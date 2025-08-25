import { db } from '@/lib/db';
import { CAStatus, KeyAlgorithm, CertificateType, CertificateStatus } from '@prisma/client';
import { Encryption, CertificateUtils, CSRUtils, CRLUtils, X509Utils } from './crypto';
import { AuditService } from './audit';
import forge from 'node-forge';
import { publishCRLToEndpoints } from './notifications';
import { logger } from './logger';

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
    caId: string;
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
    const created = await db.cAConfig.create({
      data: {
        name: (config as any).name || null,
        subjectDN: config.subjectDN,
        privateKey: JSON.stringify(encrypted),
        csr,
        keyAlgorithm: config.keyAlgorithm,
        keySize: config.keySize,
        curve: config.curve,
        status: CAStatus.INITIALIZING,
        crlDistributionPoint: process.env.CRL_DISTRIBUTION_POINT || undefined,
        ocspUrl: process.env.OCSP_URL || undefined,
      },
    });

    // Log audit event
    await AuditService.log({
      action: 'CA_CSR_GENERATED',
      description: `CA CSR generated for ${config.subjectDN}`,
      metadata: { subjectDN: config.subjectDN, keyAlgorithm: config.keyAlgorithm },
    });

    return { caId: created.id, csr, privateKey: keyPair.privateKey };
  }

  static async uploadCACertificate(certificate: string, caId?: string, certificateChain?: string): Promise<void> {
    const caConfig = caId
      ? await db.cAConfig.findUnique({ where: { id: caId } })
      : await db.cAConfig.findFirst();
    if (!caConfig) {
      throw new Error('CA configuration not found. Please initialize CA first.');
    }

    // Update CA configuration with certificate
    const { notBefore, notAfter } = X509Utils.parseCertificateDates(certificate);
    await db.cAConfig.update({
      where: { id: caConfig.id },
      data: {
        certificate,
        certificateChain: certificateChain || undefined,
        status: CAStatus.ACTIVE,
        validFrom: notBefore,
        validTo: notAfter,
        crlDistributionPoint: caConfig.crlDistributionPoint || process.env.CRL_DISTRIBUTION_POINT || undefined,
        ocspUrl: caConfig.ocspUrl || process.env.OCSP_URL || undefined,
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

    if (data.csr) {
      // External CSR (do not accept or store uploaded private keys)
      csr = data.csr;
      // If SANs are not provided, attempt to extract from CSR
      try {
        if (!data.sans || data.sans.length === 0) {
          const req = forge.pki.certificationRequestFromPem(csr);
          const extReq = req.getAttribute({ name: 'extensionRequest' });
          if (extReq && extReq.extensions) {
            const sanExt = extReq.extensions.find((e: any) => e.name === 'subjectAltName');
            if (sanExt && Array.isArray(sanExt.altNames)) {
              data.sans = sanExt.altNames
                .filter((n: any) => n && (n.type === 2 || n.type === 'DNS'))
                .map((n: any) => n.value);
            }
          }
        }
      } catch {}
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
        crlDistributionPointUrl: caConfig.crlDistributionPoint || undefined,
        ocspUrl: caConfig.ocspUrl || undefined,
        
        // CA-specific basic constraints only; advanced policy/name constraints omitted for compatibility
        ...(data.certificateType === 'CA' && {
          pathLenConstraint: parseInt(process.env.CA_PATH_LENGTH_CONSTRAINT || '0')
        }),
        
        // Certificate Policies for enterprise compliance
        certificatePolicies: this.getDefaultCertificatePolicies()
      }
    );

    // Calculate fingerprint
    const fingerprint = CertificateUtils.generateFingerprint(certificate);

    // Encrypt private key if generated internally
    let encryptedPrivateKey: string | undefined;
    if (privateKey) {
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

    // Update CRL for the certificate's CA
    await this.updateCRL(certificate.caId || undefined);
  }

  static async generateCRL(caId?: string): Promise<string> {
    try {
      const caConfig = caId
        ? await db.cAConfig.findUnique({ where: { id: caId } })
        : await db.cAConfig.findFirst();
      if (!caConfig || caConfig.status !== CAStatus.ACTIVE) {
        throw new Error('CA is not active');
      }

    // Get revoked certificates for this CA
    const revocations = await db.certificateRevocation.findMany({
      include: {
        certificate: true,
      },
      where: { certificate: { caId: caConfig.id } as any },
    });

    const revokedCertificates = revocations.map(rev => ({
      serialNumber: rev.serialNumber,
      revocationDate: rev.revocationDate,
      reason: rev.revocationReason,
    }));

    // Decrypt CA private key
    const encryptedKey = JSON.parse(caConfig.privateKey);
    const caPrivateKey = Encryption.decrypt(encryptedKey.encrypted, encryptedKey.iv, encryptedKey.tag);

    // Get CA certificate for extensions
    if (!caConfig.certificate) {
      throw new Error('CA certificate not found');
    }

    // Generate CRL with enhanced extensions
    const crl = CRLUtils.generateCRL(
      revokedCertificates,
      caConfig.subjectDN,
      caPrivateKey,
      new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
      {
        crlNumber: caConfig.crlNumber + 1,
        caCertificatePem: caConfig.certificate,
        crlDistributionPoint: caConfig.crlDistributionPoint || undefined,
        authorityInfoAccess: caConfig.ocspUrl || undefined,
      }
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

    // Publish to HA endpoints if configured
    const endpointsVar = process.env.CRL_PUBLICATION_ENDPOINTS || '';
    const endpoints = endpointsVar
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (endpoints.length > 0) {
      try {
        await publishCRLToEndpoints(crl, endpoints);
      } catch (e) {
        console.error('CRL publication failed', e);
      }
    }

    // Log audit event
    await AuditService.log({
      action: 'CRL_GENERATED',
      description: `CRL #${newCrlNumber} generated with ${revokedCertificates.length} revoked certificates`,
      metadata: {
        crlNumber: newCrlNumber,
        revokedCount: revokedCertificates.length,
        hasExtensions: true,
        crlDistributionPoint: caConfig.crlDistributionPoint || null,
      },
    });

      return crl;
    } catch (error) {
      logger.error('CRL generation failed', {
        error: error instanceof Error ? error.message : String(error),
        caId,
        stack: error instanceof Error ? error.stack : undefined
      });
      throw error; // Re-throw to maintain the original behavior
    }
  }

  // Generate Delta CRL for incremental updates
  static async generateDeltaCRL(caId?: string): Promise<string> {
    const caConfig = caId
      ? await db.cAConfig.findUnique({ where: { id: caId } })
      : await db.cAConfig.findFirst();
    if (!caConfig || caConfig.status !== CAStatus.ACTIVE) {
      throw new Error('CA is not active');
    }

    // Get the last full CRL
    const lastFullCRL = await db.cRL.findFirst({
      where: { caId: caConfig.id },
      orderBy: { crlNumber: 'desc' },
    });

    if (!lastFullCRL) {
      throw new Error('No base CRL found for delta CRL generation');
    }

    // Get certificates revoked since the last full CRL
    const lastRevocationDate = lastFullCRL.issuedAt;
    const recentRevocations = await db.certificateRevocation.findMany({
      where: {
        revocationDate: {
          gt: lastRevocationDate,
        },
        certificate: { caId: caConfig.id } as any,
      },
      include: {
        certificate: true,
      },
    });

    if (recentRevocations.length === 0) {
      throw new Error('No new revocations since last full CRL');
    }

    const revokedCertificates = recentRevocations.map(rev => ({
      serialNumber: rev.serialNumber,
      revocationDate: rev.revocationDate,
      reason: rev.revocationReason,
    }));

    // Decrypt CA private key
    const encryptedKey = JSON.parse(caConfig.privateKey);
    const caPrivateKey = Encryption.decrypt(encryptedKey.encrypted, encryptedKey.iv, encryptedKey.tag);

    // Get CA certificate for extensions
    if (!caConfig.certificate) {
      throw new Error('CA certificate not found');
    }

    // Generate Delta CRL
    const deltaCRL = CRLUtils.generateDeltaCRL(
      revokedCertificates,
      caConfig.subjectDN,
      caPrivateKey,
      new Date(Date.now() + 6 * 60 * 60 * 1000), // 6 hours for delta CRL
      lastFullCRL.crlNumber,
      caConfig.crlNumber + 1,
      {
        caCertificatePem: caConfig.certificate,
        crlDistributionPoint: caConfig.crlDistributionPoint || undefined,
        authorityInfoAccess: caConfig.ocspUrl || undefined,
      }
    );

    // Update CRL number
    const newCrlNumber = caConfig.crlNumber + 1;
    await db.cAConfig.update({
      where: { id: caConfig.id },
      data: { crlNumber: newCrlNumber },
    });

    // Store Delta CRL
    await db.cRL.create({
      data: {
        crlNumber: newCrlNumber,
        crlData: deltaCRL,
        nextUpdate: new Date(Date.now() + 6 * 60 * 60 * 1000), // 6 hours
        ca: { connect: { id: caConfig.id } },
      },
    });

    // Log audit event
    await AuditService.log({
      action: 'CRL_GENERATED',
      description: `Delta CRL #${newCrlNumber} generated with ${revokedCertificates.length} new revocations`,
      metadata: {
        crlNumber: newCrlNumber,
        revokedCount: revokedCertificates.length,
        isDeltaCRL: true,
        baseCRLNumber: lastFullCRL.crlNumber,
        hasExtensions: true,
        crlDistributionPoint: caConfig.crlDistributionPoint || null,
      },
    });

    return deltaCRL;
  }

  // Validate CRL extensions and compliance
  static async validateCRL(crlPem: string): Promise<{
    isValid: boolean;
    issues: string[];
    info: {
      issuer: string;
      thisUpdate: Date;
      nextUpdate: Date;
      revokedCount: number;
      crlNumber?: number;
      isDeltaCRL: boolean;
      deltaCRLIndicator?: number;
      extensions: string[];
    };
  }> {
    try {
      const validation = CRLUtils.validateCRLExtensions(crlPem);
      const info = CRLUtils.getCRLInfo(crlPem);

      return {
        isValid: validation.isValid,
        issues: validation.issues,
        info,
      };
    } catch (error) {
      return {
        isValid: false,
        issues: [`Failed to validate CRL: ${error instanceof Error ? error.message : String(error)}`],
        info: {
          issuer: 'Unknown',
          thisUpdate: new Date(),
          nextUpdate: new Date(),
          revokedCount: 0,
          extensions: [],
          isDeltaCRL: false,
        },
      };
    }
  }

  // Get CRL statistics and information
  static async getCRLStatistics(caId?: string): Promise<{
    totalCRLs: number;
    lastFullCRL?: {
      crlNumber: number;
      issuedAt: Date;
      nextUpdate: Date;
      revokedCount: number;
    };
    lastDeltaCRL?: {
      crlNumber: number;
      issuedAt: Date;
      nextUpdate: Date;
      revokedCount: number;
    };
    totalRevokedCertificates: number;
    crlDistributionPoint?: string;
    nextCRLUpdate?: Date;
  }> {
    const caConfig = caId
      ? await db.cAConfig.findUnique({ where: { id: caId } })
      : await db.cAConfig.findFirst();
    if (!caConfig) {
      throw new Error('CA configuration not found');
    }

    // Get all CRLs
    const crls = await db.cRL.findMany({
      where: { caId: caConfig.id },
      orderBy: { crlNumber: 'desc' },
    });

    // Get total revoked certificates
    const totalRevoked = await db.certificateRevocation.count({
      where: { certificate: { caId: caConfig.id } as any },
    });

    // Find last full CRL and delta CRL
    let lastFullCRL: any = null;
    let lastDeltaCRL: any = null;

    for (const crl of crls) {
      try {
        const info = CRLUtils.getCRLInfo(crl.crlData);
        if (info.isDeltaCRL && !lastDeltaCRL) {
          lastDeltaCRL = {
            crlNumber: crl.crlNumber,
            issuedAt: crl.issuedAt,
            nextUpdate: crl.nextUpdate,
            revokedCount: info.revokedCount,
          };
        } else if (!info.isDeltaCRL && !lastFullCRL) {
          lastFullCRL = {
            crlNumber: crl.crlNumber,
            issuedAt: crl.issuedAt,
            nextUpdate: crl.nextUpdate,
            revokedCount: info.revokedCount,
          };
        }
      } catch (error) {
        console.warn(`Failed to parse CRL ${crl.crlNumber}:`, error);
      }
    }

    return {
      totalCRLs: crls.length,
      lastFullCRL,
      lastDeltaCRL,
      totalRevokedCertificates: totalRevoked,
      crlDistributionPoint: caConfig.crlDistributionPoint || undefined,
      nextCRLUpdate: lastFullCRL?.nextUpdate,
    };
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

  private static async updateCRL(caId?: string): Promise<void> {
    try {
      await this.generateCRL(caId);
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

  static startCRLScheduler(): void {
    const hours = parseInt(process.env.CRL_UPDATE_INTERVAL_HOURS || '24', 10);
    const intervalMs = Math.max(1, hours) * 60 * 60 * 1000;
    const runOnStartup = process.env.CRL_RUN_ON_STARTUP !== 'false'; // Default to true unless explicitly disabled
    
    logger.info('Starting CRL scheduler...', {
      intervalHours: hours,
      runOnStartup,
      intervalMs
    });

    // Interval for subsequent runs
    setInterval(async () => {
      try {
        await this.generateCRL();
        logger.info('CRL generation scheduler executed successfully.');
      } catch (err) {
        logger.error('CRL scheduler run failed:', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }, intervalMs);

    // Only run immediately if enabled and CA is already configured and active
    // This prevents startup failures when CA is not yet set up
    if (runOnStartup) {
      setTimeout(async () => {
        try {
          // Check if there's an active CA before attempting CRL generation
          const caConfig = await db.cAConfig.findFirst({ where: { status: 'ACTIVE' } });
          if (!caConfig) {
            logger.info('No active CA found, skipping initial CRL generation');
            return;
          }
          
          await this.generateCRL();
          logger.info('Initial CRL generation executed successfully.');
        } catch (err) {
          // It's okay if this fails on first start before CA is configured
          logger.warn('Initial CRL generation failed (CA may not be active)', {
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }, 5000); // Wait 5 seconds for database and other services to be ready
    } else {
      logger.info('CRL initial generation disabled, will run on next scheduled interval');
    }
  }
}