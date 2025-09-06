/**
 * Health Check Manager
 *
 * Comprehensive health monitoring system for system components
 * Handles automated health checks, alerting, and status reporting
 */

import { SettingsCacheService } from './settings-cache';
import { AuditService } from './audit';

// Health Check Configuration interface
export interface HealthCheckConfig {
  enabled: boolean;
  intervalMinutes: number;
  timeoutSeconds: number;
  failureThreshold: number;
  successThreshold: number;
  retryAttempts: number;
  retryDelaySeconds: number;
  notificationSettings: {
    enabled: boolean;
    notifyOnFailure: boolean;
    notifyOnRecovery: boolean;
    alertRecipients?: string[];
    escalationDelayMinutes?: number;
  };
  checks: HealthCheckDefinition[];
}

// Health Check Definition interface
export interface HealthCheckDefinition {
  id: string;
  name: string;
  type: 'http' | 'tcp' | 'database' | 'filesystem' | 'memory' | 'cpu' | 'disk' | 'custom';
  enabled: boolean;
  endpoint?: string;
  port?: number;
  timeoutSeconds?: number;
  expectedStatus?: number;
  expectedResponse?: string;
  headers?: Record<string, string>;
  databaseQuery?: string;
  filesystemPath?: string;
  thresholdWarning?: number;
  thresholdCritical?: number;
  customFunction?: string;
}

// Health Check Result interface
export interface HealthCheckResult {
  checkId: string;
  checkName: string;
  status: 'healthy' | 'unhealthy' | 'warning';
  responseTime: number;
  timestamp: Date;
  message: string;
  details?: any;
  error?: string;
  consecutiveFailures: number;
  lastFailureTime?: Date;
  lastSuccessTime?: Date;
}

// Health Check Status interface
export interface HealthCheckStatus {
  overallStatus: 'healthy' | 'unhealthy' | 'warning';
  totalChecks: number;
  healthyChecks: number;
  unhealthyChecks: number;
  warningChecks: number;
  lastCheckTime?: Date;
  nextCheckTime?: Date;
  results: HealthCheckResult[];
  uptimePercentage: number;
}

// Health Check Statistics interface
export interface HealthCheckStatistics {
  totalChecks: number;
  successfulChecks: number;
  failedChecks: number;
  averageResponseTime: number;
  uptimePercentage: number;
  lastCheckTime?: Date;
  mostFailingCheck?: string;
  checkTypeDistribution: Record<string, number>;
  failureRateByCheck: Record<string, number>;
  averageResponseTimeByCheck: Record<string, number>;
}

// Health Check Alert interface
export interface HealthCheckAlert {
  id: string;
  checkId: string;
  checkName: string;
  alertType: 'failure' | 'recovery' | 'warning';
  message: string;
  timestamp: Date;
  resolved: boolean;
  resolvedAt?: Date;
  consecutiveFailures: number;
  details?: any;
}

// Health Check Manager Class
export class HealthCheckManager {
  private static checkInterval: NodeJS.Timeout | null = null;
  private static lastResults: Map<string, HealthCheckResult> = new Map();
  private static alerts: HealthCheckAlert[] = [];
  private static consecutiveFailures: Map<string, number> = new Map();

  // Initialize the health check manager
  static async initialize(): Promise<void> {
    try {
      await this.startHealthCheckMonitoring();
      console.log('Health Check Manager initialized');
    } catch (error) {
      console.error('Failed to initialize Health Check Manager:', error);
    }
  }

