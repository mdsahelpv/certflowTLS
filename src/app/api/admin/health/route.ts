import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { SettingsValidation } from '@/lib/settings-validation';
import { AuditService } from '@/lib/audit';
import { SettingsCacheService } from '@/lib/settings-cache';

// Health Check Configuration interface
interface HealthCheckConfig {
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
  checks: Array<{
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
  }>;
}

// Health Check Result interface
interface HealthCheckResult {
  checkName: string;
  status: 'healthy' | 'unhealthy' | 'warning';
  responseTime: number;
  timestamp: Date;
  message?: string;
  details?: any;
  error?: string;
}

// Health Check Status interface
interface HealthCheckStatus {
  overallStatus: 'healthy' | 'unhealthy' | 'warning';
  totalChecks: number;
  healthyChecks: number;
  unhealthyChecks: number;
  warningChecks: number;
  lastCheckTime?: Date;
  nextCheckTime?: Date;
  results: HealthCheckResult[];
}

// Health Check Statistics interface
interface HealthCheckStatistics {
  totalChecks: number;
  successfulChecks: number;
  failedChecks: number;
  averageResponseTime: number;
  uptimePercentage: number;
  lastCheckTime?: Date;
  mostFailingCheck?: string;
  checkTypeDistribution: Record<string, number>;
}

