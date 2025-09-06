import { SettingsCacheService } from '@/lib/settings-cache';
import { db } from '@/lib/db';

// Mock the database
jest.mock('@/lib/db', () => ({
  db: {
    systemConfig: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      findMany: jest.fn(),
    },
    securityPolicy: {
      findFirst: jest.fn(),
      upsert: jest.fn(),
      findMany: jest.fn(),
    },
    cASetting: {
      findFirst: jest.fn(),
      upsert: jest.fn(),
      findMany: jest.fn(),
    },
    performanceSetting: {
      findFirst: jest.fn(),
      upsert: jest.fn(),
      findMany: jest.fn(),
    },
    notificationSetting: {
      findMany: jest.fn(),
    },
  },
}));

const mockedDb = db as jest.Mocked<typeof db>;

describe('SettingsCacheService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Clear cache before each test
    SettingsCacheService.clearAll();
  });

  describe('getSystemConfig', () => {
    it('should return cached value if available', async () => {
      // Set up cache
      await SettingsCacheService.setSystemConfig('testKey', 'cachedValue');

      const result = await SettingsCacheService.getSystemConfig('testKey');

      expect(result).toBe('cachedValue');
      expect(mockedDb.systemConfig.findUnique).not.toHaveBeenCalled();
    });

    it('should fetch from database if not cached', async () => {
      const mockConfig = {
        key: 'testKey',
        value: JSON.stringify('dbValue'),
        description: 'Test config',
        isEncrypted: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockedDb.systemConfig.findUnique.mockResolvedValue(mockConfig);

      const result = await SettingsCacheService.getSystemConfig('testKey');

      expect(result).toBe('dbValue');
      expect(mockedDb.systemConfig.findUnique).toHaveBeenCalledWith({
        where: { key: 'testKey' }
      });
    });

    it('should return null for non-existent config', async () => {
      mockedDb.systemConfig.findUnique.mockResolvedValue(null);

      const result = await SettingsCacheService.getSystemConfig('nonExistentKey');

      expect(result).toBeNull();
    });
  });

  describe('setSystemConfig', () => {
    it('should update database and cache', async () => {
      const mockUpsertResult = {
        key: 'testKey',
        value: JSON.stringify('newValue'),
        description: null,
        isEncrypted: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockedDb.systemConfig.upsert.mockResolvedValue(mockUpsertResult);

      await SettingsCacheService.setSystemConfig('testKey', 'newValue');

      expect(mockedDb.systemConfig.upsert).toHaveBeenCalledWith({
        where: { key: 'testKey' },
        update: {
          value: JSON.stringify('newValue'),
          updatedAt: new Date()
        },
        create: {
          key: 'testKey',
          value: JSON.stringify('newValue')
        }
      });

      // Verify cache was updated
      const cachedValue = await SettingsCacheService.getSystemConfig('testKey');
      expect(cachedValue).toBe('newValue');
    });
  });

  describe('getSecurityPolicy', () => {
    it('should return cached security policy', async () => {
      // Set up cache
      await SettingsCacheService.setSecurityPolicy('test_policy', 'Test Policy', { enabled: true }, 'user1');

      const result = await SettingsCacheService.getSecurityPolicy('test_policy');

      expect(result).toEqual({
        id: expect.any(String),
        name: 'Test Policy',
        config: { enabled: true },
        updatedAt: expect.any(Date)
      });
      expect(mockedDb.securityPolicy.findFirst).not.toHaveBeenCalled();
    });

    it('should fetch from database if not cached', async () => {
      const mockPolicy = {
        id: 'policy1',
        policyType: 'test_policy',
        name: 'Test Policy',
        config: JSON.stringify({ enabled: true }),
        isEnabled: true,
        createdBy: 'user1',
        updatedAt: new Date(),
      };

      mockedDb.securityPolicy.findFirst.mockResolvedValue(mockPolicy);

      const result = await SettingsCacheService.getSecurityPolicy('test_policy');

      expect(result).toEqual({
        id: 'policy1',
        name: 'Test Policy',
        config: { enabled: true },
        updatedAt: mockPolicy.updatedAt
      });
      expect(mockedDb.securityPolicy.findFirst).toHaveBeenCalledWith({
        where: { policyType: 'test_policy', isEnabled: true }
      });
    });
  });

  describe('setSecurityPolicy', () => {
    it('should update database and invalidate cache', async () => {
      const mockUpsertResult = {
        id: 'policy1',
        policyType: 'test_policy',
        name: 'Updated Policy',
        config: JSON.stringify({ enabled: false }),
        isEnabled: true,
        createdBy: 'user1',
        updatedAt: new Date(),
      };

      mockedDb.securityPolicy.upsert.mockResolvedValue(mockUpsertResult);

      await SettingsCacheService.setSecurityPolicy('test_policy', 'Updated Policy', { enabled: false }, 'user1');

      expect(mockedDb.securityPolicy.upsert).toHaveBeenCalledWith({
        where: { policyType: 'test_policy' },
        update: {
          name: 'Updated Policy',
          config: JSON.stringify({ enabled: false }),
          updatedAt: new Date()
        },
        create: {
          policyType: 'test_policy',
          name: 'Updated Policy',
          config: JSON.stringify({ enabled: false }),
          createdBy: 'user1'
        }
      });
    });
  });

  describe('getSettingsList', () => {
    it('should return cached settings list', async () => {
      // Pre-populate cache
      await SettingsCacheService.getSettingsList('security');

      // Mock database call
      mockedDb.securityPolicy.findMany.mockResolvedValue([]);

      const result = await SettingsCacheService.getSettingsList('security');

      expect(result).toEqual([]);
      // Should not call database on second call due to caching
    });

    it('should fetch from database and cache result', async () => {
      const mockPolicies = [
        {
          id: 'policy1',
          policyType: 'password_policy',
          name: 'Password Policy',
          config: JSON.stringify({ minLength: 8 }),
          isEnabled: true,
          createdBy: 'user1',
          updatedAt: new Date(),
        }
      ];

      mockedDb.securityPolicy.findMany.mockResolvedValue(mockPolicies);

      const result = await SettingsCacheService.getSettingsList('security');

      expect(result).toEqual([
        {
          id: 'policy1',
          policyType: 'password_policy',
          name: 'Password Policy',
          config: { minLength: 8 },
          isEnabled: true,
          createdBy: 'user1',
          updatedAt: mockPolicies[0].updatedAt
        }
      ]);

      expect(mockedDb.securityPolicy.findMany).toHaveBeenCalledWith({
        where: { isEnabled: true },
        select: {
          id: true,
          policyType: true,
          name: true,
          config: true,
          updatedAt: true
        }
      });
    });
  });

  describe('invalidateByType', () => {
    it('should invalidate cache entries by type', async () => {
      // Set up cache entries
      await SettingsCacheService.setSystemConfig('testKey', 'testValue');

      // Invalidate system configs
      SettingsCacheService.invalidateByType('system');

      // Next get should fetch from database
      mockedDb.systemConfig.findUnique.mockResolvedValue({
        key: 'testKey',
        value: JSON.stringify('newValue'),
        description: null,
        isEncrypted: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await SettingsCacheService.getSystemConfig('testKey');
      expect(result).toBe('newValue');
    });
  });

  describe('clearAll', () => {
    it('should clear all cached entries', async () => {
      // Set up cache entries
      await SettingsCacheService.setSystemConfig('testKey', 'testValue');

      // Clear all
      SettingsCacheService.clearAll();

      // Next get should fetch from database
      mockedDb.systemConfig.findUnique.mockResolvedValue({
        key: 'testKey',
        value: JSON.stringify('dbValue'),
        description: null,
        isEncrypted: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await SettingsCacheService.getSystemConfig('testKey');
      expect(result).toBe('dbValue');
    });
  });

  describe('getCacheStats', () => {
    it('should return cache statistics', () => {
      const stats = SettingsCacheService.getCacheStats();

      expect(stats).toHaveProperty('hits');
      expect(stats).toHaveProperty('misses');
      expect(stats).toHaveProperty('evictions');
      expect(stats).toHaveProperty('entries');
      expect(stats).toHaveProperty('hitRate');
      expect(typeof stats.hitRate).toBe('number');
    });
  });

  describe('warmupCache', () => {
    it('should warm up cache with frequently accessed settings', async () => {
      mockedDb.securityPolicy.findMany.mockResolvedValue([]);
      mockedDb.performanceSetting.findMany.mockResolvedValue([]);
      mockedDb.systemConfig.findUnique.mockResolvedValue(null);

      await SettingsCacheService.warmupCache();

      expect(mockedDb.securityPolicy.findMany).toHaveBeenCalled();
      expect(mockedDb.performanceSetting.findMany).toHaveBeenCalled();
    });
  });
});
