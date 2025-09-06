/**
 * Performance Metrics Manager
 *
 * Comprehensive performance monitoring system for collecting, storing,
 * aggregating, and analyzing system performance metrics with alerting
 */

import { SettingsCacheService } from './settings-cache';
import { AuditService } from './audit';

// Performance Metric Definition interface
export interface PerformanceMetricDefinition {
  id: string;
  name: string;
  type: 'cpu' | 'memory' | 'disk' | 'network' | 'database' | 'response_time' | 'custom';
  enabled: boolean;
  collectionIntervalSeconds: number;
  aggregationMethod: 'average' | 'min' | 'max' | 'sum' | 'count';
  retentionHours: number;
  alertThreshold?: number;
  unit?: string;
  description?: string;
  tags?: Record<string, string>;
}

// Performance Metric Data Point interface
export interface PerformanceMetricDataPoint {
  id: string;
  metricId: string;
  metricName: string;
  metricType: string;
  value: number;
  unit: string;
  timestamp: Date;
  tags?: Record<string, string>;
  metadata?: any;
  collectedAt: Date;
  collectionDuration: number;
}

// Performance Metrics Aggregation interface
export interface PerformanceMetricsAggregation {
  id: string;
  metricId: string;
  metricName: string;
  metricType: string;
  timeRange: string;
  aggregationMethod: string;
  aggregatedValue: number;
  dataPoints: number;
  minValue: number;
  maxValue: number;
  averageValue: number;
  standardDeviation: number;
  timestamp: Date;
  startTime: Date;
  endTime: Date;
}

// Performance Alert interface
export interface PerformanceAlert {
  id: string;
  metricId: string;
  metricName: string;
  metricType: string;
  alertType: 'threshold_exceeded' | 'trend_anomaly' | 'performance_degradation';
  severity: 'low' | 'medium' | 'high' | 'critical';
  threshold: number;
  actualValue: number;
  message: string;
  timestamp: Date;
  acknowledged: boolean;
  acknowledgedBy?: string;
  acknowledgedAt?: Date;
  resolved: boolean;
  resolvedAt?: Date;
  consecutiveOccurrences: number;
  metadata?: any;
}

// Performance Dashboard Data interface
export interface PerformanceDashboardData {
  summary: {
    overallHealth: 'healthy' | 'warning' | 'critical';
    activeAlerts: number;
    totalMetrics: number;
    collectionUptime: number;
    dataRetentionDays: number;
  };
  currentMetrics: Record<string, {
    value: number;
    unit: string;
    timestamp: Date;
    status: 'normal' | 'warning' | 'critical';
  }>;
  historicalTrends: Array<{
    metricName: string;
    metricType: string;
    dataPoints: Array<{
      timestamp: Date;
      value: number;
      aggregatedValue?: number;
    }>;
    trend: 'up' | 'down' | 'stable';
    changePercent: number;
    averageValue: number;
    minValue: number;
    maxValue: number;
  }>;
  alerts: PerformanceAlert[];
  recommendations: Array<{
    type: 'optimization' | 'alert' | 'maintenance';
    priority: 'low' | 'medium' | 'high';
    title: string;
    description: string;
    actionItems: string[];
    affectedMetrics: string[];
  }>;
  systemInfo: {
    cpuCores: number;
    totalMemory: number;
    totalDisk: number;
    osVersion: string;
    uptime: number;
  };
}

// Performance Metrics Configuration interface
export interface PerformanceMetricsConfig {
  enabled: boolean;
  collectionIntervalMinutes: number;
  retentionDays: number;
  cpuThreshold: number;
  memoryThreshold: number;
  diskThreshold: number;
  responseTimeThreshold: number;
  networkThreshold: number;
  databaseConnectionThreshold: number;
  alertSettings: {
    enabled: boolean;
    cpuAlertThreshold: number;
    memoryAlertThreshold: number;
    diskAlertThreshold: number;
    responseTimeAlertThreshold: number;
    consecutiveFailuresThreshold: number;
    alertRecipients?: string[];
    escalationEnabled: boolean;
    escalationDelayMinutes: number;
  };
  metrics: PerformanceMetricDefinition[];
}