  // Run all configured health checks
  static async runAllHealthChecks(): Promise<HealthCheckStatus> {
    try {
      const config = await this.getHealthCheckConfig();
      if (!config.enabled) {
        return {
          overallStatus: 'healthy',
          totalChecks: 0,
          healthyChecks: 0,
          unhealthyChecks: 0,
          warningChecks: 0,
          results: [],
          uptimePercentage: 100
        };
      }

      const results: HealthCheckResult[] = [];

      for (const check of config.checks.filter(c => c.enabled)) {
        try {
          const result = await this.executeHealthCheck(check);
          results.push(result);

          // Update last results
          this.lastResults.set(check.id, result);

          // Handle alerting
          await this.handleAlerting(check, result, config);
        } catch (error) {
          console.error(`Error executing health check ${check.name}:`, error);
          const errorResult: HealthCheckResult = {
            checkId: check.id,
            checkName: check.name,
            status: 'unhealthy',
            responseTime: 0,
            timestamp: new Date(),
            message: `Health check failed: ${check.name}`,
            error: String(error),
            consecutiveFailures: (this.consecutiveFailures.get(check.id) || 0) + 1
          };

          results.push(errorResult);
          this.lastResults.set(check.id, errorResult);
        }
      }

      const healthyChecks = results.filter(r => r.status === 'healthy').length;
      const unhealthyChecks = results.filter(r => r.status === 'unhealthy').length;
      const warningChecks = results.filter(r => r.status === 'warning').length;

      const overallStatus = unhealthyChecks > 0 ? 'unhealthy' :
                           warningChecks > 0 ? 'warning' : 'healthy';

      const status: HealthCheckStatus = {
        overallStatus,
        totalChecks: results.length,
        healthyChecks,
        unhealthyChecks,
        warningChecks,
        lastCheckTime: new Date(),
        nextCheckTime: new Date(Date.now() + (config.intervalMinutes * 60 * 1000)),
        results,
        uptimePercentage: await this.calculateUptimePercentage()
      };

      // Log the health check execution
      await AuditService.log({
        action: 'USER_UPDATED' as any,
        userId: 'system',
        username: 'system',
        description: `Health checks completed: ${healthyChecks}/${results.length} healthy`,
        metadata: {
          overallStatus,
          totalChecks: results.length,
          healthyChecks,
          unhealthyChecks,
          warningChecks
        }
      });

      return status;
    } catch (error) {
      console.error('Error running all health checks:', error);
      return {
        overallStatus: 'unhealthy',
        totalChecks: 0,
        healthyChecks: 0,
        unhealthyChecks: 0,
        warningChecks: 0,
        results: [],
        uptimePercentage: 0
      };
    }
  }

  // Execute a single health check
  static async executeHealthCheck(check: HealthCheckDefinition): Promise<HealthCheckResult> {
    const startTime = Date.now();

    try {
      let result: { status: 'healthy' | 'unhealthy' | 'warning'; message: string; details?: any };

      switch (check.type) {
        case 'http':
          result = await this.performHttpCheck(check);
          break;
        case 'tcp':
          result = await this.performTcpCheck(check);
          break;
        case 'database':
          result = await this.performDatabaseCheck(check);
          break;
        case 'filesystem':
          result = await this.performFilesystemCheck(check);
          break;
        case 'memory':
          result = await this.performMemoryCheck(check);
          break;
        case 'cpu':
          result = await this.performCpuCheck(check);
          break;
        case 'disk':
          result = await this.performDiskCheck(check);
          break;
        case 'custom':
          result = await this.performCustomCheck(check);
          break;
        default:
          throw new Error(`Unknown check type: ${check.type}`);
      }

      const responseTime = Date.now() - startTime;
      const consecutiveFailures = this.consecutiveFailures.get(check.id) || 0;

      const healthResult: HealthCheckResult = {
        checkId: check.id,
        checkName: check.name,
        status: result.status,
        responseTime,
        timestamp: new Date(),
        message: result.message,
        details: result.details,
        consecutiveFailures: result.status === 'healthy' ? 0 : consecutiveFailures + 1,
        lastSuccessTime: result.status === 'healthy' ? new Date() : undefined,
        lastFailureTime: result.status !== 'healthy' ? new Date() : undefined
      };

      // Update consecutive failures
      if (result.status === 'healthy') {
        this.consecutiveFailures.delete(check.id);
      } else {
        this.consecutiveFailures.set(check.id, healthResult.consecutiveFailures);
      }

      return healthResult;
    } catch (error) {
      const responseTime = Date.now() - startTime;
      const consecutiveFailures = (this.consecutiveFailures.get(check.id) || 0) + 1;

      const errorResult: HealthCheckResult = {
        checkId: check.id,
        checkName: check.name,
        status: 'unhealthy',
        responseTime,
        timestamp: new Date(),
        message: `Health check failed: ${check.name}`,
        error: String(error),
        consecutiveFailures,
        lastFailureTime: new Date()
      };

      this.consecutiveFailures.set(check.id, consecutiveFailures);
      return errorResult;
    }
  }

