import { db } from '@/lib/db';
import { CAStatus, KeyAlgorithm, CertificateType, CertificateStatus } from '@prisma/client';
import { Encryption, CertificateUtils, CSRUtils, CRLUtils, X509Utils } from './crypto';
import { AuditService } from './audit';

export interface CAConfigData {
  name?: string;
  subjectDN: string;
  keyAlgorithm: KeyAlgorithm;
  keySize?: number;
  curve?: string;
}

export interface CertificateData {
  subjectDN: string;
  certificateType: CertificateType;
  keyAlgorithm: KeyAlgorithm;
  keySize?: number;
  curve?: string;
  validityDays: number;
  sans?: string[];
  privateKey?: string; // For external CSRs
  csr?: string; // For external CSRs
}

export class CAService {
  static async initializeCA(config: CAConfigData): Promise<{
    csr: string;
    privateKey: string;
  }> {
    // Generate key pair
    const keyPair = CSRUtils.generateKeyPair(config.keyAlgorithm, config.keySize, config.curve);
    
    // Encrypt private key
    const encrypted = Encryption.encrypt(keyPair.privateKey);
    
    // Generate CSR
    const subject = CertificateUtils.parseDN(config.subjectDN);
    const csr = CSRUtils.generateCSR(subject, keyPair.privateKey, keyPair.publicKey);
    
    // Store CA configuration
    await db.cAConfig.create({
      data: {
        name: (config as any).name || null,
        subjectDN: config.subjectDN,
        privateKey: JSON.stringify(encrypted),
        csr,
        keyAlgorithm: config.keyAlgorithm,
        keySize: config.keySize,
        curve: config.curve,
        status: CAStatus.INITIALIZING,
      },
    });

    // Log audit event
    await AuditService.log({
      action: 'CA_CSR_GENERATED',
      description: `CA CSR generated for ${config.subjectDN}`,
      metadata: { subjectDN: config.subjectDN, keyAlgorithm: config.keyAlgorithm },
    });

    return { csr, privateKey: keyPair.privateKey };
  }

  static async uploadCACertificate(certificate: string): Promise<void> {
    const caConfig = await db.cAConfig.findFirst();
    if (!caConfig) {
      throw new Error('CA configuration not found. Please initialize CA first.');
    }

    // Update CA configuration with certificate
    const { notBefore, notAfter } = X509Utils.parseCertificateDates(certificate);
    await db.cAConfig.update({
      where: { id: caConfig.id },
      data: {
        certificate,
        status: CAStatus.ACTIVE,
        validFrom: notBefore,
        validTo: notAfter,
      },
    });

    // Log audit event
    await AuditService.log({
      action: 'CA_CERTIFICATE_UPLOADED',
      description: 'CA certificate uploaded and activated',
      metadata: { subjectDN: caConfig.subjectDN },
    });
  }

  static async getCAStatus(): Promise<Array<{
    id: string;
    status: CAStatus;
    name?: string;
    subjectDN: string;
    validFrom?: Date;
    validTo?: Date;
    certificateCount: number;
  }>> {
    const cas = await db.cAConfig.findMany({
      orderBy: { createdAt: 'desc' },
    });
    const counts = await db.certificate.groupBy({ by: ['caId'], _count: { _all: true } });
    const map = new Map<string, number>();
    counts.forEach((c: any) => c.caId && map.set(c.caId, c._count._all));
    return cas.map(ca => ({
      id: ca.id,
      status: ca.status,
      name: (ca as any).name || undefined,
      subjectDN: ca.subjectDN,
      validFrom: ca.validFrom || undefined,
      validTo: ca.validTo || undefined,
      certificateCount: map.get(ca.id) || 0,
    }));
  }

