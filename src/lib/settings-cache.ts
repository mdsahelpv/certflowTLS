/**
 * Settings Cache Layer
 *
 * High-performance caching layer for admin settings
 * Reduces database load and improves response times
 */

import { db } from '@/lib/db';

// Cache entry interface
interface CacheEntry<T = any> {
  data: T;
  timestamp: number;
  ttl: number; // Time to live in milliseconds
  hits: number;
  lastAccessed: number;
}

// Cache statistics
interface CacheStats {
  hits: number;
  misses: number;
  evictions: number;
  entries: number;
  hitRate: number;
}

// Settings cache configuration
interface CacheConfig {
  defaultTTL: number; // Default TTL in milliseconds
  maxEntries: number; // Maximum cache entries
  cleanupInterval: number; // Cleanup interval in milliseconds
}

class SettingsCache {
  private cache = new Map<string, CacheEntry>();
  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    evictions: 0,
    entries: 0,
    hitRate: 0
  };

  private config: CacheConfig = {
    defaultTTL: 5 * 60 * 1000, // 5 minutes
    maxEntries: 1000,
    cleanupInterval: 10 * 60 * 1000 // 10 minutes
  };

  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(config?: Partial<CacheConfig>) {
    if (config) {
      this.config = { ...this.config, ...config };
    }
    this.startCleanupTimer();
  }

  // Get cached value
  get<T = any>(key: string): T | null {
    const entry = this.cache.get(key);

    if (!entry) {
      this.stats.misses++;
      this.updateHitRate();
      return null;
    }

    // Check if entry has expired
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      this.stats.misses++;
      this.stats.evictions++;
      this.stats.entries = this.cache.size;
      this.updateHitRate();
      return null;
    }

    // Update access statistics
    entry.hits++;
    entry.lastAccessed = Date.now();
    this.stats.hits++;
    this.updateHitRate();

    return entry.data;
  }

  // Set cached value
  set<T = any>(key: string, data: T, ttl?: number): void {
    // Check if we need to evict entries due to size limit
    if (this.cache.size >= this.config.maxEntries) {
      this.evictLRU();
    }

    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      ttl: ttl || this.config.defaultTTL,
      hits: 0,
      lastAccessed: Date.now()
    };

    this.cache.set(key, entry);
    this.stats.entries = this.cache.size;
  }

  // Delete cached value
  delete(key: string): boolean {
    const deleted = this.cache.delete(key);
    if (deleted) {
      this.stats.entries = this.cache.size;
    }
    return deleted;
  }

  // Clear all cached values
  clear(): void {
    this.cache.clear();
    this.stats.entries = 0;
  }

  // Invalidate cache entries by pattern
  invalidate(pattern: string): number {
    let invalidated = 0;
    for (const key of this.cache.keys()) {
      if (key.includes(pattern)) {
        this.cache.delete(key);
        invalidated++;
      }
    }
    this.stats.entries = this.cache.size;
    return invalidated;
  }

  // Get cache statistics
  getStats(): CacheStats {
    return { ...this.stats };
  }

  // Update hit rate
  private updateHitRate(): void {
    const total = this.stats.hits + this.stats.misses;
    this.stats.hitRate = total > 0 ? (this.stats.hits / total) * 100 : 0;
  }

  // Evict least recently used entry
  private evictLRU(): void {
    let oldestKey: string | null = null;
    let oldestTime = Date.now();

    for (const [key, entry] of this.cache.entries()) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
      this.stats.evictions++;
    }
  }

  // Start cleanup timer
  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, this.config.cleanupInterval);
  }

  // Cleanup expired entries
  private cleanup(): void {
    const now = Date.now();
    let evicted = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
        evicted++;
      }
    }

    if (evicted > 0) {
      this.stats.evictions += evicted;
      this.stats.entries = this.cache.size;
    }
  }

  // Stop cleanup timer
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.clear();
  }
}

// Global settings cache instance
const settingsCache = new SettingsCache({
  defaultTTL: 10 * 60 * 1000, // 10 minutes for settings
  maxEntries: 500,
  cleanupInterval: 15 * 60 * 1000 // 15 minutes
});

