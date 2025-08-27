import * as crypto from 'crypto';
import type { CipherGCM, DecipherGCM, CipherGCMTypes } from 'crypto';
import * as forge from 'node-forge';

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
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(this.algorithm as CipherGCMTypes, this.getKey(), iv) as unknown as CipherGCM;
    
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
    const decipher = crypto.createDecipheriv(
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
      const pair = crypto.generateKeyPairSync('rsa', {
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
      const pair = crypto.generateKeyPairSync('ec', {
        namedCurve: mappedCurve, // e.g., 'P-256', 'P-384', 'P-521'
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      });
      return { privateKey: pair.privateKey, publicKey: pair.publicKey };
    }

    if (algorithm === 'Ed25519') {
      const pair = crypto.generateKeyPairSync('ed25519', {
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

// CRL Generation utilities (using pkijs)
import * as asn1js from 'asn1js';
import * as pkijs from 'pkijs';

export class CRLUtils {
  static async generateCRL(
    revokedCertificates: Array<{
      serialNumber: string;
      revocationDate: Date;
      reason: string;
    }>,
    issuerDN: string,
    caPrivateKeyPem: string,
    caCertificatePem: string,
    nextUpdate: Date,
    crlNumber: number
  ): Promise<string> {
    // Initialize pkijs
    const crypto = pkijs.getCrypto(true);

    // Create CRL object
    const crl = new pkijs.CertificateRevocationList();

    // Set properties
    crl.version = 1;
    crl.thisUpdate = new pkijs.Time({ value: new Date() });
    crl.nextUpdate = new pkijs.Time({ value: nextUpdate });

    // Parse CA certificate
    const certBuffer = Buffer.from(caCertificatePem.replace(/-----BEGIN CERTIFICATE-----|-----END CERTIFICATE-----|[\r\n]/g, ''), 'base64');
    const certAsn1 = asn1js.fromBER(certBuffer);
    const caCert = new pkijs.Certificate({ schema: certAsn1.result });
    crl.issuer = caCert.subject;

    // Add revoked certificates
    crl.revokedCertificates = [];
    for (const rc of revokedCertificates) {
      const revokedCertificate = new pkijs.RevokedCertificate({
        userCertificate: new asn1js.Integer({ value: parseInt(rc.serialNumber, 16) }),
        revocationDate: new pkijs.Time({ value: rc.revocationDate }),
      });
      // TODO: Add revocation reason extension
      crl.revokedCertificates.push(revokedCertificate);
    }

    // Add extensions
    const extensions = [];
    extensions.push(new pkijs.Extension({
      extnID: "2.5.29.20", // cRLNumber
      critical: false,
      extnValue: new asn1js.Integer({ value: crlNumber }).toBER(false),
    }));

    const authorityKeyIdentifier = caCert.subjectPublicKeyInfo.subjectPublicKey.valueBlock.valueHex;
    const authorityKeyIdentifierHashed = await crypto.digest({ name: "SHA-1" }, new Uint8Array(authorityKeyIdentifier));

    extensions.push(new pkijs.Extension({
        extnID: "2.5.29.35", // authorityKeyIdentifier
        critical: false,
        extnValue: new pkijs.AuthorityKeyIdentifier({ keyIdentifier: new asn1js.OctetString({ valueHex: authorityKeyIdentifierHashed }) }).toSchema().toBER(false),
    }));

    crl.crlExtensions = new pkijs.Extensions({ extensions });

    // Sign the CRL
    const privateKeyBuffer = Buffer.from(caPrivateKeyPem.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|[\r\n]/g, ''), 'base64');
    const privateKey = await crypto.importKey("pkcs8", privateKeyBuffer, { name: "RSASSA-PKCS1-v1_5", hash: { name: "SHA-256" } }, true, ["sign"]);

    await crl.sign(privateKey, "SHA-256");

    // Serialize to PEM
    const crlSchema = crl.toSchema();
    const crlDer = crlSchema.toBER(false);
    const crlPem = `-----BEGIN X509 CRL-----\n${Buffer.from(crlDer).toString('base64')}\n-----END X509 CRL-----`;

    return crlPem;
  }

  static async generateDeltaCRL(
    revokedCertificates: Array<{
      serialNumber: string;
      revocationDate: Date;
      reason: string;
    }>,
    issuerDN: string,
    caPrivateKeyPem: string,
    caCertificatePem: string,
    nextUpdate: Date,
    baseCrlNumber: number,
    deltaCrlNumber: number,
  ): Promise<string> {
    const crypto = pkijs.getCrypto(true);
    const crl = new pkijs.CertificateRevocationList();

    crl.version = 1;
    crl.thisUpdate = new pkijs.Time({ value: new Date() });
    crl.nextUpdate = new pkijs.Time({ value: nextUpdate });

    const certBuffer = Buffer.from(caCertificatePem.replace(/-----BEGIN CERTIFICATE-----|-----END CERTIFICATE-----|[\r\n]/g, ''), 'base64');
    const certAsn1 = asn1js.fromBER(certBuffer);
    const caCert = new pkijs.Certificate({ schema: certAsn1.result });
    crl.issuer = caCert.subject;
    crl.revokedCertificates = [];
    for (const rc of revokedCertificates) {
      const revokedCertificate = new pkijs.RevokedCertificate({
        userCertificate: new asn1js.Integer({ value: parseInt(rc.serialNumber, 16) }),
        revocationDate: new pkijs.Time({ value: rc.revocationDate }),
      });
      crl.revokedCertificates.push(revokedCertificate);
    }

    const extensions = [];
    // Base CRL Number (critical for delta CRLs)
    extensions.push(new pkijs.Extension({
        extnID: "2.5.29.20", // cRLNumber
        critical: false,
        extnValue: new asn1js.Integer({ value: baseCrlNumber }).toBER(false),
    }));
    // Delta CRL Indicator (critical)
    extensions.push(new pkijs.Extension({
        extnID: "2.5.29.27", // deltaCRLIndicator
        critical: true,
        extnValue: new asn1js.Integer({ value: deltaCrlNumber }).toBER(false),
    }));

    const authorityKeyIdentifier = caCert.subjectPublicKeyInfo.subjectPublicKey.valueBlock.valueHex;
    const authorityKeyIdentifierHashed = await crypto.digest({ name: "SHA-1" }, new Uint8Array(authorityKeyIdentifier));
    extensions.push(new pkijs.Extension({
        extnID: "2.5.29.35", // authorityKeyIdentifier
        critical: false,
        extnValue: new pkijs.AuthorityKeyIdentifier({ keyIdentifier: new asn1js.OctetString({ valueHex: authorityKeyIdentifierHashed }) }).toSchema().toBER(false),
    }));

    crl.crlExtensions = new pkijs.Extensions({ extensions });

    const privateKeyBuffer = Buffer.from(caPrivateKeyPem.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|[\r\n]/g, ''), 'base64');
    const privateKey = await crypto.importKey("pkcs8", privateKeyBuffer, { name: "RSASSA-PKCS1-v1_5", hash: { name: "SHA-256" } }, true, ["sign"]);

    await crl.sign(privateKey, "SHA-256");

    const crlSchema = crl.toSchema();
    const crlDer = crlSchema.toBER(false);
    return `-----BEGIN X509 CRL-----\n${Buffer.from(crlDer).toString('base64')}\n-----END X509 CRL-----`;
  }

  // NOTE: The other CRLUtils functions (validate, getInfo) are not implemented with pkijs yet.
  static validateCRLExtensions(crlPem: string): { isValid: boolean; issues: string[] } { return { isValid: true, issues: [] }; }
  static getCRLInfo(crlPem: string): any { return {}; }
}

export class X509Utils {
  static parseCertificateDates(certPem: string): { notBefore: Date; notAfter: Date } {
    const cert = forge.pki.certificateFromPem(certPem);
    return { notBefore: cert.validity.notBefore, notAfter: cert.validity.notAfter };
  }

  // Validate certificate chain and verify signatures
  static validateCertificateChain(
    certificatePem: string,
    caCertificates: string[],
    options: {
      checkExpiration?: boolean;
      checkRevocation?: boolean;
      maxChainLength?: number;
      requireTrustedRoot?: boolean;
    } = {}
  ): { isValid: boolean; issues: string[]; chain: Array<{ cert: forge.pki.Certificate; status: string }> } {
    const issues: string[] = [];
    const chain: Array<{ cert: forge.pki.Certificate; status: string }> = [];
    
    try {
      // Parse the certificate
      const cert = forge.pki.certificateFromPem(certificatePem);
      chain.push({ cert, status: 'valid' });
      
      // Check certificate expiration if requested
      if (options.checkExpiration !== false) {
        const now = new Date();
        if (now < cert.validity.notBefore) {
          issues.push(`Certificate is not yet valid. Valid from: ${cert.validity.notBefore.toISOString().split('T')[0]}`);
        }
        if (now > cert.validity.notAfter) {
          issues.push(`Certificate has expired. Expired on: ${cert.validity.notAfter.toISOString().split('T')[0]}`);
        }
      }
      
      // Validate certificate extensions for compliance
      const extensionValidation = this.validateExtensions(cert.extensions, false);
      if (!extensionValidation.isCompliant) {
        issues.push(...extensionValidation.issues);
      }
      
      // Build and validate certificate chain
      const maxChainLength = options.maxChainLength || 10;
      let currentCert = cert;
      let chainLength = 0;
      let foundTrustedRoot = false;
      
      while (chainLength < maxChainLength) {
        // Find issuer certificate
        const issuerCert = this.findIssuerCertificate(currentCert, caCertificates);
        if (!issuerCert) {
          if (chainLength === 0) {
            issues.push('No issuer certificate found for the certificate');
          } else {
            // This is the root CA - check if it's trusted
            const rootStatus = this.validateRootCA(currentCert, caCertificates);
            if (rootStatus.isTrusted) {
              foundTrustedRoot = true;
              chain.push({ cert: currentCert, status: 'trusted_root' });
            } else {
              issues.push(`Root CA not trusted: ${rootStatus.reason}`);
              chain.push({ cert: currentCert, status: 'untrusted_root' });
            }
            break;
          }
        } else {
          // Verify signature with issuer's public key
          try {
            if (!currentCert.verify(issuerCert.publicKey as any)) {
              const issuerCN = issuerCert.subject.getField('CN')?.value || 'Unknown';
              issues.push(`Certificate signature verification failed with issuer: ${issuerCN}`);
            }
          } catch (e) {
            const issuerCN = issuerCert.subject.getField('CN')?.value || 'Unknown';
            issues.push(`Certificate signature verification error with issuer: ${issuerCN}`);
          }

          // Validate issuer certificate
          const issuerValidation = this.validateIssuerCertificate(issuerCert, chainLength);
          if (issuerValidation.issues.length > 0) {
            issues.push(...issuerValidation.issues);
          }
          
          chain.push({ cert: issuerCert, status: 'valid' });
          currentCert = issuerCert;
        }
        
        chainLength++;
      }
      
      if (chainLength >= maxChainLength) {
        issues.push(`Certificate chain too long (max: ${maxChainLength})`);
      }
      
      // Check if we require a trusted root and found one
      if (options.requireTrustedRoot && !foundTrustedRoot) {
        issues.push('Certificate chain does not lead to a trusted root CA');
      }
      
    } catch (error) {
      // Avoid leaking internal forge errors - provide generic message
      issues.push('Failed to parse or validate the certificate. Please ensure it is a single valid PEM certificate.');
    }
    
    return {
      isValid: issues.length === 0,
      issues,
      chain
    };
  }

  // Validate root CA trust
  private static validateRootCA(
    rootCert: forge.pki.Certificate,
    caCertificates: string[]
  ): { isTrusted: boolean; reason?: string } {
    try {
      // Check if this root CA is in our trusted store
      const rootFingerprint = this.generateCertificateFingerprint(rootCert);
      
      for (const caCertPem of caCertificates) {
        try {
          const caCert = forge.pki.certificateFromPem(caCertPem);
          const caFingerprint = this.generateCertificateFingerprint(caCert);
          
          if (rootFingerprint === caFingerprint) {
            return { isTrusted: true };
          }
        } catch {
          continue;
        }
      }
      
      // Check if it's a self-signed root with proper CA constraints
      if (this.isSelfSigned(rootCert)) {
        const basicConstraints = rootCert.getExtension('basicConstraints') as any;
        const keyUsage = rootCert.getExtension('keyUsage') as any;
        
        if (basicConstraints?.cA && keyUsage?.keyCertSign) {
          return { isTrusted: true };
        } else {
          return { isTrusted: false, reason: 'Self-signed root lacks proper CA constraints' };
        }
      }
      
      return { isTrusted: false, reason: 'Root CA not in trusted store and not properly self-signed' };
    } catch {
      return { isTrusted: false, reason: 'Failed to validate root CA' };
    }
  }

  // Validate issuer certificate
  private static validateIssuerCertificate(
    issuerCert: forge.pki.Certificate,
    chainLevel: number
  ): { issues: string[] } {
    const issues: string[] = [];
    
    try {
      // Check if issuer is a CA
      const basicConstraints: any = issuerCert.getExtension('basicConstraints');
      const isCA = basicConstraints?.cA ?? basicConstraints?.value?.cA ?? false;
      
      if (!isCA) {
        const issuerCN = issuerCert.subject.getField('CN')?.value || 'Unknown';
        issues.push(`Issuer certificate is not a CA: ${issuerCN}`);
      }
      
      // Check key usage
      const keyUsage: any = issuerCert.getExtension('keyUsage');
      const canSign = keyUsage?.keyCertSign ?? keyUsage?.value?.keyCertSign ?? false;
      
      if (!canSign) {
        const issuerCN = issuerCert.subject.getField('CN')?.value || 'Unknown';
        issues.push(`Issuer certificate cannot sign other certificates: ${issuerCN}`);
      }
      
      // Check path length constraint for intermediate CAs
      if (chainLevel > 0 && basicConstraints?.pathLenConstraint !== undefined) {
        if (basicConstraints.pathLenConstraint < 0) {
          const issuerCN = issuerCert.subject.getField('CN')?.value || 'Unknown';
          issues.push(`Issuer certificate has invalid path length constraint: ${issuerCN}`);
        }
      }
      
      // Validate extensions for compliance
      const extensionValidation = this.validateExtensions(issuerCert.extensions, true);
      if (!extensionValidation.isCompliant) {
        issues.push(...extensionValidation.issues.map(issue => `Issuer ${issue}`));
      }
      
    } catch {
      // Extension parsing failed, skip detailed validation
    }
    
    return { issues };
  }

  // Check if certificate is self-signed
  private static isSelfSigned(cert: forge.pki.Certificate): boolean {
    try {
      return cert.verify(cert.publicKey as any);
    } catch {
      return false;
    }
  }

  // Generate certificate fingerprint
  private static generateCertificateFingerprint(cert: forge.pki.Certificate): string {
    try {
      const der = forge.asn1.toDer(forge.pki.certificateToAsn1(cert));
      const hash = forge.md.sha256.create();
      hash.update(der.getBytes());
      return hash.digest().toHex();
    } catch {
      return '';
    }
  }

  // Find issuer certificate from a list of CA certificates
  private static findIssuerCertificate(
    certificate: forge.pki.Certificate,
    caCertificates: string[]
  ): forge.pki.Certificate | null {
    const issuerDN = certificate.issuer.getField('CN')?.value;
    
    for (const caCertPem of caCertificates) {
      try {
        const caCert = forge.pki.certificateFromPem(caCertPem);
        const caSubjectDN = caCert.subject.getField('CN')?.value;
        
        if (issuerDN === caSubjectDN) {
          return caCert;
        }
      } catch (error) {
        // Skip invalid certificates
        continue;
      }
    }
    
    return null;
  }

  // Verify certificate signature
  static verifyCertificateSignature(certificatePem: string, issuerPublicKeyOrCertPem: string): boolean {
    try {
      const cert = forge.pki.certificateFromPem(certificatePem);
      let issuerPublicKey: any;
      if (/-----BEGIN CERTIFICATE-----/.test(issuerPublicKeyOrCertPem)) {
        const issuerCert = forge.pki.certificateFromPem(issuerPublicKeyOrCertPem);
        issuerPublicKey = issuerCert.publicKey;
      } else {
        issuerPublicKey = forge.pki.publicKeyFromPem(issuerPublicKeyOrCertPem);
      }
      return cert.verify(issuerPublicKey);
    } catch (error) {
      return false;
    }
  }

  // Check certificate expiration
  static isCertificateExpired(certificatePem: string): { expired: boolean; daysUntilExpiry: number; validFrom: Date; validTo: Date } {
    try {
      const cert = forge.pki.certificateFromPem(certificatePem);
      const now = new Date();
      const validFrom = cert.validity.notBefore;
      const validTo = cert.validity.notAfter;
      
      const expired = now > validTo;
      const daysUntilExpiry = Math.ceil((validTo.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      
      return {
        expired,
        daysUntilExpiry: expired ? 0 : daysUntilExpiry,
        validFrom,
        validTo
      };
    } catch (error) {
      return {
        expired: true,
        daysUntilExpiry: 0,
        validFrom: new Date(),
        validTo: new Date()
      };
    }
  }

  // Get certificate chain information
  static getCertificateChainInfo(certificatePem: string, caCertificates: string[]): {
    chainLength: number;
    isComplete: boolean;
    rootCA: string | null;
    intermediateCAs: string[];
    endEntity: string;
  } {
    try {
      const cert = forge.pki.certificateFromPem(certificatePem);
      const chain = this.validateCertificateChain(certificatePem, caCertificates, { checkExpiration: false });
      
      const endEntity = cert.subject.getField('CN')?.value || 'Unknown';
      const intermediateCAs: string[] = [];
      let rootCA: string | null = null;
      
      // Skip the first certificate (end entity)
      for (let i = 1; i < chain.chain.length; i++) {
        const chainCert = chain.chain[i].cert;
        const cn = chainCert.subject.getField('CN')?.value || 'Unknown';
        
        if (i === chain.chain.length - 1) {
          // Last certificate in chain is the root CA
          rootCA = cn;
        } else {
          // Intermediate CAs
          intermediateCAs.push(cn);
        }
      }
      
      return {
        chainLength: chain.chain.length,
        isComplete: chain.isValid,
        rootCA,
        intermediateCAs,
        endEntity
      };
    } catch (error) {
      return {
        chainLength: 0,
        isComplete: false,
        rootCA: null,
        intermediateCAs: [],
        endEntity: 'Unknown'
      };
    }
  }

  // Validate X.509 extensions for compliance
  static validateExtensions(extensions: any[], isCA: boolean): { isCompliant: boolean; issues: string[] } {
    const issues: string[] = [];
    
    // Check for required extensions
    const requiredExtensions = ['basicConstraints', 'keyUsage', 'subjectKeyIdentifier', 'authorityKeyIdentifier'];
    const foundExtensions = extensions.map(ext => ext.name);
    
    for (const required of requiredExtensions) {
      if (!foundExtensions.includes(required)) {
        issues.push(`Missing required extension: ${required}`);
      }
    }
    
    // Validate Basic Constraints
    const basicConstraints = extensions.find(ext => ext.name === 'basicConstraints');
    if (basicConstraints) {
      if (isCA && !basicConstraints.critical) {
        issues.push('Basic Constraints must be critical for CA certificates');
      }
      if (isCA && basicConstraints.pathLenConstraint !== undefined && basicConstraints.pathLenConstraint < 0) {
        issues.push('Path length constraint must be non-negative');
      }
    }
    
    // Validate Key Usage
    const keyUsage = extensions.find(ext => ext.name === 'keyUsage');
    if (keyUsage) {
      if (isCA && !keyUsage.critical) {
        issues.push('Key Usage must be critical for CA certificates');
      }
      if (isCA && !keyUsage.keyCertSign) {
        issues.push('CA certificates must have keyCertSign capability');
      }
      if (isCA && !keyUsage.cRLSign) {
        issues.push('CA certificates must have cRLSign capability');
      }
    }
    
    // Validate Policy Constraints (if present)
    const policyConstraints = extensions.find(ext => ext.name === 'policyConstraints');
    if (policyConstraints && isCA && !policyConstraints.critical) {
      issues.push('Policy Constraints must be critical for CA certificates');
    }
    
    // Validate Name Constraints (if present)
    const nameConstraints = extensions.find(ext => ext.name === 'nameConstraints');
    if (nameConstraints && isCA && !nameConstraints.critical) {
      issues.push('Name Constraints must be critical for CA certificates');
    }
    
    return {
      isCompliant: issues.length === 0,
      issues
    };
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
      extKeyUsage?: { serverAuth?: boolean; clientAuth?: boolean; codeSigning?: boolean; emailProtection?: boolean; timeStamping?: boolean; ocspSigning?: boolean };
      crlDistributionPointUrl?: string;
      ocspUrl?: string;
      pathLenConstraint?: number; // For CA certificates
      certificatePolicies?: string[]; // Policy OIDs
      policyConstraints?: { requireExplicitPolicy?: number; inhibitPolicyMapping?: number };
      nameConstraints?: { permittedSubtrees?: string[]; excludedSubtrees?: string[] };
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

    // Build extensions with proper X.509 compliance
    const extensions: any[] = [];

    // 1. Basic Constraints (CRITICAL for CA certificates)
    const basicConstraints: any = { 
      name: 'basicConstraints', 
      value: {
        cA: isCA,
      },
      critical: isCA // Critical for CA certificates
    };
    
    // Add path length constraint for CA certificates
    if (isCA && opts?.pathLenConstraint !== undefined) {
      basicConstraints.value.pathLenConstraint = opts.pathLenConstraint;
    }
    extensions.push(basicConstraints);

    // 2. Key Usage (CRITICAL for CA certificates)
    const keyUsage: any = { 
      name: 'keyUsage',
      value: {},
      critical: isCA // Critical for CA certificates
    };

    if (isCA) {
      // CA-specific key usage
      keyUsage.value.keyCertSign = true;    // Certificate signing
      keyUsage.value.cRLSign = true;        // CRL signing
      keyUsage.value.digitalSignature = true; // Digital signature
    } else {
      // End-entity key usage based on certificate type
      keyUsage.value.digitalSignature = true;
      keyUsage.value.keyEncipherment = true;
      keyUsage.value.dataEncipherment = true;
      keyUsage.value.keyAgreement = false;
      keyUsage.value.keyCertSign = false;
      keyUsage.value.cRLSign = false;
      keyUsage.value.encipherOnly = false;
      keyUsage.value.decipherOnly = false;
    }
    extensions.push(keyUsage);

    // 3. Subject Key Identifier (Non-critical)
    extensions.push({ 
      name: 'subjectKeyIdentifier', 
      value: this.getSubjectKeyIdentifierFromCSR(csr),
      critical: false 
    });

    // 4. Authority Key Identifier (Non-critical)
    extensions.push({ 
      name: 'authorityKeyIdentifier', 
      value: { keyIdentifier: this.getSubjectKeyIdentifier(caCert) },
      critical: false 
    });

    // 5. Extended Key Usage (Non-critical, purpose-specific)
    if (opts?.extKeyUsage) {
      const extKeyUsage: any = { name: 'extKeyUsage', value: {}, critical: false };
      const anySet = (
        opts.extKeyUsage.serverAuth ||
        opts.extKeyUsage.clientAuth ||
        opts.extKeyUsage.codeSigning ||
        opts.extKeyUsage.emailProtection ||
        opts.extKeyUsage.timeStamping ||
        opts.extKeyUsage.ocspSigning
      );
      if (anySet) {
        if (opts.extKeyUsage.serverAuth) extKeyUsage.value.serverAuth = true;
        if (opts.extKeyUsage.clientAuth) extKeyUsage.value.clientAuth = true;
        if (opts.extKeyUsage.codeSigning) extKeyUsage.value.codeSigning = true;
        if (opts.extKeyUsage.emailProtection) extKeyUsage.value.emailProtection = true;
        if (opts.extKeyUsage.timeStamping) extKeyUsage.value.timeStamping = true;
        if (opts.extKeyUsage.ocspSigning) extKeyUsage.value.ocspSigning = true;
        extensions.push(extKeyUsage);
      }
    }

    // 6. Subject Alternative Names (Non-critical)
    if (sans && sans.length > 0) {
      const isIPv4 = (s: string) => /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/.test(s);
      const isIPv6 = (s: string) => /^[0-9a-fA-F:]+$/.test(s) && s.includes(':');
      const altNames = sans.map((s) => {
        const value = s.trim();
        if (isIPv4(value) || isIPv6(value)) {
          return { type: 7, ip: value } as any; // IP address
        }
        return { type: 2, value } as any; // DNS name (supports wildcard like *.example.com)
      });
      extensions.push({ 
        name: 'subjectAltName', 
        value: { altNames },
        critical: false
      });
    }

    // 7. Certificate Policies (Non-critical) - REQUIRED for enterprise PKI
    if (opts?.certificatePolicies && opts.certificatePolicies.length > 0) {
      const policyIdentifiers = opts.certificatePolicies.map(policyOid => ({
        policyIdentifier: policyOid,
        policyQualifiers: [] // Can be extended with policy qualifiers
      }));
      extensions.push({ 
        name: 'certificatePolicies', 
        value: { policyIdentifiers }, 
        critical: false 
      });
    }

    // 8. Policy Constraints (CRITICAL for CA certificates) — disabled for compatibility
    // if (isCA && opts?.policyConstraints) {
    //   const policyConstraints: any = { name: 'policyConstraints', critical: true };
    //   if (opts.policyConstraints.requireExplicitPolicy !== undefined) policyConstraints.requireExplicitPolicy = opts.policyConstraints.requireExplicitPolicy;
    //   if (opts.policyConstraints.inhibitPolicyMapping !== undefined) policyConstraints.inhibitPolicyMapping = opts.policyConstraints.inhibitPolicyMapping;
    //   extensions.push(policyConstraints);
    // }

    // 9. Name Constraints (CRITICAL for CA certificates) — disabled for compatibility
    // if (isCA && opts?.nameConstraints) {
    //   const nameConstraints: any = { name: 'nameConstraints', critical: true };
    //   if (opts.nameConstraints.permittedSubtrees?.length) nameConstraints.permittedSubtrees = opts.nameConstraints.permittedSubtrees.map(domain => ({ type: 2, value: domain }));
    //   if (opts.nameConstraints.excludedSubtrees?.length) nameConstraints.excludedSubtrees = opts.nameConstraints.excludedSubtrees.map(domain => ({ type: 2, value: domain }));
    //   extensions.push(nameConstraints);
    // }

    // 10. CRL Distribution Points (Non-critical) - REQUIRED for enterprise PKI
    if (opts?.crlDistributionPointUrl) {
      extensions.push({ 
        name: 'cRLDistributionPoints', 
        value: [{
          distributionPoint: [{ type: 6, value: opts.crlDistributionPointUrl }],
          reasons: [1, 2, 3, 4, 5, 6, 8, 9, 10], // All revocation reasons
          cRLIssuer: undefined
        }],
        critical: false
      });
    }

    // 11. Authority Information Access (Non-critical) - REQUIRED for enterprise PKI
    if (opts?.ocspUrl) {
      extensions.push({
        name: 'authorityInfoAccess',
        value: {
          accessDescriptions: [
            {
              accessMethod: '1.3.6.1.5.5.7.48.1', // OCSP
              accessLocation: { type: 6, value: opts.ocspUrl },
            },
            {
              accessMethod: '1.3.6.1.5.5.7.48.2', // CA Issuers
              accessLocation: { type: 6, value: opts.ocspUrl.replace('/ocsp', '/ca') },
            },
          ],
        },
        critical: false
      });
    }

    cert.setExtensions(extensions);

    // Validate extensions for X.509 compliance (best-effort)
    // const validation = this.validateExtensions(extensions, isCA);
    // if (!validation.isCompliant) {
    //   throw new Error(`X.509 extension validation failed: ${validation.issues.join(', ')}`);
    // }

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

  // Get detailed extension information for debugging
  static getExtensionDetails(certPem: string): Array<{ name: string; critical: boolean; value: any }> {
    const cert = forge.pki.certificateFromPem(certPem);
    return cert.extensions.map(ext => ({
      name: ext.name,
      critical: ext.critical,
      value: ext.value
    }));
  }

  // Verify certificate extensions compliance
  static verifyCertificateCompliance(certPem: string): { isCompliant: boolean; issues: string[] } {
    const cert = forge.pki.certificateFromPem(certPem);
    const isCA = cert.extensions.some(ext => 
      ext.name === 'basicConstraints' && ext.value && ext.value.cA
    );
    
    return this.validateExtensions(cert.extensions, isCA);
  }

  static selfSignCSR(
    csrPem: string,
    privateKeyPem: string,
    validityDays: number,
    opts?: {
      crlDistributionPointUrl?: string;
      ocspUrl?: string;
    }
    ): string {
    const csr = forge.pki.certificationRequestFromPem(csrPem);
    if (!csr.verify()) {
      throw new Error('Invalid CSR signature');
    }

    const privateKey = forge.pki.privateKeyFromPem(privateKeyPem);
    const publicKey = csr.publicKey;

    const cert = forge.pki.createCertificate();
    cert.publicKey = publicKey;
    cert.serialNumber = CertificateUtils.generateSerialNumber();

    const now = new Date();
    cert.validity.notBefore = now;
    cert.validity.notAfter = new Date(now.getTime() + validityDays * 24 * 60 * 60 * 1000);

    // Self-signed, so issuer is the same as subject
    cert.setSubject(csr.subject.attributes);
    cert.setIssuer(csr.subject.attributes);

    const extensions: any[] = [
      {
        name: 'basicConstraints',
        value: {
          cA: true,
          pathLenConstraint: 0,
        },
        critical: true,
      },
      {
        name: 'keyUsage',
        value: {
          keyCertSign: true,
          cRLSign: true,
        },
        critical: true,
      },
      {
        name: 'subjectKeyIdentifier',
        value: this.getSubjectKeyIdentifierFromCSR(csr),
        critical: false,
      },
      // Authority Key Identifier for self-signed certs is the same as Subject Key Identifier
      {
        name: 'authorityKeyIdentifier',
        value: { keyIdentifier: this.getSubjectKeyIdentifierFromCSR(csr) },
        critical: false,
      },
    ];

    if (opts?.crlDistributionPointUrl) {
      extensions.push({
        name: 'cRLDistributionPoints',
        value: [{
          distributionPoint: [{ type: 6, value: opts.crlDistributionPointUrl }],
        }],
        critical: false
      });
    }

    if (opts?.ocspUrl) {
      extensions.push({
        name: 'authorityInfoAccess',
        value: {
          accessDescriptions: [
            {
              accessMethod: '1.3.6.1.5.5.7.48.1', // OCSP
              accessLocation: { type: 6, value: opts.ocspUrl },
            },
          ],
        },
        critical: false
      });
    }

    cert.setExtensions(extensions);
    cert.sign(privateKey, forge.md.sha256.create());

    return forge.pki.certificateToPem(cert);
  }

  private static getSubjectKeyIdentifierFromCSR(csr: any): string {
    const publicKeyDer = forge.asn1.toDer(forge.pki.publicKeyToAsn1(csr.publicKey)).getBytes();
    const sha1 = forge.md.sha1.create();
    sha1.update(publicKeyDer);
    return sha1.digest().getBytes();
  }
}