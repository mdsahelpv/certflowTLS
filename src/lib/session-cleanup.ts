/**
 * Session Cleanup Utilities
 *
 * Automated session cleanup and maintenance utilities
 * Handles expired session removal, cleanup scheduling, and maintenance tasks
 */

import { SettingsCacheService } from './settings-cache';
import { AuditService } from './audit';
import { SessionManager } from './session-manager';
import { RememberMeManager } from './remember-me-manager';

// Cleanup configuration interface
export interface CleanupConfig {
  enabled: boolean;
  cleanupIntervalHours: number;
  maxSessionAgeHours: number;
  maxRememberMeTokenAgeDays: number;
  batchSize: number;
  enableAutoCleanup: boolean;
  cleanupStartTime: string; // HH:MM format
  retentionPeriodDays: number;
}

// Cleanup statistics interface
export interface CleanupStats {
  sessionsCleaned: number;
  rememberMeTokensCleaned: number;
  activityLogsCleaned: number;
  totalItemsProcessed: number;
  errors: string[];
  duration: number;
  lastCleanup: Date;
  nextCleanup: Date;
}

// Cleanup result interface
export interface CleanupResult {
  success: boolean;
  stats: CleanupStats;
  message: string;
}

// Session Cleanup Manager Class
export class SessionCleanupManager {
  private static cleanupTimer: NodeJS.Timeout | null = null;

  // Initialize cleanup scheduler
  static async initialize(): Promise<void> {
    try {
      const config = await this.getCleanupConfig();

      if (config.enabled && config.enableAutoCleanup) {
        this.scheduleCleanup();
        console.log('Session cleanup scheduler initialized');
      }
    } catch (error) {
      console.error('Failed to initialize session cleanup:', error);
    }
  }

  // Perform comprehensive session cleanup
  static async performCleanup(): Promise<CleanupResult> {
    const startTime = Date.now();
    const stats: CleanupStats = {
      sessionsCleaned: 0,
      rememberMeTokensCleaned: 0,
      activityLogsCleaned: 0,
      totalItemsProcessed: 0,
      errors: [],
      duration: 0,
      lastCleanup: new Date(),
      nextCleanup: new Date()
    };

    try {
      console.log('Starting session cleanup...');

      // 1. Clean up expired sessions
      try {
        const sessionCleanupResult = await SessionManager.cleanupExpiredSessions();
        stats.sessionsCleaned = sessionCleanupResult.deleted;

        if (sessionCleanupResult.errors.length > 0) {
          stats.errors.push(...sessionCleanupResult.errors.map(err => `Session cleanup: ${err}`));
        }
      } catch (error) {
        stats.errors.push(`Session cleanup failed: ${error}`);
      }

      // 2. Clean up expired remember me tokens
      try {
        const tokenCleanupResult = await RememberMeManager.cleanupAllExpiredTokens();
        stats.rememberMeTokensCleaned = tokenCleanupResult;
      } catch (error) {
        stats.errors.push(`Remember me token cleanup failed: ${error}`);
      }

      // 3. Clean up old activity logs
      try {
        const activityCleanupResult = await this.cleanupOldActivityLogs();
        stats.activityLogsCleaned = activityCleanupResult;
      } catch (error) {
        stats.errors.push(`Activity log cleanup failed: ${error}`);
      }

      // 4. Clean up old audit logs (if configured)
      try {
        const auditCleanupResult = await this.cleanupOldAuditLogs();
        stats.totalItemsProcessed += auditCleanupResult;
      } catch (error) {
        stats.errors.push(`Audit log cleanup failed: ${error}`);
      }

      // Calculate totals and duration
      stats.totalItemsProcessed = stats.sessionsCleaned + stats.rememberMeTokensCleaned + stats.activityLogsCleaned;
      stats.duration = Date.now() - startTime;

      // Schedule next cleanup
      const config = await this.getCleanupConfig();
      stats.nextCleanup = new Date(Date.now() + (config.cleanupIntervalHours * 60 * 60 * 1000));

      // Update last cleanup time
      await SettingsCacheService.setSystemConfig('last_session_cleanup', stats.lastCleanup.toISOString());

      // Log cleanup results
      await AuditService.log({
        action: 'CONFIG_UPDATED' as any,
        userId: 'system',
        username: 'system',
        description: 'Session cleanup completed',
        metadata: {
          cleanupStats: stats,
          duration: stats.duration,
          itemsProcessed: stats.totalItemsProcessed
        }
      });

      const result: CleanupResult = {
        success: stats.errors.length === 0,
        stats,
        message: `Cleanup completed: ${stats.totalItemsProcessed} items processed in ${stats.duration}ms`
      };

      console.log('Session cleanup completed:', result.message);
      return result;

    } catch (error) {
      stats.duration = Date.now() - startTime;
      stats.errors.push(`Cleanup failed: ${error}`);

      return {
        success: false,
        stats,
        message: `Cleanup failed after ${stats.duration}ms`
      };
    }
  }

