import { db } from '@/lib/db';
import { X509Utils } from './crypto';
import { AuditService } from './audit';
import forge from 'node-forge';

// Simple in-memory cache for validation results (in production, use Redis)
const validationCache = new Map<string, { result: CertificateValidationResult; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export interface CertificateValidationResult {
  isValid: boolean;
  issues: string[];
  chain: Array<{ cert: any; status: string }>;
  chainInfo: {
    chainLength: number;
    isComplete: boolean;
    rootCA: string | null;
    intermediateCAs: string[];
    endEntity: string;
  };
  expiration: {
    expired: boolean;
    daysUntilExpiry: number;
    validFrom: Date;
    validTo: Date;
  };
  signature: {
    verified: boolean;
    issuer: string;
  };
  lastValidated: Date;
  cached?: boolean;
}

export interface ValidationOptions {
  checkExpiration?: boolean;
  checkRevocation?: boolean;
  maxChainLength?: number;
  includeChainInfo?: boolean;
  requireTrustedRoot?: boolean;
  validateExtensions?: boolean;
  checkKeyUsage?: boolean;
  checkBasicConstraints?: boolean;
}

export class CertificateValidationService {
  /**
   * Validate a certificate with full chain validation
   */
  static async validateCertificate(
    certificatePem: string,
    options: ValidationOptions = {},
    userId?: string,
    username?: string
  ): Promise<CertificateValidationResult> {
    const defaultOptions: ValidationOptions = {
      checkExpiration: true,
      checkRevocation: true,
      maxChainLength: 10,
      includeChainInfo: true,
      requireTrustedRoot: true,
      validateExtensions: true,
      checkKeyUsage: true,
      checkBasicConstraints: true,
      ...options
    };

    // Generate cache key based on certificate content and options
    const cacheKey = this.generateCacheKey(certificatePem, defaultOptions);
    
    // Check cache first
    const cachedResult = this.getCachedResult(cacheKey);
    if (cachedResult) {
      // Update lastValidated timestamp
      cachedResult.lastValidated = new Date();
      cachedResult.cached = true;
      
      // Log cache hit
      await AuditService.log({
        action: 'CERTIFICATE_VALIDATED',
        userId,
        username,
        description: `Certificate validation completed (cached) for ${cachedResult.chainInfo.endEntity}`,
        metadata: {
          isValid: cachedResult.isValid,
          issuesCount: cachedResult.issues.length,
          chainLength: cachedResult.chainInfo.chainLength,
          expired: cachedResult.expiration.expired,
          endEntity: cachedResult.chainInfo.endEntity,
          issuer: cachedResult.signature.issuer,
          trustedRoot: cachedResult.chainInfo.rootCA !== null,
          validationOptions: defaultOptions,
          cached: true
        }
      });
      
      return cachedResult;
    }

    try {
      // Get all CA certificates from database
      const caConfigs = await db.cAConfig.findMany({
        where: { status: 'ACTIVE' },
        select: { certificate: true }
      });

      const caCertificates = caConfigs
        .map(config => config.certificate)
        .filter(Boolean) as string[];

      // Validate certificate chain with enhanced options
      const chainValidation = X509Utils.validateCertificateChain(
        certificatePem,
        caCertificates,
        {
          checkExpiration: defaultOptions.checkExpiration,
          maxChainLength: defaultOptions.maxChainLength,
          requireTrustedRoot: defaultOptions.requireTrustedRoot
        }
      );

      // Check expiration
      const expiration = X509Utils.isCertificateExpired(certificatePem);

      // Get chain information
      const chainInfo = X509Utils.getCertificateChainInfo(certificatePem, caCertificates);

      // Check revocation if requested
      if (defaultOptions.checkRevocation) {
        const revocationStatus = await this.checkRevocationStatus(certificatePem);
        if (revocationStatus.isRevoked) {
          chainValidation.issues.push(`Certificate is revoked: ${revocationStatus.reason}`);
        }
      }

      // Verify signature
      const signature = await this.verifySignature(certificatePem, caCertificates);

      // Additional validation checks
      if (defaultOptions.validateExtensions || defaultOptions.checkKeyUsage || defaultOptions.checkBasicConstraints) {
        const additionalValidation = await this.performAdditionalValidation(
          certificatePem,
          defaultOptions
        );
        chainValidation.issues.push(...additionalValidation.issues);
      }

      const result: CertificateValidationResult = {
        isValid: chainValidation.isValid && !expiration.expired && signature.verified,
        issues: chainValidation.issues,
        chain: chainValidation.chain,
        chainInfo,
        expiration,
        signature,
        lastValidated: new Date(),
        cached: false
      };

      // Cache the result
      this.cacheValidationResult(cacheKey, result);

      // Log validation attempt with proper action and user context
      await AuditService.log({
        action: 'CERTIFICATE_VALIDATED',
        userId,
        username,
        description: `Certificate validation completed for ${chainInfo.endEntity}`,
        metadata: {
          isValid: result.isValid,
          issuesCount: result.issues.length,
          chainLength: result.chainInfo.chainLength,
          expired: result.expiration.expired,
          endEntity: result.chainInfo.endEntity,
          issuer: signature.issuer,
          trustedRoot: result.chainInfo.rootCA !== null,
          validationOptions: defaultOptions
        }
      });

      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // Log validation error with proper action and user context
      await AuditService.log({
        action: 'CERTIFICATE_VALIDATION_ERROR',
        userId,
        username,
        description: `Certificate validation failed: ${errorMessage}`,
        metadata: { 
          error: errorMessage,
          certificatePemLength: certificatePem.length // Log length, not content
        }
      });

      return {
        isValid: false,
        issues: [`Validation error: ${errorMessage}`],
        chain: [],
        chainInfo: {
          chainLength: 0,
          isComplete: false,
          rootCA: null,
          intermediateCAs: [],
          endEntity: 'Unknown'
        },
        expiration: {
          expired: true,
          daysUntilExpiry: 0,
          validFrom: new Date(),
          validTo: new Date()
        },
        signature: {
          verified: false,
          issuer: 'Unknown'
        },
        lastValidated: new Date(),
        cached: false
      };
    }
  }

  /**
   * Check if a certificate is revoked
   */
  private static async checkRevocationStatus(certificatePem: string): Promise<{
    isRevoked: boolean;
    reason?: string;
    revokedAt?: Date;
  }> {
    try {
      // Extract serial number from certificate
      const cert = forge.pki.certificateFromPem(certificatePem);
      const serialNumber = cert.serialNumber;

      // Check database for revocation - use findFirst instead of findUnique
      const revocation = await db.certificateRevocation.findFirst({
        where: { serialNumber }
      });

      if (revocation) {
        return {
          isRevoked: true,
          reason: revocation.revocationReason,
          revokedAt: revocation.revocationDate
        };
      }

      return { isRevoked: false };

    } catch (error) {
      return { isRevoked: false };
    }
  }

  /**
   * Verify certificate signature
   */
  private static async verifySignature(
    certificatePem: string,
    caCertificates: string[]
  ): Promise<{ verified: boolean; issuer: string }> {
    try {
      const cert = forge.pki.certificateFromPem(certificatePem);
      const issuerDN = cert.issuer.getField('CN')?.value || 'Unknown';

      // Find issuer certificate
      const issuerCert = caCertificates.find(caCertPem => {
        try {
          const caCert = forge.pki.certificateFromPem(caCertPem);
          const caSubjectDN = caCert.subject.getField('CN')?.value;
          return issuerDN === caSubjectDN;
        } catch {
          return false;
        }
      });

      if (!issuerCert) {
        return { verified: false, issuer: issuerDN };
      }

      // Verify signature
      const verified = X509Utils.verifyCertificateSignature(certificatePem, issuerCert);
      return { verified, issuer: issuerDN };

    } catch (error) {
      return { verified: false, issuer: 'Unknown' };
    }
  }

  /**
   * Perform additional validation checks on the certificate
   */
  private static async performAdditionalValidation(
    certificatePem: string,
    options: ValidationOptions
  ): Promise<{ issues: string[] }> {
    const issues: string[] = [];
    
    try {
      const cert = forge.pki.certificateFromPem(certificatePem);
      
      // Validate extensions if requested
      if (options.validateExtensions) {
        const extensionValidation = X509Utils.validateExtensions(cert.extensions, false);
        if (!extensionValidation.isCompliant) {
          issues.push(...extensionValidation.issues);
        }
      }
      
      // Check key usage if requested
      if (options.checkKeyUsage) {
        const keyUsage: any = cert.getExtension('keyUsage');
        if (keyUsage) {
          // Check for appropriate key usage based on certificate type
          const hasServerAuth = keyUsage.extKeyUsage?.includes('1.3.6.1.5.5.7.3.1');
          const hasClientAuth = keyUsage.extKeyUsage?.includes('1.3.6.1.5.5.7.3.2');
          const hasCodeSigning = keyUsage.extKeyUsage?.includes('1.3.6.1.5.5.7.3.3');
          
          if (!hasServerAuth && !hasClientAuth && !hasCodeSigning) {
            issues.push('Certificate lacks appropriate extended key usage');
          }
        }
      }
      
      // Check basic constraints if requested
      if (options.checkBasicConstraints) {
        const basicConstraints: any = cert.getExtension('basicConstraints');
        if (basicConstraints?.cA && !basicConstraints.critical) {
          issues.push('Basic Constraints extension should be critical for CA certificates');
        }
      }
      
      // Check for weak algorithms
      const publicKey = cert.publicKey;
      if (publicKey) {
        if (publicKey.n && publicKey.n.bitLength() < 2048) {
          issues.push('RSA key size is less than 2048 bits (weak)');
        }
        if (publicKey.curve && ['secp160k1', 'secp160r1', 'secp160r2'].includes(publicKey.curve)) {
          issues.push('ECDSA curve is weak (less than 256 bits)');
        }
      }
      
      // Check for deprecated hash algorithms in signature
      const signatureAlgorithm = cert.signatureAlgorithm;
      if (signatureAlgorithm && signatureAlgorithm.includes('md5')) {
        issues.push('Certificate uses deprecated MD5 hash algorithm');
      }
      
    } catch (error) {
      issues.push('Failed to perform additional validation checks');
    }
    
    return { issues };
  }

  /**
   * Update lastValidated timestamp for a certificate
   */
  static async updateLastValidated(certificateId: string): Promise<void> {
    try {
      await db.certificate.update({
        where: { id: certificateId },
        data: { lastValidated: new Date() }
      });
    } catch (error) {
      // Log error but don't fail validation
      console.error('Failed to update lastValidated:', error);
    }
  }

  /**
   * Validate a certificate by ID from database
   */
  static async validateCertificateById(
    certificateId: string,
    options: ValidationOptions = {},
    userId?: string,
    username?: string
  ): Promise<CertificateValidationResult | null> {
    try {
      const certificate = await db.certificate.findUnique({
        where: { id: certificateId },
        select: { certificate: true, serialNumber: true }
      });

      if (!certificate?.certificate) {
        return null;
      }

      const result = await this.validateCertificate(
        certificate.certificate,
        options,
        userId,
        username
      );

      // Update lastValidated timestamp
      await this.updateLastValidated(certificateId);

      return result;
    } catch (error) {
      console.error('Error validating certificate by ID:', error);
      return null;
    }
  }

  /**
   * Get all certificates that need validation
   */
  static async getCertificatesForValidation(): Promise<Array<{
    id: string;
    serialNumber: string;
    subjectDN: string;
    validTo: Date;
    lastValidated?: Date;
  }>> {
    const now = new Date();
    const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    return await db.certificate.findMany({
      where: {
        status: 'ACTIVE',
        validTo: {
          gte: now,
          lte: thirtyDaysFromNow
        }
      },
      select: {
        id: true,
        serialNumber: true,
        subjectDN: true,
        validTo: true,
        // Remove lastValidated until schema is updated
        // lastValidated: true
      }
    });
  }

  /**
   * Batch validate multiple certificates
   */
  static async batchValidateCertificates(
    certificateIds: string[],
    options: ValidationOptions = {}
  ): Promise<Array<{ certificateId: string; result: CertificateValidationResult }>> {
    const results: Array<{ certificateId: string; result: CertificateValidationResult }> = [];

    for (const certificateId of certificateIds) {
      try {
        const certificate = await db.certificate.findUnique({
          where: { id: certificateId },
          select: { certificate: true }
        });

        if (certificate?.certificate) {
          const result = await this.validateCertificate(certificate.certificate, options);
          results.push({ certificateId, result });
        }
      } catch (error) {
        // Log error and continue with next certificate
        console.error(`Error validating certificate ${certificateId}:`, error);
      }
    }

    return results;
  }

  /**
   * Get validation statistics
   */
  static async getValidationStatistics(): Promise<{
    totalCertificates: number;
    validCertificates: number;
    expiredCertificates: number;
    revokedCertificates: number;
    certificatesNeedingValidation: number;
    averageChainLength: number;
  }> {
    const [
      totalCertificates,
      expiredCertificates,
      revokedCertificates,
      certificatesNeedingValidation
    ] = await Promise.all([
      db.certificate.count({ where: { status: 'ACTIVE' } }),
      db.certificate.count({ where: { status: 'EXPIRED' } }),
      db.certificate.count({ where: { status: 'REVOKED' } }),
      this.getCertificatesForValidation().then(certs => certs.length)
    ]);

    const validCertificates = totalCertificates - expiredCertificates - revokedCertificates;

    // Calculate average chain length (simplified)
    const averageChainLength = 2; // Most certificates have 2-level chains

    return {
      totalCertificates,
      validCertificates,
      expiredCertificates,
      revokedCertificates,
      certificatesNeedingValidation,
      averageChainLength
    };
  }

  /**
   * Generate a cache key for a certificate validation result.
   */
  private static generateCacheKey(certificatePem: string, options: ValidationOptions): string {
    return `${certificatePem}-${JSON.stringify(options)}`;
  }

  /**
   * Get a cached validation result.
   */
  private static getCachedResult(cacheKey: string): CertificateValidationResult | null {
    const cached = validationCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.result;
    }
    return null;
  }

  /**
   * Cache a validation result.
   */
  private static cacheValidationResult(cacheKey: string, result: CertificateValidationResult): void {
    validationCache.set(cacheKey, { result, timestamp: Date.now() });
  }

  /**
   * Clear the validation cache.
   */
  static async clearValidationCache(): Promise<{ cleared: number }> {
    const size = validationCache.size;
    validationCache.clear();
    return { cleared: size };
  }

  /**
   * Get cache statistics.
   */
  static async getCacheStatistics(): Promise<{
    size: number;
    hitRate: number;
    totalRequests: number;
    cacheHits: number;
  }> {
    // This is a simplified implementation - in production, track actual hit rates
    return {
      size: validationCache.size,
      hitRate: 0.75, // Placeholder - implement actual tracking
      totalRequests: 0, // Placeholder - implement actual tracking
      cacheHits: 0 // Placeholder - implement actual tracking
    };
  }
}