// Performance Metrics Manager Class
export class PerformanceMetricsManager {
  private static collectionInterval: NodeJS.Timeout | null = null;
  private static dataPoints: Map<string, PerformanceMetricDataPoint[]> = new Map();
  private static aggregations: Map<string, PerformanceMetricsAggregation[]> = new Map();
  private static alerts: PerformanceAlert[] = [];
  private static readonly MAX_DATA_POINTS_PER_METRIC = 10000;
  private static readonly AGGREGATION_INTERVAL_MINUTES = 60; // 1 hour

  // Initialize the performance metrics manager
  static async initialize(): Promise<void> {
    try {
      await this.startMetricsCollection();
      await this.startDataAggregation();
      console.log('Performance Metrics Manager initialized');
    } catch (error) {
      console.error('Failed to initialize Performance Metrics Manager:', error);
    }
  }

  // Collect all enabled performance metrics
  static async collectAllMetrics(): Promise<{ metricsCollected: number; collectionTime: number; errors: string[] }> {
    try {
      const startTime = Date.now();
      const config = await this.getPerformanceMetricsConfig();
      if (!config.enabled) {
        return {
          metricsCollected: 0,
          collectionTime: 0,
          errors: ['Performance metrics collection is disabled']
        };
      }

      let collectedCount = 0;
      const errors: string[] = [];

      for (const metric of config.metrics.filter(m => m.enabled)) {
        try {
          const dataPoint = await this.collectMetricData(metric);
          await this.storeMetricDataPoint(dataPoint);
          collectedCount++;

          // Check for alerts
          await this.checkMetricAlerts(metric, dataPoint);
        } catch (error) {
          errors.push(`Failed to collect ${metric.name}: ${error}`);
        }
      }

      const collectionTime = Date.now() - startTime;

      // Log the collection
      await AuditService.log({
        action: 'USER_UPDATED' as any,
        userId: 'system',
        username: 'system',
        description: `Performance metrics collected: ${collectedCount} metrics`,
        metadata: {
          metricsCollected: collectedCount,
          collectionTime,
          errors: errors.length
        }
      });

      return {
        metricsCollected: collectedCount,
        collectionTime,
        errors
      };
    } catch (error) {
      console.error('Error collecting performance metrics:', error);
      return {
        metricsCollected: 0,
        collectionTime: 0,
        errors: [String(error)]
      };
    }
  }

  // Get current performance metrics
  static async getCurrentMetrics(): Promise<Record<string, { value: number; unit: string; timestamp: Date; status: 'normal' | 'warning' | 'critical' }>> {
    try {
      const config = await this.getPerformanceMetricsConfig();
      const currentMetrics: Record<string, { value: number; unit: string; timestamp: Date; status: 'normal' | 'warning' | 'critical' }> = {};

      for (const metric of config.metrics.filter(m => m.enabled)) {
        const dataPoints = this.dataPoints.get(metric.id) || [];
        const latestDataPoint = dataPoints[dataPoints.length - 1];

        if (latestDataPoint) {
          const status = this.determineMetricStatus(metric, latestDataPoint.value);
          currentMetrics[metric.name] = {
            value: latestDataPoint.value,
            unit: latestDataPoint.unit,
            timestamp: latestDataPoint.timestamp,
            status
          };
        }
      }

      return currentMetrics;
    } catch (error) {
      console.error('Error getting current metrics:', error);
      return {};
    }
  }

