/**
 * Settings Backup & Restore Service
 *
 * Comprehensive backup and restore functionality for admin settings
 * Ensures data safety, disaster recovery, and configuration portability
 */

import { db } from '@/lib/db';
import { AuditService } from './audit';
import { SettingsValidation } from './settings-validation';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';

// Backup metadata interface
export interface BackupMetadata {
  id: string;
  name: string;
  description?: string;
  version: string;
  createdAt: Date;
  createdBy: string;
  settingsCount: number;
  checksum: string;
  includesAuditLogs: boolean;
}

// Backup content interface
export interface BackupContent {
  metadata: BackupMetadata;
  systemConfigs: any[];
  securityPolicies: any[];
  caSettings: any[];
  performanceSettings: any[];
  notificationSettings: any[];
  auditLogs?: any[];
}

// Restore options interface
export interface RestoreOptions {
  dryRun?: boolean;
  skipValidation?: boolean;
  includeAuditLogs?: boolean;
  backupUserId?: string;
  backupUsername?: string;
}

// Restore result interface
export interface RestoreResult {
  success: boolean;
  restored: {
    systemConfigs: number;
    securityPolicies: number;
    caSettings: number;
    performanceSettings: number;
    notificationSettings: number;
    auditLogs: number;
  };
  skipped: {
    systemConfigs: number;
    securityPolicies: number;
    caSettings: number;
    performanceSettings: number;
    notificationSettings: number;
    auditLogs: number;
  };
  errors: string[];
  warnings: string[];
}

// Settings Backup Service
export class SettingsBackupService {
  private static readonly BACKUP_DIR = path.join(process.cwd(), 'backups', 'settings');

  // Ensure backup directory exists
  private static ensureBackupDir(): void {
    if (!fs.existsSync(this.BACKUP_DIR)) {
      fs.mkdirSync(this.BACKUP_DIR, { recursive: true });
    }
  }

