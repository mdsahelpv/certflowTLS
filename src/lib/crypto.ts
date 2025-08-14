import crypto from 'crypto';
import { createCipheriv, createDecipheriv, randomBytes, generateKeyPairSync } from 'crypto';
import type { CipherGCM, DecipherGCM, CipherGCMTypes } from 'crypto';
import forge from 'node-forge';

// Encryption utilities for sensitive data at rest
export class Encryption {
  private static algorithm = 'aes-256-gcm';
  private static getKey(): Buffer {
    const configuredKey = process.env.ENCRYPTION_KEY;
    if (!configuredKey) {
      if (process.env.NODE_ENV === 'production') {
        throw new Error('ENCRYPTION_KEY is required in production');
      }
      // Development fallback (not secure for production)
      return Buffer.from('development-only-32-bytes-key-123456', 'utf8').slice(0, 32);
    }
    const keyBuffer = Buffer.from(configuredKey, 'utf8');
    if (process.env.NODE_ENV === 'production' && keyBuffer.length < 32) {
      throw new Error('ENCRYPTION_KEY must be at least 32 bytes');
    }
    return keyBuffer.slice(0, 32);
  }

  static encrypt(text: string): { encrypted: string; iv: string; tag: string } {
    const iv = randomBytes(16);
    const cipher = createCipheriv(this.algorithm as CipherGCMTypes, this.getKey(), iv) as unknown as CipherGCM;
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const tag = cipher.getAuthTag();
    
    return {
      encrypted,
      iv: iv.toString('hex'),
      tag: tag.toString('hex')
    };
  }

  static decrypt(encrypted: string, iv: string, tag: string): string {
    const decipher = createDecipheriv(
      this.algorithm as CipherGCMTypes,
      this.getKey(),
      Buffer.from(iv, 'hex')
    ) as unknown as DecipherGCM;
    
    decipher.setAuthTag(Buffer.from(tag, 'hex'));
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }
}

// Certificate utilities
export class CertificateUtils {
  static generateSerialNumber(): string {
    return crypto.randomBytes(16).toString('hex').toUpperCase();
  }

  static generateFingerprint(certificate: string): string {
    const cert = Buffer.from(certificate, 'utf8');
    const hash = crypto.createHash('sha256').update(cert).digest('hex');
    return hash.match(/.{2}/g)?.join(':').toUpperCase() || '';
  }

  static formatDN(parts: Record<string, string>): string {
    const dn: string[] = [];
    if (parts.C) dn.push(`C=${parts.C}`);
    if (parts.ST) dn.push(`ST=${parts.ST}`);
    if (parts.L) dn.push(`L=${parts.L}`);
    if (parts.O) dn.push(`O=${parts.O}`);
    if (parts.OU) dn.push(`OU=${parts.OU}`);
    if (parts.CN) dn.push(`CN=${parts.CN}`);
    return dn.join(',');
  }

  static parseDN(dn: string): Record<string, string> {
    const parts: Record<string, string> = {};
    const components = dn.split(',');
    
    for (const component of components) {
      const [key, value] = component.trim().split('=');
      if (key && value) {
        parts[key] = value;
      }
    }
    
    return parts;
  }
}

// CSR Generation utilities
export class CSRUtils {
  static generateKeyPair(
    algorithm: 'RSA' | 'ECDSA' | 'Ed25519',
    keySize?: number,
    curve?: string
  ): { privateKey: string; publicKey: string } {
    if (algorithm === 'RSA') {
      const pair = generateKeyPairSync('rsa', {
        modulusLength: keySize || 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      });
      return { privateKey: pair.privateKey, publicKey: pair.publicKey };
    }

    if (algorithm === 'ECDSA') {
      const inputCurve = (curve || 'P-256').toUpperCase();
      const curveMap: Record<string, string> = {
        'P-256': 'prime256v1',
        'P-384': 'secp384r1',
        'P-521': 'secp521r1',
      };
      const mappedCurve = curveMap[inputCurve] || inputCurve;
      const pair = generateKeyPairSync('ec', {
        namedCurve: mappedCurve, // e.g., 'P-256', 'P-384', 'P-521'
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      });
      return { privateKey: pair.privateKey, publicKey: pair.publicKey };
    }

    if (algorithm === 'Ed25519') {
      const pair = generateKeyPairSync('ed25519', {
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      });
      return { privateKey: pair.privateKey, publicKey: pair.publicKey };
    }

    throw new Error(`Unsupported algorithm: ${algorithm}`);
  }