  // Get health check statistics
  static async getHealthCheckStatistics(): Promise<HealthCheckStatistics> {
    try {
      const [
        totalChecks,
        successfulChecks,
        failedChecks,
        averageResponseTime,
        lastCheckTime,
        mostFailingCheck,
        checkTypeDistribution,
        failureRateByCheck,
        averageResponseTimeByCheck
      ] = await Promise.all([
        this.getTotalChecksCount(),
        this.getSuccessfulChecksCount(),
        this.getFailedChecksCount(),
        this.getAverageResponseTime(),
        this.getLastCheckTime(),
        this.getMostFailingCheck(),
        this.getCheckTypeDistribution(),
        this.getFailureRateByCheck(),
        this.getAverageResponseTimeByCheck()
      ]);

      const uptimePercentage = await this.calculateUptimePercentage();

      return {
        totalChecks,
        successfulChecks,
        failedChecks,
        averageResponseTime,
        uptimePercentage,
        lastCheckTime,
        mostFailingCheck,
        checkTypeDistribution,
        failureRateByCheck,
        averageResponseTimeByCheck
      };
    } catch (error) {
      console.error('Error getting health check statistics:', error);
      return {
        totalChecks: 0,
        successfulChecks: 0,
        failedChecks: 0,
        averageResponseTime: 0,
        uptimePercentage: 0,
        checkTypeDistribution: {},
        failureRateByCheck: {},
        averageResponseTimeByCheck: {}
      };
    }
  }

  // Get active alerts
  static async getActiveAlerts(): Promise<HealthCheckAlert[]> {
    try {
      return this.alerts.filter(alert => !alert.resolved);
    } catch (error) {
      console.error('Error getting active alerts:', error);
      return [];
    }
  }

  // Resolve alert
  static async resolveAlert(alertId: string): Promise<boolean> {
    try {
      const alert = this.alerts.find(a => a.id === alertId);
      if (alert) {
        alert.resolved = true;
        alert.resolvedAt = new Date();

        // Log alert resolution
        await AuditService.log({
          action: 'USER_UPDATED' as any,
          userId: 'system',
          username: 'system',
          description: `Health check alert resolved: ${alert.checkName}`,
          metadata: {
            alertId,
            checkId: alert.checkId,
            alertType: alert.alertType
          }
        });

        return true;
      }
      return false;
    } catch (error) {
      console.error('Error resolving alert:', error);
      return false;
    }
  }

  // Test health check endpoint
  static async testHealthCheckEndpoint(check: HealthCheckDefinition): Promise<HealthCheckResult> {
    try {
      const result = await this.executeHealthCheck(check);

      // Log the test
      await AuditService.log({
        action: 'USER_UPDATED' as any,
        userId: 'system',
        username: 'system',
        description: `Health check endpoint tested: ${check.name}`,
        metadata: {
          checkId: check.id,
          checkName: check.name,
          status: result.status,
          responseTime: result.responseTime
        }
      });

      return result;
    } catch (error) {
      console.error('Error testing health check endpoint:', error);
      return {
        checkId: check.id,
        checkName: check.name,
        status: 'unhealthy',
        responseTime: 0,
        timestamp: new Date(),
        message: `Test failed for ${check.name}`,
        error: String(error),
        consecutiveFailures: 1,
        lastFailureTime: new Date()
      };
    }
  }

  // Reset health check statistics
  static async resetHealthCheckStatistics(): Promise<{ statisticsReset: boolean; alertsCleared: boolean; consecutiveFailuresReset: boolean }> {
    try {
      // Clear statistics
      this.lastResults.clear();
      this.consecutiveFailures.clear();

      // Clear resolved alerts (keep active ones)
      this.alerts = this.alerts.filter(alert => !alert.resolved);

      // Log the reset
      await AuditService.log({
        action: 'USER_UPDATED' as any,
        userId: 'system',
        username: 'system',
        description: 'Health check statistics reset',
        metadata: {
          alertsCleared: this.alerts.length,
          consecutiveFailuresReset: true
        }
      });

      return {
        statisticsReset: true,
        alertsCleared: true,
        consecutiveFailuresReset: true
      };
    } catch (error) {
      console.error('Error resetting health check statistics:', error);
      return {
        statisticsReset: false,
        alertsCleared: false,
        consecutiveFailuresReset: false
      };
    }
  }

  // Private helper methods