// Cache key generators
export const CacheKeys = {
  systemConfig: (key: string) => `system_config:${key}`,
  securityPolicy: (type: string) => `security_policy:${type}`,
  caSetting: (type: string, caId?: string) => `ca_setting:${type}${caId ? `:${caId}` : ''}`,
  performanceSetting: (type: string) => `performance_setting:${type}`,
  notificationSetting: (type: string) => `notification_setting:${type}`,
  allSettings: () => 'all_settings',
  settingsList: (type: string) => `settings_list:${type}`
};

// Settings Cache Service
export class SettingsCacheService {
  // Get system configuration with caching
  static async getSystemConfig(key: string): Promise<any> {
    const cacheKey = CacheKeys.systemConfig(key);
    let value = settingsCache.get(cacheKey);

    if (value === null) {
      // Fetch from database
      const config = await db.systemConfig.findUnique({
        where: { key }
      });

      if (config) {
        value = config.value ? JSON.parse(config.value) : null;
        settingsCache.set(cacheKey, value);
      }
    }

    return value;
  }

  // Set system configuration with cache invalidation
  static async setSystemConfig(key: string, value: any): Promise<void> {
    // Update database
    await db.systemConfig.upsert({
      where: { key },
      update: {
        value: JSON.stringify(value),
        updatedAt: new Date()
      },
      create: {
        key,
        value: JSON.stringify(value)
      }
    });

    // Update cache
    const cacheKey = CacheKeys.systemConfig(key);
    settingsCache.set(cacheKey, value);
  }

  // Get security policy with caching
  static async getSecurityPolicy(policyType: string): Promise<any> {
    const cacheKey = CacheKeys.securityPolicy(policyType);
    let policy = settingsCache.get(cacheKey);

    if (policy === null) {
      // Fetch from database
      const dbPolicy = await db.securityPolicy.findFirst({
        where: { policyType, isEnabled: true }
      });

      if (dbPolicy) {
        policy = {
          id: dbPolicy.id,
          name: dbPolicy.name,
          config: JSON.parse(dbPolicy.config),
          updatedAt: dbPolicy.updatedAt
        };
        settingsCache.set(cacheKey, policy);
      }
    }

    return policy;
  }

  // Set security policy with cache invalidation
  static async setSecurityPolicy(policyType: string, name: string, config: any, userId?: string): Promise<void> {
    // Update database
    await db.securityPolicy.upsert({
      where: { policyType },
      update: {
        name,
        config: JSON.stringify(config),
        updatedAt: new Date()
      },
      create: {
        policyType,
        name,
        config: JSON.stringify(config),
        createdBy: userId
      }
    });

    // Invalidate cache
    const cacheKey = CacheKeys.securityPolicy(policyType);
    settingsCache.delete(cacheKey);
  }

  // Get CA setting with caching
  static async getCASetting(settingType: string, caId?: string): Promise<any> {
    const cacheKey = CacheKeys.caSetting(settingType, caId);
    let setting = settingsCache.get(cacheKey);

    if (setting === null) {
      // Fetch from database
      const where: any = { settingType, isEnabled: true };
      if (caId) where.caId = caId;

      const dbSetting = await db.cASetting.findFirst({
        where
      });

      if (dbSetting) {
        setting = {
          id: dbSetting.id,
          name: dbSetting.name,
          config: JSON.parse(dbSetting.config),
          caId: dbSetting.caId,
          updatedAt: dbSetting.updatedAt
        };
        settingsCache.set(cacheKey, setting);
      }
    }

    return setting;
  }

  // Set CA setting with cache invalidation
  static async setCASetting(settingType: string, name: string, config: any, caId?: string, userId?: string): Promise<void> {
    // Update database
    const where: any = { settingType };
    if (caId) where.caId = caId;

    await db.cASetting.upsert({
      where,
      update: {
        name,
        config: JSON.stringify(config),
        updatedAt: new Date()
      },
      create: {
        settingType,
        name,
        config: JSON.stringify(config),
        caId,
        createdBy: userId
      }
    });

    // Invalidate cache
    const cacheKey = CacheKeys.caSetting(settingType, caId);
    settingsCache.delete(cacheKey);
  }

