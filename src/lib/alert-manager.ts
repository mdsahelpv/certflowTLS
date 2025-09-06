/**
 * Alert Manager
 *
 * Comprehensive alert management system for threshold monitoring,
 * escalation rules, suppression, and alert lifecycle management
 */

import { SettingsCacheService } from './settings-cache';
import { AuditService } from './audit';

// Alert Threshold interface
export interface AlertThreshold {
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
  createdBy?: string;
  updatedBy?: string;
}

// Alert Instance interface
export interface AlertInstance {
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
  repeatCount: number;
  lastEvaluation: Date;
}

// Alert Escalation Rule interface
export interface AlertEscalationRule {
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
  createdBy?: string;
  updatedBy?: string;
}

// Alert Suppression Rule interface
export interface AlertSuppressionRule {
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
  updatedBy?: string;
  updatedAt?: Date;
}

// Alert History Entry interface
export interface AlertHistoryEntry {
  id: string;
  alertId: string;
  action: 'created' | 'acknowledged' | 'resolved' | 'escalated' | 'suppressed' | 'commented' | 'assigned';
  userId?: string;
  username?: string;
  timestamp: Date;
  details?: Record<string, any>;
  message?: string;
}

// Alert Statistics interface
export interface AlertStatistics {
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

// Alert Manager Class
export class AlertManager {
  private static alertInstances: Map<string, AlertInstance> = new Map();
  private static escalationTimers: Map<string, NodeJS.Timeout> = new Map();
  private static suppressionRules: AlertSuppressionRule[] = [];
  private static readonly EVALUATION_INTERVAL_MS = 30000; // 30 seconds
  private static readonly ESCALATION_CHECK_INTERVAL_MS = 60000; // 1 minute
  private static evaluationInterval: NodeJS.Timeout | null = null;
  private static escalationInterval: NodeJS.Timeout | null = null;

  // Initialize the alert manager
  static async initialize(): Promise<void> {
    try {
      await this.startAlertEvaluation();
      await this.startEscalationMonitoring();
      await this.loadSuppressionRules();
      console.log('Alert Manager initialized');
    } catch (error) {
      console.error('Failed to initialize Alert Manager:', error);
    }
  }

  // Evaluate metric against alert thresholds
  static async evaluateMetric(metricType: string, value: number | string, tags?: Record<string, string>): Promise<void> {
    try {
      const thresholds = await this.getAlertThresholds();
      const applicableThresholds = thresholds.filter(t =>
        t.enabled &&
        t.metricType === metricType &&
        this.isSuppressed(t, tags)
      );

      for (const threshold of applicableThresholds) {
        await this.evaluateThreshold(threshold, value, tags);
      }
    } catch (error) {
      console.error('Error evaluating metric:', error);
    }
  }