  // Clean up old activity logs
  private static async cleanupOldActivityLogs(): Promise<number> {
    try {
      const config = await this.getCleanupConfig();
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - config.retentionPeriodDays);

      // This would clean up old activity logs from the database
      // For now, return 0 as this requires database implementation
      return 0;
    } catch (error) {
      console.error('Error cleaning up activity logs:', error);
      return 0;
    }
  }

  // Clean up old audit logs
  private static async cleanupOldAuditLogs(): Promise<number> {
    try {
      const config = await this.getCleanupConfig();
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - config.retentionPeriodDays);

      // This would clean up old audit logs from the database
      // For now, return 0 as this requires database implementation
      return 0;
    } catch (error) {
      console.error('Error cleaning up audit logs:', error);
      return 0;
    }
  }

  // Get cleanup configuration
  static async getCleanupConfig(): Promise<CleanupConfig> {
    try {
      const configData = await SettingsCacheService.getSecurityPolicy('session_cleanup_config');

      return configData?.config || {
        enabled: true,
        cleanupIntervalHours: 24,
        maxSessionAgeHours: 168, // 7 days
        maxRememberMeTokenAgeDays: 90,
        batchSize: 100,
        enableAutoCleanup: true,
        cleanupStartTime: '02:00', // 2 AM
        retentionPeriodDays: 90
      };
    } catch (error) {
      console.error('Error getting cleanup config:', error);
      return {
        enabled: true,
        cleanupIntervalHours: 24,
        maxSessionAgeHours: 168,
        maxRememberMeTokenAgeDays: 90,
        batchSize: 100,
        enableAutoCleanup: true,
        cleanupStartTime: '02:00',
        retentionPeriodDays: 90
      };
    }
  }

  // Update cleanup configuration
  static async updateCleanupConfig(config: Partial<CleanupConfig>): Promise<void> {
    try {
      const currentConfig = await this.getCleanupConfig();
      const updatedConfig = { ...currentConfig, ...config };

      await SettingsCacheService.setSecurityPolicy(
        'session_cleanup_config',
        'Session Cleanup Configuration',
        updatedConfig,
        'system'
      );

      // Reschedule cleanup if interval changed
      if (config.cleanupIntervalHours || config.enableAutoCleanup !== undefined) {
        this.rescheduleCleanup();
      }

      // Log configuration change
      await AuditService.log({
        action: 'CONFIG_UPDATED' as any,
        userId: 'system',
        username: 'system',
        description: 'Session cleanup configuration updated',
        metadata: { oldConfig: currentConfig, newConfig: updatedConfig }
      });
    } catch (error) {
      console.error('Error updating cleanup config:', error);
      throw error;
    }
  }

  // Get cleanup statistics
  static async getCleanupStats(): Promise<CleanupStats | null> {
    try {
      const lastCleanupStr = await SettingsCacheService.getSystemConfig('last_session_cleanup');
      const config = await this.getCleanupConfig();

      if (!lastCleanupStr) {
        return null;
      }

      const lastCleanup = new Date(lastCleanupStr);
      const nextCleanup = new Date(lastCleanup.getTime() + (config.cleanupIntervalHours * 60 * 60 * 1000));

      return {
        sessionsCleaned: 0, // Would be stored separately
        rememberMeTokensCleaned: 0,
        activityLogsCleaned: 0,
        totalItemsProcessed: 0,
        errors: [],
        duration: 0,
        lastCleanup,
        nextCleanup
      };
    } catch (error) {
      console.error('Error getting cleanup stats:', error);
      return null;
    }
  }

  // Force immediate cleanup
  static async forceCleanup(): Promise<CleanupResult> {
    try {
      console.log('Forcing immediate session cleanup...');
      return await this.performCleanup();
    } catch (error) {
      console.error('Error forcing cleanup:', error);
      return {
        success: false,
        stats: {
          sessionsCleaned: 0,
          rememberMeTokensCleaned: 0,
          activityLogsCleaned: 0,
          totalItemsProcessed: 0,
          errors: [`Force cleanup failed: ${error}`],
          duration: 0,
          lastCleanup: new Date(),
          nextCleanup: new Date()
        },
        message: 'Force cleanup failed'
      };
    }
  }

  // Schedule cleanup based on configuration
  private static async scheduleCleanup(): Promise<void> {
    try {
      const config = await this.getCleanupConfig();

      if (!config.enabled || !config.enableAutoCleanup) {
        this.stopCleanup();
        return;
      }

      // Calculate next cleanup time
      const now = new Date();
      const [hours, minutes] = config.cleanupStartTime.split(':').map(Number);
      const nextCleanup = new Date();

      nextCleanup.setHours(hours, minutes, 0, 0);

      // If the time has already passed today, schedule for tomorrow
      if (nextCleanup <= now) {
        nextCleanup.setDate(nextCleanup.getDate() + 1);
      }

      const delay = nextCleanup.getTime() - now.getTime();

      // Clear existing timer
      this.stopCleanup();

      // Schedule new cleanup
      this.cleanupTimer = setTimeout(async () => {
        await this.performCleanup();
        // Reschedule for next interval
        this.scheduleCleanup();
      }, delay);

      console.log(`Session cleanup scheduled for ${nextCleanup.toISOString()}`);
    } catch (error) {
      console.error('Error scheduling cleanup:', error);
    }
  }

  // Reschedule cleanup (called when config changes)
  private static async rescheduleCleanup(): Promise<void> {
    this.stopCleanup();
    await this.scheduleCleanup();
  }

  // Stop cleanup scheduler
  private static stopCleanup(): void {
    if (this.cleanupTimer) {
      clearTimeout(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  // Clean up old cache entries
  static async cleanupCache(): Promise<{ entriesRemoved: number }> {
    try {
      // Clear expired cache entries
      SettingsCacheService.invalidateByType('security');

      // Get cache stats
      const cacheStats = SettingsCacheService.getCacheStats();

      return {
        entriesRemoved: cacheStats.evictions
      };
    } catch (error) {
      console.error('Error cleaning up cache:', error);
      return { entriesRemoved: 0 };
    }
  }

  // Health check for cleanup system
  static async healthCheck(): Promise<{
    status: 'healthy' | 'warning' | 'error';
    message: string;
    lastCleanup?: Date;
    nextCleanup?: Date;
  }> {
    try {
      const config = await this.getCleanupConfig();
      const stats = await this.getCleanupStats();

      if (!config.enabled) {
        return {
          status: 'warning',
          message: 'Session cleanup is disabled'
        };
      }

      if (!stats) {
        return {
          status: 'warning',
          message: 'No cleanup has been performed yet'
        };
      }

      const now = new Date();
      const timeSinceLastCleanup = now.getTime() - stats.lastCleanup.getTime();
      const expectedInterval = config.cleanupIntervalHours * 60 * 60 * 1000;

      if (timeSinceLastCleanup > expectedInterval * 1.5) { // 50% overdue
        return {
          status: 'warning',
          message: 'Cleanup is overdue',
          lastCleanup: stats.lastCleanup,
          nextCleanup: stats.nextCleanup
        };
      }

      if (stats.errors.length > 0) {
        return {
          status: 'warning',
          message: `Cleanup completed with ${stats.errors.length} errors`,
          lastCleanup: stats.lastCleanup,
          nextCleanup: stats.nextCleanup
        };
      }

      return {
        status: 'healthy',
        message: 'Session cleanup system is healthy',
        lastCleanup: stats.lastCleanup,
        nextCleanup: stats.nextCleanup
      };
    } catch (error) {
      return {
        status: 'error',
        message: `Health check failed: ${error}`
      };
    }
  }

  // Shutdown cleanup system
  static shutdown(): void {
    this.stopCleanup();
    console.log('Session cleanup system shut down');
  }
}

// Export utilities
export const performSessionCleanup = SessionCleanupManager.performCleanup.bind(SessionCleanupManager);
export const forceSessionCleanup = SessionCleanupManager.forceCleanup.bind(SessionCleanupManager);
export const getCleanupConfig = SessionCleanupManager.getCleanupConfig.bind(SessionCleanupManager);
export const updateCleanupConfig = SessionCleanupManager.updateCleanupConfig.bind(SessionCleanupManager);
export const getCleanupStats = SessionCleanupManager.getCleanupStats.bind(SessionCleanupManager);
export const initializeSessionCleanup = SessionCleanupManager.initialize.bind(SessionCleanupManager);
export const cleanupSessionCache = SessionCleanupManager.cleanupCache.bind(SessionCleanupManager);
export const checkCleanupHealth = SessionCleanupManager.healthCheck.bind(SessionCleanupManager);

export default SessionCleanupManager;