  // Generate checksum for backup integrity
  private static generateChecksum(data: any): string {
    const crypto = require('crypto');
    const content = JSON.stringify(data, Object.keys(data).sort());
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  // Create backup of all admin settings
  static async createBackup(
    name: string,
    description?: string,
    userId?: string,
    username?: string,
    includeAuditLogs: boolean = false
  ): Promise<{ success: boolean; backupPath?: string; error?: string }> {
    try {
      this.ensureBackupDir();

      // Gather all settings data
      const [
        systemConfigs,
        securityPolicies,
        caSettings,
        performanceSettings,
        notificationSettings,
        auditLogs
      ] = await Promise.all([
        db.systemConfig.findMany({
          select: { key: true, value: true, description: true, isEncrypted: true, createdAt: true, updatedAt: true }
        }),
        db.securityPolicy.findMany({
          select: { policyType: true, name: true, config: true, isEnabled: true, createdBy: true, updatedAt: true }
        }),
        db.cASetting.findMany({
          select: { settingType: true, name: true, config: true, caId: true, isEnabled: true, createdBy: true, updatedAt: true }
        }),
        db.performanceSetting.findMany({
          select: { settingType: true, name: true, config: true, isEnabled: true, createdBy: true, updatedAt: true }
        }),
        db.notificationSetting.findMany({
          select: { type: true, event: true, recipient: true, enabled: true, daysBefore: true, webhookConfig: true, createdAt: true, updatedAt: true }
        }),
        includeAuditLogs ? db.auditLog.findMany({
          where: { action: { contains: 'UPDATED' } },
          select: { action: true, userId: true, username: true, description: true, metadata: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
          take: 1000 // Limit audit logs to prevent huge backups
        }) : Promise.resolve([])
      ]);

      // Parse JSON configs
      const parsedSecurityPolicies = securityPolicies.map(policy => ({
        ...policy,
        config: JSON.parse(policy.config)
      }));

      const parsedCASettings = caSettings.map(setting => ({
        ...setting,
        config: JSON.parse(setting.config)
      }));

      const parsedPerformanceSettings = performanceSettings.map(setting => ({
        ...setting,
        config: JSON.parse(setting.config)
      }));

      const parsedSystemConfigs = systemConfigs.map(config => ({
        ...config,
        value: config.value ? JSON.parse(config.value) : null
      }));

      // Create backup content
      const backupContent: BackupContent = {
        metadata: {
          id: `backup_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          name,
          description,
          version: process.env.npm_package_version || '1.0.0',
          createdAt: new Date(),
          createdBy: userId || 'system',
          settingsCount: systemConfigs.length + securityPolicies.length + caSettings.length + performanceSettings.length + notificationSettings.length,
          checksum: '',
          includesAuditLogs: includeAuditLogs
        },
        systemConfigs: parsedSystemConfigs,
        securityPolicies: parsedSecurityPolicies,
        caSettings: parsedCASettings,
        performanceSettings: parsedPerformanceSettings,
        notificationSettings,
        auditLogs: includeAuditLogs ? auditLogs : undefined
      };

      // Generate checksum
      backupContent.metadata.checksum = this.generateChecksum(backupContent);

      // Save backup file
      const backupPath = path.join(this.BACKUP_DIR, `${backupContent.metadata.id}.json`);
      await fs.promises.writeFile(backupPath, JSON.stringify(backupContent, null, 2), 'utf8');

      // Log backup creation
      if (userId && username) {
        await AuditService.logAdminSettingsChange({
          action: 'SYSTEM_CONFIG_UPDATED' as any,
          userId,
          username,
          description: `Settings backup created: ${name}`,
          changes: [{
            settingKey: 'backup',
            oldValue: null,
            newValue: backupContent.metadata.id,
            settingType: 'system_config'
          }]
        });
      }

      return { success: true, backupPath };
    } catch (error) {
      console.error('Failed to create settings backup:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  // List available backups
  static async listBackups(): Promise<{ id: string; name: string; description?: string; createdAt: Date; size: number }[]> {
    try {
      this.ensureBackupDir();

      const files = await fs.promises.readdir(this.BACKUP_DIR);
      const backups = [];

      for (const file of files) {
        if (file.endsWith('.json')) {
          try {
            const filePath = path.join(this.BACKUP_DIR, file);
            const stats = await fs.promises.stat(filePath);
            const content = await fs.promises.readFile(filePath, 'utf8');
            const backup: BackupContent = JSON.parse(content);

            backups.push({
              id: backup.metadata.id,
              name: backup.metadata.name,
              description: backup.metadata.description,
              createdAt: new Date(backup.metadata.createdAt),
              size: stats.size
            });
          } catch (error) {
            console.warn(`Failed to read backup file ${file}:`, error);
          }
        }
      }

      return backups.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    } catch (error) {
      console.error('Failed to list backups:', error);
      return [];
    }
  }

  // Validate backup file integrity
  static async validateBackup(backupId: string): Promise<{ valid: boolean; errors: string[] }> {
    try {
      const backupPath = path.join(this.BACKUP_DIR, `${backupId}.json`);

      if (!fs.existsSync(backupPath)) {
        return { valid: false, errors: ['Backup file not found'] };
      }

      const content = await fs.promises.readFile(backupPath, 'utf8');
      const backup: BackupContent = JSON.parse(content);

      const errors: string[] = [];

      // Validate metadata
      if (!backup.metadata.id || !backup.metadata.name) {
        errors.push('Invalid backup metadata');
      }

      // Validate checksum
      const calculatedChecksum = this.generateChecksum(backup);
      if (calculatedChecksum !== backup.metadata.checksum) {
        errors.push('Backup checksum mismatch - file may be corrupted');
      }

      // Validate settings structure
      if (!Array.isArray(backup.systemConfigs)) {
        errors.push('Invalid system configs structure');
      }
      if (!Array.isArray(backup.securityPolicies)) {
        errors.push('Invalid security policies structure');
      }
      if (!Array.isArray(backup.caSettings)) {
        errors.push('Invalid CA settings structure');
      }
      if (!Array.isArray(backup.performanceSettings)) {
        errors.push('Invalid performance settings structure');
      }
      if (!Array.isArray(backup.notificationSettings)) {
        errors.push('Invalid notification settings structure');
      }

      return { valid: errors.length === 0, errors };
    } catch (error) {
      return { valid: false, errors: [error instanceof Error ? error.message : 'Unknown validation error'] };
    }
  }

  // Restore settings from backup
  static async restoreBackup(
    backupId: string,
    options: RestoreOptions = {}
  ): Promise<RestoreResult> {
    const result: RestoreResult = {
      success: false,
      restored: {
        systemConfigs: 0,
        securityPolicies: 0,
        caSettings: 0,
        performanceSettings: 0,
        notificationSettings: 0,
        auditLogs: 0
      },
      skipped: {
        systemConfigs: 0,
        securityPolicies: 0,
        caSettings: 0,
        performanceSettings: 0,
        notificationSettings: 0,
        auditLogs: 0
      },
      errors: [],
      warnings: []
    };

    try {
      // Validate backup first
      if (!options.skipValidation) {
        const validation = await this.validateBackup(backupId);
        if (!validation.valid) {
          result.errors.push(...validation.errors);
          return result;
        }
      }

      // Read backup file
      const backupPath = path.join(this.BACKUP_DIR, `${backupId}.json`);
      const content = await fs.promises.readFile(backupPath, 'utf8');
      const backup: BackupContent = JSON.parse(content);

      if (options.dryRun) {
        // Dry run - just count what would be restored
        result.restored.systemConfigs = backup.systemConfigs.length;
        result.restored.securityPolicies = backup.securityPolicies.length;
        result.restored.caSettings = backup.caSettings.length;
        result.restored.performanceSettings = backup.performanceSettings.length;
        result.restored.notificationSettings = backup.notificationSettings.length;
        if (backup.auditLogs) {
          result.restored.auditLogs = backup.auditLogs.length;
        }
        result.success = true;
        return result;
      }

      // Perform actual restore
      const transaction = await db.$transaction(async (tx) => {
        // Restore system configs
        for (const config of backup.systemConfigs) {
          try {
            await tx.systemConfig.upsert({
              where: { key: config.key },
              update: {
                value: JSON.stringify(config.value),
                description: config.description,
                isEncrypted: config.isEncrypted,
                updatedAt: new Date()
              },
              create: {
                key: config.key,
                value: JSON.stringify(config.value),
                description: config.description,
                isEncrypted: config.isEncrypted
              }
            });
            result.restored.systemConfigs++;
          } catch (error) {
            result.errors.push(`Failed to restore system config ${config.key}: ${error}`);
          }
        }

        // Restore security policies
        for (const policy of backup.securityPolicies) {
          try {
            await tx.securityPolicy.upsert({
              where: { policyType: policy.policyType },
              update: {
                name: policy.name,
                config: JSON.stringify(policy.config),
                isEnabled: policy.isEnabled,
                updatedAt: new Date()
              },
              create: {
                policyType: policy.policyType,
                name: policy.name,
                config: JSON.stringify(policy.config),
                isEnabled: policy.isEnabled,
                createdBy: options.backupUserId
              }
            });
            result.restored.securityPolicies++;
          } catch (error) {
            result.errors.push(`Failed to restore security policy ${policy.policyType}: ${error}`);
          }
        }

        // Restore CA settings
        for (const setting of backup.caSettings) {
          try {
            const where: any = { settingType: setting.settingType };
            if (setting.caId) where.caId = setting.caId;

            await tx.cASetting.upsert({
              where,
              update: {
                name: setting.name,
                config: JSON.stringify(setting.config),
                isEnabled: setting.isEnabled,
                updatedAt: new Date()
              },
              create: {
                settingType: setting.settingType,
                name: setting.name,
                config: JSON.stringify(setting.config),
                caId: setting.caId,
                isEnabled: setting.isEnabled,
                createdBy: options.backupUserId
              }
            });
            result.restored.caSettings++;
          } catch (error) {
            result.errors.push(`Failed to restore CA setting ${setting.settingType}: ${error}`);
          }
        }

        // Restore performance settings
        for (const setting of backup.performanceSettings) {
          try {
            await tx.performanceSetting.upsert({
              where: { settingType: setting.settingType },
              update: {
                name: setting.name,
                config: JSON.stringify(setting.config),
                isEnabled: setting.isEnabled,
                updatedAt: new Date()
              },
              create: {
                settingType: setting.settingType,
                name: setting.name,
                config: JSON.stringify(setting.config),
                isEnabled: setting.isEnabled,
                createdBy: options.backupUserId
              }
            });
            result.restored.performanceSettings++;
          } catch (error) {
            result.errors.push(`Failed to restore performance setting ${setting.settingType}: ${error}`);
          }
        }

        // Restore notification settings
        for (const setting of backup.notificationSettings) {
          try {
            await tx.notificationSetting.upsert({
              where: {
                type_event_recipient: {
                  type: setting.type,
                  event: setting.event,
                  recipient: setting.recipient
                }
              },
              update: {
                enabled: setting.enabled,
                daysBefore: setting.daysBefore,
                webhookConfig: setting.webhookConfig,
                updatedAt: new Date()
              },
              create: {
                type: setting.type,
                event: setting.event,
                recipient: setting.recipient,
                enabled: setting.enabled,
                daysBefore: setting.daysBefore,
                webhookConfig: setting.webhookConfig
              }
            });
            result.restored.notificationSettings++;
          } catch (error) {
            result.errors.push(`Failed to restore notification setting: ${error}`);
          }
        }

        // Restore audit logs if requested
        if (options.includeAuditLogs && backup.auditLogs) {
          for (const log of backup.auditLogs) {
            try {
              await tx.auditLog.create({
                data: {
                  action: log.action,
                  userId: log.userId,
                  username: log.username,
                  description: log.description,
                  metadata: log.metadata,
                  createdAt: new Date(log.createdAt)
                }
              });
              result.restored.auditLogs++;
            } catch (error) {
              result.errors.push(`Failed to restore audit log: ${error}`);
            }
          }
        }
      });

      result.success = result.errors.length === 0;

      // Log restore operation
      if (options.backupUserId && options.backupUsername) {
        await AuditService.logAdminSettingsChange({
          action: 'SYSTEM_CONFIG_UPDATED' as any,
          userId: options.backupUserId,
          username: options.backupUsername,
          description: `Settings restored from backup: ${backup.metadata.name}`,
          changes: [{
            settingKey: 'restore',
            oldValue: null,
            newValue: backupId,
            settingType: 'system_config'
          }]
        });
      }

      return result;
    } catch (error) {
      result.errors.push(error instanceof Error ? error.message : 'Unknown restore error');
      return result;
    }
  }

  // Delete backup file
  static async deleteBackup(backupId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const backupPath = path.join(this.BACKUP_DIR, `${backupId}.json`);

      if (!fs.existsSync(backupPath)) {
        return { success: false, error: 'Backup file not found' };
      }

      await fs.promises.unlink(backupPath);
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  // Export settings to JSON (for manual backup)
  static async exportSettings(): Promise<string> {
    const [
      systemConfigs,
      securityPolicies,
      caSettings,
      performanceSettings,
      notificationSettings
    ] = await Promise.all([
      db.systemConfig.findMany(),
      db.securityPolicy.findMany(),
      db.cASetting.findMany(),
      db.performanceSetting.findMany(),
      db.notificationSetting.findMany()
    ]);

    const exportData = {
      exportedAt: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
      systemConfigs: systemConfigs.map(config => ({
        ...config,
        value: config.value ? JSON.parse(config.value) : null
      })),
      securityPolicies: securityPolicies.map(policy => ({
        ...policy,
        config: JSON.parse(policy.config)
      })),
      caSettings: caSettings.map(setting => ({
        ...setting,
        config: JSON.parse(setting.config)
      })),
      performanceSettings: performanceSettings.map(setting => ({
        ...setting,
        config: JSON.parse(setting.config)
      })),
      notificationSettings
    };

    return JSON.stringify(exportData, null, 2);
  }

  // Import settings from JSON
  static async importSettings(
    jsonData: string,
    userId?: string,
    username?: string
  ): Promise<{ success: boolean; imported: number; errors: string[] }> {
    try {
      const importData = JSON.parse(jsonData);
      let imported = 0;
      const errors: string[] = [];

      // Import system configs
      if (importData.systemConfigs) {
        for (const config of importData.systemConfigs) {
          try {
            await db.systemConfig.upsert({
              where: { key: config.key },
              update: {
                value: JSON.stringify(config.value),
                description: config.description,
                isEncrypted: config.isEncrypted,
                updatedAt: new Date()
              },
              create: {
                key: config.key,
                value: JSON.stringify(config.value),
                description: config.description,
                isEncrypted: config.isEncrypted
              }
            });
            imported++;
          } catch (error) {
            errors.push(`Failed to import system config ${config.key}: ${error}`);
          }
        }
      }

      // Log import operation
      if (userId && username) {
        await AuditService.logAdminSettingsChange({
          action: 'SYSTEM_CONFIG_UPDATED' as any,
          userId,
          username,
          description: `Settings imported from JSON (${imported} items)`,
          changes: [{
            settingKey: 'import',
            oldValue: null,
            newValue: imported,
            settingType: 'system_config'
          }]
        });
      }

      return { success: errors.length === 0, imported, errors };
    } catch (error) {
      return { success: false, imported: 0, errors: [error instanceof Error ? error.message : 'Unknown import error'] };
    }
  }

  // Get backup statistics
  static async getBackupStats(): Promise<{
    totalBackups: number;
    totalSize: number;
    oldestBackup?: Date;
    newestBackup?: Date;
  }> {
    try {
      const backups = await this.listBackups();

      if (backups.length === 0) {
        return { totalBackups: 0, totalSize: 0 };
      }

      const totalSize = backups.reduce((sum, backup) => sum + backup.size, 0);
      const oldestBackup = backups[backups.length - 1].createdAt;
      const newestBackup = backups[0].createdAt;

      return {
        totalBackups: backups.length,
        totalSize,
        oldestBackup,
        newestBackup
      };
    } catch (error) {
      console.error('Failed to get backup stats:', error);
      return { totalBackups: 0, totalSize: 0 };
    }
  }
}

// Export default instance
export default SettingsBackupService;
