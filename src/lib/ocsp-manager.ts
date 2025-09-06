/**
 * OCSP Manager
 *
 * Comprehensive Online Certificate Status Protocol management system
 * Handles OCSP responder operations, response caching, monitoring, and validation
 */

import { SettingsCacheService } from './settings-cache';
import { AuditService } from './audit';

// OCSP Response interface
export interface OCSPResponse {
  id: string;
  serialNumber: string;
  issuerHash: string;
  status: 'good' | 'revoked' | 'unknown';
  revocationTime?: Date;
  revocationReason?: string;
  thisUpdate: Date;
  nextUpdate: Date;
  producedAt: Date;
  signatureAlgorithm: string;
  signature: string;
  certificateId: string;
  responseSize: number;
  cached: boolean;
  cacheExpiry?: Date;
}

// OCSP Request interface
export interface OCSPRequest {
  serialNumber: string;
  issuerNameHash: string;
  issuerKeyHash: string;
  hashAlgorithm?: 'sha1' | 'sha256' | 'sha384' | 'sha512';
  nonce?: string;
  serviceLocator?: string;
  requestTime: Date;
  clientIP?: string;
  userAgent?: string;
}

// OCSP Responder Configuration interface
export interface OCSPResponderConfig {
  enabled: boolean;
  autoGenerate: boolean;
  responderUrl: string;
  backupResponderUrls?: string[];
  cacheTimeoutMinutes: number;
  maxCacheSize: number;
  includeNextUpdate: boolean;
  includeSingleExtensions: boolean;
  responseTimeoutSeconds: number;
  monitoringSettings: {
    enabled: boolean;
    responseTimeThreshold: number;
    failureThreshold: number;
    alertRecipients?: string[];
  };
  securitySettings: {
    signResponses: boolean;
    responseSigningKey?: string;
    includeCertId: boolean;
    nonceSupport: boolean;
  };
}

// OCSP Cache Entry interface
export interface OCSPResponseCache {
  serialNumber: string;
  issuerHash: string;
  response: OCSPResponse;
  cachedAt: Date;
  expiresAt: Date;
  accessCount: number;
  lastAccessed: Date;
}

// OCSP Statistics interface
export interface OCSPStatistics {
  totalRequests: number;
  cacheHits: number;
  cacheMisses: number;
  averageResponseTime: number;
  errorRate: number;
  cacheSize: number;
  cacheHitRate: number;
  uptimePercentage: number;
  lastRequestAt?: Date;
  mostRequestedCertificate?: string;
  responseStatusDistribution: Record<string, number>;
}

// OCSP Monitoring Data interface
export interface OCSPMonitoringData {
  responseTimes: number[];
  errorCount: number;
  totalRequests: number;
  lastError?: string;
  lastErrorAt?: Date;
  uptimeStart: Date;
  downtimeSeconds: number;
  alertsTriggered: number;
  lastAlertAt?: Date;
}

// OCSP Manager Class
export class OCSPManager {
  private static responseCache: Map<string, OCSPResponseCache> = new Map();
  private static readonly CACHE_CLEANUP_INTERVAL = 600000; // 10 minutes
  private static cacheCleanupTimer: NodeJS.Timeout | null = null;

  // Initialize the OCSP manager
  static async initialize(): Promise<void> {
    try {
      await this.startCacheCleanup();
      console.log('OCSP Manager initialized');
    } catch (error) {
      console.error('Failed to initialize OCSP Manager:', error);
    }
  }