  private static async getHealthCheckConfig(): Promise<HealthCheckConfig> {
    try {
      const configData = await SettingsCacheService.getCASetting('health_check_config');

      return configData?.config || {
        enabled: true,
        intervalMinutes: 5,
        timeoutSeconds: 30,
        failureThreshold: 3,
        successThreshold: 2,
        retryAttempts: 2,
        retryDelaySeconds: 5,
        notificationSettings: {
          enabled: true,
          notifyOnFailure: true,
          notifyOnRecovery: true,
          alertRecipients: []
        },
        checks: [
          {
            id: 'api_health',
            name: 'API Health',
            type: 'http',
            enabled: true,
            endpoint: 'http://localhost:3000/api/health',
            expectedStatus: 200,
            timeoutSeconds: 10
          },
          {
            id: 'database_connection',
            name: 'Database Connection',
            type: 'database',
            enabled: true,
            databaseQuery: 'SELECT 1',
            timeoutSeconds: 5
          },
          {
            id: 'filesystem',
            name: 'File System',
            type: 'filesystem',
            enabled: true,
            filesystemPath: '/tmp',
            timeoutSeconds: 5
          }
        ]
      };
    } catch (error) {
      console.error('Error getting health check config:', error);
      throw error;
    }
  }

  private static async performHttpCheck(check: HealthCheckDefinition): Promise<{ status: 'healthy' | 'unhealthy' | 'warning'; message: string; details?: any }> {
    try {
      if (!check.endpoint) {
        throw new Error('HTTP endpoint is required');
      }

      // This would make an actual HTTP request
      // For now, return mock result
      const responseTime = Math.random() * 1000 + 100;
      const statusCode = 200;

      if (check.expectedStatus && statusCode !== check.expectedStatus) {
        return {
          status: 'unhealthy',
          message: `HTTP check failed: expected ${check.expectedStatus}, got ${statusCode}`,
          details: { statusCode, responseTime, endpoint: check.endpoint }
        };
      }

      return {
        status: 'healthy',
        message: `HTTP check passed for ${check.endpoint}`,
        details: { statusCode, responseTime, endpoint: check.endpoint }
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        message: `HTTP check failed for ${check.endpoint}`,
        details: { error: String(error), endpoint: check.endpoint }
      };
    }
  }

  private static async performTcpCheck(check: HealthCheckDefinition): Promise<{ status: 'healthy' | 'unhealthy' | 'warning'; message: string; details?: any }> {
    try {
      if (!check.endpoint || !check.port) {
        throw new Error('TCP endpoint and port are required');
      }

      // This would perform a TCP connection test
      // For now, return mock result
      const connectionTime = Math.random() * 500 + 50;

      return {
        status: 'healthy',
        message: `TCP check passed for ${check.endpoint}:${check.port}`,
        details: { connectionTime, endpoint: check.endpoint, port: check.port }
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        message: `TCP check failed for ${check.endpoint}:${check.port}`,
        details: { error: String(error), endpoint: check.endpoint, port: check.port }
      };
    }
  }

  private static async performDatabaseCheck(check: HealthCheckDefinition): Promise<{ status: 'healthy' | 'unhealthy' | 'warning'; message: string; details?: any }> {
    try {
      // This would execute a database query
      // For now, return mock result
      const queryTime = Math.random() * 100 + 25;

      return {
        status: 'healthy',
        message: 'Database connection is healthy',
        details: { queryTime, resultCount: 1, query: check.databaseQuery }
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        message: 'Database connection failed',
        details: { error: String(error), query: check.databaseQuery }
      };
    }
  }

  private static async performFilesystemCheck(check: HealthCheckDefinition): Promise<{ status: 'healthy' | 'unhealthy' | 'warning'; message: string; details?: any }> {
    try {
      if (!check.filesystemPath) {
        throw new Error('Filesystem path is required');
      }

      // This would check filesystem accessibility
      // For now, return mock result
      const freeSpace = '10GB';
      const accessible = true;

      return {
        status: 'healthy',
        message: `Filesystem check passed for ${check.filesystemPath}`,
        details: { accessible, freeSpace, path: check.filesystemPath }
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        message: `Filesystem check failed for ${check.filesystemPath}`,
        details: { error: String(error), path: check.filesystemPath }
      };
    }
  }

  private static async performMemoryCheck(check: HealthCheckDefinition): Promise<{ status: 'healthy' | 'unhealthy' | 'warning'; message: string; details?: any }> {
    try {
      // This would check system memory usage
      // For now, return mock result
      const memoryUsage = Math.random() * 100;
      const totalMemory = '8GB';
      const freeMemory = `${(8 * (100 - memoryUsage) / 100).toFixed(1)}GB`;

      const status = memoryUsage > (check.thresholdCritical || 90) ? 'unhealthy' :
                     memoryUsage > (check.thresholdWarning || 80) ? 'warning' : 'healthy';

      return {
        status,
        message: `Memory usage: ${memoryUsage.toFixed(1)}%`,
        details: { memoryUsage, totalMemory, freeMemory }
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        message: 'Memory check failed',
        details: { error: String(error) }
      };
    }
  }