  // Create alert threshold
  static async createAlertThreshold(threshold: Omit<AlertThreshold, 'id' | 'createdAt' | 'updatedAt'>, userId: string): Promise<{ id: string; created: boolean }> {
    try {
      const thresholdId = `threshold_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      const newThreshold: AlertThreshold = {
        ...threshold,
        id: thresholdId,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: userId
      };

      // TODO: Save to database
      // await db.alertThreshold.create({ data: newThreshold });

      // Log threshold creation
      await AuditService.log({
        action: 'USER_UPDATED' as any,
        userId,
        username: userId,
        description: `Alert threshold created: ${threshold.name}`,
        metadata: {
          thresholdId,
          thresholdName: threshold.name,
          metricType: threshold.metricType,
          severity: threshold.severity
        }
      });

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

  // Update alert threshold
  static async updateAlertThreshold(thresholdId: string, updates: Partial<AlertThreshold>, userId: string): Promise<{ updated: boolean }> {
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

      // Log threshold update
      await AuditService.log({
        action: 'USER_UPDATED' as any,
        userId,
        username: userId,
        description: `Alert threshold updated: ${thresholdId}`,
        metadata: {
          thresholdId,
          updates: Object.keys(updates)
        }
      });

      return { updated: true };
    } catch (error) {
      console.error('Error updating alert threshold:', error);
      return { updated: false };
    }
  }

  // Delete alert threshold
  static async deleteAlertThreshold(thresholdId: string, userId: string): Promise<{ deleted: boolean }> {
    try {
      // TODO: Delete from database
      // await db.alertThreshold.delete({
      //   where: { id: thresholdId }
      // });

      // Log threshold deletion
      await AuditService.log({
        action: 'USER_UPDATED' as any,
        userId,
        username: userId,
        description: `Alert threshold deleted: ${thresholdId}`,
        metadata: {
          thresholdId
        }
      });

      return { deleted: true };
    } catch (error) {
      console.error('Error deleting alert threshold:', error);
      return { deleted: false };
    }
  }

  // Get alert thresholds
  static async getAlertThresholds(): Promise<AlertThreshold[]> {
    try {
      // This would retrieve thresholds from database
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

  // Get active alerts
  static async getActiveAlerts(): Promise<AlertInstance[]> {
    try {
      return Array.from(this.alertInstances.values()).filter(
        alert => alert.status === 'active' || alert.status === 'acknowledged'
      );
    } catch (error) {
      console.error('Error getting active alerts:', error);
      return [];
    }
  }

  // Acknowledge alert
  static async acknowledgeAlert(alertId: string, userId: string, comment?: string): Promise<{ acknowledged: boolean }> {
    try {
      const alert = this.alertInstances.get(alertId);
      if (!alert || alert.status !== 'active') {
        return { acknowledged: false };
      }

      alert.status = 'acknowledged';
      alert.acknowledgedBy = userId;
      alert.acknowledgedAt = new Date();
      alert.updatedAt = new Date();

      // Cancel escalation timer
      const timer = this.escalationTimers.get(alertId);
      if (timer) {
        clearTimeout(timer);
        this.escalationTimers.delete(alertId);
      }

      // Add history entry
      await this.addAlertHistoryEntry(alertId, 'acknowledged', userId, { comment });

      // Log acknowledgment
      await AuditService.log({
        action: 'USER_UPDATED' as any,
        userId,
        username: userId,
        description: `Alert acknowledged: ${alert.thresholdName}`,
        metadata: {
          alertId,
          thresholdName: alert.thresholdName,
          comment
        }
      });

      return { acknowledged: true };
    } catch (error) {
      console.error('Error acknowledging alert:', error);
      return { acknowledged: false };
    }
  }

  // Resolve alert
  static async resolveAlert(alertId: string, userId: string, comment?: string): Promise<{ resolved: boolean }> {
    try {
      const alert = this.alertInstances.get(alertId);
      if (!alert) {
        return { resolved: false };
      }

      alert.status = 'resolved';
      alert.resolvedBy = userId;
      alert.resolvedAt = new Date();
      alert.updatedAt = new Date();

      // Cancel escalation timer
      const timer = this.escalationTimers.get(alertId);
      if (timer) {
        clearTimeout(timer);
        this.escalationTimers.delete(alertId);
      }

      // Add history entry
      await this.addAlertHistoryEntry(alertId, 'resolved', userId, { comment });

      // Log resolution
      await AuditService.log({
        action: 'USER_UPDATED' as any,
        userId,
        username: userId,
        description: `Alert resolved: ${alert.thresholdName}`,
        metadata: {
          alertId,
          thresholdName: alert.thresholdName,
          comment
        }
      });

      return { resolved: true };
    } catch (error) {
      console.error('Error resolving alert:', error);
      return { resolved: false };
    }
  }

  // Create escalation rule
  static async createEscalationRule(rule: Omit<AlertEscalationRule, 'id' | 'createdAt' | 'updatedAt'>, userId: string): Promise<{ id: string; created: boolean }> {
    try {
      const ruleId = `escalation_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      const newRule: AlertEscalationRule = {
        ...rule,
        id: ruleId,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: userId
      };

      // TODO: Save to database
      // await db.alertEscalationRule.create({ data: newRule });

      // Log escalation rule creation
      await AuditService.log({
        action: 'USER_UPDATED' as any,
        userId,
        username: userId,
        description: `Escalation rule created: ${rule.name}`,
        metadata: {
          ruleId,
          ruleName: rule.name
        }
      });

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

  // Get escalation rules
  static async getEscalationRules(): Promise<AlertEscalationRule[]> {
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

  // Create suppression rule
  static async createSuppressionRule(rule: Omit<AlertSuppressionRule, 'id' | 'createdAt' | 'expiresAt'>, userId: string): Promise<{ id: string; created: boolean }> {
    try {
      const ruleId = `suppression_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      const newRule: AlertSuppressionRule = {
        ...rule,
        id: ruleId,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + rule.duration * 1000),
        createdBy: userId
      };

      this.suppressionRules.push(newRule);

      // TODO: Save to database
      // await db.alertSuppressionRule.create({ data: newRule });

      // Log suppression rule creation
      await AuditService.log({
        action: 'USER_UPDATED' as any,
        userId,
        username: userId,
        description: `Suppression rule created: ${rule.name}`,
        metadata: {
          ruleId,
          ruleName: rule.name,
          duration: rule.duration
        }
      });

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

  // Get suppression rules
  static async getSuppressionRules(): Promise<AlertSuppressionRule[]> {
    try {
      return this.suppressionRules.filter(rule => rule.expiresAt > new Date());
    } catch (error) {
      console.error('Error getting suppression rules:', error);
      return [];
    }
  }

  // Get alert history
  static async getAlertHistory(alertId?: string, limit: number = 50): Promise<AlertHistoryEntry[]> {
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

  // Get alert statistics
  static async getAlertStatistics(): Promise<AlertStatistics> {
    try {
      const allAlerts = Array.from(this.alertInstances.values());
      const activeAlerts = allAlerts.filter(a => a.status === 'active');
      const acknowledgedAlerts = allAlerts.filter(a => a.status === 'acknowledged');
      const resolvedAlerts = allAlerts.filter(a => a.status === 'resolved');
      const suppressedAlerts = allAlerts.filter(a => a.status === 'suppressed');

      // Calculate statistics
      const alertsBySeverity = {
        low: allAlerts.filter(a => a.severity === 'low').length,
        medium: allAlerts.filter(a => a.severity === 'medium').length,
        high: allAlerts.filter(a => a.severity === 'high').length,
        critical: allAlerts.filter(a => a.severity === 'critical').length
      };

      const alertsByType: Record<string, number> = {};
      allAlerts.forEach(alert => {
        alertsByType[alert.metricType] = (alertsByType[alert.metricType] || 0) + 1;
      });

      // Calculate time-based statistics
      const now = Date.now();
      const last24Hours = allAlerts.filter(a => a.createdAt.getTime() > now - 24 * 60 * 60 * 1000);
      const last7Days = allAlerts.filter(a => a.createdAt.getTime() > now - 7 * 24 * 60 * 60 * 1000);
      const last30Days = allAlerts.filter(a => a.createdAt.getTime() > now - 30 * 24 * 60 * 60 * 1000);

      return {
        totalAlerts: allAlerts.length,
        activeAlerts: activeAlerts.length,
        acknowledgedAlerts: acknowledgedAlerts.length,
        resolvedAlerts: resolvedAlerts.length,
        suppressedAlerts: suppressedAlerts.length,
        alertsBySeverity,
        alertsByType,
        averageResolutionTime: 1800, // Mock data
        averageTimeToAcknowledge: 600, // Mock data
        escalationRate: 15.5, // Mock data
        falsePositiveRate: 8.2, // Mock data
        last24Hours: {
          created: last24Hours.length,
          resolved: last24Hours.filter(a => a.status === 'resolved').length,
          acknowledged: last24Hours.filter(a => a.status === 'acknowledged').length
        },
        last7Days: {
          created: last7Days.length,
          resolved: last7Days.filter(a => a.status === 'resolved').length,
          acknowledged: last7Days.filter(a => a.status === 'acknowledged').length
        },
        last30Days: {
          created: last30Days.length,
          resolved: last30Days.filter(a => a.status === 'resolved').length,
          acknowledged: last30Days.filter(a => a.status === 'acknowledged').length
        }
      };
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

  // Test alert threshold
  static async testAlertThreshold(thresholdId: string, testValue: any): Promise<{ triggered: boolean; message: string }> {
    try {
      const thresholds = await this.getAlertThresholds();
      const threshold = thresholds.find(t => t.id === thresholdId);

      if (!threshold) {
        return {
          triggered: false,
          message: 'Threshold not found'
        };
      }

      const triggered = this.evaluateThresholdCondition(threshold, testValue);

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

  // Private helper methods

  private static async evaluateThreshold(threshold: AlertThreshold, value: number | string, tags?: Record<string, string>): Promise<void> {
    try {
      const existingAlert = Array.from(this.alertInstances.values()).find(
        alert => alert.thresholdId === threshold.id && alert.status === 'active'
      );

      const triggered = this.evaluateThresholdCondition(threshold, value);

      if (triggered) {
        if (existingAlert) {
          // Update existing alert
          existingAlert.currentValue = value;
          existingAlert.repeatCount++;
          existingAlert.lastEvaluation = new Date();
          existingAlert.updatedAt = new Date();
        } else {
          // Check cooldown period
          const lastAlert = Array.from(this.alertInstances.values())
            .filter(alert => alert.thresholdId === threshold.id)
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];

          if (lastAlert) {
            const timeSinceLastAlert = Date.now() - lastAlert.createdAt.getTime();
            if (timeSinceLastAlert < threshold.cooldownPeriod * 1000) {
              return; // Still in cooldown
            }
          }

          // Create new alert
          await this.createAlert(threshold, value, tags);
        }
      } else if (existingAlert && threshold.autoResolve && threshold.resolveThreshold !== undefined) {
        // Check if alert should be auto-resolved
        const shouldResolve = this.evaluateThresholdCondition(
          { ...threshold, threshold: threshold.resolveThreshold },
          value
        );

        if (shouldResolve) {
          await this.resolveAlert(existingAlert.id, 'system', 'Auto-resolved: condition no longer met');
        }
      }
    } catch (error) {
      console.error('Error evaluating threshold:', error);
    }
  }

  private static evaluateThresholdCondition(threshold: AlertThreshold, value: any): boolean {
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
      console.error('Error evaluating threshold condition:', error);
      return false;
    }
  }

  private static async createAlert(threshold: AlertThreshold, value: number | string, tags?: Record<string, string>): Promise<void> {
    try {
      const alertId = `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      const alert: AlertInstance = {
        id: alertId,
        thresholdId: threshold.id,
        thresholdName: threshold.name,
        metricType: threshold.metricType,
        severity: threshold.severity,
        status: 'active',
        currentValue: value,
        thresholdValue: threshold.threshold,
        condition: threshold.condition,
        message: threshold.customMessage || `${threshold.name}: ${value} ${threshold.condition} ${threshold.threshold}`,
        escalationLevel: 0,
        tags: { ...threshold.tags, ...tags },
        createdAt: new Date(),
        updatedAt: new Date(),
        repeatCount: 1,
        lastEvaluation: new Date()
      };

      this.alertInstances.set(alertId, alert);

      // Add history entry
      await this.addAlertHistoryEntry(alertId, 'created', undefined, {
        threshold: threshold.name,
        value,
        condition: threshold.condition,
        thresholdValue: threshold.threshold
      });

      // Schedule escalation check
      await this.scheduleEscalationCheck(alert);

      // Send initial notifications
      await this.sendAlertNotifications(alert, threshold);

      // Log alert creation
      await AuditService.log({
        action: 'USER_UPDATED' as any,
        userId: 'system',
        username: 'system',
        description: `Alert created: ${threshold.name}`,
        metadata: {
          alertId,
          thresholdName: threshold.name,
          severity: threshold.severity,
          value
        }
      });
    } catch (error) {
      console.error('Error creating alert:', error);
    }
  }

  private static async scheduleEscalationCheck(alert: AlertInstance): Promise<void> {
    try {
      const escalationRules = await this.getEscalationRules();
      const applicableRule = escalationRules.find(rule =>
        rule.enabled &&
        rule.triggerConditions.some(condition =>
          condition.severity === alert.severity
        )
      );

      if (!applicableRule) return;

      const triggerCondition = applicableRule.triggerConditions.find(
        condition => condition.severity === alert.severity
      );

      if (!triggerCondition) return;

      const timer = setTimeout(async () => {
        await this.checkEscalation(alert, applicableRule);
      }, triggerCondition.timeUnacknowledged * 1000);

      this.escalationTimers.set(alert.id, timer);
    } catch (error) {
      console.error('Error scheduling escalation check:', error);
    }
  }

  private static async checkEscalation(alert: AlertInstance, rule: AlertEscalationRule): Promise<void> {
    try {
      if (alert.status !== 'active') return;

      const currentLevel = alert.escalationLevel;
      if (currentLevel >= rule.maxEscalationLevel) return;

      const nextStep = rule.escalationSteps.find(step => step.step === currentLevel + 1);
      if (!nextStep) return;

      alert.escalationLevel++;
      alert.updatedAt = new Date();

      // Send escalation notifications
      await this.sendEscalationNotifications(alert, nextStep);

      // Add history entry
      await this.addAlertHistoryEntry(alert.id, 'escalated', undefined, {
        level: alert.escalationLevel,
        step: nextStep.step
      });

      // Schedule next escalation check
      if (alert.escalationLevel < rule.maxEscalationLevel) {
        const nextTimer = setTimeout(async () => {
          await this.checkEscalation(alert, rule);
        }, nextStep.delayMinutes * 60 * 1000);

        this.escalationTimers.set(alert.id, nextTimer);
      }
    } catch (error) {
      console.error('Error checking escalation:', error);
    }
  }

  private static async sendAlertNotifications(alert: AlertInstance, threshold: AlertThreshold): Promise<void> {
    try {
      // This would send notifications via configured channels
      // For now, just log the notification
      console.log(`Sending alert notifications for: ${alert.thresholdName}`);

      // TODO: Implement actual notification sending
      // - Email notifications
      // - Webhook notifications
      // - Slack notifications
      // - SMS notifications

      alert.lastNotificationSent = new Date();
    } catch (error) {
      console.error('Error sending alert notifications:', error);
    }
  }

  private static async sendEscalationNotifications(alert: AlertInstance, step: any): Promise<void> {
    try {
      // This would send escalation notifications
      console.log(`Sending escalation notifications for: ${alert.thresholdName}, level: ${alert.escalationLevel}`);

      // TODO: Implement actual escalation notification sending
    } catch (error) {
      console.error('Error sending escalation notifications:', error);
    }
  }

  private static isSuppressed(threshold: AlertThreshold, tags?: Record<string, string>): boolean {
    try {
      for (const rule of this.suppressionRules) {
        if (!rule.enabled || rule.expiresAt <= new Date()) continue;

        let matches = true;
        for (const condition of rule.conditions) {
          const fieldValue = this.getFieldValue(threshold, tags, condition.field);
          if (!this.evaluateSuppressionCondition(fieldValue, condition)) {
            matches = false;
            break;
          }
        }

        if (matches) {
          return true; // Alert is suppressed
        }
      }

      return false; // Alert is not suppressed
    } catch (error) {
      console.error('Error checking suppression:', error);
      return false;
    }
  }

  private static getFieldValue(threshold: AlertThreshold, tags: Record<string, string> | undefined, field: string): string {
    try {
      const parts = field.split('.');
      if (parts[0] === 'tags' && parts[1] && tags) {
        return tags[parts[1]] || '';
      }

      // Handle other field types
      switch (field) {
        case 'metricType':
          return threshold.metricType;
        case 'severity':
          return threshold.severity;
        case 'name':
          return threshold.name;
        default:
          return '';
      }
    } catch (error) {
      console.error('Error getting field value:', error);
      return '';
    }
  }

  private static evaluateSuppressionCondition(value: string, condition: any): boolean {
    try {
      switch (condition.operator) {
        case 'equals':
          return value === condition.value;
        case 'not_equals':
          return value !== condition.value;
        case 'contains':
          return value.includes(condition.value);
        case 'not_contains':
          return !value.includes(condition.value);
        case 'regex':
          return new RegExp(condition.value).test(value);
        default:
          return false;
      }
    } catch (error) {
      console.error('Error evaluating suppression condition:', error);
      return false;
    }
  }

  private static async addAlertHistoryEntry(alertId: string, action: string, userId?: string, details?: any): Promise<void> {
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

  private static async loadSuppressionRules(): Promise<void> {
    try {
      // This would load suppression rules from database
      this.suppressionRules = [
        {
          id: 'maintenance_suppression',
          name: 'Maintenance Window Suppression',
          enabled: true,
          conditions: [
            { field: 'tags.maintenance', operator: 'equals', value: 'true' }
          ],
          duration: 7200,
          reason: 'System maintenance in progress',
          createdBy: 'admin',
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 7200000)
        }
      ];

      // TODO: Implement actual suppression rule loading
    } catch (error) {
      console.error('Error loading suppression rules:', error);
    }
  }

  private static async startAlertEvaluation(): Promise<void> {
    try {
      this.evaluationInterval = setInterval(async () => {
        try {
          // This would evaluate metrics against thresholds
          // For now, just clean up old alerts
          await this.cleanupOldAlerts();
        } catch (error) {
          console.error('Error in alert evaluation:', error);
        }
      }, this.EVALUATION_INTERVAL_MS);
    } catch (error) {
      console.error('Error starting alert evaluation:', error);
    }
  }

  private static async startEscalationMonitoring(): Promise<void> {
    try {
      this.escalationInterval = setInterval(async () => {
        try {
          // Check for alerts that need escalation
          const activeAlerts = await this.getActiveAlerts();
          for (const alert of activeAlerts) {
            if (alert.status === 'active' && !this.escalationTimers.has(alert.id)) {
              await this.scheduleEscalationCheck(alert);
            }
          }
        } catch (error) {
          console.error('Error in escalation monitoring:', error);
        }
      }, this.ESCALATION_CHECK_INTERVAL_MS);
    } catch (error) {
      console.error('Error starting escalation monitoring:', error);
    }
  }

  private static async cleanupOldAlerts(): Promise<void> {
    try {
      const cutoffDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago

      for (const [alertId, alert] of this.alertInstances.entries()) {
        if (alert.createdAt < cutoffDate && alert.status === 'resolved') {
          this.alertInstances.delete(alertId);
        }
      }
    } catch (error) {
      console.error('Error cleaning up old alerts:', error);
    }
  }

  // Shutdown the alert manager
  static shutdown(): void {
    if (this.evaluationInterval) {
      clearInterval(this.evaluationInterval);
      this.evaluationInterval = null;
    }

    if (this.escalationInterval) {
      clearInterval(this.escalationInterval);
      this.escalationInterval = null;
    }

    // Clear all escalation timers
    for (const timer of this.escalationTimers.values()) {
      clearTimeout(timer);
    }
    this.escalationTimers.clear();

    this.alertInstances.clear();
    this.suppressionRules = [];
    console.log('Alert Manager shut down');
  }
}

// Export utilities
export const evaluateMetric = AlertManager.evaluateMetric.bind(AlertManager);
export const createAlertThreshold = AlertManager.createAlertThreshold.bind(AlertManager);
export const updateAlertThreshold = AlertManager.updateAlertThreshold.bind(AlertManager);
export const deleteAlertThreshold = AlertManager.deleteAlertThreshold.bind(AlertManager);
export const getAlertThresholds = AlertManager.getAlertThresholds.bind(AlertManager);
export const getActiveAlerts = AlertManager.getActiveAlerts.bind(AlertManager);
export const acknowledgeAlert = AlertManager.acknowledgeAlert.bind(AlertManager);
export const resolveAlert = AlertManager.resolveAlert.bind(AlertManager);
export const createEscalationRule = AlertManager.createEscalationRule.bind(AlertManager);
export const getEscalationRules = AlertManager.getEscalationRules.bind(AlertManager);
export const createSuppressionRule = AlertManager.createSuppressionRule.bind(AlertManager);
export const getSuppressionRules = AlertManager.getSuppressionRules.bind(AlertManager);
export const getAlertHistory = AlertManager.getAlertHistory.bind(AlertManager);
export const getAlertStatistics = AlertManager.getAlertStatistics.bind(AlertManager);
export const testAlertThreshold = AlertManager.testAlertThreshold.bind(AlertManager);
export const initializeAlertManager = AlertManager.initialize.bind(AlertManager);

export default AlertManager;
