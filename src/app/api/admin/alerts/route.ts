import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { SettingsValidation } from '@/lib/settings-validation';
import { AuditService } from '@/lib/audit';
import { SettingsCacheService } from '@/lib/settings-cache';

// Alert Threshold Configuration interface
interface AlertThreshold {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  metricType: 'cpu_usage' | 'memory_usage' | 'disk_usage' | 'network_traffic' | 'response_time' | 'error_rate' | 'certificate_expiry' | 'security_events' | 'system_health' | 'custom';
  condition: 'greater_than' | 'less_than' | 'equals' | 'not_equals' | 'contains' | 'not_contains';
  threshold: number | string;
  unit?: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  evaluationPeriod: number;
  cooldownPeriod: number;
  autoResolve: boolean;
  resolveThreshold?: number | string;
  notificationChannels: Array<'email' | 'webhook' | 'slack' | 'sms'>;
  customMessage?: string;
  tags?: Record<string, string>;
  createdAt: Date;
  updatedAt: Date;
}

// Alert Instance interface
interface AlertInstance {
  id: string;
  thresholdId: string;
  thresholdName: string;
  metricType: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: 'active' | 'acknowledged' | 'resolved' | 'suppressed';
  currentValue: number | string;
  thresholdValue: number | string;
  condition: string;
  message: string;
  acknowledgedBy?: string;
  acknowledgedAt?: Date;
  resolvedBy?: string;
  resolvedAt?: Date;
  suppressedUntil?: Date;
  escalationLevel: number;
  lastNotificationSent?: Date;
  tags?: Record<string, string>;
  createdAt: Date;
  updatedAt: Date;
}

// Alert Escalation Rule interface
interface AlertEscalationRule {
  id: string;
  name: string;
  enabled: boolean;
  triggerConditions: Array<{
    severity: 'low' | 'medium' | 'high' | 'critical';
    timeUnacknowledged: number;
    repeatCount?: number;
  }>;
  escalationSteps: Array<{
    step: number;
    delayMinutes: number;
    channels: Array<'email' | 'webhook' | 'slack' | 'sms'>;
    recipients: string[];
    message?: string;
    escalateTo?: string;
  }>;
  maxEscalationLevel: number;
  createdAt: Date;
  updatedAt: Date;
}

// Alert History Entry interface
interface AlertHistoryEntry {
  id: string;
  alertId: string;
  action: 'created' | 'acknowledged' | 'resolved' | 'escalated' | 'suppressed' | 'commented' | 'assigned';
  userId?: string;
  username?: string;
  timestamp: Date;
  details?: Record<string, any>;
  message?: string;
}

// Alert Suppression Rule interface
interface AlertSuppressionRule {
  id: string;
  name: string;
  enabled: boolean;
  conditions: Array<{
    field: string;
    operator: 'equals' | 'not_equals' | 'contains' | 'not_contains' | 'regex';
    value: string;
  }>;
  duration: number;
  reason: string;
  createdBy: string;
  createdAt: Date;
  expiresAt: Date;
}

// Alert Statistics interface
interface AlertStatistics {
  totalAlerts: number;
  activeAlerts: number;
  acknowledgedAlerts: number;
  resolvedAlerts: number;
  suppressedAlerts: number;
  alertsBySeverity: {
    low: number;
    medium: number;
    high: number;
    critical: number;
  };
  alertsByType: Record<string, number>;
  averageResolutionTime: number;
  averageTimeToAcknowledge: number;
  escalationRate: number;
  falsePositiveRate: number;
  last24Hours: {
    created: number;
    resolved: number;
    acknowledged: number;
  };
  last7Days: {
    created: number;
    resolved: number;
    acknowledged: number;
  };
  last30Days: {
    created: number;
    resolved: number;
    acknowledged: number;
  };
}