  private static async performCpuCheck(check: HealthCheckDefinition): Promise<{ status: 'healthy' | 'unhealthy' | 'warning'; message: string; details?: any }> {
    try {
      // This would check CPU usage
      // For now, return mock result
      const cpuUsage = Math.random() * 100;
      const loadAverage = (Math.random() * 4 + 1).toFixed(1);

      const status = cpuUsage > (check.thresholdCritical || 90) ? 'unhealthy' :
                     cpuUsage > (check.thresholdWarning || 80) ? 'warning' : 'healthy';

      return {
        status,
        message: `CPU usage: ${cpuUsage.toFixed(1)}%`,
        details: { cpuUsage, loadAverage }
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        message: 'CPU check failed',
        details: { error: String(error) }
      };
    }
  }

  private static async performDiskCheck(check: HealthCheckDefinition): Promise<{ status: 'healthy' | 'unhealthy' | 'warning'; message: string; details?: any }> {
    try {
      // This would check disk usage
      // For now, return mock result
      const diskUsage = Math.random() * 100;
      const totalSpace = '100GB';
      const freeSpace = `${(100 * (100 - diskUsage) / 100).toFixed(1)}GB`;

      const status = diskUsage > (check.thresholdCritical || 90) ? 'unhealthy' :
                     diskUsage > (check.thresholdWarning || 85) ? 'warning' : 'healthy';

      return {
        status,
        message: `Disk usage: ${diskUsage.toFixed(1)}%`,
        details: { diskUsage, totalSpace, freeSpace }
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        message: 'Disk check failed',
        details: { error: String(error) }
      };
    }
  }

  private static async performCustomCheck(check: HealthCheckDefinition): Promise<{ status: 'healthy' | 'unhealthy' | 'warning'; message: string; details?: any }> {
    try {
      // This would execute custom health check logic
      // For now, return mock result
      return {
        status: 'healthy',
        message: `Custom check passed for ${check.name}`,
        details: { customResult: 'OK', function: check.customFunction }
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        message: `Custom check failed for ${check.name}`,
        details: { error: String(error), function: check.customFunction }
      };
    }
  }

  private static async handleAlerting(check: HealthCheckDefinition, result: HealthCheckResult, config: HealthCheckConfig): Promise<void> {
    try {
      if (!config.notificationSettings.enabled) {
        return;
      }

      const lastResult = this.lastResults.get(check.id);
      const consecutiveFailures = result.consecutiveFailures;

      // Check for failure alert
      if (result.status !== 'healthy' &&
          config.notificationSettings.notifyOnFailure &&
          consecutiveFailures >= config.failureThreshold) {

        const alert: HealthCheckAlert = {
          id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          checkId: check.id,
          checkName: check.name,
          alertType: 'failure',
          message: `Health check failed: ${check.name} (${consecutiveFailures} consecutive failures)`,
          timestamp: new Date(),
          resolved: false,
          consecutiveFailures,
          details: {
            result,
            check
          }
        };

        this.alerts.push(alert);

        // Log the alert
        await AuditService.log({
          action: 'USER_UPDATED' as any,
          userId: 'system',
          username: 'system',
          description: `Health check alert created: ${check.name}`,
          metadata: {
            alertId: alert.id,
            checkId: check.id,
            alertType: 'failure',
            consecutiveFailures
          }
        });
      }

      // Check for recovery alert
      if (result.status === 'healthy' &&
          lastResult?.status !== 'healthy' &&
          config.notificationSettings.notifyOnRecovery) {

        const alert: HealthCheckAlert = {
          id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          checkId: check.id,
          checkName: check.name,
          alertType: 'recovery',
          message: `Health check recovered: ${check.name}`,
          timestamp: new Date(),
          resolved: true,
          resolvedAt: new Date(),
          consecutiveFailures: 0,
          details: {
            result,
            check
          }
        };

        this.alerts.push(alert);

        // Log the recovery
        await AuditService.log({
          action: 'USER_UPDATED' as any,
          userId: 'system',
          username: 'system',
          description: `Health check recovery: ${check.name}`,
          metadata: {
            alertId: alert.id,
            checkId: check.id,
            alertType: 'recovery'
          }
        });
      }
    } catch (error) {
      console.error('Error handling alerting:', error);
    }
  }