  // Get performance dashboard data
  static async getDashboardData(): Promise<PerformanceDashboardData> {
    try {
      const [currentMetrics, historicalTrends, alerts, recommendations] = await Promise.all([
        this.getCurrentMetrics(),
        this.getHistoricalTrends(),
        this.getActiveAlerts(),
        this.generateRecommendations()
      ]);

      const config = await this.getPerformanceMetricsConfig();
      const activeAlerts = alerts.filter(a => !a.resolved).length;
      const overallHealth = this.calculateOverallHealth(currentMetrics, activeAlerts);

      return {
        summary: {
          overallHealth,
          activeAlerts,
          totalMetrics: config.metrics.filter(m => m.enabled).length,
          collectionUptime: 99.9, // Would calculate from actual data
          dataRetentionDays: config.retentionDays
        },
        currentMetrics,
        historicalTrends,
        alerts,
        recommendations,
        systemInfo: await this.getSystemInfo()
      };
    } catch (error) {
      console.error('Error getting dashboard data:', error);
      return {
        summary: {
          overallHealth: 'critical',
          activeAlerts: 0,
          totalMetrics: 0,
          collectionUptime: 0,
          dataRetentionDays: 30
        },
        currentMetrics: {},
        historicalTrends: [],
        alerts: [],
        recommendations: [],
        systemInfo: {
          cpuCores: 0,
          totalMemory: 0,
          totalDisk: 0,
          osVersion: 'unknown',
          uptime: 0
        }
      };
    }
  }

  // Get historical trends for metrics
  static async getHistoricalTrends(timeRangeHours: number = 24): Promise<Array<{
    metricName: string;
    metricType: string;
    dataPoints: Array<{ timestamp: Date; value: number; aggregatedValue?: number }>;
    trend: 'up' | 'down' | 'stable';
    changePercent: number;
    averageValue: number;
    minValue: number;
    maxValue: number;
  }>> {
    try {
      const trends: Array<{
        metricName: string;
        metricType: string;
        dataPoints: Array<{ timestamp: Date; value: number; aggregatedValue?: number }>;
        trend: 'up' | 'down' | 'stable';
        changePercent: number;
        averageValue: number;
        minValue: number;
        maxValue: number;
      }> = [];

      const cutoffTime = new Date(Date.now() - (timeRangeHours * 60 * 60 * 1000));

      for (const [metricId, dataPoints] of this.dataPoints.entries()) {
        const recentDataPoints = dataPoints.filter(dp => dp.timestamp >= cutoffTime);
        if (recentDataPoints.length === 0) continue;

        const values = recentDataPoints.map(dp => dp.value);
        const averageValue = values.reduce((sum, val) => sum + val, 0) / values.length;
        const minValue = Math.min(...values);
        const maxValue = Math.max(...values);

        // Calculate trend
        const firstHalf = values.slice(0, Math.floor(values.length / 2));
        const secondHalf = values.slice(Math.floor(values.length / 2));
        const firstHalfAvg = firstHalf.reduce((sum, val) => sum + val, 0) / firstHalf.length;
        const secondHalfAvg = secondHalf.reduce((sum, val) => sum + val, 0) / secondHalf.length;

        let trend: 'up' | 'down' | 'stable' = 'stable';
        let changePercent = 0;

        if (firstHalfAvg > 0) {
          changePercent = ((secondHalfAvg - firstHalfAvg) / firstHalfAvg) * 100;
          if (Math.abs(changePercent) > 5) {
            trend = changePercent > 0 ? 'up' : 'down';
          }
        }

        const metricName = recentDataPoints[0]?.metricName || 'Unknown';
        const metricType = recentDataPoints[0]?.metricType || 'unknown';

        trends.push({
          metricName,
          metricType,
          dataPoints: recentDataPoints.map(dp => ({
            timestamp: dp.timestamp,
            value: dp.value
          })),
          trend,
          changePercent,
          averageValue,
          minValue,
          maxValue
        });
      }

      return trends;
    } catch (error) {
      console.error('Error getting historical trends:', error);
      return [];
    }
  }

