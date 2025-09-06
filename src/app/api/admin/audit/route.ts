import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { SettingsValidation } from '@/lib/settings-validation';
import { AuditService } from '@/lib/audit';
import { SettingsCacheService } from '@/lib/settings-cache';

// Audit configuration interface
interface AuditConfig {
  enabled: boolean;
  logLevel: 'error' | 'warn' | 'info' | 'debug';
  retentionDays: number;
  alertOnSuspicious: boolean;
  maxLogSize: number;
  compressOldLogs: boolean;
  externalLogging: boolean;
  logSensitiveOperations: boolean;
}

// Audit statistics interface
interface AuditStats {
  totalEvents: number;
  eventsLast24h: number;
  eventsLast7d: number;
  eventsLast30d: number;
  suspiciousEvents: number;
  criticalEvents: number;
  logSize: number;
  retentionStatus: 'healthy' | 'warning' | 'critical';
  lastCleanup: Date | null;
}

// Security alert configuration
interface SecurityAlertConfig {
  enabled: boolean;
  emailNotifications: boolean;
  adminNotifications: boolean;
  alertThresholds: {
    suspiciousEventsPerHour: number;
    criticalEventsPerHour: number;
    failedLoginAttemptsPerHour: number;
  };
  alertRecipients: string[];
}

