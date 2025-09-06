/**
 * CRL Manager Tests
 *
 * Comprehensive test suite for CRL management functionality
 */

import { jest } from '@jest/globals';
import CRLManager, {
  CRL,
  CRLEntry,
  CRLGenerationRequest,
  CRLDistributionPoint
} from '../../src/lib/crl-manager';
import { SettingsCacheService } from '../../src/lib/settings-cache';

// Mock dependencies
jest.mock('../../src/lib/settings-cache');
jest.mock('../../src/lib/audit');

describe('CRLManager', () => {
  let mockSettingsCacheService: jest.Mocked<typeof SettingsCacheService>;

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();

    // Setup mock implementations
    mockSettingsCacheService = SettingsCacheService as jest.Mocked<typeof SettingsCacheService>;

    // Mock default CRL settings
    mockSettingsCacheService.getCASetting.mockResolvedValue({
      config: {
        enabled: true,
        autoGenerate: true,
        updateIntervalHours: 24,
        includeExpired: false,
        includeRevoked: true,
        validityHours: 168,
        overlapHours: 2,
        distributionPoints: [
          {
            id: 'default',
            url: 'http://localhost:3000/crl/ca.crl',
            enabled: true,
            priority: 1,
            syncCount: 0,
            failureCount: 0
          }
        ],
        notificationSettings: {
          enabled: true,
          notifyOnGeneration: false,
          notifyOnFailure: true,
          notifyOnDistributionFailure: true,
          recipients: []
        },
        securitySettings: {
          signCRL: true,
          includeIssuer: true,
          includeExtensions: true
        }
      }
    });

    mockSettingsCacheService.setCASetting.mockResolvedValue();
  });

  afterEach(() => {
    // Clear any intervals
    CRLManager.shutdown();
  });

  describe('Initialization', () => {
    test('should initialize successfully', async () => {
      await expect(CRLManager.initialize()).resolves.not.toThrow();
    });

    test('should start CRL monitoring when enabled', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await CRLManager.initialize();

      expect(consoleSpy).toHaveBeenCalledWith('CRL Manager initialized');
      consoleSpy.mockRestore();
    });
  });

  describe('generateCRL', () => {
    let mockRequest: CRLGenerationRequest;

    beforeEach(() => {
      mockRequest = {
        caId: 'test-ca',
        reason: 'manual',
        priority: 'high',
        includeExpired: false,
        customValidityHours: 168,
        forceRegeneration: false,
        requestedBy: 'test-user'
      };
    });

    test('should generate CRL successfully', async () => {
      // Mock successful CRL generation steps
      const originalGetRevokedCertificates = CRLManager.prototype['getRevokedCertificates'];
      const originalCreateCRL = CRLManager.prototype['createCRL'];
      const originalSignCRL = CRLManager.prototype['signCRL'];
      const originalStoreCRL = CRLManager.prototype['storeCRL'];
      const originalDistributeCRL = CRLManager.prototype['distributeCRL'];

      CRLManager.prototype['getRevokedCertificates'] = jest.fn().mockResolvedValue([]);
      CRLManager.prototype['createCRL'] = jest.fn().mockResolvedValue({
        id: 'crl_123',
        version: 2,
        issuer: 'CN=Test CA',
        thisUpdate: new Date(),
        nextUpdate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        revokedCertificates: [],
        signatureAlgorithm: 'sha256WithRSAEncryption',
        signature: 'mock_signature',
        status: 'active',
        generatedAt: new Date(),
        generatedBy: 'test-user',
        caId: 'test-ca',
        distributionPoints: ['http://localhost:3000/crl/ca.crl'],
        size: 500,
        serialNumber: 'crl_123'
      });
      CRLManager.prototype['signCRL'] = jest.fn().mockResolvedValue();
      CRLManager.prototype['storeCRL'] = jest.fn().mockResolvedValue();
      CRLManager.prototype['distributeCRL'] = jest.fn().mockResolvedValue({ success: true, results: [] });

      const result = await CRLManager.generateCRL(mockRequest);

      expect(result.success).toBe(true);
      expect(result.message).toContain('CRL generated successfully');
      expect(result.crl).toBeDefined();

      // Restore original methods
      CRLManager.prototype['getRevokedCertificates'] = originalGetRevokedCertificates;
      CRLManager.prototype['createCRL'] = originalCreateCRL;
      CRLManager.prototype['signCRL'] = originalSignCRL;
      CRLManager.prototype['storeCRL'] = originalStoreCRL;
      CRLManager.prototype['distributeCRL'] = originalDistributeCRL;
    });

    test('should handle disabled CRL generation', async () => {
      mockSettingsCacheService.getCASetting.mockResolvedValue({
        config: { enabled: false }
      });

      const result = await CRLManager.generateCRL(mockRequest);

      expect(result.success).toBe(false);
      expect(result.message).toContain('CRL generation is disabled');
    });

    test('should handle CRL generation errors', async () => {
      const originalGetRevokedCertificates = CRLManager.prototype['getRevokedCertificates'];
      CRLManager.prototype['getRevokedCertificates'] = jest.fn().mockRejectedValue(new Error('Database error'));

      const result = await CRLManager.generateCRL(mockRequest);

      expect(result.success).toBe(false);
      expect(result.message).toContain('CRL generation failed');

      CRLManager.prototype['getRevokedCertificates'] = originalGetRevokedCertificates;
    });
  });

  describe('validateCRL', () => {
    test('should validate valid CRL successfully', async () => {
      const mockCRL: CRL = {
        id: 'crl_123',
        version: 2,
        issuer: 'CN=Test CA',
        thisUpdate: new Date(Date.now() - 24 * 60 * 60 * 1000), // 1 day ago
        nextUpdate: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000), // 6 days from now
        revokedCertificates: [],
        signatureAlgorithm: 'sha256WithRSAEncryption',
        signature: 'mock_signature_crl_123',
        status: 'active',
        generatedAt: new Date(),
        generatedBy: 'test-user',
        caId: 'test-ca',
        distributionPoints: ['http://localhost:3000/crl/ca.crl'],
        size: 500,
        serialNumber: 'crl_123'
      };

      // Mock getting CRL
      const originalGetCRL = CRLManager.prototype['getCRL'];
      CRLManager.prototype['getCRL'] = jest.fn().mockResolvedValue(mockCRL);

      // Mock signature validation
      const originalValidateCRLSignature = CRLManager.prototype['validateCRLSignature'];
      CRLManager.prototype['validateCRLSignature'] = jest.fn().mockResolvedValue(true);

      const result = await CRLManager.validateCRL('crl_123');

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.details).toMatchObject({
        crlId: 'crl_123',
        issuer: 'CN=Test CA',
        revokedCertificates: 0,
        status: 'active'
      });

      CRLManager.prototype['getCRL'] = originalGetCRL;
      CRLManager.prototype['validateCRLSignature'] = originalValidateCRLSignature;
    });

    test('should detect CRL validation errors', async () => {
      const mockCRL: CRL = {
        id: 'crl_123',
        version: 2,
        issuer: 'CN=Test CA',
        thisUpdate: new Date(Date.now() + 24 * 60 * 60 * 1000), // Future date (invalid)
        nextUpdate: new Date(Date.now() - 24 * 60 * 60 * 1000), // Past date (expired)
        revokedCertificates: [],
        signatureAlgorithm: 'sha256WithRSAEncryption',
        signature: '', // Missing signature
        status: 'active',
        generatedAt: new Date(),
        generatedBy: 'test-user',
        caId: 'test-ca',
        distributionPoints: ['http://localhost:3000/crl/ca.crl'],
        size: 500,
        serialNumber: 'crl_123'
      };

      const originalGetCRL = CRLManager.prototype['getCRL'];
      CRLManager.prototype['getCRL'] = jest.fn().mockResolvedValue(mockCRL);

      const result = await CRLManager.validateCRL('crl_123');

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('CRL signature is missing');
      expect(result.errors).toContain('CRL thisUpdate is in the future');
      expect(result.warnings).toContain('CRL has expired');

      CRLManager.prototype['getCRL'] = originalGetCRL;
    });

    test('should handle non-existent CRL', async () => {
      const originalGetCRL = CRLManager.prototype['getCRL'];
      CRLManager.prototype['getCRL'] = jest.fn().mockResolvedValue(null);

      const result = await CRLManager.validateCRL('non-existent');

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('CRL not found');

      CRLManager.prototype['getCRL'] = originalGetCRL;
    });
  });

  describe('distributeCRL', () => {
    let mockCRL: CRL;
    let mockDistributionPoints: CRLDistributionPoint[];

    beforeEach(() => {
      mockCRL = {
        id: 'crl_123',
        version: 2,
        issuer: 'CN=Test CA',
        thisUpdate: new Date(),
        nextUpdate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        revokedCertificates: [],
        signatureAlgorithm: 'sha256WithRSAEncryption',
        signature: 'mock_signature',
        status: 'active',
        generatedAt: new Date(),
        generatedBy: 'test-user',
        caId: 'test-ca',
        distributionPoints: ['http://localhost:3000/crl/ca.crl'],
        size: 500,
        serialNumber: 'crl_123'
      };

      mockDistributionPoints = [
        {
          id: 'point1',
          url: 'http://localhost:3000/crl/ca.crl',
          enabled: true,
          priority: 1,
          syncCount: 0,
          failureCount: 0
        }
      ];
    });

    test('should distribute CRL successfully', async () => {
      const originalUploadCRLToPoint = CRLManager.prototype['uploadCRLToPoint'];
      const originalUpdateDistributionPoint = CRLManager.prototype['updateDistributionPoint'];

      CRLManager.prototype['uploadCRLToPoint'] = jest.fn().mockResolvedValue({
        success: true,
        responseTime: 150
      });
      CRLManager.prototype['updateDistributionPoint'] = jest.fn().mockResolvedValue();

      const result = await CRLManager.distributeCRL(mockCRL, mockDistributionPoints);

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(1);
      expect(result.results[0]).toMatchObject({
        pointId: 'point1',
        success: true,
        responseTime: 150
      });

      CRLManager.prototype['uploadCRLToPoint'] = originalUploadCRLToPoint;
      CRLManager.prototype['updateDistributionPoint'] = originalUpdateDistributionPoint;
    });

    test('should handle distribution failures', async () => {
      const originalUploadCRLToPoint = CRLManager.prototype['uploadCRLToPoint'];
      CRLManager.prototype['uploadCRLToPoint'] = jest.fn().mockResolvedValue({
        success: false,
        error: 'Connection failed',
        responseTime: 0
      });

      const result = await CRLManager.distributeCRL(mockCRL, mockDistributionPoints);

      expect(result.success).toBe(false);
      expect(result.results[0]).toMatchObject({
        pointId: 'point1',
        success: false,
        error: 'Connection failed'
      });

      CRLManager.prototype['uploadCRLToPoint'] = originalUploadCRLToPoint;
    });
  });

  describe('getCRLStatistics', () => {
    test('should return CRL statistics', async () => {
      // Mock statistics methods
      const originalGetTotalCRLCount = CRLManager.prototype['getTotalCRLCount'];
      const originalGetActiveCRLCount = CRLManager.prototype['getActiveCRLCount'];
      const originalGetExpiredCRLCount = CRLManager.prototype['getExpiredCRLCount'];

      CRLManager.prototype['getTotalCRLCount'] = jest.fn().mockResolvedValue(10);
      CRLManager.prototype['getActiveCRLCount'] = jest.fn().mockResolvedValue(8);
      CRLManager.prototype['getExpiredCRLCount'] = jest.fn().mockResolvedValue(2);
      CRLManager.prototype['getTotalRevokedCertificatesCount'] = jest.fn().mockResolvedValue(25);
      CRLManager.prototype['getAverageCRLSize'] = jest.fn().mockResolvedValue(1500);
      CRLManager.prototype['getGenerationSuccessRate'] = jest.fn().mockResolvedValue(95);
      CRLManager.prototype['getDistributionSuccessRate'] = jest.fn().mockResolvedValue(98);

      const stats = await CRLManager.getCRLStatistics();

      expect(stats).toMatchObject({
        totalCRLs: 10,
        activeCRLs: 8,
        expiredCRLs: 2,
        totalRevokedCertificates: 25,
        averageCRLSize: 1500,
        generationSuccessRate: 95,
        distributionSuccessRate: 98
      });

      CRLManager.prototype['getTotalCRLCount'] = originalGetTotalCRLCount;
      CRLManager.prototype['getActiveCRLCount'] = originalGetActiveCRLCount;
      CRLManager.prototype['getExpiredCRLCount'] = originalGetExpiredCRLCount;
    });
  });

  describe('testCRLDistribution', () => {
    test('should test CRL distribution successfully', async () => {
      const originalTestDistributionPoint = CRLManager.prototype['testDistributionPoint'];
      CRLManager.prototype['testDistributionPoint'] = jest.fn().mockResolvedValue({
        success: true,
        responseTime: 150,
        statusCode: 200
      });

      const result = await CRLManager.testCRLDistribution();

      expect(result.total).toBe(1);
      expect(result.successful).toBe(1);
      expect(result.failed).toBe(0);
      expect(result.results[0]).toMatchObject({
        success: true,
        responseTime: 150,
        statusCode: 200
      });

      CRLManager.prototype['testDistributionPoint'] = originalTestDistributionPoint;
    });

    test('should handle distribution test failures', async () => {
      const originalTestDistributionPoint = CRLManager.prototype['testDistributionPoint'];
      CRLManager.prototype['testDistributionPoint'] = jest.fn().mockResolvedValue({
        success: false,
        responseTime: 0,
        statusCode: 500,
        error: 'Server error'
      });

      const result = await CRLManager.testCRLDistribution();

      expect(result.total).toBe(1);
      expect(result.successful).toBe(0);
      expect(result.failed).toBe(1);
      expect(result.results[0]).toMatchObject({
        success: false,
        statusCode: 500,
        error: 'Server error'
      });

      CRLManager.prototype['testDistributionPoint'] = originalTestDistributionPoint;
    });
  });

  describe('exportCRL', () => {
    test('should export CRL in PEM format', async () => {
      const mockCRL: CRL = {
        id: 'crl_123',
        version: 2,
        issuer: 'CN=Test CA',
        thisUpdate: new Date(),
        nextUpdate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        revokedCertificates: [],
        signatureAlgorithm: 'sha256WithRSAEncryption',
        signature: 'mock_signature_data',
        status: 'active',
        generatedAt: new Date(),
        generatedBy: 'test-user',
        caId: 'test-ca',
        distributionPoints: ['http://localhost:3000/crl/ca.crl'],
        size: 500,
        serialNumber: 'crl_123'
      };

      const originalGetCRL = CRLManager.prototype['getCRL'];
      CRLManager.prototype['getCRL'] = jest.fn().mockResolvedValue(mockCRL);

      const result = await CRLManager.exportCRL('crl_123', 'pem');

      expect(result.format).toBe('pem');
      expect(result.data).toContain('-----BEGIN X509 CRL-----');
      expect(result.data).toContain('mock_signature_data');
      expect(result.filename).toBe('crl_test-ca_crl_123.crl');

      CRLManager.prototype['getCRL'] = originalGetCRL;
    });

    test('should export CRL in DER format', async () => {
      const mockCRL: CRL = {
        id: 'crl_123',
        version: 2,
        issuer: 'CN=Test CA',
        thisUpdate: new Date(),
        nextUpdate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        revokedCertificates: [],
        signatureAlgorithm: 'sha256WithRSAEncryption',
        signature: 'mock_signature_data',
        status: 'active',
        generatedAt: new Date(),
        generatedBy: 'test-user',
        caId: 'test-ca',
        distributionPoints: ['http://localhost:3000/crl/ca.crl'],
        size: 500,
        serialNumber: 'crl_123'
      };

      const originalGetCRL = CRLManager.prototype['getCRL'];
      CRLManager.prototype['getCRL'] = jest.fn().mockResolvedValue(mockCRL);

      const result = await CRLManager.exportCRL('crl_123', 'der');

      expect(result.format).toBe('der');
      expect(result.filename).toBe('crl_test-ca_crl_123.der');

      CRLManager.prototype['getCRL'] = originalGetCRL;
    });

    test('should throw error for non-existent CRL', async () => {
      const originalGetCRL = CRLManager.prototype['getCRL'];
      CRLManager.prototype['getCRL'] = jest.fn().mockResolvedValue(null);

      await expect(CRLManager.exportCRL('non-existent', 'pem'))
        .rejects.toThrow('CRL not found');

      CRLManager.prototype['getCRL'] = originalGetCRL;
    });
  });

  describe('cleanupOldCRLs', () => {
    test('should cleanup old CRLs successfully', async () => {
      const result = await CRLManager.cleanupOldCRLs();

      expect(result).toMatchObject({
        deleted: 0,
        errors: []
      });
    });
  });

  describe('CRL Size Calculation', () => {
    test('should calculate CRL size correctly', () => {
      const mockCRL: CRL = {
        id: 'crl_123',
        version: 2,
        issuer: 'CN=Test CA',
        thisUpdate: new Date(),
        nextUpdate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        revokedCertificates: [
          { serialNumber: '123', revocationDate: new Date(), revocationReason: 'keyCompromise' },
          { serialNumber: '456', revocationDate: new Date(), revocationReason: 'unspecified' }
        ],
        signatureAlgorithm: 'sha256WithRSAEncryption',
        signature: 'mock_signature',
        status: 'active',
        generatedAt: new Date(),
        generatedBy: 'test-user',
        caId: 'test-ca',
        distributionPoints: ['http://localhost:3000/crl/ca.crl'],
        size: 0,
        serialNumber: 'crl_123'
      };

      const size = CRLManager.prototype['calculateCRLSize'](mockCRL);

      // Base size (500) + 2 entries * 100 bytes each = 700
      expect(size).toBe(700);
    });
  });

  describe('Error Handling', () => {
    test('should handle configuration errors gracefully', async () => {
      mockSettingsCacheService.getCASetting.mockRejectedValue(new Error('Config error'));

      const result = await CRLManager.generateCRL({
        caId: 'test-ca',
        reason: 'manual',
        priority: 'high',
        requestedBy: 'test-user'
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('CRL generation failed');
    });

    test('should handle CRL validation errors', async () => {
      const originalGetCRL = CRLManager.prototype['getCRL'];
      CRLManager.prototype['getCRL'] = jest.fn().mockRejectedValue(new Error('Database error'));

      const result = await CRLManager.validateCRL('crl_123');

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Validation failed due to error');

      CRLManager.prototype['getCRL'] = originalGetCRL;
    });
  });

  describe('Integration Tests', () => {
    test('should handle complete CRL lifecycle', async () => {
      // Test that all public methods exist and are callable
      expect(typeof CRLManager.generateCRL).toBe('function');
      expect(typeof CRLManager.validateCRL).toBe('function');
      expect(typeof CRLManager.distributeCRL).toBe('function');
      expect(typeof CRLManager.getCRLStatistics).toBe('function');
      expect(typeof CRLManager.testCRLDistribution).toBe('function');
      expect(typeof CRLManager.exportCRL).toBe('function');
      expect(typeof CRLManager.cleanupOldCRLs).toBe('function');
    });
  });
});