// GET - Retrieve health check configuration and status
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

    // Get health check configuration from database with caching
    const [
      healthConfig,
      status,
      statistics
    ] = await Promise.all([
      SettingsCacheService.getCASetting('health_check_config'),
      getHealthCheckStatus(),
      getHealthCheckStatistics()
    ]);

    // Build response configuration
    const config: HealthCheckConfig = healthConfig?.config || {
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
          name: 'API Health',
          type: 'http',
          enabled: true,
          endpoint: 'http://localhost:3000/api/health',
          expectedStatus: 200,
          timeoutSeconds: 10
        },
        {
          name: 'Database Connection',
          type: 'database',
          enabled: true,
          databaseQuery: 'SELECT 1',
          timeoutSeconds: 5
        },
        {
          name: 'File System',
          type: 'filesystem',
          enabled: true,
          filesystemPath: '/tmp',
          timeoutSeconds: 5
        }
      ]
    };

    return NextResponse.json({
      config,
      status,
      statistics
    });
  } catch (error) {
    console.error('Error fetching health check configuration:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST - Update health check configuration and manage health checks
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
      case 'updateHealthCheckConfig':
        // Validate health check configuration
        if (!updateConfig.healthCheckConfig) {
          return NextResponse.json({ error: 'Health check configuration is required' }, { status: 400 });
        }

        const healthValidation = SettingsValidation.validateHealthCheckConfig(updateConfig.healthCheckConfig);
        if (!healthValidation.isValid) {
          return NextResponse.json({
            error: 'Invalid health check configuration',
            details: healthValidation.errors
          }, { status: 400 });
        }

        // Get current config for audit logging
        const currentHealthConfig = await SettingsCacheService.getCASetting('health_check_config');

        // Update health check configuration in database
        await SettingsCacheService.setCASetting(
          'health_check_config',
          'Health Check Configuration',
          updateConfig.healthCheckConfig,
          undefined,
          userId
        );

        // Log the change
        await AuditService.log({
          action: 'CONFIG_UPDATED' as any,
          userId,
          username,
          description: 'Health check configuration updated',
          metadata: {
            oldConfig: currentHealthConfig?.config,
            newConfig: updateConfig.healthCheckConfig
          }
        });

        return NextResponse.json({
          success: true,
          message: 'Health check configuration updated successfully'
        });

      case 'runHealthCheck':
        // Run a specific health check or all checks
        const checkName = updateConfig.checkName;
        const result = await runHealthCheck(checkName);

        // Log the health check execution
        await AuditService.log({
          action: 'USER_UPDATED' as any,
          userId,
          username,
          description: `Health check executed: ${checkName || 'all checks'}`,
          metadata: {
            checkName,
            result
          }
        });

        return NextResponse.json({
          success: true,
          message: 'Health check executed successfully',
          result
        });

      case 'runAllHealthChecks':
        // Run all configured health checks
        const allResults = await runAllHealthChecks();

        // Log the comprehensive health check
        await AuditService.log({
          action: 'USER_UPDATED' as any,
          userId,
          username,
          description: 'All health checks executed',
          metadata: {
            totalChecks: allResults.totalChecks,
            healthyChecks: allResults.healthyChecks,
            unhealthyChecks: allResults.unhealthyChecks,
            overallStatus: allResults.overallStatus
          }
        });

        return NextResponse.json({
          success: true,
          message: 'All health checks executed successfully',
          result: allResults
        });

      case 'resetHealthCheckStats':
        // Reset health check statistics
        const resetResult = await resetHealthCheckStatistics();

        // Log the reset
        await AuditService.log({
          action: 'USER_UPDATED' as any,
          userId,
          username,
          description: 'Health check statistics reset',
          metadata: resetResult
        });

        return NextResponse.json({
          success: true,
          message: 'Health check statistics reset successfully',
          result: resetResult
        });

      case 'testHealthCheckEndpoint':
        // Test a specific health check endpoint
        if (!updateConfig.endpoint || !updateConfig.type) {
          return NextResponse.json({ error: 'Endpoint and type are required' }, { status: 400 });
        }

        const testResult = await testHealthCheckEndpoint(updateConfig.endpoint, updateConfig.type, updateConfig.options);

        // Log the test
        await AuditService.log({
          action: 'USER_UPDATED' as any,
          userId,
          username,
          description: `Health check endpoint tested: ${updateConfig.endpoint}`,
          metadata: {
            endpoint: updateConfig.endpoint,
            type: updateConfig.type,
            testResult
          }
        });

        return NextResponse.json({
          success: true,
          message: 'Health check endpoint test completed',
          result: testResult
        });

      case 'exportHealthCheckReport':
        // Export health check report
        const format = updateConfig.format || 'json';
        const report = await exportHealthCheckReport(format);

        return NextResponse.json({
          success: true,
          message: 'Health check report exported successfully',
          result: report
        });

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Error updating health check configuration:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Helper function to get health check status
async function getHealthCheckStatus(): Promise<HealthCheckStatus> {
  try {
    // This would integrate with your health check database to get current status
    // For now, return mock status
    const status: HealthCheckStatus = {
      overallStatus: 'healthy',
      totalChecks: 3,
      healthyChecks: 3,
      unhealthyChecks: 0,
      warningChecks: 0,
      results: [
        {
          checkName: 'API Health',
          status: 'healthy',
          responseTime: 150,
          timestamp: new Date(),
          message: 'API is responding normally'
        },
        {
          checkName: 'Database Connection',
          status: 'healthy',
          responseTime: 50,
          timestamp: new Date(),
          message: 'Database connection is healthy'
        },
        {
          checkName: 'File System',
          status: 'healthy',
          responseTime: 10,
          timestamp: new Date(),
          message: 'File system is accessible'
        }
      ]
    };

    // TODO: Implement actual health check status from your database
    // Example:
    // const latestResults = await db.healthCheckResult.findMany({
    //   orderBy: { timestamp: 'desc' },
    //   take: 10
    // });

    return status;
  } catch (error) {
    console.error('Error getting health check status:', error);
    return {
      overallStatus: 'unhealthy',
      totalChecks: 0,
      healthyChecks: 0,
      unhealthyChecks: 0,
      warningChecks: 0,
      results: []
    };
  }
}

// Helper function to get health check statistics
async function getHealthCheckStatistics(): Promise<HealthCheckStatistics> {
  try {
    // This would integrate with your health check database to get statistics
    // For now, return mock statistics
    const stats: HealthCheckStatistics = {
      totalChecks: 100,
      successfulChecks: 95,
      failedChecks: 5,
      averageResponseTime: 120,
      uptimePercentage: 95,
      checkTypeDistribution: {
        http: 40,
        database: 30,
        filesystem: 20,
        custom: 10
      }
    };

    // TODO: Implement actual health check statistics from your database

    return stats;
  } catch (error) {
    console.error('Error getting health check statistics:', error);
    return {
      totalChecks: 0,
      successfulChecks: 0,
      failedChecks: 0,
      averageResponseTime: 0,
      uptimePercentage: 0,
      checkTypeDistribution: {}
    };
  }
}

// Helper function to run a specific health check
async function runHealthCheck(checkName?: string): Promise<HealthCheckResult[]> {
  try {
    const config = await SettingsCacheService.getCASetting('health_check_config');
    const checks = config?.config?.checks || [];

    const targetChecks = checkName
      ? checks.filter(check => check.name === checkName && check.enabled)
      : checks.filter(check => check.enabled);

    const results: HealthCheckResult[] = [];

    for (const check of targetChecks) {
      try {
        const startTime = Date.now();
        const result = await executeHealthCheck(check);
        const responseTime = Date.now() - startTime;

        results.push({
          checkName: check.name,
          status: result.status,
          responseTime,
          timestamp: new Date(),
          message: result.message,
          details: result.details,
          error: result.error
        });
      } catch (error) {
        results.push({
          checkName: check.name,
          status: 'unhealthy',
          responseTime: 0,
          timestamp: new Date(),
          error: String(error)
        });
      }
    }

    return results;
  } catch (error) {
    console.error('Error running health check:', error);
    return [];
  }
}

// Helper function to run all health checks
async function runAllHealthChecks(): Promise<HealthCheckStatus> {
  try {
    const results = await runHealthCheck();

    const healthyChecks = results.filter(r => r.status === 'healthy').length;
    const unhealthyChecks = results.filter(r => r.status === 'unhealthy').length;
    const warningChecks = results.filter(r => r.status === 'warning').length;

    const overallStatus = unhealthyChecks > 0 ? 'unhealthy' :
                         warningChecks > 0 ? 'warning' : 'healthy';

    return {
      overallStatus,
      totalChecks: results.length,
      healthyChecks,
      unhealthyChecks,
      warningChecks,
      lastCheckTime: new Date(),
      results
    };
  } catch (error) {
    console.error('Error running all health checks:', error);
    return {
      overallStatus: 'unhealthy',
      totalChecks: 0,
      healthyChecks: 0,
      unhealthyChecks: 0,
      warningChecks: 0,
      results: []
    };
  }
}

// Helper function to execute a single health check
async function executeHealthCheck(check: any): Promise<{ status: 'healthy' | 'unhealthy' | 'warning'; message: string; details?: any; error?: string }> {
  try {
    switch (check.type) {
      case 'http':
        return await performHttpCheck(check);
      case 'tcp':
        return await performTcpCheck(check);
      case 'database':
        return await performDatabaseCheck(check);
      case 'filesystem':
        return await performFilesystemCheck(check);
      case 'memory':
        return await performMemoryCheck(check);
      case 'cpu':
        return await performCpuCheck(check);
      case 'disk':
        return await performDiskCheck(check);
      case 'custom':
        return await performCustomCheck(check);
      default:
        return {
          status: 'unhealthy',
          message: `Unknown check type: ${check.type}`,
          error: 'Unsupported check type'
        };
    }
  } catch (error) {
    return {
      status: 'unhealthy',
      message: `Health check failed: ${check.name}`,
      error: String(error)
    };
  }
}

// Health check implementations
async function performHttpCheck(check: any): Promise<{ status: 'healthy' | 'unhealthy' | 'warning'; message: string; details?: any }> {
  try {
    // This would make an actual HTTP request
    // For now, return mock result
    return {
      status: 'healthy',
      message: `HTTP check passed for ${check.endpoint}`,
      details: { statusCode: 200, responseTime: 150 }
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      message: `HTTP check failed for ${check.endpoint}`,
      details: { error: String(error) }
    };
  }
}

async function performTcpCheck(check: any): Promise<{ status: 'healthy' | 'unhealthy' | 'warning'; message: string; details?: any }> {
  try {
    // This would perform a TCP connection test
    // For now, return mock result
    return {
      status: 'healthy',
      message: `TCP check passed for ${check.endpoint}:${check.port}`,
      details: { connectionTime: 50 }
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      message: `TCP check failed for ${check.endpoint}:${check.port}`,
      details: { error: String(error) }
    };
  }
}

async function performDatabaseCheck(check: any): Promise<{ status: 'healthy' | 'unhealthy' | 'warning'; message: string; details?: any }> {
  try {
    // This would execute a database query
    // For now, return mock result
    return {
      status: 'healthy',
      message: 'Database connection is healthy',
      details: { queryTime: 25, resultCount: 1 }
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      message: 'Database connection failed',
      details: { error: String(error) }
    };
  }
}

async function performFilesystemCheck(check: any): Promise<{ status: 'healthy' | 'unhealthy' | 'warning'; message: string; details?: any }> {
  try {
    // This would check filesystem accessibility
    // For now, return mock result
    return {
      status: 'healthy',
      message: `Filesystem check passed for ${check.filesystemPath}`,
      details: { accessible: true, freeSpace: '10GB' }
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      message: `Filesystem check failed for ${check.filesystemPath}`,
      details: { error: String(error) }
    };
  }
}

async function performMemoryCheck(check: any): Promise<{ status: 'healthy' | 'unhealthy' | 'warning'; message: string; details?: any }> {
  try {
    // This would check system memory usage
    // For now, return mock result
    const memoryUsage = 60; // Mock 60% usage
    const status = memoryUsage > (check.thresholdCritical || 90) ? 'unhealthy' :
                   memoryUsage > (check.thresholdWarning || 80) ? 'warning' : 'healthy';

    return {
      status,
      message: `Memory usage: ${memoryUsage}%`,
      details: { memoryUsage, totalMemory: '8GB', freeMemory: '3.2GB' }
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      message: 'Memory check failed',
      details: { error: String(error) }
    };
  }
}

async function performCpuCheck(check: any): Promise<{ status: 'healthy' | 'unhealthy' | 'warning'; message: string; details?: any }> {
  try {
    // This would check CPU usage
    // For now, return mock result
    const cpuUsage = 45; // Mock 45% usage
    const status = cpuUsage > (check.thresholdCritical || 90) ? 'unhealthy' :
                   cpuUsage > (check.thresholdWarning || 80) ? 'warning' : 'healthy';

    return {
      status,
      message: `CPU usage: ${cpuUsage}%`,
      details: { cpuUsage, loadAverage: '1.2' }
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      message: 'CPU check failed',
      details: { error: String(error) }
    };
  }
}

async function performDiskCheck(check: any): Promise<{ status: 'healthy' | 'unhealthy' | 'warning'; message: string; details?: any }> {
  try {
    // This would check disk usage
    // For now, return mock result
    const diskUsage = 70; // Mock 70% usage
    const status = diskUsage > (check.thresholdCritical || 90) ? 'unhealthy' :
                   diskUsage > (check.thresholdWarning || 85) ? 'warning' : 'healthy';

    return {
      status,
      message: `Disk usage: ${diskUsage}%`,
      details: { diskUsage, totalSpace: '100GB', freeSpace: '30GB' }
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      message: 'Disk check failed',
      details: { error: String(error) }
    };
  }
}

async function performCustomCheck(check: any): Promise<{ status: 'healthy' | 'unhealthy' | 'warning'; message: string; details?: any }> {
  try {
    // This would execute custom health check logic
    // For now, return mock result
    return {
      status: 'healthy',
      message: `Custom check passed for ${check.name}`,
      details: { customResult: 'OK' }
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      message: `Custom check failed for ${check.name}`,
      details: { error: String(error) }
    };
  }
}

// Helper function to reset health check statistics
async function resetHealthCheckStatistics(): Promise<{ statisticsReset: boolean; statusReset: boolean }> {
  try {
    // This would reset health check statistics in your database
    // For now, return mock result
    const result = {
      statisticsReset: true,
      statusReset: true
    };

    // TODO: Implement actual statistics reset

    return result;
  } catch (error) {
    console.error('Error resetting health check statistics:', error);
    return {
      statisticsReset: false,
      statusReset: false
    };
  }
}

// Helper function to test health check endpoint
async function testHealthCheckEndpoint(endpoint: string, type: string, options?: any): Promise<HealthCheckResult> {
  try {
    const mockCheck = { name: `Test ${type}`, type, endpoint, ...options };
    const result = await executeHealthCheck(mockCheck);

    return {
      checkName: `Test ${type}`,
      status: result.status,
      responseTime: 100, // Mock response time
      timestamp: new Date(),
      message: result.message,
      details: result.details,
      error: result.error
    };
  } catch (error) {
    return {
      checkName: `Test ${type}`,
      status: 'unhealthy',
      responseTime: 0,
      timestamp: new Date(),
      error: String(error)
    };
  }
}

// Helper function to export health check report
async function exportHealthCheckReport(format: string): Promise<{ format: string; data: string; filename: string }> {
  try {
    const [status, statistics] = await Promise.all([
      getHealthCheckStatus(),
      getHealthCheckStatistics()
    ]);

    const reportData = {
      timestamp: new Date(),
      status,
      statistics
    };

    let data: string;
    if (format === 'json') {
      data = JSON.stringify(reportData, null, 2);
    } else {
      // Convert to CSV format
      data = `Metric,Value\nOverall Status,${status.overallStatus}\nTotal Checks,${status.totalChecks}\nHealthy Checks,${status.healthyChecks}\nUnhealthy Checks,${status.unhealthyChecks}\nAverage Response Time,${statistics.averageResponseTime}\nUptime Percentage,${statistics.uptimePercentage}`;
    }

    return {
      format,
      data,
      filename: `health_check_report_${new Date().toISOString().split('T')[0]}.${format === 'json' ? 'json' : 'csv'}`
    };
  } catch (error) {
    console.error('Error exporting health check report:', error);
    throw error;
  }
}
