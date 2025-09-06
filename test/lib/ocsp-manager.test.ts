/**
 * OCSP Manager Tests
 *
 * Comprehensive test suite for OCSP management functionality
 */

import { jest } from '@jest/globals';
import OCSPManager, {
  OCSPResponse,
  OCSPRequest,
  OCSPResponderConfig
} from '../../src/lib/ocsp-manager';
import { SettingsCacheService } from '../../src/lib/settings-cache';

// Mock dependencies
jest.mock('../../src/lib/settings-cache');
jest.mock('../../src/lib/audit');

describe('OCSPManager', () => {
  let mockSettingsCacheService: jest.Mocked<typeof SettingsCacheService>;

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();

    // Setup mock implementations
    mockSettingsCacheService = SettingsCacheService as jest.Mocked<typeof SettingsCacheService>;

    // Mock default OCSP settings
    mockSettingsCacheService.getCASetting.mockResolvedValue({
      config: {
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
      }
    });

    mockSettingsCacheService.setCASetting.mockResolvedValue();
  });

  afterEach(() => {
    // Clear any timers
    OCSPManager.shutdown();
  });

  describe('Initialization', () => {
    test('should initialize successfully', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await OCSPManager.initialize();

      expect(consoleSpy).toHaveBeenCalledWith('OCSP Manager initialized');
      consoleSpy.mockRestore();
    });
  });

  describe('processOCSPRequest', () => {
    let mockRequest: OCSPRequest;

    beforeEach(() => {
      mockRequest = {
        serialNumber: '123456789',
        issuerNameHash: 'abc123',
        issuerKeyHash: 'def456',
        hashAlgorithm: 'sha256',
        requestTime: new Date(),
        clientIP: '192.168.1.1'
      };
    });

    test('should process OCSP request successfully', async () => {
      const originalGenerateOCSPResponse = OCSPManager.prototype['generateOCSPResponse'];
      const originalSignOCSPResponse = OCSPManager.prototype['signOCSPResponse'];

      OCSPManager.prototype['generateOCSPResponse'] = jest.fn().mockResolvedValue({
        id: 'ocsp_123',
        serialNumber: '123456789',
        issuerHash: 'abc123',
        status: 'good',
        thisUpdate: new Date(),
        nextUpdate: new Date(Date.now() + 60 * 60 * 1000),
        producedAt: new Date(),
        signatureAlgorithm: 'sha256WithRSAEncryption',
        signature: 'mock_signature',
        certificateId: 'cert_123456789',
        responseSize: 500,
        cached: false
      });
      OCSPManager.prototype['signOCSPResponse'] = jest.fn().mockResolvedValue('mock_signature');

      const result = await OCSPManager.processOCSPRequest(mockRequest);

      expect(result.success).toBe(true);
      expect(result.response).toBeDefined();
      expect(result.fromCache).toBe(false);

      OCSPManager.prototype['generateOCSPResponse'] = originalGenerateOCSPResponse;
      OCSPManager.prototype['signOCSPResponse'] = originalSignOCSPResponse;
    });

    test('should return cached response when available', async () => {
      // First, populate the cache
      const cacheKey = `${mockRequest.serialNumber}:${mockRequest.issuerNameHash}`;
      const mockResponse: OCSPResponse = {
        id: 'ocsp_cached',
        serialNumber: '123456789',
        issuerHash: 'abc123',
        status: 'good',
        thisUpdate: new Date(),
        nextUpdate: new Date(Date.now() + 60 * 60 * 1000),
        producedAt: new Date(),
        signatureAlgorithm: 'sha256WithRSAEncryption',
        signature: 'mock_signature',
        certificateId: 'cert_123456789',
        responseSize: 500,
        cached: true
      };

      // Access the private cache
      const cache = (OCSPManager as any).responseCache;
      cache.set(cacheKey, {
        serialNumber: mockRequest.serialNumber,
        issuerHash: mockRequest.issuerNameHash,
        response: mockResponse,
        cachedAt: new Date(),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        accessCount: 0,
        lastAccessed: new Date()
      });

      const result = await OCSPManager.processOCSPRequest(mockRequest);

      expect(result.success).toBe(true);
      expect(result.response).toBeDefined();
      expect(result.fromCache).toBe(true);

      // Clear cache
      cache.clear();
    });

    test('should handle disabled OCSP responder', async () => {
      mockSettingsCacheService.getCASetting.mockResolvedValue({
        config: { enabled: false }
      });

      const result = await OCSPManager.processOCSPRequest(mockRequest);

      expect(result.success).toBe(false);
      expect(result.error).toContain('OCSP responder is disabled');
    });

    test('should handle OCSP request errors', async () => {
      const originalGetCertificateStatus = OCSPManager.prototype['getCertificateStatus'];
      OCSPManager.prototype['getCertificateStatus'] = jest.fn().mockRejectedValue(new Error('Database error'));

      const result = await OCSPManager.processOCSPRequest(mockRequest);

      expect(result.success).toBe(false);
      expect(result.error).toContain('OCSP request processing failed');

      OCSPManager.prototype['getCertificateStatus'] = originalGetCertificateStatus;
    });
  });

  describe('generateOCSPResponse', () => {
    let mockRequest: OCSPRequest;

    beforeEach(() => {
      mockRequest = {
        serialNumber: '123456789',
        issuerNameHash: 'abc123',
        issuerKeyHash: 'def456',
        requestTime: new Date()
      };
    });

    test('should generate OCSP response successfully', async () => {
      const originalGetCertificateStatus = OCSPManager.prototype['getCertificateStatus'];
      const originalSignOCSPResponse = OCSPManager.prototype['signOCSPResponse'];

      OCSPManager.prototype['getCertificateStatus'] = jest.fn().mockResolvedValue({
        status: 'good'
      });
      OCSPManager.prototype['signOCSPResponse'] = jest.fn().mockResolvedValue('mock_signature');

      const response = await OCSPManager.generateOCSPResponse(mockRequest);

      expect(response.serialNumber).toBe('123456789');
      expect(response.issuerHash).toBe('abc123');
      expect(response.status).toBe('good');
      expect(response.signature).toBe('mock_signature');

      OCSPManager.prototype['getCertificateStatus'] = originalGetCertificateStatus;
      OCSPManager.prototype['signOCSPResponse'] = originalSignOCSPResponse;
    });

    test('should handle revoked certificates', async () => {
      const originalGetCertificateStatus = OCSPManager.prototype['getCertificateStatus'];

      OCSPManager.prototype['getCertificateStatus'] = jest.fn().mockResolvedValue({
        status: 'revoked',
        revocationTime: new Date(),
        revocationReason: 'keyCompromise'
      });

      const response = await OCSPManager.generateOCSPResponse(mockRequest);

      expect(response.status).toBe('revoked');
      expect(response.revocationTime).toBeDefined();
      expect(response.revocationReason).toBe('keyCompromise');

      OCSPManager.prototype['getCertificateStatus'] = originalGetCertificateStatus;
    });
  });

  describe('validateOCSPResponse', () => {
    test('should validate valid OCSP response', async () => {
      const mockResponse: OCSPResponse = {
        id: 'ocsp_123',
        serialNumber: '123456789',
        issuerHash: 'abc123',
        status: 'good',
        thisUpdate: new Date(Date.now() - 60 * 1000), // 1 minute ago
        nextUpdate: new Date(Date.now() + 59 * 60 * 1000), // 59 minutes from now
        producedAt: new Date(),
        signatureAlgorithm: 'sha256WithRSAEncryption',
        signature: 'mock_signature_ocsp_123',
        certificateId: 'cert_123456789',
        responseSize: 500,
        cached: false
      };

      const originalValidateOCSPResponseSignature = OCSPManager.prototype['validateOCSPResponseSignature'];
      OCSPManager.prototype['validateOCSPResponseSignature'] = jest.fn().mockResolvedValue(true);

      const result = await OCSPManager.validateOCSPResponse(mockResponse);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);

      OCSPManager.prototype['validateOCSPResponseSignature'] = originalValidateOCSPResponseSignature;
    });

    test('should detect OCSP response validation errors', async () => {
      const mockResponse: OCSPResponse = {
        id: 'ocsp_123',
        serialNumber: '', // Missing serial number
        issuerHash: 'abc123',
        status: 'good',
        thisUpdate: new Date(Date.now() + 60 * 1000), // Future date (invalid)
        nextUpdate: new Date(Date.now() - 60 * 1000), // Past date (expired)
        producedAt: new Date(),
        signatureAlgorithm: 'sha256WithRSAEncryption',
        signature: '', // Missing signature
        certificateId: 'cert_123456789',
        responseSize: 500,
        cached: false
      };

      const result = await OCSPManager.validateOCSPResponse(mockResponse);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Serial number is missing');
      expect(result.errors).toContain('OCSP response thisUpdate is in the future');
      expect(result.errors).toContain('OCSP response signature is missing');
      expect(result.warnings).toContain('OCSP response has expired');
    });

    test('should validate revoked certificate requirements', async () => {
      const mockResponse: OCSPResponse = {
        id: 'ocsp_123',
        serialNumber: '123456789',
        issuerHash: 'abc123',
        status: 'revoked',
        thisUpdate: new Date(),
        nextUpdate: new Date(Date.now() + 60 * 60 * 1000),
        producedAt: new Date(),
        signatureAlgorithm: 'sha256WithRSAEncryption',
        signature: 'mock_signature',
        certificateId: 'cert_123456789',
        responseSize: 500,
        cached: false
        // Missing revocationTime for revoked certificate
      };

      const result = await OCSPManager.validateOCSPResponse(mockResponse);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Revoked certificate must have revocation time');
    });
  });

  describe('getOCSPStatistics', () => {
    test('should return OCSP statistics', async () => {
      // Mock statistics methods
      const originalGetTotalRequestCount = OCSPManager.prototype['getTotalRequestCount'];
      const originalGetCacheHitCount = OCSPManager.prototype['getCacheHitCount'];

      OCSPManager.prototype['getTotalRequestCount'] = jest.fn().mockResolvedValue(100);
      OCSPManager.prototype['getCacheHitCount'] = jest.fn().mockResolvedValue(75);
      OCSPManager.prototype['getCacheMissCount'] = jest.fn().mockResolvedValue(25);
      OCSPManager.prototype['getAverageResponseTime'] = jest.fn().mockResolvedValue(150);
      OCSPManager.prototype['getErrorRate'] = jest.fn().mockResolvedValue(2.5);
      OCSPManager.prototype['getResponseStatusDistribution'] = jest.fn().mockResolvedValue({ good: 80, revoked: 15, unknown: 5 });

      const stats = await OCSPManager.getOCSPStatistics();

      expect(stats.totalRequests).toBe(100);
      expect(stats.cacheHits).toBe(75);
      expect(stats.cacheMisses).toBe(25);
      expect(stats.averageResponseTime).toBe(150);
      expect(stats.errorRate).toBe(2.5);
      expect(stats.cacheHitRate).toBe(75);
      expect(stats.responseStatusDistribution).toEqual({ good: 80, revoked: 15, unknown: 5 });

      OCSPManager.prototype['getTotalRequestCount'] = originalGetTotalRequestCount;
      OCSPManager.prototype['getCacheHitCount'] = originalGetCacheHitCount;
    });
  });

  describe('clearOCSPCache', () => {
    test('should clear OCSP cache successfully', async () => {
      // Populate cache first
      const cache = (OCSPManager as any).responseCache;
      cache.set('test_key', { response: {}, cachedAt: new Date(), expiresAt: new Date() });

      const result = await OCSPManager.clearOCSPCache();

      expect(result.entriesRemoved).toBe(1);
      expect(result.cacheSizeBefore).toBe(1);
      expect(result.cacheSizeAfter).toBe(0);
      expect(cache.size).toBe(0);
    });
  });

  describe('testOCSPResponder', () => {
    test('should test OCSP responder successfully', async () => {
      const result = await OCSPManager.testOCSPResponder();

      expect(result.success).toBe(true);
      expect(result.responderUrl).toBe('http://localhost:3000/ocsp');
      expect(result.responseTime).toBeGreaterThanOrEqual(0);
      expect(result.statusCode).toBe(200);
    });
  });

  describe('Cache Management', () => {
    test('should evict oldest cache entry when cache is full', () => {
      const cache = (OCSPManager as any).responseCache;
      const originalMaxCacheSize = 2;

      // Mock config to have small cache size
      const originalGetOCSPConfig = OCSPManager.prototype['getOCSPConfig'];
      OCSPManager.prototype['getOCSPConfig'] = jest.fn().mockResolvedValue({
        maxCacheSize: 2
      });

      // Add entries to cache
      const oldDate = new Date(Date.now() - 60 * 60 * 1000); // 1 hour ago
      const newDate = new Date();

      cache.set('old_key', {
        response: {},
        cachedAt: oldDate,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        accessCount: 0,
        lastAccessed: oldDate
      });

      cache.set('new_key', {
        response: {},
        cachedAt: newDate,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        accessCount: 0,
        lastAccessed: newDate
      });

      // This should trigger eviction
      OCSPManager.prototype['evictOldestCacheEntry']();

      expect(cache.size).toBe(1);
      expect(cache.has('old_key')).toBe(false);
      expect(cache.has('new_key')).toBe(true);

      OCSPManager.prototype['getOCSPConfig'] = originalGetOCSPConfig;
    });

    test('should cleanup expired cache entries', () => {
      const cache = (OCSPManager as any).responseCache;

      // Add expired and valid entries
      cache.set('expired_key', {
        response: {},
        cachedAt: new Date(),
        expiresAt: new Date(Date.now() - 60 * 1000), // Expired 1 minute ago
        accessCount: 0,
        lastAccessed: new Date()
      });

      cache.set('valid_key', {
        response: {},
        cachedAt: new Date(),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000), // Valid for 1 hour
        accessCount: 0,
        lastAccessed: new Date()
      });

      OCSPManager.prototype['cleanupExpiredCacheEntries']();

      expect(cache.size).toBe(1);
      expect(cache.has('expired_key')).toBe(false);
      expect(cache.has('valid_key')).toBe(true);
    });
  });

  describe('Response Size Calculation', () => {
    test('should calculate response size correctly', () => {
      const mockResponse: OCSPResponse = {
        id: 'ocsp_123',
        serialNumber: '123456789',
        issuerHash: 'abc123',
        status: 'good',
        thisUpdate: new Date(),
        nextUpdate: new Date(),
        producedAt: new Date(),
        signatureAlgorithm: 'sha256WithRSAEncryption',
        signature: 'mock_signature_data',
        certificateId: 'cert_123456789',
        responseSize: 0,
        cached: false
      };

      const size = OCSPManager.prototype['calculateResponseSize'](mockResponse);

      // Base size (200) + cert ID size + signature size
      const expectedSize = 200 + ('cert_123456789'.length * 2) + 'mock_signature_data'.length;
      expect(size).toBe(expectedSize);
    });
  });

  describe('Error Handling', () => {
    test('should handle configuration errors gracefully', async () => {
      mockSettingsCacheService.getCASetting.mockRejectedValue(new Error('Config error'));

      const result = await OCSPManager.processOCSPRequest({
        serialNumber: '123',
        issuerNameHash: 'abc',
        issuerKeyHash: 'def',
        requestTime: new Date()
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('OCSP request processing failed');
    });

    test('should handle certificate status query errors', async () => {
      const originalGetCertificateStatus = OCSPManager.prototype['getCertificateStatus'];
      OCSPManager.prototype['getCertificateStatus'] = jest.fn().mockRejectedValue(new Error('Database error'));

      const result = await OCSPManager.generateOCSPResponse({
        serialNumber: '123',
        issuerNameHash: 'abc',
        issuerKeyHash: 'def',
        requestTime: new Date()
      });

      expect(result.status).toBe('unknown');

      OCSPManager.prototype['getCertificateStatus'] = originalGetCertificateStatus;
    });
  });

  describe('Integration Tests', () => {
    test('should handle complete OCSP request lifecycle', async () => {
      // Test that all public methods exist and are callable
      expect(typeof OCSPManager.processOCSPRequest).toBe('function');
      expect(typeof OCSPManager.generateOCSPResponse).toBe('function');
      expect(typeof OCSPManager.validateOCSPResponse).toBe('function');
      expect(typeof OCSPManager.getOCSPStatistics).toBe('function');
      expect(typeof OCSPManager.clearOCSPCache).toBe('function');
      expect(typeof OCSPManager.testOCSPResponder).toBe('function');
      expect(typeof OCSPManager.getOCSPMonitoringData).toBe('function');
    });

    test('should maintain cache integrity', async () => {
      const cache = (OCSPManager as any).responseCache;

      // Add a cache entry
      const cacheKey = 'test:cache';
      const mockEntry = {
        serialNumber: 'test',
        issuerHash: 'cache',
        response: { id: 'test' },
        cachedAt: new Date(),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        accessCount: 0,
        lastAccessed: new Date()
      };

      cache.set(cacheKey, mockEntry);

      // Verify cache entry exists
      expect(cache.has(cacheKey)).toBe(true);
      expect(cache.get(cacheKey)).toEqual(mockEntry);

      // Clear cache
      await OCSPManager.clearOCSPCache();

      // Verify cache is empty
      expect(cache.size).toBe(0);
    });
  });

  describe('Shutdown', () => {
    test('should shutdown cleanly', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      OCSPManager.shutdown();

      expect(consoleSpy).toHaveBeenCalledWith('OCSP Manager shut down');
      consoleSpy.mockRestore();
    });
  });
});
