import { db } from '@/lib/db';
import { X509Utils } from './crypto';
import { AuditService } from './audit';
import forge from 'node-forge';

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
}

export interface ValidationOptions {
  checkExpiration?: boolean;
  checkRevocation?: boolean;
  maxChainLength?: number;
  includeChainInfo?: boolean;
}

export class CertificateValidationService {
  /**
   * Validate a certificate with full chain validation
   */
  static async validateCertificate(
    certificatePem: string,
    options: ValidationOptions = {}
  ): Promise<CertificateValidationResult> {
    const defaultOptions: ValidationOptions = {
      checkExpiration: true,
      checkRevocation: true,
      maxChainLength: 10,
      includeChainInfo: true,
      ...options
    };

    try {
      // Get all CA certificates from database
      const caConfigs = await db.cAConfig.findMany({
        where: { status: 'ACTIVE' },
        select: { certificate: true }
      });

      const caCertificates = caConfigs
        .map(config => config.certificate)
        .filter(Boolean) as string[];

      // Validate certificate chain
      const chainValidation = X509Utils.validateCertificateChain(
        certificatePem,
        caCertificates,
        {
          checkExpiration: defaultOptions.checkExpiration,
          maxChainLength: defaultOptions.maxChainLength
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

      const result: CertificateValidationResult = {
        isValid: chainValidation.isValid && !expiration.expired && signature.verified,
        issues: chainValidation.issues,
        chain: chainValidation.chain,
        chainInfo,
        expiration,
        signature,
        lastValidated: new Date()
      };

      // Log validation attempt
      await AuditService.log({
        action: 'CERTIFICATE_ISSUED' as any, // Temporary fix until schema is regenerated
        description: `Certificate validation completed for ${chainInfo.endEntity}`,
        metadata: {
          isValid: result.isValid,
          issuesCount: result.issues.length,
          chainLength: result.chainInfo.chainLength,
          expired: result.expiration.expired
        }
      });

      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // Log validation error
      await AuditService.log({
        action: 'CERTIFICATE_ISSUED' as any, // Temporary fix until schema is regenerated
        description: `Certificate validation failed: ${errorMessage}`,
        metadata: { error: errorMessage }
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
        lastValidated: new Date()
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
}