  static generateCSR(
    subject: Record<string, string>,
    privateKeyPem: string,
    publicKeyPem: string,
    sans?: string[]
  ): string {
    // Create CSR
    const csr = forge.pki.createCertificationRequest();
    // Use provided public key PEM (supports RSA/EC)
    csr.publicKey = forge.pki.publicKeyFromPem(publicKeyPem);
    // Set subject fields
    const attrs: any[] = [];
    if (subject.C) attrs.push({ name: 'countryName', value: subject.C });
    if (subject.ST) attrs.push({ name: 'stateOrProvinceName', value: subject.ST });
    if (subject.L) attrs.push({ name: 'localityName', value: subject.L });
    if (subject.O) attrs.push({ name: 'organizationName', value: subject.O });
    if (subject.OU) attrs.push({ name: 'organizationalUnitName', value: subject.OU });
    if (subject.CN) attrs.push({ name: 'commonName', value: subject.CN });
    csr.setSubject(attrs);
    // Add SANs if provided
    if (sans && sans.length > 0) {
      csr.setAttributes([
        {
          name: 'extensionRequest',
          extensions: [
            {
              name: 'subjectAltName',
              altNames: sans.map((san) => ({ type: 2, value: san })),
            } as any,
          ],
        },
      ]);
    }
    // Sign CSR
    const privateKey = forge.pki.privateKeyFromPem(privateKeyPem) as any;
    csr.sign(privateKey, forge.md.sha256.create());
    return forge.pki.certificationRequestToPem(csr);
  }
}

// CRL Generation utilities
export class CRLUtils {
  static generateCRL(
    revokedCertificates: Array<{
      serialNumber: string;
      revocationDate: Date;
      reason: string;
    }>,
    issuerDN: string,
    caPrivateKeyPem: string,
    nextUpdate: Date
  ): string {
    const crl = forge.pki.createCertificateRevocationList();

    // Issuer
    crl.issuer = this.convertDNToForgeAttrs(issuerDN);
    crl.thisUpdate = new Date();
    crl.nextUpdate = nextUpdate;

    // Revoked entries
    crl.revokedCertificates = revokedCertificates.map((rc) => ({
      serialNumber: new forge.jsbn.BigInteger(rc.serialNumber, 16),
      revocationDate: rc.revocationDate,
      extensions: [
        {
          id: 'cRLReason',
          value: this.crlReasonToValue(rc.reason),
          critical: false,
        } as any,
      ],
    }));

    // Sign
    const caPrivateKey = forge.pki.privateKeyFromPem(caPrivateKeyPem);
    crl.sign(caPrivateKey, forge.md.sha256.create());
    return forge.pki.crlToPem(crl);
  }

  private static crlReasonToValue(reason: string): number {
    const map: Record<string, number> = {
      UNSPECIFIED: 0,
      KEY_COMPROMISE: 1,
      CA_COMPROMISE: 2,
      AFFILIATION_CHANGED: 3,
      SUPERSEDED: 4,
      CESSATION_OF_OPERATION: 5,
      CERTIFICATE_HOLD: 6,
      REMOVE_FROM_CRL: 8,
      PRIVILEGE_WITHDRAWN: 9,
      AA_COMPROMISE: 10,
    };
    return map[reason] ?? 0;
  }

