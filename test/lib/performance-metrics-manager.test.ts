/**
 * Performance Metrics Manager Tests
 *
 * Comprehensive test suite for performance metrics management functionality
 */

import { jest } from '@jest/globals';
import PerformanceMetricsManager, {
  PerformanceMetricDefinition,
  PerformanceMetricDataPoint,
  PerformanceMetricsConfig
} from '../../src/lib/performance-metrics-manager';
import { SettingsCacheService } from '../../src/lib/settings-cache';

// Mock dependencies
jest.mock('../../src/lib/settings-cache');
jest.mock('../../src/lib/audit');

describe('PerformanceMetricsManager', () => {
  let mockSettingsCacheService: jest.Mocked<typeof SettingsCacheService>;

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();

    // Setup mock implementations
    mockSettingsCacheService = SettingsCacheService as jest.Mocked<typeof SettingsCacheService>;

    // Mock default performance metrics settings
    mockSettingsCacheService.getCASetting.mockResolvedValue({
      config: {
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
      }
    });

    mockSettingsCacheService.setCASetting.mockResolvedValue();
  });

  afterEach(() => {
    // Clear any timers
    PerformanceMetricsManager.shutdown();
  });

  describe('Initialization', () => {
    test('should initialize successfully', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await PerformanceMetricsManager.initialize();

      expect(consoleSpy).toHaveBeenCalledWith('Performance Metrics Manager initialized');
      consoleSpy.mockRestore();
    });
  });

  describe('collectAllMetrics', () => {
    test('should collect all enabled metrics successfully', async () => {
      const result = await PerformanceMetricsManager.collectAllMetrics();

      expect(result).toMatchObject({
        metricsCollected: 2,
        collectionTime: expect.any(Number),
        errors: expect.any(Array)
      });

      expect(result.metricsCollected).toBe(2);
      expect(result.collectionTime).toBeGreaterThanOrEqual(0);
    });

    test('should handle disabled metrics collection', async () => {
      mockSettingsCacheService.getCASetting.mockResolvedValue({
        config: { enabled: false }
      });

      const result = await PerformanceMetricsManager.collectAllMetrics();

      expect(result).toMatchObject({
        metricsCollected: 0,
        collectionTime: 0,
        errors: ['Performance metrics collection is disabled']
      });
    });

    test('should handle metric collection errors', async () => {
      const originalCollectCPUUsage = PerformanceMetricsManager.prototype['collectCPUUsage'];
      PerformanceMetricsManager.prototype['collectCPUUsage'] = jest.fn().mockRejectedValue(new Error('Collection failed'));

      const result = await PerformanceMetricsManager.collectAllMetrics();

      expect(result.metricsCollected).toBe(1); // Only memory metric should succeed
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Failed to collect CPU Usage');

      PerformanceMetricsManager.prototype['collectCPUUsage'] = originalCollectCPUUsage;
    });
  });

  describe('getCurrentMetrics', () => {
    test('should return current metrics with status', async () => {
      // First collect some metrics
      await PerformanceMetricsManager.collectAllMetrics();

      const currentMetrics = await PerformanceMetricsManager.getCurrentMetrics();

      expect(typeof currentMetrics).toBe('object');
      expect(Object.keys(currentMetrics).length).toBeGreaterThan(0);

      for (const [metricName, metricData] of Object.entries(currentMetrics)) {
        expect(metricData).toMatchObject({
          value: expect.any(Number),
          unit: expect.any(String),
          timestamp: expect.any(Date),
          status: expect.stringMatching(/normal|warning|critical/)
        });
      }
    });
  });

  describe('getDashboardData', () => {
    test('should return comprehensive dashboard data', async () => {
      // Collect some metrics first
      await PerformanceMetricsManager.collectAllMetrics();

      const dashboard = await PerformanceMetricsManager.getDashboardData();

      expect(dashboard).toMatchObject({
        summary: {
          overallHealth: expect.stringMatching(/healthy|warning|critical/),
          activeAlerts: expect.any(Number),
          totalMetrics: expect.any(Number),
          collectionUptime: expect.any(Number),
          dataRetentionDays: expect.any(Number)
        },
        currentMetrics: expect.any(Object),
        historicalTrends: expect.any(Array),
        alerts: expect.any(Array),
        recommendations: expect.any(Array),
        systemInfo: {
          cpuCores: expect.any(Number),
          totalMemory: expect.any(Number),
          totalDisk: expect.any(Number),
          osVersion: expect.any(String),
          uptime: expect.any(Number)
        }
      });
    });
  });

  describe('getHistoricalTrends', () => {
    test('should return historical trends for metrics', async () => {
      // Collect metrics multiple times to build history
      await PerformanceMetricsManager.collectAllMetrics();
      await new Promise(resolve => setTimeout(resolve, 100));
      await PerformanceMetricsManager.collectAllMetrics();

      const trends = await PerformanceMetricsManager.getHistoricalTrends(1);

      expect(Array.isArray(trends)).toBe(true);
      if (trends.length > 0) {
        const trend = trends[0];
        expect(trend).toMatchObject({
          metricName: expect.any(String),
          metricType: expect.any(String),
          dataPoints: expect.any(Array),
          trend: expect.stringMatching(/up|down|stable/),
          changePercent: expect.any(Number),
          averageValue: expect.any(Number),
          minValue: expect.any(Number),
          maxValue: expect.any(Number)
        });
      }
    });
  });

  describe('Alert Management', () => {
    test('should get active alerts', async () => {
      const alerts = await PerformanceMetricsManager.getActiveAlerts();

      expect(Array.isArray(alerts)).toBe(true);
    });

    test('should acknowledge alert', async () => {
      // Create a mock alert
      const alerts = (PerformanceMetricsManager as any).alerts;
      const mockAlert = {
        id: 'test_alert',
        metricId: 'test_metric',
        metricName: 'Test Metric',
        alertType: 'threshold_exceeded',
        severity: 'high',
        acknowledged: false,
        resolved: false,
        consecutiveOccurrences: 1,
        timestamp: new Date()
      };
      alerts.push(mockAlert);

      const result = await PerformanceMetricsManager.acknowledgeAlert('test_alert', 'test_user');

      expect(result).toBe(true);
      expect(mockAlert.acknowledged).toBe(true);
      expect(mockAlert.acknowledgedBy).toBe('test_user');
      expect(mockAlert.acknowledgedAt).toBeDefined();
    });

    test('should handle non-existent alert acknowledgment', async () => {
      const result = await PerformanceMetricsManager.acknowledgeAlert('non_existent', 'test_user');

      expect(result).toBe(false);
    });
  });

  describe('clearOldMetricsData', () => {
    test('should clear old metrics data', async () => {
      // Add some old data points
      const dataPoints = (PerformanceMetricsManager as any).dataPoints;
      const oldDate = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000); // 40 days ago

      dataPoints.set('test_metric', [
        {
          id: 'old_point',
          metricId: 'test_metric',
          timestamp: oldDate,
          value: 50
        },
        {
          id: 'new_point',
          metricId: 'test_metric',
          timestamp: new Date(),
          value: 60
        }
      ]);

      const result = await PerformanceMetricsManager.clearOldMetricsData(30);

      expect(result.recordsDeleted).toBe(1);
      expect(result.metricsCleared).toBe(1);
      expect(result.cutoffDate).toBeInstanceOf(Date);
    });
  });

  describe('generatePerformanceReport', () => {
    test('should generate JSON performance report', async () => {
      const report = await PerformanceMetricsManager.generatePerformanceReport('24h', 'json');

      expect(report).toMatchObject({
        format: 'json',
        data: expect.any(String),
        filename: expect.stringContaining('performance_report'),
        metadata: expect.any(Object)
      });

      // Verify JSON is valid
      const parsedData = JSON.parse(report.data);
      expect(parsedData).toMatchObject({
        generatedAt: expect.any(String),
        timeRange: '24h',
        dashboard: expect.any(Object),
        trends: expect.any(Array),
        metadata: expect.any(Object)
      });
    });

    test('should generate CSV performance report', async () => {
      const report = await PerformanceMetricsManager.generatePerformanceReport('24h', 'csv');

      expect(report).toMatchObject({
        format: 'csv',
        data: expect.any(String),
        filename: expect.stringContaining('.csv'),
        metadata: expect.any(Object)
      });

      // Verify CSV format
      expect(report.data).toContain('Timestamp,Metric,Value,Unit,Status');
    });
  });

  describe('Metric Collection Types', () => {
    test('should collect CPU usage metric', async () => {
      const metric: PerformanceMetricDefinition = {
        id: 'cpu_test',
        name: 'CPU Test',
        type: 'cpu',
        enabled: true,
        collectionIntervalSeconds: 60,
        aggregationMethod: 'average',
        retentionHours: 720,
        unit: '%'
      };

      const dataPoint = await PerformanceMetricsManager.prototype['collectMetricData'](metric);

      expect(dataPoint).toMatchObject({
        id: expect.stringContaining('dp_'),
        metricId: 'cpu_test',
        metricName: 'CPU Test',
        metricType: 'cpu',
        value: expect.any(Number),
        unit: '%',
        timestamp: expect.any(Date),
        collectedAt: expect.any(Date),
        collectionDuration: expect.any(Number)
      });

      expect(dataPoint.value).toBeGreaterThanOrEqual(0);
      expect(dataPoint.value).toBeLessThanOrEqual(100);
    });

    test('should collect memory usage metric', async () => {
      const metric: PerformanceMetricDefinition = {
        id: 'memory_test',
        name: 'Memory Test',
        type: 'memory',
        enabled: true,
        collectionIntervalSeconds: 60,
        aggregationMethod: 'average',
        retentionHours: 720,
        unit: '%'
      };

      const dataPoint = await PerformanceMetricsManager.prototype['collectMetricData'](metric);

      expect(dataPoint.metricType).toBe('memory');
      expect(dataPoint.value).toBeGreaterThanOrEqual(0);
      expect(dataPoint.value).toBeLessThanOrEqual(100);
    });

    test('should collect disk usage metric', async () => {
      const metric: PerformanceMetricDefinition = {
        id: 'disk_test',
        name: 'Disk Test',
        type: 'disk',
        enabled: true,
        collectionIntervalSeconds: 300,
        aggregationMethod: 'average',
        retentionHours: 2160,
        unit: '%'
      };

      const dataPoint = await PerformanceMetricsManager.prototype['collectMetricData'](metric);

      expect(dataPoint.metricType).toBe('disk');
      expect(dataPoint.value).toBeGreaterThanOrEqual(0);
      expect(dataPoint.value).toBeLessThanOrEqual(100);
    });

    test('should collect network usage metric', async () => {
      const metric: PerformanceMetricDefinition = {
        id: 'network_test',
        name: 'Network Test',
        type: 'network',
        enabled: true,
        collectionIntervalSeconds: 60,
        aggregationMethod: 'average',
        retentionHours: 168,
        unit: 'MB/s'
      };

      const dataPoint = await PerformanceMetricsManager.prototype['collectMetricData'](metric);

      expect(dataPoint.metricType).toBe('network');
      expect(dataPoint.value).toBeGreaterThanOrEqual(0);
    });

    test('should collect database metrics', async () => {
      const metric: PerformanceMetricDefinition = {
        id: 'db_test',
        name: 'Database Test',
        type: 'database',
        enabled: true,
        collectionIntervalSeconds: 60,
        aggregationMethod: 'average',
        retentionHours: 168,
        unit: 'connections'
      };

      const dataPoint = await PerformanceMetricsManager.prototype['collectMetricData'](metric);

      expect(dataPoint.metricType).toBe('database');
      expect(dataPoint.value).toBeGreaterThanOrEqual(0);
    });

    test('should collect response time metrics', async () => {
      const metric: PerformanceMetricDefinition = {
        id: 'response_test',
        name: 'Response Time Test',
        type: 'response_time',
        enabled: true,
        collectionIntervalSeconds: 60,
        aggregationMethod: 'average',
        retentionHours: 168,
        unit: 'ms'
      };

      const dataPoint = await PerformanceMetricsManager.prototype['collectMetricData'](metric);

      expect(dataPoint.metricType).toBe('response_time');
      expect(dataPoint.value).toBeGreaterThanOrEqual(0);
    });

    test('should collect custom metrics', async () => {
      const metric: PerformanceMetricDefinition = {
        id: 'custom_test',
        name: 'Custom Test',
        type: 'custom',
        enabled: true,
        collectionIntervalSeconds: 60,
        aggregationMethod: 'average',
        retentionHours: 168,
        unit: 'count'
      };

      const dataPoint = await PerformanceMetricsManager.prototype['collectMetricData'](metric);

      expect(dataPoint.metricType).toBe('custom');
      expect(dataPoint.value).toBeGreaterThanOrEqual(0);
    });

    test('should handle unknown metric type', async () => {
      const metric: PerformanceMetricDefinition = {
        id: 'unknown_test',
        name: 'Unknown Test',
        type: 'unknown' as any,
        enabled: true,
        collectionIntervalSeconds: 60,
        aggregationMethod: 'average',
        retentionHours: 168
      };

      await expect(PerformanceMetricsManager.prototype['collectMetricData'](metric))
        .rejects.toThrow('Unknown metric type: unknown');
    });
  });

  describe('Alert System', () => {
    test('should create alerts for threshold violations', async () => {
      const metric: PerformanceMetricDefinition = {
        id: 'alert_test',
        name: 'Alert Test',
        type: 'cpu',
        enabled: true,
        collectionIntervalSeconds: 60,
        aggregationMethod: 'average',
        retentionHours: 720,
        alertThreshold: 50, // Low threshold to trigger alert
        unit: '%'
      };

      // Mock high CPU usage
      const originalCollectCPUUsage = PerformanceMetricsManager.prototype['collectCPUUsage'];
      PerformanceMetricsManager.prototype['collectCPUUsage'] = jest.fn().mockResolvedValue(80); // Above threshold

      await PerformanceMetricsManager.prototype['collectMetricData'](metric);
      await PerformanceMetricsManager.prototype['checkMetricAlerts'](metric, {
        id: 'test_dp',
        metricId: 'alert_test',
        metricName: 'Alert Test',
        metricType: 'cpu',
        value: 80,
        unit: '%',
        timestamp: new Date(),
        collectedAt: new Date(),
        collectionDuration: 100
      });

      const alerts = await PerformanceMetricsManager.getActiveAlerts();

      expect(alerts.length).toBeGreaterThan(0);
      expect(alerts[0]).toMatchObject({
        metricId: 'alert_test',
        metricName: 'Alert Test',
        alertType: 'threshold_exceeded',
        severity: expect.stringMatching(/low|medium|high|critical/),
        threshold: 50,
        actualValue: 80,
        acknowledged: false,
        resolved: false
      });

      PerformanceMetricsManager.prototype['collectCPUUsage'] = originalCollectCPUUsage;
    });

    test('should determine correct alert severity', async () => {
      const severity1 = PerformanceMetricsManager.prototype['determineAlertSeverity'](
        { alertThreshold: 100 } as PerformanceMetricDefinition,
        120, // 1.2x threshold
        100
      );
      expect(severity1).toBe('low');

      const severity2 = PerformanceMetricsManager.prototype['determineAlertSeverity'](
        { alertThreshold: 100 } as PerformanceMetricDefinition,
        160, // 1.6x threshold
        100
      );
      expect(severity2).toBe('high');

      const severity3 = PerformanceMetricsManager.prototype['determineAlertSeverity'](
        { alertThreshold: 100 } as PerformanceMetricDefinition,
        250, // 2.5x threshold
        100
      );
      expect(severity3).toBe('critical');
    });
  });

  describe('Data Aggregation', () => {
    test('should calculate aggregated values correctly', () => {
      const values = [10, 20, 30, 40, 50];

      expect(PerformanceMetricsManager.prototype['calculateAggregatedValue'](values, 'average')).toBe(30);
      expect(PerformanceMetricsManager.prototype['calculateAggregatedValue'](values, 'min')).toBe(10);
      expect(PerformanceMetricsManager.prototype['calculateAggregatedValue'](values, 'max')).toBe(50);
      expect(PerformanceMetricsManager.prototype['calculateAggregatedValue'](values, 'sum')).toBe(150);
      expect(PerformanceMetricsManager.prototype['calculateAggregatedValue'](values, 'count')).toBe(5);
    });

    test('should calculate standard deviation', () => {
      const values = [10, 20, 30, 40, 50];
      const stdDev = PerformanceMetricsManager.prototype['calculateStandardDeviation'](values);

      expect(typeof stdDev).toBe('number');
      expect(stdDev).toBeGreaterThan(0);
    });
  });

  describe('Recommendations', () => {
    test('should generate CPU optimization recommendations', async () => {
      // Mock high CPU usage
      const dataPoints = (PerformanceMetricsManager as any).dataPoints;
      dataPoints.set('cpu_usage', [{
        id: 'cpu_dp',
        metricId: 'cpu_usage',
        metricName: 'CPU Usage',
        metricType: 'cpu',
        value: 95, // High CPU usage
        unit: '%',
        timestamp: new Date(),
        collectedAt: new Date(),
        collectionDuration: 100
      }]);

      const recommendations = await PerformanceMetricsManager.prototype['generateRecommendations']();

      expect(recommendations.length).toBeGreaterThan(0);
      expect(recommendations[0]).toMatchObject({
        type: 'optimization',
        priority: 'high',
        title: 'High CPU Usage Detected',
        affectedMetrics: ['CPU Usage']
      });
    });

    test('should generate memory optimization recommendations', async () => {
      // Mock high memory usage
      const dataPoints = (PerformanceMetricsManager as any).dataPoints;
      dataPoints.set('memory_usage', [{
        id: 'memory_dp',
        metricId: 'memory_usage',
        metricName: 'Memory Usage',
        metricType: 'memory',
        value: 90, // High memory usage
        unit: '%',
        timestamp: new Date(),
        collectedAt: new Date(),
        collectionDuration: 100
      }]);

      const recommendations = await PerformanceMetricsManager.prototype['generateRecommendations']();

      const memoryRec = recommendations.find(r => r.affectedMetrics.includes('Memory Usage'));
      expect(memoryRec).toMatchObject({
        type: 'optimization',
        priority: 'high',
        title: 'High Memory Usage Detected',
        affectedMetrics: ['Memory Usage']
      });
    });
  });

  describe('Error Handling', () => {
    test('should handle configuration errors gracefully', async () => {
      mockSettingsCacheService.getCASetting.mockRejectedValue(new Error('Config error'));

      const result = await PerformanceMetricsManager.collectAllMetrics();

      expect(result.metricsCollected).toBe(0);
      expect(result.errors).toHaveLength(1);
    });

    test('should handle metric collection failures', async () => {
      const originalCollectCPUUsage = PerformanceMetricsManager.prototype['collectCPUUsage'];
      PerformanceMetricsManager.prototype['collectCPUUsage'] = jest.fn().mockRejectedValue(new Error('Collection failed'));

      const metric: PerformanceMetricDefinition = {
        id: 'fail_test',
        name: 'Fail Test',
        type: 'cpu',
        enabled: true,
        collectionIntervalSeconds: 60,
        aggregationMethod: 'average',
        retentionHours: 720
      };

      await expect(PerformanceMetricsManager.prototype['collectMetricData'](metric))
        .rejects.toThrow('Failed to collect Fail Test: Collection failed');

      PerformanceMetricsManager.prototype['collectCPUUsage'] = originalCollectCPUUsage;
    });
  });

  describe('Integration Tests', () => {
    test('should handle complete metrics workflow', async () => {
      // Test that all public methods exist and are callable
      expect(typeof PerformanceMetricsManager.collectAllMetrics).toBe('function');
      expect(typeof PerformanceMetricsManager.getCurrentMetrics).toBe('function');
      expect(typeof PerformanceMetricsManager.getDashboardData).toBe('function');
      expect(typeof PerformanceMetricsManager.getHistoricalTrends).toBe('function');
      expect(typeof PerformanceMetricsManager.getActiveAlerts).toBe('function');
      expect(typeof PerformanceMetricsManager.acknowledgeAlert).toBe('function');
      expect(typeof PerformanceMetricsManager.clearOldMetricsData).toBe('function');
      expect(typeof PerformanceMetricsManager.generatePerformanceReport).toBe('function');
    });

    test('should maintain data integrity across operations', async () => {
      // Collect metrics
      await PerformanceMetricsManager.collectAllMetrics();

      // Get current metrics
      const currentMetrics = await PerformanceMetricsManager.getCurrentMetrics();

      expect(Object.keys(currentMetrics).length).toBeGreaterThan(0);

      // Get dashboard data
      const dashboard = await PerformanceMetricsManager.getDashboardData();

      expect(dashboard.currentMetrics).toEqual(currentMetrics);
    });
  });

  describe('Shutdown', () => {
    test('should shutdown cleanly', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      PerformanceMetricsManager.shutdown();

      expect(consoleSpy).toHaveBeenCalledWith('Performance Metrics Manager shut down');
      consoleSpy.mockRestore();
    });
  });

  describe('System Information', () => {
    test('should get system information', async () => {
      const systemInfo = await PerformanceMetricsManager.prototype['getSystemInfo']();

      expect(systemInfo).toMatchObject({
        cpuCores: expect.any(Number),
        totalMemory: expect.any(Number),
        totalDisk: expect.any(Number),
        osVersion: expect.any(String),
        uptime: expect.any(Number)
      });
    });
  });

  describe('Metric Status Determination', () => {
    test('should determine metric status correctly', () => {
      const metric: PerformanceMetricDefinition = {
        id: 'status_test',
        name: 'Status Test',
        type: 'cpu',
        enabled: true,
        collectionIntervalSeconds: 60,
        aggregationMethod: 'average',
        retentionHours: 720,
        alertThreshold: 80,
        unit: '%'
      };

      expect(PerformanceMetricsManager.prototype['determineMetricStatus'](metric, 50)).toBe('normal');
      expect(PerformanceMetricsManager.prototype['determineMetricStatus'](metric, 85)).toBe('warning');
      expect(PerformanceMetricsManager.prototype['determineMetricStatus'](metric, 130)).toBe('critical');
    });

    test('should handle metrics without thresholds', () => {
      const metric: PerformanceMetricDefinition = {
        id: 'no_threshold',
        name: 'No Threshold',
        type: 'cpu',
        enabled: true,
        collectionIntervalSeconds: 60,
        aggregationMethod: 'average',
        retentionHours: 720,
        unit: '%'
      };

      expect(PerformanceMetricsManager.prototype['determineMetricStatus'](metric, 100)).toBe('normal');
    });
  });

  describe('Overall Health Calculation', () => {
    test('should calculate overall health correctly', () => {
      const currentMetrics = {
        'CPU Usage': { value: 50, unit: '%', timestamp: new Date(), status: 'normal' },
        'Memory Usage': { value: 60, unit: '%', timestamp: new Date(), status: 'normal' }
      };

      expect(PerformanceMetricsManager.prototype['calculateOverallHealth'](currentMetrics, 0)).toBe('healthy');

      const warningMetrics = {
        ...currentMetrics,
        'Disk Usage': { value: 85, unit: '%', timestamp: new Date(), status: 'warning' }
      };

      expect(PerformanceMetricsManager.prototype['calculateOverallHealth'](warningMetrics, 0)).toBe('warning');

      expect(PerformanceMetricsManager.prototype['calculateOverallHealth'](currentMetrics, 1)).toBe('critical');
    });
  });
});
