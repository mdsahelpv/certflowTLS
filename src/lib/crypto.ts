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
    nextUpdate: Date,
    options: {
      crlNumber?: number;
      caCertificatePem?: string;
      crlDistributionPoint?: string;
      deltaCRL?: boolean;
      deltaCRLIndicator?: number;
      authorityInfoAccess?: string;
    } = {}
  ): string {
    const crl = forge.pki.createCertificateRevocationList();

    // Issuer
    crl.issuer = this.convertDNToForgeAttrs(issuerDN);
    crl.thisUpdate = new Date();
    crl.nextUpdate = nextUpdate;

    // Revoked entries with enhanced revocation reasons
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

    // Add CRL extensions
    const extensions: any[] = [];

    // 1. CRL Number (critical)
    if (options.crlNumber !== undefined) {
      extensions.push({
        id: 'cRLNumber',
        value: new forge.jsbn.BigInteger(options.crlNumber.toString()),
        critical: false,
      });
    }

    // 2. Authority Key Identifier (non-critical)
    if (options.caCertificatePem) {
      try {
        const caCert = forge.pki.certificateFromPem(options.caCertificatePem);
        const authorityKeyId = this.generateAuthorityKeyIdentifier(caCert);
        extensions.push({
          id: 'authorityKeyIdentifier',
          value: authorityKeyId,
          critical: false,
        });
      } catch (error) {
        console.warn('Failed to generate Authority Key Identifier:', error);
      }
    }

    // 3. CRL Distribution Points (non-critical)
    if (options.crlDistributionPoint) {
      extensions.push({
        id: 'cRLDistributionPoints',
        value: [{
          distributionPoint: [{
            type: 6, // URI
            value: options.crlDistributionPoint
          }],
          reasons: [1, 2, 3, 4, 5, 6, 8, 9, 10], // All revocation reasons
          cRLIssuer: null
        }],
        critical: false,
      });
    }

    // 4. Delta CRL Indicator (critical for delta CRLs)
    if (options.deltaCRL && options.deltaCRLIndicator !== undefined) {
      extensions.push({
        id: 'deltaCRLIndicator',
        value: new forge.jsbn.BigInteger(options.deltaCRLIndicator.toString()),
        critical: true,
      });
    }

    // 5. Authority Information Access (non-critical)
    if (options.authorityInfoAccess) {
      extensions.push({
        id: 'authorityInfoAccess',
        value: [{
          accessMethod: '1.3.6.1.5.5.7.48.2', // id-ad-caIssuers
          accessLocation: {
            type: 6, // URI
            value: options.authorityInfoAccess
          }
        }],
        critical: false,
      });
    }

    // 6. Issuing Distribution Point (critical)
    if (options.crlDistributionPoint) {
      extensions.push({
        id: 'issuingDistributionPoint',
        value: {
          distributionPoint: [{
            type: 6, // URI
            value: options.crlDistributionPoint
          }],
          onlyContainsUserCerts: false,
          onlyContainsCACerts: false,
          onlySomeReasons: null,
          indirectCRL: false,
          onlyContainsAttributeCerts: false
        },
        critical: true,
      });
    }

    // Apply extensions
    if (extensions.length > 0) {
      crl.extensions = extensions;
    }

    // Sign
    const caPrivateKey = forge.pki.privateKeyFromPem(caPrivateKeyPem);
    crl.sign(caPrivateKey, forge.md.sha256.create());
    return forge.pki.crlToPem(crl);
  }

  // Generate Delta CRL
  static generateDeltaCRL(
    revokedCertificates: Array<{
      serialNumber: string;
      revocationDate: Date;
      reason: string;
    }>,
    issuerDN: string,
    caPrivateKeyPem: string,
    nextUpdate: Date,
    baseCRLNumber: number,
    deltaCRLNumber: number,
    options: {
      caCertificatePem?: string;
      crlDistributionPoint?: string;
      authorityInfoAccess?: string;
    } = {}
  ): string {
    return this.generateCRL(revokedCertificates, issuerDN, caPrivateKeyPem, nextUpdate, {
      ...options,
      deltaCRL: true,
      deltaCRLIndicator: deltaCRLNumber,
      crlNumber: baseCRLNumber,
    });
  }

  // Generate Authority Key Identifier from CA certificate
  private static generateAuthorityKeyIdentifier(caCert: any): any {
    const publicKey = caCert.publicKey;
    const keyId = forge.pki.getPublicKeyFingerprint(publicKey, {
      algorithm: 'sha256',
      encoding: 'hex'
    });
    
    return {
      keyIdentifier: forge.util.hexToBytes(keyId),
      authorityCertIssuer: null,
      authorityCertSerialNumber: null
    };
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

  // Enhanced revocation reason mapping with descriptions
  static getRevocationReasonDescription(reason: string): { code: number; description: string; critical: boolean } {
    const reasons: Record<string, { code: number; description: string; critical: boolean }> = {
      UNSPECIFIED: { code: 0, description: 'Unspecified', critical: false },
      KEY_COMPROMISE: { code: 1, description: 'Key Compromise', critical: true },
      CA_COMPROMISE: { code: 2, description: 'CA Compromise', critical: true },
      AFFILIATION_CHANGED: { code: 3, description: 'Affiliation Changed', critical: false },
      SUPERSEDED: { code: 4, description: 'Superseded', critical: false },
      CESSATION_OF_OPERATION: { code: 5, description: 'Cessation of Operation', critical: false },
      CERTIFICATE_HOLD: { code: 6, description: 'Certificate Hold', critical: false },
      REMOVE_FROM_CRL: { code: 8, description: 'Remove from CRL', critical: false },
      PRIVILEGE_WITHDRAWN: { code: 9, description: 'Privilege Withdrawn', critical: false },
      AA_COMPROMISE: { code: 10, description: 'AA Compromise', critical: true },
    };
    return reasons[reason] ?? reasons.UNSPECIFIED;
  }

  // Validate CRL extensions
  static validateCRLExtensions(crlPem: string): { isValid: boolean; issues: string[] } {
    try {
      const crl = forge.pki.crlFromPem(crlPem);
      const issues: string[] = [];

      // Check for required extensions
      if (!crl.extensions) {
        issues.push('CRL has no extensions');
        return { isValid: false, issues };
      }

      const extensions = crl.extensions;
      const extensionNames = extensions.map(ext => ext.name || ext.id);

      // Check for CRL Number
      if (!extensionNames.includes('cRLNumber')) {
        issues.push('Missing CRL Number extension');
      }

      // Check for Authority Key Identifier
      if (!extensionNames.includes('authorityKeyIdentifier')) {
        issues.push('Missing Authority Key Identifier extension');
      }

      // Check for Issuing Distribution Point (should be critical)
      const issuingDP = extensions.find(ext => ext.name === 'issuingDistributionPoint' || ext.id === '2.5.29.28');
      if (issuingDP && !issuingDP.critical) {
        issues.push('Issuing Distribution Point extension should be critical');
      }

      // Check for Delta CRL Indicator (should be critical if present)
      const deltaCRL = extensions.find(ext => ext.name === 'deltaCRLIndicator' || ext.id === '2.5.29.27');
      if (deltaCRL && !deltaCRL.critical) {
        issues.push('Delta CRL Indicator extension should be critical');
      }

      return {
        isValid: issues.length === 0,
        issues
      };
    } catch (error) {
      return {
        isValid: false,
        issues: [`Failed to parse CRL: ${error instanceof Error ? error.message : String(error)}`]
      };
    }
  }

  // Get CRL information and statistics
  static getCRLInfo(crlPem: string): {
    issuer: string;
    thisUpdate: Date;
    nextUpdate: Date;
    revokedCount: number;
    crlNumber?: number;
    isDeltaCRL: boolean;
    deltaCRLIndicator?: number;
    extensions: string[];
  } {
    try {
      const crl = forge.pki.crlFromPem(crlPem);
      
      const crlNumber = crl.extensions?.find(ext => 
        ext.name === 'cRLNumber' || ext.id === '2.5.29.20'
      )?.value?.toString();
      
      const deltaCRLIndicator = crl.extensions?.find(ext => 
        ext.name === 'deltaCRLIndicator' || ext.id === '2.5.29.27'
      )?.value?.toString();

      return {
        issuer: forge.pki.distinguishedNameToString(crl.issuer),
        thisUpdate: crl.thisUpdate,
        nextUpdate: crl.nextUpdate,
        revokedCount: crl.revokedCertificates?.length || 0,
        crlNumber: crlNumber ? parseInt(crlNumber) : undefined,
        isDeltaCRL: !!deltaCRLIndicator,
        deltaCRLIndicator: deltaCRLIndicator ? parseInt(deltaCRLIndicator) : undefined,
        extensions: crl.extensions?.map(ext => ext.name || ext.id) || [],
      };
    } catch (error) {
      throw new Error(`Failed to parse CRL: ${error instanceof Error ? error.message : String(error)}`);
    }
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

  // Validate certificate chain and verify signatures
  static validateCertificateChain(
    certificatePem: string,
    caCertificates: string[],
    options: {
      checkExpiration?: boolean;
      checkRevocation?: boolean;
      maxChainLength?: number;
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
          issues.push(`Certificate is not yet valid. Valid from: ${cert.validity.notBefore}`);
        }
        if (now > cert.validity.notAfter) {
          issues.push(`Certificate has expired. Expired on: ${cert.validity.notAfter}`);
        }
      }
      
      // Verify certificate signature
      if (!cert.verify(cert.publicKey)) {
        issues.push('Certificate signature verification failed');
      }
      
      // Build and validate certificate chain
      const maxChainLength = options.maxChainLength || 10;
      let currentCert = cert;
      let chainLength = 0;
      
      while (chainLength < maxChainLength) {
        // Find issuer certificate
        const issuerCert = this.findIssuerCertificate(currentCert, caCertificates);
        if (!issuerCert) {
          if (chainLength === 0) {
            issues.push('No issuer certificate found for the certificate');
          } else {
            // This is the root CA
            break;
          }
        } else {
          // Verify signature with issuer's public key
          if (!currentCert.verify(issuerCert.publicKey)) {
            issues.push(`Certificate signature verification failed with issuer: ${issuerCert.subject.getField('CN')?.value || 'Unknown'}`);
          }
          
          // Check if issuer is a CA
          const basicConstraints = issuerCert.getExtension('basicConstraints');
          if (!basicConstraints || !basicConstraints.value || !basicConstraints.value.cA) {
            issues.push(`Issuer certificate is not a CA: ${issuerCert.subject.getField('CN')?.value || 'Unknown'}`);
          }
          
          // Check issuer's key usage
          const keyUsage = issuerCert.getExtension('keyUsage');
          if (!keyUsage || !keyUsage.value || !keyUsage.value.keyCertSign) {
            issues.push(`Issuer certificate cannot sign other certificates: ${issuerCert.subject.getField('CN')?.value || 'Unknown'}`);
          }
          
          chain.push({ cert: issuerCert, status: 'valid' });
          currentCert = issuerCert;
        }
        
        chainLength++;
      }
      
      if (chainLength >= maxChainLength) {
        issues.push(`Certificate chain too long (max: ${maxChainLength})`);
      }
      
    } catch (error) {
      issues.push(`Error parsing certificate: ${error instanceof Error ? error.message : String(error)}`);
    }
    
    return {
      isValid: issues.length === 0,
      issues,
      chain
    };
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
  static verifyCertificateSignature(certificatePem: string, issuerPublicKeyPem: string): boolean {
    try {
      const cert = forge.pki.certificateFromPem(certificatePem);
      const issuerPublicKey = forge.pki.publicKeyFromPem(issuerPublicKeyPem);
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
      cA: isCA,
      critical: isCA // Critical for CA certificates
    };
    
    // Add path length constraint for CA certificates
    if (isCA && opts?.pathLenConstraint !== undefined) {
      basicConstraints.pathLenConstraint = opts.pathLenConstraint;
    }
    extensions.push(basicConstraints);

    // 2. Key Usage (CRITICAL for CA certificates)
    const keyUsage: any = { 
      name: 'keyUsage',
      critical: isCA // Critical for CA certificates
    };

    if (isCA) {
      // CA-specific key usage
      keyUsage.keyCertSign = true;    // Certificate signing
      keyUsage.cRLSign = true;        // CRL signing
      keyUsage.digitalSignature = true; // Digital signature
    } else {
      // End-entity key usage based on certificate type
      keyUsage.digitalSignature = true;
      keyUsage.keyEncipherment = true;
      keyUsage.dataEncipherment = true;
      keyUsage.keyAgreement = false;
      keyUsage.keyCertSign = false;
      keyUsage.cRLSign = false;
      keyUsage.encipherOnly = false;
      keyUsage.decipherOnly = false;
    }
    extensions.push(keyUsage);

    // 3. Subject Key Identifier (Non-critical)
    extensions.push({ 
      name: 'subjectKeyIdentifier',
      critical: false
    });

    // 4. Authority Key Identifier (Non-critical)
    extensions.push({ 
      name: 'authorityKeyIdentifier', 
      keyIdentifier: this.getSubjectKeyIdentifier(caCert),
      critical: false
    });

    // 5. Extended Key Usage (Non-critical, purpose-specific)
    if (opts?.extKeyUsage) {
      const extKeyUsage: any = { 
        name: 'extKeyUsage',
        critical: false
      };

      // Add specific key usage purposes
      if (opts.extKeyUsage.serverAuth) extKeyUsage.serverAuth = true;
      if (opts.extKeyUsage.clientAuth) extKeyUsage.clientAuth = true;
      if (opts.extKeyUsage.codeSigning) extKeyUsage.codeSigning = true;
      if (opts.extKeyUsage.emailProtection) extKeyUsage.emailProtection = true;
      if (opts.extKeyUsage.timeStamping) extKeyUsage.timeStamping = true;
      if (opts.extKeyUsage.ocspSigning) extKeyUsage.ocspSigning = true;

      extensions.push(extKeyUsage);
    }

    // 6. Subject Alternative Names (Non-critical)
    if (sans && sans.length > 0) {
      extensions.push({ 
        name: 'subjectAltName', 
        altNames: sans.map((s) => ({ type: 2, value: s })),
        critical: false
      });
    }

    // 7. Certificate Policies (Non-critical)
    if (opts?.certificatePolicies && opts.certificatePolicies.length > 0) {
      const policyIdentifiers = opts.certificatePolicies.map(policyOid => ({
        policyIdentifier: policyOid,
        policyQualifiers: [] // Can be extended with policy qualifiers
      }));

      extensions.push({
        name: 'certificatePolicies',
        value: policyIdentifiers,
        critical: false
      });
    }

    // 8. Policy Constraints (CRITICAL for CA certificates)
    if (isCA && opts?.policyConstraints) {
      const policyConstraints: any = {
        name: 'policyConstraints',
        critical: true
      };

      if (opts.policyConstraints.requireExplicitPolicy !== undefined) {
        policyConstraints.requireExplicitPolicy = opts.policyConstraints.requireExplicitPolicy;
      }

      if (opts.policyConstraints.inhibitPolicyMapping !== undefined) {
        policyConstraints.inhibitPolicyMapping = opts.policyConstraints.inhibitPolicyMapping;
      }

      extensions.push(policyConstraints);
    }

    // 9. Name Constraints (CRITICAL for CA certificates)
    if (isCA && opts?.nameConstraints) {
      const nameConstraints: any = {
        name: 'nameConstraints',
        critical: true
      };

      if (opts.nameConstraints.permittedSubtrees && opts.nameConstraints.permittedSubtrees.length > 0) {
        nameConstraints.permittedSubtrees = opts.nameConstraints.permittedSubtrees.map(domain => ({
          type: 2, // DNS name
          value: domain
        }));
      }

      if (opts.nameConstraints.excludedSubtrees && opts.nameConstraints.excludedSubtrees.length > 0) {
        nameConstraints.excludedSubtrees = opts.nameConstraints.excludedSubtrees.map(domain => ({
          type: 2, // DNS name
          value: domain
        }));
      }

      extensions.push(nameConstraints);
    }

    // 10. CRL Distribution Points (Non-critical)
    if (opts?.crlDistributionPointUrl) {
      extensions.push({ 
        name: 'cRLDistributionPoints', 
        value: [{
          distributionPoint: [{
            type: 6, // URI
            value: opts.crlDistributionPointUrl
          }]
        }],
        critical: false
      });
    }

    // 11. Authority Information Access (Non-critical)
    if (opts?.ocspUrl) {
      extensions.push({
        name: 'authorityInfoAccess',
        accessDescriptions: [
          {
            accessMethod: 'ocsp',
            accessLocation: { type: 6, value: opts.ocspUrl },
          },
        ],
        critical: false
      });
    }

    cert.setExtensions(extensions);

    // Validate extensions for X.509 compliance
    const validation = this.validateExtensions(extensions, isCA);
    if (!validation.isCompliant) {
      throw new Error(`X.509 extension validation failed: ${validation.issues.join(', ')}`);
    }

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
}