  static async issueCertificate(data: CertificateData & { caId?: string }, issuedById: string): Promise<{
    certificate: string;
    privateKey?: string;
    serialNumber: string;
    fingerprint: string;
  }> {
    const caConfig = data.caId
      ? await db.cAConfig.findUnique({ where: { id: data.caId } })
      : await db.cAConfig.findFirst({ where: { status: CAStatus.ACTIVE } });
    if (!caConfig || caConfig.status !== CAStatus.ACTIVE) {
      throw new Error('CA is not active. Please upload CA certificate first.');
    }

    let privateKey: string | undefined;
    let publicKey: string | undefined;
    let csr: string | undefined;

    if (data.privateKey && data.csr) {
      // External CSR
      privateKey = data.privateKey;
      csr = data.csr;
    } else {
      // Generate new key pair and CSR
      const keyPair = CSRUtils.generateKeyPair(data.keyAlgorithm, data.keySize, data.curve);
      privateKey = keyPair.privateKey;
      publicKey = keyPair.publicKey;

      const subject = CertificateUtils.parseDN(data.subjectDN);
      csr = CSRUtils.generateCSR(subject, keyPair.privateKey, keyPair.publicKey, data.sans);
    }

    // Generate serial number
    const serialNumber = CertificateUtils.generateSerialNumber();

    // Sign certificate (real X.509 signing using CA)
    const encryptedKey = JSON.parse(caConfig.privateKey);
    const caPrivateKey = Encryption.decrypt(encryptedKey.encrypted, encryptedKey.iv, encryptedKey.tag);
    
    // Enhanced X.509 compliant certificate signing
    const certificate = X509Utils.signCertificateFromCSR(
      csr!,
      caConfig.certificate!,
      caPrivateKey,
      serialNumber,
      data.validityDays,
      data.certificateType === 'CA',
      data.sans,
      {
        // Extended Key Usage based on certificate type
        extKeyUsage: this.getExtendedKeyUsage(data.certificateType),
        
        // CRL and OCSP URLs
        crlDistributionPointUrl: process.env.CRL_DISTRIBUTION_POINT || undefined,
        ocspUrl: process.env.OCSP_URL || undefined,
        
        // CA-specific extensions
        ...(data.certificateType === 'CA' && {
          pathLenConstraint: parseInt(process.env.CA_PATH_LENGTH_CONSTRAINT || '0'),
          certificatePolicies: this.getDefaultCertificatePolicies(),
          policyConstraints: {
            requireExplicitPolicy: parseInt(process.env.POLICY_REQUIRE_EXPLICIT || '0'),
            inhibitPolicyMapping: parseInt(process.env.POLICY_INHIBIT_MAPPING || '0')
          },
          nameConstraints: this.getNameConstraints()
        })
      }
    );

    // Calculate fingerprint
    const fingerprint = CertificateUtils.generateFingerprint(certificate);

    // Encrypt private key if generated internally
    let encryptedPrivateKey: string | undefined;
    if (privateKey && !data.privateKey) {
      const encrypted = Encryption.encrypt(privateKey);
      encryptedPrivateKey = JSON.stringify(encrypted);
    }

    // Store certificate
    const { notBefore: validFrom, notAfter: validTo } = X509Utils.parseCertificateDates(certificate);

    await db.certificate.create({
      data: {
        serialNumber,
        subjectDN: data.subjectDN,
        issuerDN: caConfig.subjectDN,
        certificate,
        privateKey: encryptedPrivateKey,
        csr,
        type: data.certificateType,
        status: CertificateStatus.ACTIVE,
        keyAlgorithm: data.keyAlgorithm,
        keySize: data.keySize,
        curve: data.curve,
        validFrom,
        validTo,
        sans: data.sans ? JSON.stringify(data.sans) : null,
        fingerprint,
        issuedById,
        caId: caConfig.id,
      },
    });

    // Log audit event
    await AuditService.log({
      action: 'CERTIFICATE_ISSUED',
      userId: issuedById,
      description: `Certificate issued for ${data.subjectDN}`,
      metadata: {
        serialNumber,
        subjectDN: data.subjectDN,
        certificateType: data.certificateType,
        validityDays: data.validityDays,
      },
    });

    return {
      certificate,
      privateKey: data.privateKey ? undefined : privateKey,
      serialNumber,
      fingerprint,
    };
  }

  static async revokeCertificate(
    serialNumber: string,
    reason: string,
    revokedById: string
  ): Promise<void> {
    const certificate = await db.certificate.findUnique({
      where: { serialNumber },
    });

    if (!certificate) {
      throw new Error('Certificate not found');
    }

    if (certificate.status === CertificateStatus.REVOKED) {
      throw new Error('Certificate is already revoked');
    }

    // Update certificate status
    await db.certificate.update({
      where: { serialNumber },
      data: {
        status: CertificateStatus.REVOKED,
        revokedAt: new Date(),
        revocationReason: reason,
      },
    });

    // Create revocation record
    await db.certificateRevocation.create({
      data: {
        certificateId: certificate.id,
        serialNumber,
        revocationReason: reason as any,
        revokedById,
      },
    });

    // Log audit event
    await AuditService.log({
      action: 'CERTIFICATE_REVOKED',
      userId: revokedById,
      description: `Certificate ${serialNumber} revoked`,
      metadata: {
        serialNumber,
        subjectDN: certificate.subjectDN,
        revocationReason: reason,
      },
    });

    // Update CRL
    await this.updateCRL();
  }

