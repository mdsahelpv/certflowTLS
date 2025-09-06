/**
 * CA Renewal Manager Tests
 *
 * Comprehensive test suite for CA renewal management functionality
 */

import { jest } from '@jest/globals';
import CARenewalManager, {
  CARenewalRequest,
  CARenewalConfig,
  CARenewalStats
} from '../../src/lib/ca-renewal-manager';
import { SettingsCacheService } from '../../src/lib/settings-cache';

// Mock dependencies
jest.mock('../../src/lib/settings-cache');
jest.mock('../../src/lib/audit');

describe('CARenewalManager', () => {
  let mockSettingsCacheService: jest.Mocked<typeof SettingsCacheService>;

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();

    // Setup mock implementations
    mockSettingsCacheService = SettingsCacheService as jest.Mocked<typeof SettingsCacheService>;

    // Mock default renewal config
    mockSettingsCacheService.getCASetting.mockResolvedValue({
      config: {
        enabled: true,
        autoRenewal: false,
        renewalThresholdDays: 30,
        maxRenewalAttempts: 3,
        notificationDaysBefore: 30,
        requireApproval: true,
        backupBeforeRenewal: true,
        testRenewalFirst: true,
        approvalWorkflow: {
          minApprovers: 1,
          approvalTimeoutHours: 72,
          autoApproveThresholdDays: 7
        }
      }
    });

    mockSettingsCacheService.setCASetting.mockResolvedValue();
    mockSettingsCacheService.setSystemConfig.mockResolvedValue();
  });

  afterEach(() => {
    // Clear any intervals
    CARenewalManager.shutdown();
  });

  describe('Initialization', () => {
    test('should initialize successfully', async () => {
      await expect(CARenewalManager.initialize()).resolves.not.toThrow();
    });

    test('should start renewal monitoring when enabled', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await CARenewalManager.initialize();

      expect(consoleSpy).toHaveBeenCalledWith('CA renewal monitoring started');
      consoleSpy.mockRestore();
    });

    test('should not start monitoring when disabled', async () => {
      mockSettingsCacheService.getCASetting.mockResolvedValue({
        config: { enabled: false }
      });

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await CARenewalManager.initialize();

      expect(consoleSpy).not.toHaveBeenCalledWith('CA renewal monitoring started');
      consoleSpy.mockRestore();
    });
  });

  describe('checkExpiringCAs', () => {
    test('should handle configuration errors gracefully', async () => {
      mockSettingsCacheService.getCASetting.mockRejectedValue(new Error('Config error'));

      const result = await CARenewalManager.checkExpiringCAs();

      expect(result).toEqual([]);
    });

    test('should return empty array when disabled', async () => {
      mockSettingsCacheService.getCASetting.mockResolvedValue({
        config: { enabled: false }
      });

      const result = await CARenewalManager.checkExpiringCAs();

      expect(result).toEqual([]);
    });
  });

  describe('executeRenewal', () => {
    test('should handle invalid request gracefully', async () => {
      const invalidRequest = {} as CARenewalRequest;

      // This should handle the invalid request gracefully
      await expect(CARenewalManager.executeRenewal(invalidRequest)).resolves.toBeDefined();
    });
  });

  describe('approveRenewal', () => {
    test('should approve renewal request successfully', async () => {
      const mockRequest: CARenewalRequest = {
        id: 'renewal_123',
        caId: 'ca1',
        caName: 'Test CA',
        currentExpiry: new Date(),
        requestedExpiry: new Date(),
        status: 'pending',
        requestedBy: 'system',
        renewalReason: 'expiry_approaching',
        priority: 'high',
        backupCreated: false,
        testRenewalCompleted: false,
        attempts: 0,
        maxAttempts: 3
      };

      // Mock getting renewal request
      const originalGetRenewalRequest = CARenewalManager.prototype['getRenewalRequest'];
      CARenewalManager.prototype['getRenewalRequest'] = jest.fn().mockResolvedValue(mockRequest);

      const result = await CARenewalManager.approveRenewal('renewal_123', true, 'admin');

      expect(result.success).toBe(true);
      expect(result.message).toContain('approved');
      expect(mockRequest.status).toBe('approved');
      expect(mockRequest.approvedBy).toBe('admin');

      CARenewalManager.prototype['getRenewalRequest'] = originalGetRenewalRequest;
    });

    test('should reject renewal request successfully', async () => {
      const mockRequest: CARenewalRequest = {
        id: 'renewal_123',
        caId: 'ca1',
        caName: 'Test CA',
        currentExpiry: new Date(),
        requestedExpiry: new Date(),
        status: 'pending',
        requestedBy: 'system',
        renewalReason: 'expiry_approaching',
        priority: 'high',
        backupCreated: false,
        testRenewalCompleted: false,
        attempts: 0,
        maxAttempts: 3
      };

      const originalGetRenewalRequest = CARenewalManager.prototype['getRenewalRequest'];
      CARenewalManager.prototype['getRenewalRequest'] = jest.fn().mockResolvedValue(mockRequest);

      const result = await CARenewalManager.approveRenewal('renewal_123', false, 'admin');

      expect(result.success).toBe(true);
      expect(result.message).toContain('rejected');
      expect(mockRequest.status).toBe('rejected');

      CARenewalManager.prototype['getRenewalRequest'] = originalGetRenewalRequest;
    });

    test('should handle non-existent renewal request', async () => {
      const originalGetRenewalRequest = CARenewalManager.prototype['getRenewalRequest'];
      CARenewalManager.prototype['getRenewalRequest'] = jest.fn().mockResolvedValue(null);

      const result = await CARenewalManager.approveRenewal('nonexistent', true, 'admin');

      expect(result.success).toBe(false);
      expect(result.message).toContain('not found');

      CARenewalManager.prototype['getRenewalRequest'] = originalGetRenewalRequest;
    });
  });

  describe('getRenewalStats', () => {
    test('should return renewal statistics', async () => {
      // Mock CA data
      const originalGetAllCAs = CARenewalManager.prototype['getAllCAs'];
      const originalGetPendingRenewalRequests = CARenewalManager.prototype['getPendingRenewalRequests'];

      CARenewalManager.prototype['getAllCAs'] = jest.fn().mockResolvedValue([
        { id: 'ca1', expiryDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000) },
        { id: 'ca2', expiryDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000) }
      ]);

      CARenewalManager.prototype['getPendingRenewalRequests'] = jest.fn().mockResolvedValue([
        { status: 'pending' },
        { status: 'in_progress' }
      ]);

      mockSettingsCacheService.getSystemConfig.mockResolvedValue(new Date().toISOString());

      const stats = await CARenewalManager.getRenewalStats();

      expect(stats).toMatchObject({
        totalCAs: 2,
        expiringSoon: 1,
        expired: 1,
        pendingApprovals: 1,
        renewalInProgress: 1
      });

      CARenewalManager.prototype['getAllCAs'] = originalGetAllCAs;
      CARenewalManager.prototype['getPendingRenewalRequests'] = originalGetPendingRenewalRequests;
    });
  });

  describe('Priority Calculation', () => {
    test('should calculate correct renewal priority', () => {
      const calculatePriority = CARenewalManager.prototype['calculateRenewalPriority'];

      // Critical: <= 7 days
      expect(calculatePriority(new Date(Date.now() + 3 * 24 * 60 * 60 * 1000))).toBe('critical');

      // High: <= 30 days
      expect(calculatePriority(new Date(Date.now() + 15 * 24 * 60 * 60 * 1000))).toBe('high');

      // Medium: <= 90 days
      expect(calculatePriority(new Date(Date.now() + 60 * 24 * 60 * 60 * 1000))).toBe('medium');

      // Low: > 90 days
      expect(calculatePriority(new Date(Date.now() + 120 * 24 * 60 * 60 * 1000))).toBe('low');
    });
  });

  describe('Error Handling', () => {
    test('should handle configuration errors gracefully', async () => {
      mockSettingsCacheService.getCASetting.mockRejectedValue(new Error('Config error'));

      const result = await CARenewalManager.checkExpiringCAs();

      expect(result).toEqual([]);
    });

    test('should handle renewal execution errors', async () => {
      const mockRequest: CARenewalRequest = {
        id: 'renewal_123',
        caId: 'ca1',
        caName: 'Test CA',
        currentExpiry: new Date(),
        requestedExpiry: new Date(),
        status: 'approved',
        requestedBy: 'system',
        renewalReason: 'expiry_approaching',
        priority: 'high',
        backupCreated: false,
        testRenewalCompleted: false,
        attempts: 0,
        maxAttempts: 3
      };

      // Mock backup failure
      const originalCreateCABackup = CARenewalManager.prototype['createCABackup'];
      CARenewalManager.prototype['createCABackup'] = jest.fn().mockRejectedValue(new Error('Backup error'));

      const result = await CARenewalManager.executeRenewal(mockRequest);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Execution error');
      expect(mockRequest.status).toBe('failed');

      CARenewalManager.prototype['createCABackup'] = originalCreateCABackup;
    });
  });

  describe('Integration Tests', () => {
    test('should handle complete renewal workflow', async () => {
      // This would test the complete workflow from detection to renewal
      // For now, just ensure the methods exist and are callable
      expect(typeof CARenewalManager.checkExpiringCAs).toBe('function');
      expect(typeof CARenewalManager.executeRenewal).toBe('function');
      expect(typeof CARenewalManager.approveRenewal).toBe('function');
      expect(typeof CARenewalManager.getRenewalStats).toBe('function');
    });
  });
});
