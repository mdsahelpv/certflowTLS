import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';

// Performance and monitoring configuration interface
interface PerformanceConfig {
  healthChecks: {
    enabled: boolean;
    intervalMinutes: number;
    timeoutSeconds: number;
    failureThreshold: number;
  };
  metrics: {
    enabled: boolean;
    collectionIntervalMinutes: number;
    retentionDays: number;
    alertThresholds: {
      cpuUsagePercent: number;
      memoryUsagePercent: number;
      diskUsagePercent: number;
      responseTimeMs: number;
    };
  };
  resourceLimits: {
    maxCpuUsagePercent: number;
    maxMemoryUsagePercent: number;
    maxDiskUsagePercent: number;
    maxConcurrentConnections: number;
    rateLimitRequestsPerMinute: number;
  };
}

// GET - Retrieve current performance configuration
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

    // Get performance configuration from environment or database
    const config: PerformanceConfig = {
      healthChecks: {
        enabled: process.env.HEALTH_CHECKS_ENABLED === 'true',
        intervalMinutes: parseInt(process.env.HEALTH_CHECK_INTERVAL_MINUTES || '5'),
        timeoutSeconds: parseInt(process.env.HEALTH_CHECK_TIMEOUT_SECONDS || '30'),
        failureThreshold: parseInt(process.env.HEALTH_CHECK_FAILURE_THRESHOLD || '3'),
      },
      metrics: {
        enabled: process.env.METRICS_ENABLED === 'true',
        collectionIntervalMinutes: parseInt(process.env.METRICS_COLLECTION_INTERVAL_MINUTES || '1'),
        retentionDays: parseInt(process.env.METRICS_RETENTION_DAYS || '30'),
        alertThresholds: {
          cpuUsagePercent: parseInt(process.env.ALERT_CPU_THRESHOLD || '80'),
          memoryUsagePercent: parseInt(process.env.ALERT_MEMORY_THRESHOLD || '85'),
          diskUsagePercent: parseInt(process.env.ALERT_DISK_THRESHOLD || '90'),
          responseTimeMs: parseInt(process.env.ALERT_RESPONSE_TIME_MS || '5000'),
        },
      },
      resourceLimits: {
        maxCpuUsagePercent: parseInt(process.env.MAX_CPU_USAGE_PERCENT || '90'),
        maxMemoryUsagePercent: parseInt(process.env.MAX_MEMORY_USAGE_PERCENT || '90'),
        maxDiskUsagePercent: parseInt(process.env.MAX_DISK_USAGE_PERCENT || '95'),
        maxConcurrentConnections: parseInt(process.env.MAX_CONCURRENT_CONNECTIONS || '1000'),
        rateLimitRequestsPerMinute: parseInt(process.env.RATE_LIMIT_REQUESTS_PER_MINUTE || '1000'),
      },
    };

    return NextResponse.json(config);
  } catch (error) {
    console.error('Error fetching performance config:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST - Update performance configuration
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

    switch (action) {
      case 'updateHealthChecks':
        // Update health check settings
        if (updateConfig.healthChecks) {
          const health = updateConfig.healthChecks;
          process.env.HEALTH_CHECKS_ENABLED = health.enabled?.toString();
          process.env.HEALTH_CHECK_INTERVAL_MINUTES = health.intervalMinutes?.toString();
          process.env.HEALTH_CHECK_TIMEOUT_SECONDS = health.timeoutSeconds?.toString();
          process.env.HEALTH_CHECK_FAILURE_THRESHOLD = health.failureThreshold?.toString();
        }
        return NextResponse.json({
          success: true,
          message: 'Health check settings updated successfully'
        });

      case 'updateMetrics':
        // Update metrics settings
        if (updateConfig.metrics) {
          const metrics = updateConfig.metrics;
          process.env.METRICS_ENABLED = metrics.enabled?.toString();
          process.env.METRICS_COLLECTION_INTERVAL_MINUTES = metrics.collectionIntervalMinutes?.toString();
          process.env.METRICS_RETENTION_DAYS = metrics.retentionDays?.toString();

          if (metrics.alertThresholds) {
            process.env.ALERT_CPU_THRESHOLD = metrics.alertThresholds.cpuUsagePercent?.toString();
            process.env.ALERT_MEMORY_THRESHOLD = metrics.alertThresholds.memoryUsagePercent?.toString();
            process.env.ALERT_DISK_THRESHOLD = metrics.alertThresholds.diskUsagePercent?.toString();
            process.env.ALERT_RESPONSE_TIME_MS = metrics.alertThresholds.responseTimeMs?.toString();
          }
        }
        return NextResponse.json({
          success: true,
          message: 'Metrics settings updated successfully'
        });

      case 'updateResourceLimits':
        // Update resource limits
        if (updateConfig.resourceLimits) {
          const limits = updateConfig.resourceLimits;
          process.env.MAX_CPU_USAGE_PERCENT = limits.maxCpuUsagePercent?.toString();
          process.env.MAX_MEMORY_USAGE_PERCENT = limits.maxMemoryUsagePercent?.toString();
          process.env.MAX_DISK_USAGE_PERCENT = limits.maxDiskUsagePercent?.toString();
          process.env.MAX_CONCURRENT_CONNECTIONS = limits.maxConcurrentConnections?.toString();
          process.env.RATE_LIMIT_REQUESTS_PER_MINUTE = limits.rateLimitRequestsPerMinute?.toString();
        }
        return NextResponse.json({
          success: true,
          message: 'Resource limits updated successfully'
        });

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Error updating performance config:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