  static async generateCRL(): Promise<string> {
    const caConfig = await db.cAConfig.findFirst();
    if (!caConfig || caConfig.status !== CAStatus.ACTIVE) {
      throw new Error('CA is not active');
    }

    // Get all revoked certificates
    const revocations = await db.certificateRevocation.findMany({
      include: {
        certificate: true,
      },
    });

    const revokedCertificates = revocations.map(rev => ({
      serialNumber: rev.serialNumber,
      revocationDate: rev.revocationDate,
      reason: rev.revocationReason,
    }));

    // Decrypt CA private key
    const encryptedKey = JSON.parse(caConfig.privateKey);
    const caPrivateKey = Encryption.decrypt(encryptedKey.encrypted, encryptedKey.iv, encryptedKey.tag);

    // Generate CRL (valid for 24h by default)
    const crl = CRLUtils.generateCRL(
      revokedCertificates,
      caConfig.subjectDN,
      caPrivateKey,
      new Date(Date.now() + 24 * 60 * 60 * 1000)
    );

    // Update CRL number
    const newCrlNumber = caConfig.crlNumber + 1;
    await db.cAConfig.update({
      where: { id: caConfig.id },
      data: { crlNumber: newCrlNumber },
    });

    // Store CRL
    await db.cRL.create({
      data: {
        crlNumber: newCrlNumber,
        crlData: crl,
        nextUpdate: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
        ca: { connect: { id: caConfig.id } },
      },
    });

    // Log audit event
    await AuditService.log({
      action: 'CRL_GENERATED',
      description: `CRL #${newCrlNumber} generated`,
      metadata: {
        crlNumber: newCrlNumber,
        revokedCount: revokedCertificates.length,
      },
    });

    return crl;
  }

  static async getCertificates(filters?: {
    type?: CertificateType;
    status?: CertificateStatus;
    subjectDN?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ certificates: any[]; total: number }> {
    const where: any = {};

    if (filters?.type) {
      where.type = filters.type;
    }

    if (filters?.status) {
      where.status = filters.status;
    }

    if (filters?.subjectDN) {
      where.subjectDN = { contains: filters.subjectDN, mode: 'insensitive' };
    }

    const [certificates, total] = await Promise.all([
      db.certificate.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: filters?.limit || 20,
        skip: filters?.offset || 0,
        include: {
          issuedBy: {
            select: { id: true, username: true, name: true }
          },
          revocation: {
            include: {
              revokedBy: {
                select: { id: true, username: true, name: true }
              }
            }
          }
        }
      }),
      db.certificate.count({ where })
    ]);

    return { certificates, total };
  }

  static async getCertificate(serialNumber: string): Promise<any> {
    return await db.certificate.findUnique({
      where: { serialNumber },
      include: {
        issuedBy: {
          select: { id: true, username: true, name: true }
        },
        revocation: {
          include: {
            revokedBy: {
              select: { id: true, username: true, name: true }
            }
          }
        }
      }
    });
  }

  // Removed mock signer; using X509Utils.signCertificateFromCSR instead

  private static async updateCRL(): Promise<void> {
    try {
      await this.generateCRL();
    } catch (error) {
      console.error('Failed to update CRL:', error);
    }
  }

  static async renewCertificate(serialNumber: string, issuedById: string): Promise<{
    certificate: string;
    privateKey?: string;
    serialNumber: string;
    fingerprint: string;
  }> {
    const existingCert = await db.certificate.findUnique({
      where: { serialNumber },
    });

    if (!existingCert) {
      throw new Error('Certificate not found');
    }

    if (existingCert.status === CertificateStatus.REVOKED) {
      throw new Error('Cannot renew revoked certificate');
    }

    // Parse existing certificate data
    const sans = existingCert.sans ? JSON.parse(existingCert.sans) : [];
    const validityDays = Math.ceil(
      (existingCert.validTo.getTime() - existingCert.validFrom.getTime()) / (24 * 60 * 60 * 1000)
    );

    // Issue new certificate
    const result = await this.issueCertificate({
      subjectDN: existingCert.subjectDN,
      certificateType: existingCert.type,
      keyAlgorithm: existingCert.keyAlgorithm,
      keySize: existingCert.keySize ?? undefined,
      curve: existingCert.curve ?? undefined,
      validityDays,
      sans,
    }, issuedById);

    // Log renewal
    await AuditService.log({
      action: 'CERTIFICATE_RENEWED',
      userId: issuedById,
      description: `Certificate renewed from ${serialNumber} to ${result.serialNumber}`,
      metadata: {
        oldSerialNumber: serialNumber,
        newSerialNumber: result.serialNumber,
        subjectDN: existingCert.subjectDN,
      },
    });

    return result;
  }

  private static getExtendedKeyUsage(type: CertificateType) {
    switch (type) {
      case 'SERVER':
        return { serverAuth: true };
      case 'CLIENT':
        return { clientAuth: true };
      case 'CA':
        return { 
          keyCertSign: true, 
          cRLSign: true,
          ocspSigning: true 
        };
      default:
        return undefined;
    }
  }

  private static getDefaultCertificatePolicies(): string[] {
    return [
      '2.5.29.32.0', // Any Policy
      '1.3.6.1.4.1.311.21.10', // Example enterprise policy
      '1.3.6.1.5.5.7.2.1' // CPS qualifier
    ];
  }

  private static getNameConstraints() {
    return {
      permittedSubtrees: ['example.com', '*.example.com'],
      excludedSubtrees: ['internal.example.com']
    };
  }
}