  static convertDNToForgeAttrs(dn: string): any[] {
    const subject = CertificateUtils.parseDN(dn);
    const attrs: any[] = [];
    if (subject.C) attrs.push({ name: 'countryName', value: subject.C });
    if (subject.ST) attrs.push({ name: 'stateOrProvinceName', value: subject.ST });
    if (subject.L) attrs.push({ name: 'localityName', value: subject.L });
    if (subject.O) attrs.push({ name: 'organizationName', value: subject.O });
    if (subject.OU) attrs.push({ name: 'organizationalUnitName', value: subject.OU });
    if (subject.CN) attrs.push({ name: 'commonName', value: subject.CN });
    return attrs;
  }
}

export class X509Utils {
  static parseCertificateDates(certPem: string): { notBefore: Date; notAfter: Date } {
    const cert = forge.pki.certificateFromPem(certPem);
    return { notBefore: cert.validity.notBefore, notAfter: cert.validity.notAfter };
  }

  static signCertificateFromCSR(
    csrPem: string,
    caCertPem: string,
    caPrivateKeyPem: string,
    serialHex: string,
    validityDays: number,
    isCA: boolean,
    sans?: string[],
    opts?: {
      extKeyUsage?: { serverAuth?: boolean; clientAuth?: boolean };
      crlDistributionPointUrl?: string;
      ocspUrl?: string;
    }
  ): string {
    const csr = forge.pki.certificationRequestFromPem(csrPem);
    if (!csr.verify()) {
      throw new Error('Invalid CSR');
    }

    const caCert = forge.pki.certificateFromPem(caCertPem);
    const caPrivateKey = forge.pki.privateKeyFromPem(caPrivateKeyPem);

    const cert = forge.pki.createCertificate();
    cert.publicKey = csr.publicKey;
    cert.serialNumber = new forge.jsbn.BigInteger(serialHex, 16).toString(16);

    const now = new Date();
    const notAfter = new Date(now.getTime() + validityDays * 24 * 60 * 60 * 1000);
    cert.validity.notBefore = now;
    cert.validity.notAfter = notAfter;

    cert.setSubject(csr.subject.attributes);
    cert.setIssuer(caCert.subject.attributes);

    const extensions: any[] = [
      { name: 'basicConstraints', cA: isCA },
      { name: 'keyUsage', digitalSignature: true, keyEncipherment: true, dataEncipherment: true, keyCertSign: isCA, cRLSign: isCA },
      { name: 'subjectKeyIdentifier' },
      { name: 'authorityKeyIdentifier', keyIdentifier: this.getSubjectKeyIdentifier(caCert) },
    ];

    if (sans && sans.length > 0) {
      extensions.push({ name: 'subjectAltName', altNames: sans.map((s) => ({ type: 2, value: s })) });
    }

    if (opts?.extKeyUsage) {
      extensions.push({ name: 'extKeyUsage', ...opts.extKeyUsage });
    }

    if (opts?.crlDistributionPointUrl) {
      // Minimal CRL DP as URI string
      extensions.push({ name: 'cRLDistributionPoints', value: opts.crlDistributionPointUrl });
    }

    if (opts?.ocspUrl) {
      extensions.push({
        name: 'authorityInfoAccess',
        accessDescriptions: [
          {
            accessMethod: 'ocsp',
            accessLocation: { type: 6, value: opts.ocspUrl },
          },
        ],
      });
    }

    cert.setExtensions(extensions);

    cert.sign(caPrivateKey, forge.md.sha256.create());
    return forge.pki.certificateToPem(cert);
  }

  private static getSubjectKeyIdentifier(cert: forge.pki.Certificate): string {
    // Compute SKI from public key
    const publicKeyDer = forge.asn1.toDer(forge.pki.publicKeyToAsn1(cert.publicKey)).getBytes();
    const sha1 = forge.md.sha1.create();
    sha1.update(publicKeyDer);
    return sha1.digest().getBytes();
  }
}