import { db } from '@/lib/db';
import { AuditAction, AuditLog } from '@prisma/client';
import { headers } from 'next/headers';

export interface AuditLogData {
  action: AuditAction;
  userId?: string;
  username?: string;
  description: string;
  metadata?: Record<string, any>;
}

// Admin Settings Audit Actions
export enum AdminSettingsAction {
  PASSWORD_POLICY_UPDATED = 'PASSWORD_POLICY_UPDATED',
  SESSION_CONFIG_UPDATED = 'SESSION_CONFIG_UPDATED',
  MFA_CONFIG_UPDATED = 'MFA_CONFIG_UPDATED',
  AUDIT_CONFIG_UPDATED = 'AUDIT_CONFIG_UPDATED',
  CA_POLICY_UPDATED = 'CA_POLICY_UPDATED',
  CERTIFICATE_TEMPLATE_UPDATED = 'CERTIFICATE_TEMPLATE_UPDATED',
  CRL_CONFIG_UPDATED = 'CRL_CONFIG_UPDATED',
  OCSP_CONFIG_UPDATED = 'OCSP_CONFIG_UPDATED',
  HEALTH_CHECK_CONFIG_UPDATED = 'HEALTH_CHECK_CONFIG_UPDATED',
  PERFORMANCE_CONFIG_UPDATED = 'PERFORMANCE_CONFIG_UPDATED',
  RESOURCE_LIMITS_UPDATED = 'RESOURCE_LIMITS_UPDATED',
  SMTP_CONFIG_UPDATED = 'SMTP_CONFIG_UPDATED',
  WEBHOOK_CONFIG_UPDATED = 'WEBHOOK_CONFIG_UPDATED',
  MAINTENANCE_MODE_TOGGLED = 'MAINTENANCE_MODE_TOGGLED',
  SYSTEM_CONFIG_UPDATED = 'SYSTEM_CONFIG_UPDATED',
}

// Admin Settings Change Tracking
export interface SettingsChange {
  settingKey: string;
  oldValue: any;
  newValue: any;
  settingType?: string;
}

export interface AdminSettingsAuditData {
  action: AdminSettingsAction;
  userId?: string;
  username?: string;
  description: string;
  changes: SettingsChange[];
  metadata?: Record<string, any>;
}

export class AuditService {
  static async log(data: AuditLogData): Promise<AuditLog> {
    let ipAddress = 'unknown';
    let userAgent = 'unknown';
    try {
      const headersList = await (headers() as any);
      if (headersList && typeof headersList.get === 'function') {
        ipAddress = headersList.get('x-forwarded-for') || headersList.get('x-real-ip') || 'unknown';
        userAgent = headersList.get('user-agent') || 'unknown';
      }
    } catch {
      // Not in a request context; leave defaults
    }

    // Avoid FK violations: only include userId if it exists
    let safeUserId: string | undefined = data.userId;
    try {
      if (data.userId) {
        const user = await db.user.findUnique({ where: { id: data.userId } });
        if (!user) safeUserId = undefined;
      }
    } catch {
      safeUserId = undefined;
    }

    try {
      return await db.auditLog.create({
        data: {
          action: data.action,
          userId: safeUserId,
          username: data.username,
          ipAddress,
          userAgent,
          description: data.description,
          metadata: data.metadata ? JSON.stringify(data.metadata) : null,
        },
      });
    } catch (e) {
      // Last-resort fallback: log without any user linkage
      return await db.auditLog.create({
        data: {
          action: data.action,
          ipAddress,
          userAgent,
          description: data.description,
          metadata: data.metadata ? JSON.stringify(data.metadata) : null,
        },
      });
    }
  }