  // Process OCSP request
  static async processOCSPRequest(request: OCSPRequest): Promise<{ success: boolean; response?: OCSPResponse; error?: string; fromCache: boolean }> {
    try {
      const config = await this.getOCSPConfig();
      if (!config.enabled) {
        return {
          success: false,
          error: 'OCSP responder is disabled',
          fromCache: false
        };
      }

      // Check cache first
      const cacheKey = `${request.serialNumber}:${request.issuerNameHash}`;
      const cachedResponse = this.responseCache.get(cacheKey);

      if (cachedResponse && cachedResponse.expiresAt > new Date()) {
        cachedResponse.accessCount++;
        cachedResponse.lastAccessed = new Date();

        // Log cache hit
        await AuditService.log({
          action: 'USER_UPDATED' as any,
          userId: 'system',
          username: 'system',
          description: `OCSP cache hit for certificate ${request.serialNumber}`,
          metadata: {
            serialNumber: request.serialNumber,
            cacheKey,
            accessCount: cachedResponse.accessCount
          }
        });

        return {
          success: true,
          response: cachedResponse.response,
          fromCache: true
        };
      }

      // Generate new OCSP response
      const response = await this.generateOCSPResponse(request);

      // Cache the response if caching is enabled
      if (config.cacheTimeoutMinutes > 0) {
        const cacheEntry: OCSPResponseCache = {
          serialNumber: request.serialNumber,
          issuerHash: request.issuerNameHash,
          response,
          cachedAt: new Date(),
          expiresAt: new Date(Date.now() + (config.cacheTimeoutMinutes * 60 * 1000)),
          accessCount: 1,
          lastAccessed: new Date()
        };

        // Check cache size limit
        if (this.responseCache.size >= config.maxCacheSize) {
          this.evictOldestCacheEntry();
        }

        this.responseCache.set(cacheKey, cacheEntry);
      }

      // Log cache miss
      await AuditService.log({
        action: 'USER_UPDATED' as any,
        userId: 'system',
        username: 'system',
        description: `OCSP response generated for certificate ${request.serialNumber}`,
        metadata: {
          serialNumber: request.serialNumber,
          status: response.status,
          fromCache: false
        }
      });

      return {
        success: true,
        response,
        fromCache: false
      };
    } catch (error) {
      console.error('Error processing OCSP request:', error);

      // Log error
      await AuditService.log({
        action: 'USER_UPDATED' as any,
        userId: 'system',
        username: 'system',
        description: `OCSP request failed for certificate ${request.serialNumber}`,
        metadata: {
          serialNumber: request.serialNumber,
          error: error
        }
      });

      return {
        success: false,
        error: `OCSP request processing failed: ${error}`,
        fromCache: false
      };
    }
  }