// GET - Retrieve alert thresholds and active alerts
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const permissions = (session.user as any).permissions || [];
    if (!permissions.includes('admin:manage')) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    // Get alert configuration from database with caching
    const [
      alertThresholds,
      activeAlerts,
      escalationRules,
      suppressionRules,
      statistics
    ] = await Promise.all([
      getAlertThresholds(),
      getActiveAlerts(),
      getEscalationRules(),
      getSuppressionRules(),
      getAlertStatistics()
    ]);

    return NextResponse.json({
      thresholds: alertThresholds,
      alerts: activeAlerts,
      escalationRules,
      suppressionRules,
      statistics
    });
  } catch (error) {
    console.error('Error fetching alert configuration:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST - Update alert thresholds and manage alerts
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const permissions = (session.user as any).permissions || [];
    if (!permissions.includes('admin:manage')) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const body = await request.json();
    const { action, config: updateConfig } = body;
    const userId = (session.user as any).id;
    const username = (session.user as any).username || session.user.email;

    switch (action) {
      case 'createAlertThreshold':
        // Validate alert threshold
        if (!updateConfig.threshold) {
          return NextResponse.json({ error: 'Alert threshold configuration is required' }, { status: 400 });
        }

        const thresholdValidation = SettingsValidation.validateAllSettings(updateConfig.threshold);
        if (!thresholdValidation.isValid) {
          return NextResponse.json({
            error: 'Invalid alert threshold configuration',
            details: thresholdValidation.errors
          }, { status: 400 });
        }

        const thresholdResult = await createAlertThreshold(updateConfig.threshold, userId);

        // Log threshold creation
        await AuditService.log({
          action: 'USER_UPDATED' as any,
          userId,
          username,
          description: `Alert threshold created: ${updateConfig.threshold.name}`,
          metadata: {
            thresholdId: thresholdResult.id,
            thresholdName: updateConfig.threshold.name,
            metricType: updateConfig.threshold.metricType,
            severity: updateConfig.threshold.severity
          }
        });

        return NextResponse.json({
          success: true,
          message: 'Alert threshold created successfully',
          result: thresholdResult
        });

      case 'updateAlertThreshold':
        // Validate alert threshold
        if (!updateConfig.threshold || !updateConfig.thresholdId) {
          return NextResponse.json({ error: 'Alert threshold and threshold ID are required' }, { status: 400 });
        }

        const updateThresholdValidation = SettingsValidation.validateAllSettings(updateConfig.threshold);
        if (!updateThresholdValidation.isValid) {
          return NextResponse.json({
            error: 'Invalid alert threshold configuration',
            details: updateThresholdValidation.errors
          }, { status: 400 });
        }

        const updateResult = await updateAlertThreshold(updateConfig.thresholdId, updateConfig.threshold, userId);

        // Log threshold update
        await AuditService.log({
          action: 'USER_UPDATED' as any,
          userId,
          username,
          description: `Alert threshold updated: ${updateConfig.threshold.name}`,
          metadata: {
            thresholdId: updateConfig.thresholdId,
            thresholdName: updateConfig.threshold.name
          }
        });

        return NextResponse.json({
          success: true,
          message: 'Alert threshold updated successfully',
          result: updateResult
        });

      case 'deleteAlertThreshold':
        // Delete alert threshold
        if (!updateConfig.thresholdId) {
          return NextResponse.json({ error: 'Threshold ID is required' }, { status: 400 });
        }

        const deleteThresholdResult = await deleteAlertThreshold(updateConfig.thresholdId, userId);

        // Log threshold deletion
        await AuditService.log({
          action: 'USER_UPDATED' as any,
          userId,
          username,
          description: `Alert threshold deleted: ${updateConfig.thresholdId}`,
          metadata: {
            thresholdId: updateConfig.thresholdId
          }
        });

        return NextResponse.json({
          success: true,
          message: 'Alert threshold deleted successfully',
          result: deleteThresholdResult
        });

      case 'acknowledgeAlert':
        // Acknowledge alert
        if (!updateConfig.alertId) {
          return NextResponse.json({ error: 'Alert ID is required' }, { status: 400 });
        }

        const acknowledgeResult = await acknowledgeAlert(updateConfig.alertId, userId, updateConfig.comment);

        // Log alert acknowledgment
        await AuditService.log({
          action: 'USER_UPDATED' as any,
          userId,
          username,
          description: `Alert acknowledged: ${updateConfig.alertId}`,
          metadata: {
            alertId: updateConfig.alertId,
            comment: updateConfig.comment
          }
        });

        return NextResponse.json({
          success: true,
          message: 'Alert acknowledged successfully',
          result: acknowledgeResult
        });

      case 'resolveAlert':
        // Resolve alert
        if (!updateConfig.alertId) {
          return NextResponse.json({ error: 'Alert ID is required' }, { status: 400 });
        }

        const resolveResult = await resolveAlert(updateConfig.alertId, userId, updateConfig.comment);

        // Log alert resolution
        await AuditService.log({
          action: 'USER_UPDATED' as any,
          userId,
          username,
          description: `Alert resolved: ${updateConfig.alertId}`,
          metadata: {
            alertId: updateConfig.alertId,
            comment: updateConfig.comment
          }
        });

        return NextResponse.json({
          success: true,
          message: 'Alert resolved successfully',
          result: resolveResult
        });

      case 'createEscalationRule':
        // Validate escalation rule
        if (!updateConfig.rule) {
          return NextResponse.json({ error: 'Escalation rule configuration is required' }, { status: 400 });
        }

        const escalationValidation = SettingsValidation.validateAllSettings(updateConfig.rule);
        if (!escalationValidation.isValid) {
          return NextResponse.json({
            error: 'Invalid escalation rule configuration',
            details: escalationValidation.errors
          }, { status: 400 });
        }

        const escalationResult = await createEscalationRule(updateConfig.rule, userId);

        // Log escalation rule creation
        await AuditService.log({
          action: 'USER_UPDATED' as any,
          userId,
          username,
          description: `Escalation rule created: ${updateConfig.rule.name}`,
          metadata: {
            ruleId: escalationResult.id,
            ruleName: updateConfig.rule.name
          }
        });

        return NextResponse.json({
          success: true,
          message: 'Escalation rule created successfully',
          result: escalationResult
        });

      case 'createSuppressionRule':
        // Validate suppression rule
        if (!updateConfig.rule) {
          return NextResponse.json({ error: 'Suppression rule configuration is required' }, { status: 400 });
        }

        const suppressionValidation = SettingsValidation.validateAllSettings(updateConfig.rule);
        if (!suppressionValidation.isValid) {
          return NextResponse.json({
            error: 'Invalid suppression rule configuration',
            details: suppressionValidation.errors
          }, { status: 400 });
        }

        const suppressionResult = await createSuppressionRule(updateConfig.rule, userId);

        // Log suppression rule creation
        await AuditService.log({
          action: 'USER_UPDATED' as any,
          userId,
          username,
          description: `Suppression rule created: ${updateConfig.rule.name}`,
          metadata: {
            ruleId: suppressionResult.id,
            ruleName: updateConfig.rule.name
          }
        });

        return NextResponse.json({
          success: true,
          message: 'Suppression rule created successfully',
          result: suppressionResult
        });

      case 'getAlertHistory':
        // Get alert history
        const historyResult = await getAlertHistory(updateConfig.alertId, updateConfig.limit || 50);

        return NextResponse.json({
          success: true,
          message: 'Alert history retrieved successfully',
          result: historyResult
        });

      case 'testAlertThreshold':
        // Test alert threshold
        if (!updateConfig.thresholdId) {
          return NextResponse.json({ error: 'Threshold ID is required' }, { status: 400 });
        }

        const testResult = await testAlertThreshold(updateConfig.thresholdId, updateConfig.testValue);

        return NextResponse.json({
          success: true,
          message: 'Alert threshold tested successfully',
          result: testResult
        });

      case 'bulkAcknowledgeAlerts':
        // Bulk acknowledge alerts
        if (!updateConfig.alertIds || !Array.isArray(updateConfig.alertIds)) {
          return NextResponse.json({ error: 'Alert IDs array is required' }, { status: 400 });
        }

        const bulkAcknowledgeResult = await bulkAcknowledgeAlerts(updateConfig.alertIds, userId, updateConfig.comment);

        // Log bulk acknowledgment
        await AuditService.log({
          action: 'USER_UPDATED' as any,
          userId,
          username,
          description: `Bulk alert acknowledgment: ${updateConfig.alertIds.length} alerts`,
          metadata: {
            alertIds: updateConfig.alertIds,
            count: updateConfig.alertIds.length,
            comment: updateConfig.comment
          }
        });

        return NextResponse.json({
          success: true,
          message: `${updateConfig.alertIds.length} alerts acknowledged successfully`,
          result: bulkAcknowledgeResult
        });

      case 'bulkResolveAlerts':
        // Bulk resolve alerts
        if (!updateConfig.alertIds || !Array.isArray(updateConfig.alertIds)) {
          return NextResponse.json({ error: 'Alert IDs array is required' }, { status: 400 });
        }

        const bulkResolveResult = await bulkResolveAlerts(updateConfig.alertIds, userId, updateConfig.comment);

        // Log bulk resolution
        await AuditService.log({
          action: 'USER_UPDATED' as any,
          userId,
          username,
          description: `Bulk alert resolution: ${updateConfig.alertIds.length} alerts`,
          metadata: {
            alertIds: updateConfig.alertIds,
            count: updateConfig.alertIds.length,
            comment: updateConfig.comment
          }
        });

        return NextResponse.json({
          success: true,
          message: `${updateConfig.alertIds.length} alerts resolved successfully`,
          result: bulkResolveResult
        });

      case 'exportAlerts':
        // Export alerts data
        const exportResult = await exportAlerts(updateConfig.format || 'json', updateConfig.filters);

        return NextResponse.json({
          success: true,
          message: 'Alerts exported successfully',
          result: exportResult
        });

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Error updating alert configuration:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Helper function to get alert thresholds
async function getAlertThresholds(): Promise<AlertThreshold[]> {
  try {
    // This would retrieve alert thresholds from database
    // For now, return mock data
    const thresholds: AlertThreshold[] = [
      {
        id: 'cpu_high',
        name: 'High CPU Usage',
        description: 'Alert when CPU usage exceeds threshold',
        enabled: true,
        metricType: 'cpu_usage',
        condition: 'greater_than',
        threshold: 80,
        unit: '%',
        severity: 'high',
        evaluationPeriod: 300,
        cooldownPeriod: 600,
        autoResolve: true,
        resolveThreshold: 70,
        notificationChannels: ['email', 'webhook'],
        customMessage: 'CPU usage is critically high',
        tags: { component: 'system', priority: 'high' },
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: 'memory_high',
        name: 'High Memory Usage',
        description: 'Alert when memory usage exceeds threshold',
        enabled: true,
        metricType: 'memory_usage',
        condition: 'greater_than',
        threshold: 85,
        unit: '%',
        severity: 'medium',
        evaluationPeriod: 300,
        cooldownPeriod: 600,
        autoResolve: true,
        resolveThreshold: 75,
        notificationChannels: ['email'],
        tags: { component: 'system', priority: 'medium' },
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: 'disk_low',
        name: 'Low Disk Space',
        description: 'Alert when disk space is running low',
        enabled: true,
        metricType: 'disk_usage',
        condition: 'greater_than',
        threshold: 90,
        unit: '%',
        severity: 'critical',
        evaluationPeriod: 600,
        cooldownPeriod: 3600,
        autoResolve: false,
        notificationChannels: ['email', 'slack'],
        customMessage: 'Disk space is critically low',
        tags: { component: 'storage', priority: 'critical' },
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ];

    // TODO: Implement actual threshold retrieval
    // const thresholds = await db.alertThreshold.findMany({ orderBy: { createdAt: 'desc' } });

    return thresholds;
  } catch (error) {
    console.error('Error getting alert thresholds:', error);
    return [];
  }
}

// Helper function to get active alerts
async function getActiveAlerts(): Promise<AlertInstance[]> {
  try {
    // This would retrieve active alerts from database
    // For now, return mock data
    const alerts: AlertInstance[] = [
      {
        id: 'alert_001',
        thresholdId: 'cpu_high',
        thresholdName: 'High CPU Usage',
        metricType: 'cpu_usage',
        severity: 'high',
        status: 'active',
        currentValue: 95,
        thresholdValue: 80,
        condition: 'greater_than',
        message: 'CPU usage is at 95%, exceeding threshold of 80%',
        escalationLevel: 0,
        tags: { component: 'system' },
        createdAt: new Date(Date.now() - 300000), // 5 minutes ago
        updatedAt: new Date(Date.now() - 300000)
      }
    ];

    // TODO: Implement actual alert retrieval

    return alerts;
  } catch (error) {
    console.error('Error getting active alerts:', error);
    return [];
  }
}

// Helper function to get escalation rules
async function getEscalationRules(): Promise<AlertEscalationRule[]> {
  try {
    // This would retrieve escalation rules from database
    // For now, return mock data
    const rules: AlertEscalationRule[] = [
      {
        id: 'escalation_critical',
        name: 'Critical Alert Escalation',
        enabled: true,
        triggerConditions: [
          { severity: 'critical', timeUnacknowledged: 300, repeatCount: 3 }
        ],
        escalationSteps: [
          {
            step: 1,
            delayMinutes: 5,
            channels: ['email'],
            recipients: ['admin@example.com'],
            message: 'Critical alert requires immediate attention'
          },
          {
            step: 2,
            delayMinutes: 15,
            channels: ['email', 'slack'],
            recipients: ['manager@example.com', '#alerts'],
            message: 'Critical alert escalated to management'
          }
        ],
        maxEscalationLevel: 2,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ];

    // TODO: Implement actual escalation rule retrieval

    return rules;
  } catch (error) {
    console.error('Error getting escalation rules:', error);
    return [];
  }
}

// Helper function to get suppression rules
async function getSuppressionRules(): Promise<AlertSuppressionRule[]> {
  try {
    // This would retrieve suppression rules from database
    // For now, return mock data
    const rules: AlertSuppressionRule[] = [
      {
        id: 'maintenance_suppression',
        name: 'Maintenance Window Suppression',
        enabled: true,
        conditions: [
          { field: 'tags.maintenance', operator: 'equals', value: 'true' }
        ],
        duration: 7200, // 2 hours
        reason: 'System maintenance in progress',
        createdBy: 'admin',
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 7200000) // 2 hours from now
      }
    ];

    // TODO: Implement actual suppression rule retrieval

    return rules;
  } catch (error) {
    console.error('Error getting suppression rules:', error);
    return [];
  }
}

// Helper function to get alert statistics
async function getAlertStatistics(): Promise<AlertStatistics> {
  try {
    // This would calculate statistics from database
    // For now, return mock data
    const stats: AlertStatistics = {
      totalAlerts: 150,
      activeAlerts: 5,
      acknowledgedAlerts: 10,
      resolvedAlerts: 135,
      suppressedAlerts: 0,
      alertsBySeverity: {
        low: 50,
        medium: 40,
        high: 35,
        critical: 25
      },
      alertsByType: {
        cpu_usage: 45,
        memory_usage: 38,
        disk_usage: 25,
        network_traffic: 20,
        security_events: 15,
        system_health: 7
      },
      averageResolutionTime: 1800, // 30 minutes
      averageTimeToAcknowledge: 600, // 10 minutes
      escalationRate: 15.5,
      falsePositiveRate: 8.2,
      last24Hours: {
        created: 8,
        resolved: 6,
        acknowledged: 7
      },
      last7Days: {
        created: 45,
        resolved: 42,
        acknowledged: 38
      },
      last30Days: {
        created: 150,
        resolved: 135,
        acknowledged: 125
      }
    };

    // TODO: Implement actual statistics calculation

    return stats;
  } catch (error) {
    console.error('Error getting alert statistics:', error);
    return {
      totalAlerts: 0,
      activeAlerts: 0,
      acknowledgedAlerts: 0,
      resolvedAlerts: 0,
      suppressedAlerts: 0,
      alertsBySeverity: { low: 0, medium: 0, high: 0, critical: 0 },
      alertsByType: {},
      averageResolutionTime: 0,
      averageTimeToAcknowledge: 0,
      escalationRate: 0,
      falsePositiveRate: 0,
      last24Hours: { created: 0, resolved: 0, acknowledged: 0 },
      last7Days: { created: 0, resolved: 0, acknowledged: 0 },
      last30Days: { created: 0, resolved: 0, acknowledged: 0 }
    };
  }
}

// Helper function to create alert threshold
async function createAlertThreshold(threshold: any, userId: string): Promise<{ id: string; created: boolean }> {
  try {
    const thresholdId = `threshold_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // TODO: Save to database
    // await db.alertThreshold.create({
    //   data: {
    //     ...threshold,
    //     id: thresholdId,
    //     createdBy: userId,
    //     createdAt: new Date(),
    //     updatedAt: new Date()
    //   }
    // });

    return {
      id: thresholdId,
      created: true
    };
  } catch (error) {
    console.error('Error creating alert threshold:', error);
    return {
      id: '',
      created: false
    };
  }
}

// Helper function to update alert threshold
async function updateAlertThreshold(thresholdId: string, updates: any, userId: string): Promise<{ updated: boolean }> {
  try {
    // TODO: Update in database
    // await db.alertThreshold.update({
    //   where: { id: thresholdId },
    //   data: {
    //     ...updates,
    //     updatedBy: userId,
    //     updatedAt: new Date()
    //   }
    // });

    return { updated: true };
  } catch (error) {
    console.error('Error updating alert threshold:', error);
    return { updated: false };
  }
}

// Helper function to delete alert threshold
async function deleteAlertThreshold(thresholdId: string, userId: string): Promise<{ deleted: boolean }> {
  try {
    // TODO: Delete from database
    // await db.alertThreshold.delete({
    //   where: { id: thresholdId }
    // });

    return { deleted: true };
  } catch (error) {
    console.error('Error deleting alert threshold:', error);
    return { deleted: false };
  }
}

// Helper function to acknowledge alert
async function acknowledgeAlert(alertId: string, userId: string, comment?: string): Promise<{ acknowledged: boolean }> {
  try {
    // TODO: Update alert in database
    // await db.alertInstance.update({
    //   where: { id: alertId },
    //   data: {
    //     status: 'acknowledged',
    //     acknowledgedBy: userId,
    //     acknowledgedAt: new Date(),
    //     updatedAt: new Date()
    //   }
    // });

    // Add history entry
    await addAlertHistoryEntry(alertId, 'acknowledged', userId, { comment });

    return { acknowledged: true };
  } catch (error) {
    console.error('Error acknowledging alert:', error);
    return { acknowledged: false };
  }
}

// Helper function to resolve alert
async function resolveAlert(alertId: string, userId: string, comment?: string): Promise<{ resolved: boolean }> {
  try {
    // TODO: Update alert in database
    // await db.alertInstance.update({
    //   where: { id: alertId },
    //   data: {
    //     status: 'resolved',
    //     resolvedBy: userId,
    //     resolvedAt: new Date(),
    //     updatedAt: new Date()
    //   }
    // });

    // Add history entry
    await addAlertHistoryEntry(alertId, 'resolved', userId, { comment });

    return { resolved: true };
  } catch (error) {
    console.error('Error resolving alert:', error);
    return { resolved: false };
  }
}

// Helper function to create escalation rule
async function createEscalationRule(rule: any, userId: string): Promise<{ id: string; created: boolean }> {
  try {
    const ruleId = `escalation_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // TODO: Save to database
    // await db.alertEscalationRule.create({
    //   data: {
    //     ...rule,
    //     id: ruleId,
    //     createdBy: userId,
    //     createdAt: new Date(),
    //     updatedAt: new Date()
    //   }
    // });

    return {
      id: ruleId,
      created: true
    };
  } catch (error) {
    console.error('Error creating escalation rule:', error);
    return {
      id: '',
      created: false
    };
  }
}

// Helper function to create suppression rule
async function createSuppressionRule(rule: any, userId: string): Promise<{ id: string; created: boolean }> {
  try {
    const ruleId = `suppression_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // TODO: Save to database
    // await db.alertSuppressionRule.create({
    //   data: {
    //     ...rule,
    //     id: ruleId,
    //     createdBy: userId,
    //     createdAt: new Date(),
    //     updatedAt: new Date()
    //   }
    // });

    return {
      id: ruleId,
      created: true
    };
  } catch (error) {
    console.error('Error creating suppression rule:', error);
    return {
      id: '',
      created: false
    };
  }
}

// Helper function to get alert history
async function getAlertHistory(alertId?: string, limit: number = 50): Promise<AlertHistoryEntry[]> {
  try {
    // This would retrieve alert history from database
    // For now, return mock data
    const history: AlertHistoryEntry[] = [
      {
        id: 'history_001',
        alertId: alertId || 'alert_001',
        action: 'created',
        timestamp: new Date(Date.now() - 300000),
        message: 'Alert created due to high CPU usage'
      },
      {
        id: 'history_002',
        alertId: alertId || 'alert_001',
        action: 'acknowledged',
        userId: 'user_123',
        username: 'admin',
        timestamp: new Date(Date.now() - 120000),
        message: 'Alert acknowledged by admin'
      }
    ];

    // TODO: Implement actual history retrieval

    return history.slice(0, limit);
  } catch (error) {
    console.error('Error getting alert history:', error);
    return [];
  }
}

// Helper function to test alert threshold
async function testAlertThreshold(thresholdId: string, testValue: any): Promise<{ triggered: boolean; message: string }> {
  try {
    const thresholds = await getAlertThresholds();
    const threshold = thresholds.find(t => t.id === thresholdId);

    if (!threshold) {
      return {
        triggered: false,
        message: 'Threshold not found'
      };
    }

    const triggered = evaluateThreshold(threshold, testValue);

    return {
      triggered,
      message: triggered
        ? `Alert would be triggered: ${threshold.name} (${testValue} ${threshold.condition} ${threshold.threshold})`
        : `Alert would not be triggered: ${threshold.name} (${testValue} does not meet ${threshold.condition} ${threshold.threshold})`
    };
  } catch (error) {
    console.error('Error testing alert threshold:', error);
    return {
      triggered: false,
      message: `Error testing threshold: ${String(error)}`
    };
  }
}

// Helper function to bulk acknowledge alerts
async function bulkAcknowledgeAlerts(alertIds: string[], userId: string, comment?: string): Promise<{ acknowledged: number }> {
  try {
    let acknowledged = 0;

    for (const alertId of alertIds) {
      const result = await acknowledgeAlert(alertId, userId, comment);
      if (result.acknowledged) {
        acknowledged++;
      }
    }

    return { acknowledged };
  } catch (error) {
    console.error('Error bulk acknowledging alerts:', error);
    return { acknowledged: 0 };
  }
}

// Helper function to bulk resolve alerts
async function bulkResolveAlerts(alertIds: string[], userId: string, comment?: string): Promise<{ resolved: number }> {
  try {
    let resolved = 0;

    for (const alertId of alertIds) {
      const result = await resolveAlert(alertId, userId, comment);
      if (result.resolved) {
        resolved++;
      }
    }

    return { resolved };
  } catch (error) {
    console.error('Error bulk resolving alerts:', error);
    return { resolved: 0 };
  }
}

// Helper function to export alerts
async function exportAlerts(format: string, filters?: any): Promise<{ format: string; data: string; filename: string }> {
  try {
    const alerts = await getActiveAlerts();
    let data: string;

    if (format === 'json') {
      data = JSON.stringify(alerts, null, 2);
    } else {
      // CSV format
      data = 'ID,Name,Severity,Status,Current Value,Threshold,Created At\n';
      alerts.forEach(alert => {
        data += `${alert.id},${alert.thresholdName},${alert.severity},${alert.status},${alert.currentValue},${alert.thresholdValue},${alert.createdAt.toISOString()}\n`;
      });
    }

    return {
      format,
      data,
      filename: `alerts_export_${new Date().toISOString().split('T')[0]}.${format}`
    };
  } catch (error) {
    console.error('Error exporting alerts:', error);
    throw error;
  }
}

// Helper function to add alert history entry
async function addAlertHistoryEntry(alertId: string, action: string, userId?: string, details?: any): Promise<void> {
  try {
    // TODO: Save history entry to database
    // await db.alertHistory.create({
    //   data: {
    //     alertId,
    //     action,
    //     userId,
    //     details,
    //     timestamp: new Date()
    //   }
    // });
  } catch (error) {
    console.error('Error adding alert history entry:', error);
  }
}

// Helper function to evaluate threshold
function evaluateThreshold(threshold: AlertThreshold, value: any): boolean {
  try {
    switch (threshold.condition) {
      case 'greater_than':
        return Number(value) > Number(threshold.threshold);
      case 'less_than':
        return Number(value) < Number(threshold.threshold);
      case 'equals':
        return value == threshold.threshold;
      case 'not_equals':
        return value != threshold.threshold;
      case 'contains':
        return String(value).includes(String(threshold.threshold));
      case 'not_contains':
        return !String(value).includes(String(threshold.threshold));
      default:
        return false;
    }
  } catch (error) {
    console.error('Error evaluating threshold:', error);
    return false;
  }
}