  static async getAuditLogs(filters?: {
    action?: AuditAction;
    userId?: string;
    username?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  }): Promise<{ logs: AuditLog[]; total: number }> {
    const where: any = {};

    if (filters?.action) {
      where.action = filters.action;
    }

    if (filters?.userId) {
      where.userId = filters.userId;
    }

    if (filters?.username) {
      where.username = { contains: filters.username };
    }

    if (filters?.startDate || filters?.endDate) {
      where.createdAt = {};
      if (filters.startDate) {
        where.createdAt.gte = filters.startDate;
      }
      if (filters.endDate) {
        where.createdAt.lte = filters.endDate;
      }
    }

    const [logs, total] = await Promise.all([
      db.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: filters?.limit || 50,
        skip: filters?.offset || 0,
        include: {
          user: {
            select: { id: true, username: true, name: true, email: true }
          }
        }
      }),
      db.auditLog.count({ where })
    ]);

    // Type assertion to include user relation
    const logsWithUsers = logs as (typeof logs[0] & { user?: { id: string; username: string; name: string; email: string } })[];

    return { logs, total };
  }

  static async exportAuditLogs(filters?: {
    action?: AuditAction;
    userId?: string;
    username?: string;
    startDate?: Date;
    endDate?: Date;
  }, format: 'csv' | 'json' = 'csv'): Promise<string> {
    const where: any = {};

    if (filters?.action) {
      where.action = filters.action;
    }

    if (filters?.userId) {
      where.userId = filters.userId;
    }

    if (filters?.username) {
      where.username = { contains: filters.username, mode: 'insensitive' };
    }

    if (filters?.startDate || filters?.endDate) {
      where.createdAt = {};
      if (filters.startDate) {
        where.createdAt.gte = filters.startDate;
      }
      if (filters.endDate) {
        where.createdAt.lte = filters.endDate;
      }
    }

    const logs = await db.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: { id: true, username: true, name: true, email: true }
        }
      }
    });

    if (format === 'json') {
      return JSON.stringify(logs, null, 2);
    }

    // CSV format
    const headers = [
      'Timestamp',
      'Action',
      'User ID',
      'Username',
      'User Name',
      'User Email',
      'IP Address',
      'User Agent',
      'Description',
      'Metadata'
    ];

    const rows = logs.map(log => [
      log.createdAt.toISOString(),
      log.action,
      log.userId || '',
      log.username || '',
      log.user?.name || '',
      log.user?.email || '',
      log.ipAddress || '',
      log.userAgent || '',
      log.description,
      log.metadata || ''
    ]);

    return [headers.join(','), ...rows.map(row => row.map(cell => `"${cell}"`).join(','))].join('\n');
  }

  // Admin Settings Audit Logging
  static async logAdminSettingsChange(data: AdminSettingsAuditData): Promise<AuditLog> {
    let ipAddress = 'unknown';
    let userAgent = 'unknown';
    try {
      const headersList = await (headers() as any);
      if (headersList && typeof headersList.get === 'function') {
        ipAddress = headersList.get('x-forwarded-for') || headersList.get('x-real-ip') || 'unknown';
        userAgent = headersList.get('user-agent') || 'unknown';
      }
    } catch {
      // Not in a request context; leave defaults
    }

    // Avoid FK violations: only include userId if it exists
    let safeUserId: string | undefined = data.userId;
    try {
      if (data.userId) {
        const user = await db.user.findUnique({ where: { id: data.userId } });
        if (!user) safeUserId = undefined;
      }
    } catch {
      safeUserId = undefined;
    }

    // Prepare metadata with changes
    const metadata = {
      changes: data.changes,
      settingType: data.changes[0]?.settingType || 'unknown',
      changeCount: data.changes.length,
      ...data.metadata
    };

    try {
      return await db.auditLog.create({
        data: {
          action: data.action as any, // Cast to AuditAction for admin settings
          userId: safeUserId,
          username: data.username,
          ipAddress,
          userAgent,
          description: data.description,
          metadata: JSON.stringify(metadata),
        },
      });
    } catch (e) {
      // Last-resort fallback: log without any user linkage
      return await db.auditLog.create({
        data: {
          action: data.action as any,
          ipAddress,
          userAgent,
          description: data.description,
          metadata: JSON.stringify(metadata),
        },
      });
    }
  }

  // Helper method to compare settings and generate changes
  static compareSettings(oldSettings: Record<string, any>, newSettings: Record<string, any>, settingType?: string): SettingsChange[] {
    const changes: SettingsChange[] = [];

    // Get all unique keys from both objects
    const allKeys = new Set([...Object.keys(oldSettings), ...Object.keys(newSettings)]);

    for (const key of Array.from(allKeys)) {
      const oldValue = oldSettings[key];
      const newValue = newSettings[key];

      // Deep comparison for objects/arrays
      const oldStr = JSON.stringify(oldValue);
      const newStr = JSON.stringify(newValue);

      if (oldStr !== newStr) {
        changes.push({
          settingKey: key,
          oldValue,
          newValue,
          settingType
        });
      }
    }

    return changes;
  }

  // Specific audit methods for different admin settings
  static async logPasswordPolicyChange(userId: string, username: string, oldPolicy: any, newPolicy: any): Promise<AuditLog> {
    const changes = this.compareSettings(oldPolicy, newPolicy, 'password_policy');
    return this.logAdminSettingsChange({
      action: AdminSettingsAction.PASSWORD_POLICY_UPDATED,
      userId,
      username,
      description: `Password policy updated with ${changes.length} changes`,
      changes
    });
  }

  static async logSessionConfigChange(userId: string, username: string, oldConfig: any, newConfig: any): Promise<AuditLog> {
    const changes = this.compareSettings(oldConfig, newConfig, 'session_config');
    return this.logAdminSettingsChange({
      action: AdminSettingsAction.SESSION_CONFIG_UPDATED,
      userId,
      username,
      description: `Session configuration updated with ${changes.length} changes`,
      changes
    });
  }

  static async logMFAConfigChange(userId: string, username: string, oldConfig: any, newConfig: any): Promise<AuditLog> {
    const changes = this.compareSettings(oldConfig, newConfig, 'mfa_config');
    return this.logAdminSettingsChange({
      action: AdminSettingsAction.MFA_CONFIG_UPDATED,
      userId,
      username,
      description: `MFA configuration updated with ${changes.length} changes`,
      changes
    });
  }

  static async logAuditConfigChange(userId: string, username: string, oldConfig: any, newConfig: any): Promise<AuditLog> {
    const changes = this.compareSettings(oldConfig, newConfig, 'audit_config');
    return this.logAdminSettingsChange({
      action: AdminSettingsAction.AUDIT_CONFIG_UPDATED,
      userId,
      username,
      description: `Audit configuration updated with ${changes.length} changes`,
      changes
    });
  }

  static async logCAPolicyChange(userId: string, username: string, oldPolicy: any, newPolicy: any): Promise<AuditLog> {
    const changes = this.compareSettings(oldPolicy, newPolicy, 'ca_policy');
    return this.logAdminSettingsChange({
      action: AdminSettingsAction.CA_POLICY_UPDATED,
      userId,
      username,
      description: `CA policy updated with ${changes.length} changes`,
      changes
    });
  }

  static async logCertificateTemplateChange(userId: string, username: string, oldTemplate: any, newTemplate: any): Promise<AuditLog> {
    const changes = this.compareSettings(oldTemplate, newTemplate, 'certificate_template');
    return this.logAdminSettingsChange({
      action: AdminSettingsAction.CERTIFICATE_TEMPLATE_UPDATED,
      userId,
      username,
      description: `Certificate template updated with ${changes.length} changes`,
      changes
    });
  }

  static async logCRLConfigChange(userId: string, username: string, oldConfig: any, newConfig: any): Promise<AuditLog> {
    const changes = this.compareSettings(oldConfig, newConfig, 'crl_config');
    return this.logAdminSettingsChange({
      action: AdminSettingsAction.CRL_CONFIG_UPDATED,
      userId,
      username,
      description: `CRL configuration updated with ${changes.length} changes`,
      changes
    });
  }

  static async logOCSPConfigChange(userId: string, username: string, oldConfig: any, newConfig: any): Promise<AuditLog> {
    const changes = this.compareSettings(oldConfig, newConfig, 'ocsp_config');
    return this.logAdminSettingsChange({
      action: AdminSettingsAction.OCSP_CONFIG_UPDATED,
      userId,
      username,
      description: `OCSP configuration updated with ${changes.length} changes`,
      changes
    });
  }

  static async logHealthCheckConfigChange(userId: string, username: string, oldConfig: any, newConfig: any): Promise<AuditLog> {
    const changes = this.compareSettings(oldConfig, newConfig, 'health_check_config');
    return this.logAdminSettingsChange({
      action: AdminSettingsAction.HEALTH_CHECK_CONFIG_UPDATED,
      userId,
      username,
      description: `Health check configuration updated with ${changes.length} changes`,
      changes
    });
  }

  static async logPerformanceConfigChange(userId: string, username: string, oldConfig: any, newConfig: any): Promise<AuditLog> {
    const changes = this.compareSettings(oldConfig, newConfig, 'performance_config');
    return this.logAdminSettingsChange({
      action: AdminSettingsAction.PERFORMANCE_CONFIG_UPDATED,
      userId,
      username,
      description: `Performance configuration updated with ${changes.length} changes`,
      changes
    });
  }

  static async logResourceLimitsChange(userId: string, username: string, oldLimits: any, newLimits: any): Promise<AuditLog> {
    const changes = this.compareSettings(oldLimits, newLimits, 'resource_limits');
    return this.logAdminSettingsChange({
      action: AdminSettingsAction.RESOURCE_LIMITS_UPDATED,
      userId,
      username,
      description: `Resource limits updated with ${changes.length} changes`,
      changes
    });
  }

  static async logSMTPConfigChange(userId: string, username: string, oldConfig: any, newConfig: any): Promise<AuditLog> {
    const changes = this.compareSettings(oldConfig, newConfig, 'smtp_config');
    return this.logAdminSettingsChange({
      action: AdminSettingsAction.SMTP_CONFIG_UPDATED,
      userId,
      username,
      description: `SMTP configuration updated with ${changes.length} changes`,
      changes
    });
  }

  static async logWebhookConfigChange(userId: string, username: string, oldConfig: any, newConfig: any): Promise<AuditLog> {
    const changes = this.compareSettings(oldConfig, newConfig, 'webhook_config');
    return this.logAdminSettingsChange({
      action: AdminSettingsAction.WEBHOOK_CONFIG_UPDATED,
      userId,
      username,
      description: `Webhook configuration updated with ${changes.length} changes`,
      changes
    });
  }

  static async logMaintenanceModeToggle(userId: string, username: string, enabled: boolean, message?: string): Promise<AuditLog> {
    return this.logAdminSettingsChange({
      action: AdminSettingsAction.MAINTENANCE_MODE_TOGGLED,
      userId,
      username,
      description: `Maintenance mode ${enabled ? 'enabled' : 'disabled'}`,
      changes: [{
        settingKey: 'maintenanceMode',
        oldValue: !enabled,
        newValue: enabled,
        settingType: 'system_config'
      }],
      metadata: { message }
    });
  }

  static async logSystemConfigChange(userId: string, username: string, key: string, oldValue: any, newValue: any): Promise<AuditLog> {
    return this.logAdminSettingsChange({
      action: AdminSettingsAction.SYSTEM_CONFIG_UPDATED,
      userId,
      username,
      description: `System configuration updated: ${key}`,
      changes: [{
        settingKey: key,
        oldValue,
        newValue,
        settingType: 'system_config'
      }]
    });
  }

  // Get admin settings audit logs
  static async getAdminSettingsAuditLogs(filters?: {
    action?: AdminSettingsAction;
    userId?: string;
    username?: string;
    settingType?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  }): Promise<{ logs: AuditLog[]; total: number }> {
    const where: any = {};

    // Filter by admin settings actions
    const adminActions = Object.values(AdminSettingsAction);
    where.action = { in: adminActions };

    if (filters?.action) {
      where.action = filters.action;
    }

    if (filters?.userId) {
      where.userId = filters.userId;
    }

    if (filters?.username) {
      where.username = { contains: filters.username };
    }

    if (filters?.settingType) {
      where.metadata = { contains: `"settingType":"${filters.settingType}"` };
    }

    if (filters?.startDate || filters?.endDate) {
      where.createdAt = {};
      if (filters.startDate) {
        where.createdAt.gte = filters.startDate;
      }
      if (filters.endDate) {
        where.createdAt.lte = filters.endDate;
      }
    }

    const [logs, total] = await Promise.all([
      db.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: filters?.limit || 50,
        skip: filters?.offset || 0,
        include: {
          user: {
            select: { id: true, username: true, name: true, email: true }
          }
        }
      }),
      db.auditLog.count({ where })
    ]);

    return { logs, total };
  }

  // Export admin settings audit logs
  static async exportAdminSettingsAuditLogs(filters?: {
    action?: AdminSettingsAction;
    userId?: string;
    username?: string;
    settingType?: string;
    startDate?: Date;
    endDate?: Date;
  }, format: 'csv' | 'json' = 'csv'): Promise<string> {
    const { logs } = await this.getAdminSettingsAuditLogs(filters);

    if (format === 'json') {
      return JSON.stringify(logs, null, 2);
    }

    // CSV format with admin settings specific columns
    const headers = [
      'Timestamp',
      'Action',
      'User ID',
      'Username',
      'User Name',
      'User Email',
      'IP Address',
      'Setting Type',
      'Changes Count',
      'Description',
      'Changes Details'
    ];

    const rows = logs.map(log => {
      let metadata: any = {};
      try {
        metadata = JSON.parse(log.metadata || '{}');
      } catch {
        // Ignore parse errors
      }

      // Type assertion for user relation
      const logWithUser = log as typeof log & { user?: { id: string; username: string; name: string; email: string } };

      return [
        log.createdAt.toISOString(),
        log.action,
        log.userId || '',
        log.username || '',
        logWithUser.user?.name || '',
        logWithUser.user?.email || '',
        log.ipAddress || '',
        metadata.settingType || '',
        metadata.changeCount || 0,
        log.description,
        JSON.stringify(metadata.changes || [])
      ];
    });

    return [headers.join(','), ...rows.map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(','))].join('\n');
  }
}