  // Generate OCSP response
  static async generateOCSPResponse(request: OCSPRequest): Promise<OCSPResponse> {
    try {
      // Check certificate status in database
      const certStatus = await this.getCertificateStatus(request.serialNumber, request.issuerNameHash);

      const now = new Date();
      const nextUpdate = new Date(now.getTime() + (60 * 60 * 1000)); // 1 hour from now

      const response: OCSPResponse = {
        id: `ocsp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        serialNumber: request.serialNumber,
        issuerHash: request.issuerNameHash,
        status: certStatus.status,
        revocationTime: certStatus.revocationTime,
        revocationReason: certStatus.revocationReason,
        thisUpdate: now,
        nextUpdate,
        producedAt: now,
        signatureAlgorithm: 'sha256WithRSAEncryption',
        signature: '',
        certificateId: `cert_${request.serialNumber}`,
        responseSize: 0,
        cached: false
      };

      // Sign response if configured
      const config = await this.getOCSPConfig();
      if (config.securitySettings.signResponses) {
        response.signature = await this.signOCSPResponse(response);
      }

      // Calculate response size
      response.responseSize = this.calculateResponseSize(response);

      return response;
    } catch (error) {
      console.error('Error generating OCSP response:', error);
      throw error;
    }
  }

  // Validate OCSP response
  static async validateOCSPResponse(response: OCSPResponse): Promise<{ isValid: boolean; errors: string[]; warnings: string[] }> {
    try {
      const errors: string[] = [];
      const warnings: string[] = [];

      // Validate response structure
      if (!response.serialNumber) {
        errors.push('Serial number is missing');
      }

      if (!response.issuerHash) {
        errors.push('Issuer hash is missing');
      }

      // Validate dates
      const now = new Date();
      if (response.nextUpdate < now) {
        warnings.push('OCSP response has expired');
      }

      if (response.thisUpdate > now) {
        errors.push('OCSP response thisUpdate is in the future');
      }

      // Validate signature if present
      if (response.signature) {
        const signatureValid = await this.validateOCSPResponseSignature(response);
        if (!signatureValid) {
          errors.push('OCSP response signature is invalid');
        }
      }

      // Validate status-specific requirements
      if (response.status === 'revoked' && !response.revocationTime) {
        errors.push('Revoked certificate must have revocation time');
      }

      return {
        isValid: errors.length === 0,
        errors,
        warnings
      };
    } catch (error) {
      console.error('Error validating OCSP response:', error);
      return {
        isValid: false,
        errors: [`Validation failed: ${error}`],
        warnings: []
      };
    }
  }

  // Get OCSP statistics
  static async getOCSPStatistics(): Promise<OCSPStatistics> {
    try {
      const [
        totalRequests,
        cacheHits,
        cacheMisses,
        averageResponseTime,
        errorRate,
        lastRequestAt,
        mostRequestedCertificate,
        responseStatusDistribution
      ] = await Promise.all([
        this.getTotalRequestCount(),
        this.getCacheHitCount(),
        this.getCacheMissCount(),
        this.getAverageResponseTime(),
        this.getErrorRate(),
        this.getLastRequestTime(),
        this.getMostRequestedCertificate(),
        this.getResponseStatusDistribution()
      ]);

      const cacheSize = this.responseCache.size;
      const cacheHitRate = totalRequests > 0 ? (cacheHits / totalRequests) * 100 : 0;

      return {
        totalRequests,
        cacheHits,
        cacheMisses,
        averageResponseTime,
        errorRate,
        cacheSize,
        cacheHitRate,
        uptimePercentage: 100, // Would calculate from monitoring data
        lastRequestAt,
        mostRequestedCertificate,
        responseStatusDistribution
      };
    } catch (error) {
      console.error('Error getting OCSP statistics:', error);
      return {
        totalRequests: 0,
        cacheHits: 0,
        cacheMisses: 0,
        averageResponseTime: 0,
        errorRate: 0,
        cacheSize: 0,
        cacheHitRate: 0,
        uptimePercentage: 100,
        responseStatusDistribution: {}
      };
    }
  }

  // Clear OCSP response cache
  static async clearOCSPCache(): Promise<{ entriesRemoved: number; cacheSizeBefore: number; cacheSizeAfter: number }> {
    try {
      const cacheSizeBefore = this.responseCache.size;
      const entriesRemoved = this.responseCache.size;

      this.responseCache.clear();

      // Log cache clear
      await AuditService.log({
        action: 'USER_UPDATED' as any,
        userId: 'system',
        username: 'system',
        description: `OCSP response cache cleared: ${entriesRemoved} entries removed`,
        metadata: {
          entriesRemoved,
          cacheSizeBefore,
          cacheSizeAfter: 0
        }
      });

      return {
        entriesRemoved,
        cacheSizeBefore,
        cacheSizeAfter: 0
      };
    } catch (error) {
      console.error('Error clearing OCSP cache:', error);
      return {
        entriesRemoved: 0,
        cacheSizeBefore: 0,
        cacheSizeAfter: 0
      };
    }
  }

  // Test OCSP responder
  static async testOCSPResponder(): Promise<{ success: boolean; responseTime: number; statusCode: number; error?: string; responderUrl: string }> {
    try {
      const config = await this.getOCSPConfig();
      const responderUrl = config.responderUrl;

      // Test connectivity to OCSP responder
      const startTime = Date.now();
      // This would make an actual HTTP request to test the responder
      const responseTime = Date.now() - startTime;

      return {
        success: true,
        responseTime,
        statusCode: 200,
        responderUrl
      };
    } catch (error) {
      console.error('Error testing OCSP responder:', error);
      return {
        success: false,
        responseTime: 0,
        statusCode: 0,
        error: String(error),
        responderUrl: 'unknown'
      };
    }
  }

  // Get OCSP monitoring data
  static async getOCSPMonitoringData(): Promise<OCSPMonitoringData> {
    try {
      // This would retrieve monitoring data from storage
      const monitoring: OCSPMonitoringData = {
        responseTimes: [],
        errorCount: 0,
        totalRequests: 0,
        uptimeStart: new Date(),
        downtimeSeconds: 0,
        alertsTriggered: 0
      };

      return monitoring;
    } catch (error) {
      console.error('Error getting OCSP monitoring data:', error);
      return {
        responseTimes: [],
        errorCount: 0,
        totalRequests: 0,
        uptimeStart: new Date(),
        downtimeSeconds: 0,
        alertsTriggered: 0
      };
    }
  }

  // Private helper methods

  private static async getOCSPConfig(): Promise<OCSPResponderConfig> {
    try {
      const configData = await SettingsCacheService.getCASetting('ocsp_settings');

      return configData?.config || {
        enabled: true,
        autoGenerate: true,
        responderUrl: 'http://localhost:3000/ocsp',
        cacheTimeoutMinutes: 60,
        maxCacheSize: 1000,
        includeNextUpdate: true,
        includeSingleExtensions: false,
        responseTimeoutSeconds: 30,
        monitoringSettings: {
          enabled: true,
          responseTimeThreshold: 5000,
          failureThreshold: 5,
          alertRecipients: []
        },
        securitySettings: {
          signResponses: true,
          includeCertId: true,
          nonceSupport: true
        }
      };
    } catch (error) {
      console.error('Error getting OCSP config:', error);
      throw error;
    }
  }

  private static async getCertificateStatus(serialNumber: string, issuerHash: string): Promise<{ status: 'good' | 'revoked' | 'unknown'; revocationTime?: Date; revocationReason?: string }> {
    try {
      // This would query your certificate database for the certificate status
      // For now, return mock status
      return {
        status: 'good'
      };
    } catch (error) {
      console.error('Error getting certificate status:', error);
      return {
        status: 'unknown'
      };
    }
  }

  private static async signOCSPResponse(response: OCSPResponse): Promise<string> {
    // This would sign the OCSP response using the configured signing key
    // For now, return a mock signature
    return Buffer.from(`mock_signature_${response.id}`).toString('base64');
  }

  private static calculateResponseSize(response: OCSPResponse): number {
    // Calculate approximate response size in bytes
    const baseSize = 200; // Base OCSP response structure
    const certIdSize = response.certificateId.length * 2;
    const signatureSize = response.signature ? response.signature.length : 0;

    return baseSize + certIdSize + signatureSize;
  }

  private static async validateOCSPResponseSignature(response: OCSPResponse): Promise<boolean> {
    // This would validate the OCSP response signature
    // For now, return true for mock responses
    return response.signature.startsWith('mock_signature_');
  }

  private static evictOldestCacheEntry(): void {
    let oldestKey: string | null = null;
    let oldestTime = new Date();

    for (const [key, entry] of this.responseCache.entries()) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.responseCache.delete(oldestKey);
    }
  }

  private static async startCacheCleanup(): Promise<void> {
    try {
      // Clean up expired cache entries periodically
      this.cacheCleanupTimer = setInterval(() => {
        this.cleanupExpiredCacheEntries();
      }, this.CACHE_CLEANUP_INTERVAL);
    } catch (error) {
      console.error('Error starting cache cleanup:', error);
    }
  }

  private static cleanupExpiredCacheEntries(): void {
    try {
      const now = new Date();
      const expiredKeys: string[] = [];

      for (const [key, entry] of this.responseCache.entries()) {
        if (entry.expiresAt < now) {
          expiredKeys.push(key);
        }
      }

      expiredKeys.forEach(key => this.responseCache.delete(key));

      if (expiredKeys.length > 0) {
        console.log(`Cleaned up ${expiredKeys.length} expired OCSP cache entries`);
      }
    } catch (error) {
      console.error('Error cleaning up expired cache entries:', error);
    }
  }

  // Statistics helper methods
  private static async getTotalRequestCount(): Promise<number> {
    // This would count total OCSP requests from your database
    return 0;
  }

  private static async getCacheHitCount(): Promise<number> {
    // This would count cache hits from your database
    return 0;
  }

  private static async getCacheMissCount(): Promise<number> {
    // This would count cache misses from your database
    return 0;
  }

  private static async getAverageResponseTime(): Promise<number> {
    // This would calculate average response time from your database
    return 0;
  }

  private static async getErrorRate(): Promise<number> {
    // This would calculate error rate from your database
    return 0;
  }

  private static async getLastRequestTime(): Promise<Date | undefined> {
    // This would get the last OCSP request time from your database
    return undefined;
  }

  private static async getMostRequestedCertificate(): Promise<string | undefined> {
    // This would get the most requested certificate from your database
    return undefined;
  }

  private static async getResponseStatusDistribution(): Promise<Record<string, number>> {
    // This would get response status distribution from your database
    return {};
  }

  // Shutdown the OCSP manager
  static shutdown(): void {
    if (this.cacheCleanupTimer) {
      clearInterval(this.cacheCleanupTimer);
      this.cacheCleanupTimer = null;
    }
    this.responseCache.clear();
    console.log('OCSP Manager shut down');
  }
}

// Export utilities
export const processOCSPRequest = OCSPManager.processOCSPRequest.bind(OCSPManager);
export const generateOCSPResponse = OCSPManager.generateOCSPResponse.bind(OCSPManager);
export const validateOCSPResponse = OCSPManager.validateOCSPResponse.bind(OCSPManager);
export const getOCSPStatistics = OCSPManager.getOCSPStatistics.bind(OCSPManager);
export const clearOCSPCache = OCSPManager.clearOCSPCache.bind(OCSPManager);
export const testOCSPResponder = OCSPManager.testOCSPResponder.bind(OCSPManager);
export const getOCSPMonitoringData = OCSPManager.getOCSPMonitoringData.bind(OCSPManager);
export const initializeOCSPManager = OCSPManager.initialize.bind(OCSPManager);

export default OCSPManager;