  // Get active performance alerts
  static async getActiveAlerts(): Promise<PerformanceAlert[]> {
    try {
      return this.alerts.filter(alert => !alert.resolved);
    } catch (error) {
      console.error('Error getting active alerts:', error);
      return [];
    }
  }

  // Acknowledge alert
  static async acknowledgeAlert(alertId: string, userId: string): Promise<boolean> {
    try {
      const alert = this.alerts.find(a => a.id === alertId);
      if (alert && !alert.acknowledged) {
        alert.acknowledged = true;
        alert.acknowledgedBy = userId;
        alert.acknowledgedAt = new Date();

        // Log acknowledgment
        await AuditService.log({
          action: 'USER_UPDATED' as any,
          userId,
          username: userId,
          description: `Performance alert acknowledged: ${alert.metricName}`,
          metadata: {
            alertId,
            metricName: alert.metricName,
            severity: alert.severity
          }
        });

        return true;
      }
      return false;
    } catch (error) {
      console.error('Error acknowledging alert:', error);
      return false;
    }
  }

  // Clear old metrics data
  static async clearOldMetricsData(olderThanDays: number): Promise<{ recordsDeleted: number; metricsCleared: number; cutoffDate: Date }> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

      let totalRecordsDeleted = 0;
      let metricsCleared = 0;

      // Clear old data points
      for (const [metricId, dataPoints] of this.dataPoints.entries()) {
        const originalLength = dataPoints.length;
        const filteredPoints = dataPoints.filter(dp => dp.timestamp >= cutoffDate);

        if (filteredPoints.length !== originalLength) {
          this.dataPoints.set(metricId, filteredPoints);
          totalRecordsDeleted += (originalLength - filteredPoints.length);
          metricsCleared++;
        }
      }

      // Clear old aggregations
      for (const [metricId, aggregations] of this.aggregations.entries()) {
        const originalLength = aggregations.length;
        const filteredAggregations = aggregations.filter(agg => agg.timestamp >= cutoffDate);

        if (filteredAggregations.length !== originalLength) {
          this.aggregations.set(metricId, filteredAggregations);
          totalRecordsDeleted += (originalLength - filteredAggregations.length);
        }
      }

      // Log cleanup
      await AuditService.log({
        action: 'USER_UPDATED' as any,
        userId: 'system',
        username: 'system',
        description: `Old metrics data cleared: ${totalRecordsDeleted} records from ${metricsCleared} metrics`,
        metadata: {
          recordsDeleted: totalRecordsDeleted,
          metricsCleared,
          cutoffDate
        }
      });