  // Get performance setting with caching
  static async getPerformanceSetting(settingType: string): Promise<any> {
    const cacheKey = CacheKeys.performanceSetting(settingType);
    let setting = settingsCache.get(cacheKey);

    if (setting === null) {
      // Fetch from database
      const dbSetting = await db.performanceSetting.findFirst({
        where: { settingType, isEnabled: true }
      });

      if (dbSetting) {
        setting = {
          id: dbSetting.id,
          name: dbSetting.name,
          config: JSON.parse(dbSetting.config),
          updatedAt: dbSetting.updatedAt
        };
        settingsCache.set(cacheKey, setting);
      }
    }

    return setting;
  }

  // Set performance setting with cache invalidation
  static async setPerformanceSetting(settingType: string, name: string, config: any, userId?: string): Promise<void> {
    // Update database
    await db.performanceSetting.upsert({
      where: { settingType },
      update: {
        name,
        config: JSON.stringify(config),
        updatedAt: new Date()
      },
      create: {
        settingType,
        name,
        config: JSON.stringify(config),
        createdBy: userId
      }
    });

    // Invalidate cache
    const cacheKey = CacheKeys.performanceSetting(settingType);
    settingsCache.delete(cacheKey);
  }

  // Get all settings of a type with caching
  static async getSettingsList(type: 'security' | 'ca' | 'performance' | 'notification'): Promise<any[]> {
    const cacheKey = CacheKeys.settingsList(type);
    let settings = settingsCache.get<any[]>(cacheKey);

    if (settings === null) {
      // Fetch from database based on type
      let dbSettings: any[] = [];

      switch (type) {
        case 'security':
          dbSettings = await db.securityPolicy.findMany({
            where: { isEnabled: true },
            select: {
              id: true,
              policyType: true,
              name: true,
              config: true,
              updatedAt: true
            }
          });
          break;
        case 'ca':
          dbSettings = await db.cASetting.findMany({
            where: { isEnabled: true },
            select: {
              id: true,
              settingType: true,
              name: true,
              config: true,
              caId: true,
              updatedAt: true
            }
          });
          break;
        case 'performance':
          dbSettings = await db.performanceSetting.findMany({
            where: { isEnabled: true },
            select: {
              id: true,
              settingType: true,
              name: true,
              config: true,
              updatedAt: true
            }
          });
          break;
        case 'notification':
          dbSettings = await db.notificationSetting.findMany({
            where: { enabled: true },
            select: {
              id: true,
              type: true,
              event: true,
              recipient: true,
              enabled: true,
              daysBefore: true,
              updatedAt: true
            }
          });
          break;
      }

      settings = dbSettings.map(setting => ({
        ...setting,
        config: setting.config ? JSON.parse(setting.config) : undefined
      }));

      settingsCache.set(cacheKey, settings, 5 * 60 * 1000); // 5 minutes for lists
    }

    return settings;
  }

  // Invalidate all caches for a setting type
  static invalidateByType(type: 'security' | 'ca' | 'performance' | 'notification' | 'system'): void {
    settingsCache.invalidate(type);
  }

  // Invalidate specific cache entry
  static invalidateKey(key: string): void {
    settingsCache.delete(key);
  }

  // Clear all caches
  static clearAll(): void {
    settingsCache.clear();
  }

  // Get cache statistics
  static getCacheStats(): CacheStats {
    return settingsCache.getStats();
  }

  // Warm up cache on application startup
  static async warmupCache(): Promise<void> {
    console.log('Warming up settings cache...');

    try {
      // Warm up frequently accessed settings
      const promises = [
        this.getSettingsList('security'),
        this.getSettingsList('performance'),
        this.getSystemConfig('maintenanceMode'),
        this.getSystemConfig('systemVersion')
      ];

      await Promise.all(promises);
      console.log('Settings cache warmed up successfully');
    } catch (error) {
      console.error('Failed to warm up settings cache:', error);
    }
  }

  // Clean shutdown
  static shutdown(): void {
    settingsCache.destroy();
  }
}

// Export default instance
export { settingsCache };
export default SettingsCacheService;