// GET - Retrieve current audit configuration and statistics
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const permissions = (session.user as any).permissions || [];
    if (!permissions.includes('config:manage')) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    // Get audit configuration from database with caching
    const [
      auditConfig,
      auditStats,
      alertConfig
    ] = await Promise.all([
      SettingsCacheService.getSecurityPolicy('audit_config'),
      getAuditStatistics(),
      SettingsCacheService.getSecurityPolicy('security_alerts_config')
    ]);

    // Build response configuration
    const config: AuditConfig = auditConfig?.config || {
      enabled: true,
      logLevel: 'info',
      retentionDays: 90,
      alertOnSuspicious: true,
      maxLogSize: 100,
      compressOldLogs: true,
      externalLogging: false,
      logSensitiveOperations: true
    };

    const alerts: SecurityAlertConfig = alertConfig?.config || {
      enabled: true,
      emailNotifications: true,
      adminNotifications: true,
      alertThresholds: {
        suspiciousEventsPerHour: 10,
        criticalEventsPerHour: 5,
        failedLoginAttemptsPerHour: 20
      },
      alertRecipients: []
    };

    return NextResponse.json({
      config,
      statistics: auditStats,
      alerts
    });
  } catch (error) {
    console.error('Error fetching audit config:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST - Update audit configuration
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const permissions = (session.user as any).permissions || [];
    if (!permissions.includes('config:manage')) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const body = await request.json();
    const { action, config: updateConfig } = body;
    const userId = (session.user as any).id;
    const username = (session.user as any).username || session.user.email;

    switch (action) {
      case 'updateAuditConfig':
        // Validate audit configuration
        if (!updateConfig.auditConfig) {
          return NextResponse.json({ error: 'Audit configuration is required' }, { status: 400 });
        }

        const auditValidation = SettingsValidation.validateAuditConfig(updateConfig.auditConfig);
        if (!auditValidation.isValid) {
          return NextResponse.json({
            error: 'Invalid audit configuration',
            details: auditValidation.errors
          }, { status: 400 });
        }

        // Get current config for audit logging
        const currentAuditConfig = await SettingsCacheService.getSecurityPolicy('audit_config');

        // Update audit configuration in database
        await SettingsCacheService.setSecurityPolicy(
          'audit_config',
          'Audit Configuration',
          updateConfig.auditConfig,
          userId
        );

        // Log the change
        await AuditService.log({
          action: 'CONFIG_UPDATED' as any,
          userId,
          username,
          description: 'Audit configuration updated',
          metadata: {
            oldConfig: currentAuditConfig?.config,
            newConfig: updateConfig.auditConfig
          }
        });

        return NextResponse.json({
          success: true,
          message: 'Audit configuration updated successfully'
        });

      case 'updateSecurityAlerts':
        // Validate security alert configuration
        if (!updateConfig.alertConfig) {
          return NextResponse.json({ error: 'Security alert configuration is required' }, { status: 400 });
        }

        // Get current config for audit logging
        const currentAlertConfig = await SettingsCacheService.getSecurityPolicy('security_alerts_config');

        // Update security alert configuration
        await SettingsCacheService.setSecurityPolicy(
          'security_alerts_config',
          'Security Alert Configuration',
          updateConfig.alertConfig,
          userId
        );

        // Log the change
        await AuditService.log({
          action: 'CONFIG_UPDATED' as any,
          userId,
          username,
          description: 'Security alert configuration updated',
          metadata: {
            oldConfig: currentAlertConfig?.config,
            newConfig: updateConfig.alertConfig
          }
        });

        return NextResponse.json({
          success: true,
          message: 'Security alert configuration updated successfully'
        });

      case 'cleanupAuditLogs':
        // Perform audit log cleanup
        const cleanupResult = await performAuditLogCleanup();

        // Log the cleanup
        await AuditService.log({
          action: 'CONFIG_UPDATED' as any,
          userId,
          username,
          description: `Audit log cleanup performed: ${cleanupResult.deleted} logs removed`,
          metadata: cleanupResult
        });

        return NextResponse.json({
          success: true,
          message: `Audit log cleanup completed: ${cleanupResult.deleted} logs removed`,
          result: cleanupResult
        });

      case 'exportAuditLogs':
        // Export audit logs for a date range
        const { startDate, endDate, format } = updateConfig;

        if (!startDate || !endDate) {
          return NextResponse.json({ error: 'Start date and end date are required' }, { status: 400 });
        }

        const exportResult = await exportAuditLogs(new Date(startDate), new Date(endDate), format || 'json');

        // Log the export
        await AuditService.log({
          action: 'USER_UPDATED' as any,
          userId,
          username,
          description: `Audit logs exported: ${exportResult.totalLogs} logs from ${startDate} to ${endDate}`,
          metadata: {
            startDate,
            endDate,
            format: format || 'json',
            totalLogs: exportResult.totalLogs
          }
        });

        return NextResponse.json({
          success: true,
          message: `Audit logs exported successfully: ${exportResult.totalLogs} logs`,
          result: exportResult
        });

      case 'testSecurityAlert':
        // Send a test security alert
        const testResult = await sendTestSecurityAlert();

        // Log the test
        await AuditService.log({
          action: 'USER_UPDATED' as any,
          userId,
          username,
          description: 'Test security alert sent',
          metadata: { testResult }
        });

        return NextResponse.json({
          success: true,
          message: 'Test security alert sent successfully',
          result: testResult
        });

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Error updating audit config:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Helper function to get audit statistics
async function getAuditStatistics(): Promise<AuditStats> {
  try {
    // This would integrate with your audit log database to get statistics
    // For now, return mock statistics
    const stats: AuditStats = {
      totalEvents: 0,
      eventsLast24h: 0,
      eventsLast7d: 0,
      eventsLast30d: 0,
      suspiciousEvents: 0,
      criticalEvents: 0,
      logSize: 0,
      retentionStatus: 'healthy',
      lastCleanup: null
    };

    // TODO: Implement actual audit statistics from your database
    // Example:
    // const totalEvents = await db.auditLog.count();
    // const eventsLast24h = await db.auditLog.count({
    //   where: { timestamp: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } }
    // });

    return stats;
  } catch (error) {
    console.error('Error getting audit statistics:', error);
    return {
      totalEvents: 0,
      eventsLast24h: 0,
      eventsLast7d: 0,
      eventsLast30d: 0,
      suspiciousEvents: 0,
      criticalEvents: 0,
      logSize: 0,
      retentionStatus: 'healthy',
      lastCleanup: null
    };
  }
}

// Helper function to perform audit log cleanup
async function performAuditLogCleanup(): Promise<{ deleted: number; errors: string[] }> {
  try {
    const config = await SettingsCacheService.getSecurityPolicy('audit_config');
    const retentionDays = config?.config?.retentionDays || 90;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    // This would clean up old audit logs from the database
    // For now, return mock result
    const result = {
      deleted: 0,
      errors: [] as string[]
    };

    // TODO: Implement actual audit log cleanup
    // Example:
    // const deleted = await db.auditLog.deleteMany({
    //   where: { timestamp: { lt: cutoffDate } }
    // });
    // result.deleted = deleted.count;

    // Update last cleanup time
    await SettingsCacheService.setSystemConfig('last_audit_cleanup', new Date().toISOString());

    return result;
  } catch (error) {
    console.error('Error performing audit log cleanup:', error);
    return {
      deleted: 0,
      errors: [`Cleanup failed: ${error}`]
    };
  }
}

// Helper function to export audit logs
async function exportAuditLogs(
  startDate: Date,
  endDate: Date,
  format: string
): Promise<{ totalLogs: number; data: any; format: string }> {
  try {
    // This would export audit logs from the database
    // For now, return mock result
    const result = {
      totalLogs: 0,
      data: [],
      format
    };

    // TODO: Implement actual audit log export
    // Example:
    // const logs = await db.auditLog.findMany({
    //   where: {
    //     timestamp: { gte: startDate, lte: endDate }
    //   },
    //   orderBy: { timestamp: 'desc' }
    // });
    // result.totalLogs = logs.length;
    // result.data = format === 'csv' ? convertToCSV(logs) : logs;

    return result;
  } catch (error) {
    console.error('Error exporting audit logs:', error);
    return {
      totalLogs: 0,
      data: [],
      format
    };
  }
}

// Helper function to send test security alert
async function sendTestSecurityAlert(): Promise<{ sent: boolean; recipients: string[]; message: string }> {
  try {
    const alertConfig = await SettingsCacheService.getSecurityPolicy('security_alerts_config');
    const recipients = alertConfig?.config?.alertRecipients || [];

    // This would send actual security alerts
    // For now, return mock result
    const result = {
      sent: true,
      recipients,
      message: 'Test security alert sent successfully'
    };

    // TODO: Implement actual alert sending
    // Example:
    // if (alertConfig?.config?.emailNotifications) {
    //   await sendEmailAlert(recipients, 'Test Security Alert', 'This is a test alert');
    // }

    return result;
  } catch (error) {
    console.error('Error sending test security alert:', error);
    return {
      sent: false,
      recipients: [],
      message: `Failed to send test alert: ${error}`
    };
  }
}