      return {
        recordsDeleted: totalRecordsDeleted,
        metricsCleared,
        cutoffDate
      };
    } catch (error) {
      console.error('Error clearing old metrics data:', error);
      return {
        recordsDeleted: 0,
        metricsCleared: 0,
        cutoffDate: new Date()
      };
    }
  }

  // Generate performance report
  static async generatePerformanceReport(timeRange: string, format: 'json' | 'csv' = 'json'): Promise<{ format: string; data: string; filename: string; metadata: any }> {
    try {
      const [dashboardData, trends] = await Promise.all([
        this.getDashboardData(),
        this.getHistoricalTrends()
      ]);

      const reportData = {
        generatedAt: new Date(),
        timeRange,
        dashboard: dashboardData,
        trends,
        metadata: {
          totalDataPoints: Array.from(this.dataPoints.values()).reduce((sum, points) => sum + points.length, 0),
          totalAggregations: Array.from(this.aggregations.values()).reduce((sum, aggs) => sum + aggs.length, 0),
          activeAlerts: dashboardData.alerts.filter(a => !a.resolved).length
        }
      };

      let data: string;
      if (format === 'json') {
        data = JSON.stringify(reportData, null, 2);
      } else {
        // Generate CSV format
        data = 'Timestamp,Metric,Value,Unit,Status\n';
        for (const [metricName, metricData] of Object.entries(dashboardData.currentMetrics)) {
          data += `${metricData.timestamp.toISOString()},${metricName},${metricData.value},${metricData.unit},${metricData.status}\n`;
        }
      }

      return {
        format,
        data,
        filename: `performance_report_${new Date().toISOString().split('T')[0]}.${format}`,
        metadata: reportData.metadata
      };
    } catch (error) {
      console.error('Error generating performance report:', error);
      throw error;
    }
  }

  // Private helper methods

  private static async getPerformanceMetricsConfig(): Promise<PerformanceMetricsConfig> {
    try {
      const configData = await SettingsCacheService.getCASetting('performance_metrics_config');

      return configData?.config || {
        enabled: true,
        collectionIntervalMinutes: 5,
        retentionDays: 30,
        cpuThreshold: 80,
        memoryThreshold: 85,
        diskThreshold: 90,
        responseTimeThreshold: 2000,
        networkThreshold: 100,
        databaseConnectionThreshold: 100,
        alertSettings: {
          enabled: true,
          cpuAlertThreshold: 90,
          memoryAlertThreshold: 90,
          diskAlertThreshold: 95,
          responseTimeAlertThreshold: 5000,
          consecutiveFailuresThreshold: 3,
          alertRecipients: [],
          escalationEnabled: true,
          escalationDelayMinutes: 30
        },
        metrics: [
          {
            id: 'cpu_usage',
            name: 'CPU Usage',
            type: 'cpu',
            enabled: true,
            collectionIntervalSeconds: 60,
            aggregationMethod: 'average',
            retentionHours: 720,
            alertThreshold: 80,
            unit: '%'
          },
          {
            id: 'memory_usage',
            name: 'Memory Usage',
            type: 'memory',
            enabled: true,
            collectionIntervalSeconds: 60,
            aggregationMethod: 'average',
            retentionHours: 720,
            alertThreshold: 85,
            unit: '%'
          }
        ]
      };
    } catch (error) {
      console.error('Error getting performance metrics config:', error);
      throw error;
    }
  }

  private static async collectMetricData(metric: PerformanceMetricDefinition): Promise<PerformanceMetricDataPoint> {
    const startTime = Date.now();

    try {
      let value: number;

      switch (metric.type) {
        case 'cpu':
          value = await this.collectCPUUsage();
          break;
        case 'memory':
          value = await this.collectMemoryUsage();
          break;
        case 'disk':
          value = await this.collectDiskUsage();
          break;
        case 'network':
          value = await this.collectNetworkUsage();
          break;
        case 'database':
          value = await this.collectDatabaseMetrics();
          break;
        case 'response_time':
          value = await this.collectResponseTime();
          break;
        case 'custom':
          value = await this.collectCustomMetric(metric);
          break;
        default:
          throw new Error(`Unknown metric type: ${metric.type}`);
      }

      const collectionDuration = Date.now() - startTime;

      return {
        id: `dp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        metricId: metric.id,
        metricName: metric.name,
        metricType: metric.type,
        value,
        unit: metric.unit || '',
        timestamp: new Date(),
        tags: metric.tags,
        collectedAt: new Date(),
        collectionDuration
      };
    } catch (error) {
      const collectionDuration = Date.now() - startTime;
      throw new Error(`Failed to collect ${metric.name}: ${error}`);
    }
  }

  private static async collectCPUUsage(): Promise<number> {
    // This would collect actual CPU usage
    // For now, return mock data
    return Math.random() * 100;
  }

  private static async collectMemoryUsage(): Promise<number> {
    // This would collect actual memory usage
    // For now, return mock data
    return Math.random() * 100;
  }

  private static async collectDiskUsage(): Promise<number> {
    // This would collect actual disk usage
    // For now, return mock data
    return Math.random() * 100;
  }

  private static async collectNetworkUsage(): Promise<number> {
    // This would collect actual network usage
    // For now, return mock data
    return Math.random() * 1000;
  }

  private static async collectDatabaseMetrics(): Promise<number> {
    // This would collect actual database metrics
    // For now, return mock data
    return Math.floor(Math.random() * 100);
  }

  private static async collectResponseTime(): Promise<number> {
    // This would collect actual response time metrics
    // For now, return mock data
    return Math.random() * 5000 + 100;
  }

  private static async collectCustomMetric(metric: PerformanceMetricDefinition): Promise<number> {
    // This would collect custom metric data
    // For now, return mock data
    return Math.random() * 100;
  }

  private static async storeMetricDataPoint(dataPoint: PerformanceMetricDataPoint): Promise<void> {
    try {
      const dataPoints = this.dataPoints.get(dataPoint.metricId) || [];
      dataPoints.push(dataPoint);

      // Maintain max data points limit
      if (dataPoints.length > this.MAX_DATA_POINTS_PER_METRIC) {
        dataPoints.splice(0, dataPoints.length - this.MAX_DATA_POINTS_PER_METRIC);
      }

      this.dataPoints.set(dataPoint.metricId, dataPoints);
    } catch (error) {
      console.error('Error storing metric data point:', error);
      throw error;
    }
  }

  private static async checkMetricAlerts(metric: PerformanceMetricDefinition, dataPoint: PerformanceMetricDataPoint): Promise<void> {
    try {
      const config = await this.getPerformanceMetricsConfig();
      if (!config.alertSettings.enabled) return;

      const threshold = metric.alertThreshold;
      if (!threshold) return;

      const isThresholdExceeded = dataPoint.value > threshold;
      if (!isThresholdExceeded) return;

      // Check for existing alert
      const existingAlert = this.alerts.find(
        alert => alert.metricId === metric.id &&
                !alert.resolved &&
                alert.alertType === 'threshold_exceeded'
      );

      if (existingAlert) {
        existingAlert.consecutiveOccurrences++;
        existingAlert.actualValue = dataPoint.value;
        existingAlert.timestamp = new Date();
        return;
      }

      // Create new alert
      const severity = this.determineAlertSeverity(metric, dataPoint.value, threshold);
      const alert: PerformanceAlert = {
        id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        metricId: metric.id,
        metricName: metric.name,
        metricType: metric.type,
        alertType: 'threshold_exceeded',
        severity,
        threshold,
        actualValue: dataPoint.value,
        message: `${metric.name} exceeded threshold: ${dataPoint.value}${dataPoint.unit} > ${threshold}${dataPoint.unit}`,
        timestamp: new Date(),
        acknowledged: false,
        resolved: false,
        consecutiveOccurrences: 1,
        metadata: {
          dataPoint,
          metric
        }
      };

      this.alerts.push(alert);

      // Log alert creation
      await AuditService.log({
        action: 'USER_UPDATED' as any,
        userId: 'system',
        username: 'system',
        description: `Performance alert created: ${metric.name}`,
        metadata: {
          alertId: alert.id,
          metricName: metric.name,
          severity,
          threshold,
          actualValue: dataPoint.value
        }
      });
    } catch (error) {
      console.error('Error checking metric alerts:', error);
    }
  }

  private static determineMetricStatus(metric: PerformanceMetricDefinition, value: number): 'normal' | 'warning' | 'critical' {
    const threshold = metric.alertThreshold;
    if (!threshold) return 'normal';

    if (value > threshold * 1.5) return 'critical';
    if (value > threshold) return 'warning';
    return 'normal';
  }

  private static determineAlertSeverity(metric: PerformanceMetricDefinition, value: number, threshold: number): 'low' | 'medium' | 'high' | 'critical' {
    const ratio = value / threshold;

    if (ratio > 2) return 'critical';
    if (ratio > 1.5) return 'high';
    if (ratio > 1.2) return 'medium';
    return 'low';
  }

  private static calculateOverallHealth(currentMetrics: Record<string, any>, activeAlerts: number): 'healthy' | 'warning' | 'critical' {
    if (activeAlerts > 0) return 'critical';

    const criticalMetrics = Object.values(currentMetrics).filter((m: any) => m.status === 'critical').length;
    const warningMetrics = Object.values(currentMetrics).filter((m: any) => m.status === 'warning').length;

    if (criticalMetrics > 0) return 'critical';
    if (warningMetrics > 0) return 'warning';
    return 'healthy';
  }

  private static async generateRecommendations(): Promise<Array<{
    type: 'optimization' | 'alert' | 'maintenance';
    priority: 'low' | 'medium' | 'high';
    title: string;
    description: string;
    actionItems: string[];
    affectedMetrics: string[];
  }>> {
    try {
      const recommendations: Array<{
        type: 'optimization' | 'alert' | 'maintenance';
        priority: 'low' | 'medium' | 'high';
        title: string;
        description: string;
        actionItems: string[];
        affectedMetrics: string[];
      }> = [];

      const currentMetrics = await this.getCurrentMetrics();

      // CPU optimization recommendation
      const cpuMetric = Object.entries(currentMetrics).find(([name]) => name.toLowerCase().includes('cpu'));
      if (cpuMetric && cpuMetric[1].value > 80) {
        recommendations.push({
          type: 'optimization',
          priority: 'high',
          title: 'High CPU Usage Detected',
          description: 'CPU usage is consistently high, consider optimization',
          actionItems: [
            'Review running processes',
            'Implement caching strategies',
            'Consider load balancing',
            'Optimize database queries'
          ],
          affectedMetrics: [cpuMetric[0]]
        });
      }

      // Memory optimization recommendation
      const memoryMetric = Object.entries(currentMetrics).find(([name]) => name.toLowerCase().includes('memory'));
      if (memoryMetric && memoryMetric[1].value > 85) {
        recommendations.push({
          type: 'optimization',
          priority: 'high',
          title: 'High Memory Usage Detected',
          description: 'Memory usage is high, consider memory optimization',
          actionItems: [
            'Check for memory leaks',
            'Implement memory pooling',
            'Review object allocations',
            'Consider garbage collection tuning'
          ],
          affectedMetrics: [memoryMetric[0]]
        });
      }

      return recommendations;
    } catch (error) {
      console.error('Error generating recommendations:', error);
      return [];
    }
  }

  private static async getSystemInfo(): Promise<{
    cpuCores: number;
    totalMemory: number;
    totalDisk: number;
    osVersion: string;
    uptime: number;
  }> {
    try {
      // This would collect actual system information
      // For now, return mock data
      return {
        cpuCores: 4,
        totalMemory: 8192, // MB
        totalDisk: 256000, // MB
        osVersion: 'Linux 5.4.0',
        uptime: 86400 // seconds
      };
    } catch (error) {
      console.error('Error getting system info:', error);
      return {
        cpuCores: 0,
        totalMemory: 0,
        totalDisk: 0,
        osVersion: 'unknown',
        uptime: 0
      };
    }
  }

  private static async startMetricsCollection(): Promise<void> {
    try {
      const config = await this.getPerformanceMetricsConfig();

      if (config.enabled) {
        // Start periodic metrics collection
        this.collectionInterval = setInterval(async () => {
          try {
            await this.collectAllMetrics();
          } catch (error) {
            console.error('Error in metrics collection:', error);
          }
        }, config.collectionIntervalMinutes * 60 * 1000);
      }
    } catch (error) {
      console.error('Error starting metrics collection:', error);
    }
  }

  private static async startDataAggregation(): Promise<void> {
    try {
      // Start periodic data aggregation
      setInterval(async () => {
        try {
          await this.performDataAggregation();
        } catch (error) {
          console.error('Error in data aggregation:', error);
        }
      }, this.AGGREGATION_INTERVAL_MINUTES * 60 * 1000);
    } catch (error) {
      console.error('Error starting data aggregation:', error);
    }
  }

  private static async performDataAggregation(): Promise<void> {
    try {
      const config = await this.getPerformanceMetricsConfig();
      const aggregationStartTime = new Date(Date.now() - (this.AGGREGATION_INTERVAL_MINUTES * 60 * 1000));

      for (const metric of config.metrics.filter(m => m.enabled)) {
        const dataPoints = this.dataPoints.get(metric.id) || [];
        const recentDataPoints = dataPoints.filter(dp => dp.timestamp >= aggregationStartTime);

        if (recentDataPoints.length > 0) {
          const values = recentDataPoints.map(dp => dp.value);
          const aggregatedValue = this.calculateAggregatedValue(values, metric.aggregationMethod);

          const aggregation: PerformanceMetricsAggregation = {
            id: `agg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            metricId: metric.id,
            metricName: metric.name,
            metricType: metric.type,
            timeRange: `${this.AGGREGATION_INTERVAL_MINUTES}min`,
            aggregationMethod: metric.aggregationMethod,
            aggregatedValue,
            dataPoints: values.length,
            minValue: Math.min(...values),
            maxValue: Math.max(...values),
            averageValue: values.reduce((sum, val) => sum + val, 0) / values.length,
            standardDeviation: this.calculateStandardDeviation(values),
            timestamp: new Date(),
            startTime: aggregationStartTime,
            endTime: new Date()
          };

          const aggregations = this.aggregations.get(metric.id) || [];
          aggregations.push(aggregation);
          this.aggregations.set(metric.id, aggregations);
        }
      }
    } catch (error) {
      console.error('Error performing data aggregation:', error);
    }
  }

  private static calculateAggregatedValue(values: number[], method: string): number {
    switch (method) {
      case 'average':
        return values.reduce((sum, val) => sum + val, 0) / values.length;
      case 'min':
        return Math.min(...values);
      case 'max':
        return Math.max(...values);
      case 'sum':
        return values.reduce((sum, val) => sum + val, 0);
      case 'count':
        return values.length;
      default:
        return values.reduce((sum, val) => sum + val, 0) / values.length;
    }
  }

  private static calculateStandardDeviation(values: number[]): number {
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const squaredDifferences = values.map(val => Math.pow(val - mean, 2));
    const variance = squaredDifferences.reduce((sum, val) => sum + val, 0) / values.length;
    return Math.sqrt(variance);
  }

  // Shutdown the performance metrics manager
  static shutdown(): void {
    if (this.collectionInterval) {
      clearInterval(this.collectionInterval);
      this.collectionInterval = null;
    }
    this.dataPoints.clear();
    this.aggregations.clear();
    this.alerts = [];
    console.log('Performance Metrics Manager shut down');
  }
}

// Export utilities
export const collectAllMetrics = PerformanceMetricsManager.collectAllMetrics.bind(PerformanceMetricsManager);
export const getCurrentMetrics = PerformanceMetricsManager.getCurrentMetrics.bind(PerformanceMetricsManager);
export const getDashboardData = PerformanceMetricsManager.getDashboardData.bind(PerformanceMetricsManager);
export const getHistoricalTrends = PerformanceMetricsManager.getHistoricalTrends.bind(PerformanceMetricsManager);
export const getActiveAlerts = PerformanceMetricsManager.getActiveAlerts.bind(PerformanceMetricsManager);
export const acknowledgeAlert = PerformanceMetricsManager.acknowledgeAlert.bind(PerformanceMetricsManager);
export const clearOldMetricsData = PerformanceMetricsManager.clearOldMetricsData.bind(PerformanceMetricsManager);
export const generatePerformanceReport = PerformanceMetricsManager.generatePerformanceReport.bind(PerformanceMetricsManager);
export const initializePerformanceMetricsManager = PerformanceMetricsManager.initialize.bind(PerformanceMetricsManager);

export default PerformanceMetricsManager;