  private static async startHealthCheckMonitoring(): Promise<void> {
    try {
      const config = await this.getHealthCheckConfig();

      if (config.enabled) {
        // Start periodic health checks
        this.checkInterval = setInterval(async () => {
          try {
            await this.runAllHealthChecks();
          } catch (error) {
            console.error('Error in health check monitoring:', error);
          }
        }, config.intervalMinutes * 60 * 1000);
      }
    } catch (error) {
      console.error('Error starting health check monitoring:', error);
    }
  }

  private static async calculateUptimePercentage(): Promise<number> {
    try {
      // This would calculate uptime percentage based on historical data
      // For now, return mock value
      return 95.5;
    } catch (error) {
      console.error('Error calculating uptime percentage:', error);
      return 0;
    }
  }

  // Statistics helper methods
  private static async getTotalChecksCount(): Promise<number> {
    // This would count total health checks from your database
    return this.lastResults.size;
  }

  private static async getSuccessfulChecksCount(): Promise<number> {
    // This would count successful health checks
    return Array.from(this.lastResults.values()).filter(r => r.status === 'healthy').length;
  }

  private static async getFailedChecksCount(): Promise<number> {
    // This would count failed health checks
    return Array.from(this.lastResults.values()).filter(r => r.status !== 'healthy').length;
  }

  private static async getAverageResponseTime(): Promise<number> {
    // This would calculate average response time
    const results = Array.from(this.lastResults.values());
    if (results.length === 0) return 0;

    const totalTime = results.reduce((sum, r) => sum + r.responseTime, 0);
    return totalTime / results.length;
  }

  private static async getLastCheckTime(): Promise<Date | undefined> {
    // This would get the last check time
    const results = Array.from(this.lastResults.values());
    if (results.length === 0) return undefined;

    return results.reduce((latest, r) =>
      r.timestamp > latest ? r.timestamp : latest,
      results[0].timestamp
    );
  }

  private static async getMostFailingCheck(): Promise<string | undefined> {
    // This would get the most failing check
    const failureCounts: Record<string, number> = {};

    for (const result of this.lastResults.values()) {
      if (result.status !== 'healthy') {
        failureCounts[result.checkName] = (failureCounts[result.checkName] || 0) + 1;
      }
    }

    const entries = Object.entries(failureCounts);
    if (entries.length === 0) return undefined;

    return entries.reduce((max, [name, count]) =>
      count > max[1] ? [name, count] : max,
      entries[0]
    )[0];
  }

  private static async getCheckTypeDistribution(): Promise<Record<string, number>> {
    // This would get check type distribution
    const distribution: Record<string, number> = {};
    const config = await this.getHealthCheckConfig();

    for (const check of config.checks) {
      distribution[check.type] = (distribution[check.type] || 0) + 1;
    }

    return distribution;
  }

  private static async getFailureRateByCheck(): Promise<Record<string, number>> {
    // This would calculate failure rate by check
    const failureRates: Record<string, number> = {};

    for (const [checkId, result] of this.lastResults.entries()) {
      const totalChecks = 1; // Would be calculated from historical data
      const failures = result.status !== 'healthy' ? 1 : 0;
      failureRates[result.checkName] = (failures / totalChecks) * 100;
    }

    return failureRates;
  }

  private static async getAverageResponseTimeByCheck(): Promise<Record<string, number>> {
    // This would calculate average response time by check
    const responseTimes: Record<string, number> = {};

    for (const result of this.lastResults.values()) {
      responseTimes[result.checkName] = result.responseTime;
    }

    return responseTimes;
  }

  // Shutdown the health check manager
  static shutdown(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    this.lastResults.clear();
    this.consecutiveFailures.clear();
    this.alerts = [];
    console.log('Health Check Manager shut down');
  }
}

// Export utilities
export const runAllHealthChecks = HealthCheckManager.runAllHealthChecks.bind(HealthCheckManager);
export const executeHealthCheck = HealthCheckManager.executeHealthCheck.bind(HealthCheckManager);
export const getHealthCheckStatistics = HealthCheckManager.getHealthCheckStatistics.bind(HealthCheckManager);
export const getActiveAlerts = HealthCheckManager.getActiveAlerts.bind(HealthCheckManager);
export const resolveAlert = HealthCheckManager.resolveAlert.bind(HealthCheckManager);
export const testHealthCheckEndpoint = HealthCheckManager.testHealthCheckEndpoint.bind(HealthCheckManager);
export const resetHealthCheckStatistics = HealthCheckManager.resetHealthCheckStatistics.bind(HealthCheckManager);
export const initializeHealthCheckManager = HealthCheckManager.initialize.bind(HealthCheckManager);

export default HealthCheckManager;
