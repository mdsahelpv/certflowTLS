/**
 * Health Check Manager Tests
 *
 * Comprehensive test suite for health check management functionality
 */

import { jest } from '@jest/globals';
import HealthCheckManager, {
  HealthCheckDefinition,
  HealthCheckResult,
  HealthCheckStatus
} from '../../src/lib/health-check-manager';
import { SettingsCacheService } from '../../src/lib/settings-cache';

// Mock dependencies
jest.mock('../../src/lib/settings-cache');
jest.mock('../../src/lib/audit');

describe('HealthCheckManager', () => {
  let mockSettingsCacheService: jest.Mocked<typeof SettingsCacheService>;

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();

    // Setup mock implementations
    mockSettingsCacheService = SettingsCacheService as jest.Mocked<typeof SettingsCacheService>;

    // Mock default health check settings
    mockSettingsCacheService.getCASetting.mockResolvedValue({
      config: {
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
          }
        ]
      }
    });

    mockSettingsCacheService.setCASetting.mockResolvedValue();
  });

  afterEach(() => {
    // Clear any timers
    HealthCheckManager.shutdown();
  });

  describe('Initialization', () => {
    test('should initialize successfully', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await HealthCheckManager.initialize();

      expect(consoleSpy).toHaveBeenCalledWith('Health Check Manager initialized');
      consoleSpy.mockRestore();
    });
  });

  describe('runAllHealthChecks', () => {
    test('should run all health checks successfully', async () => {
      const result = await HealthCheckManager.runAllHealthChecks();

      expect(result).toMatchObject({
        overallStatus: 'healthy',
        totalChecks: 2,
        healthyChecks: 2,
        unhealthyChecks: 0,
        warningChecks: 0,
        results: expect.any(Array)
      });

      expect(result.results).toHaveLength(2);
      expect(result.results[0]).toMatchObject({
        checkId: 'api_health',
        checkName: 'API Health',
        status: 'healthy',
        responseTime: expect.any(Number),
        timestamp: expect.any(Date),
        message: expect.stringContaining('HTTP check passed'),
        consecutiveFailures: 0
      });
    });

    test('should handle disabled health checks', async () => {
      mockSettingsCacheService.getCASetting.mockResolvedValue({
        config: { enabled: false }
      });

      const result = await HealthCheckManager.runAllHealthChecks();

      expect(result).toMatchObject({
        overallStatus: 'healthy',
        totalChecks: 0,
        healthyChecks: 0,
        unhealthyChecks: 0,
        warningChecks: 0,
        results: []
      });
    });

    test('should handle health check failures', async () => {
      // Mock HTTP check to fail
      const originalPerformHttpCheck = HealthCheckManager.prototype['performHttpCheck'];
      HealthCheckManager.prototype['performHttpCheck'] = jest.fn().mockResolvedValue({
        status: 'unhealthy',
        message: 'HTTP check failed',
        details: { error: 'Connection timeout' }
      });

      const result = await HealthCheckManager.runAllHealthChecks();

      expect(result.overallStatus).toBe('unhealthy');
      expect(result.unhealthyChecks).toBe(1);
      expect(result.healthyChecks).toBe(1);

      HealthCheckManager.prototype['performHttpCheck'] = originalPerformHttpCheck;
    });
  });

  describe('executeHealthCheck', () => {
    let mockCheck: HealthCheckDefinition;

    beforeEach(() => {
      mockCheck = {
        id: 'test_check',
        name: 'Test Check',
        type: 'http',
        enabled: true,
        endpoint: 'http://localhost:3000/test',
        expectedStatus: 200,
        timeoutSeconds: 10
      };
    });

    test('should execute HTTP health check successfully', async () => {
      const result = await HealthCheckManager.executeHealthCheck(mockCheck);

      expect(result).toMatchObject({
        checkId: 'test_check',
        checkName: 'Test Check',
        status: 'healthy',
        responseTime: expect.any(Number),
        timestamp: expect.any(Date),
        message: expect.stringContaining('HTTP check passed'),
        consecutiveFailures: 0
      });
    });

    test('should execute database health check successfully', async () => {
      const dbCheck: HealthCheckDefinition = {
        id: 'db_check',
        name: 'Database Check',
        type: 'database',
        enabled: true,
        databaseQuery: 'SELECT 1',
        timeoutSeconds: 5
      };

      const result = await HealthCheckManager.executeHealthCheck(dbCheck);

      expect(result).toMatchObject({
        checkId: 'db_check',
        checkName: 'Database Check',
        status: 'healthy',
        message: 'Database connection is healthy',
        consecutiveFailures: 0
      });
    });

    test('should handle health check errors', async () => {
      const originalPerformHttpCheck = HealthCheckManager.prototype['performHttpCheck'];
      HealthCheckManager.prototype['performHttpCheck'] = jest.fn().mockRejectedValue(new Error('Network error'));

      const result = await HealthCheckManager.executeHealthCheck(mockCheck);

      expect(result).toMatchObject({
        checkId: 'test_check',
        checkName: 'Test Check',
        status: 'unhealthy',
        responseTime: expect.any(Number),
        message: 'Health check failed: Test Check',
        error: 'Network error',
        consecutiveFailures: 1
      });

      HealthCheckManager.prototype['performHttpCheck'] = originalPerformHttpCheck;
    });

    test('should track consecutive failures', async () => {
      const originalPerformHttpCheck = HealthCheckManager.prototype['performHttpCheck'];
      HealthCheckManager.prototype['performHttpCheck'] = jest.fn().mockResolvedValue({
        status: 'unhealthy',
        message: 'HTTP check failed',
        details: { error: 'Connection failed' }
      });

      // First failure
      await HealthCheckManager.executeHealthCheck(mockCheck);
      let result = await HealthCheckManager.executeHealthCheck(mockCheck);

      expect(result.consecutiveFailures).toBe(2);

      // Recovery
      HealthCheckManager.prototype['performHttpCheck'] = jest.fn().mockResolvedValue({
        status: 'healthy',
        message: 'HTTP check passed',
        details: { statusCode: 200 }
      });

      result = await HealthCheckManager.executeHealthCheck(mockCheck);
      expect(result.consecutiveFailures).toBe(0);

      HealthCheckManager.prototype['performHttpCheck'] = originalPerformHttpCheck;
    });
  });

  describe('getHealthCheckStatistics', () => {
    test('should return health check statistics', async () => {
      // Run some health checks first to populate data
      await HealthCheckManager.runAllHealthChecks();

      const stats = await HealthCheckManager.getHealthCheckStatistics();

      expect(stats).toMatchObject({
        totalChecks: expect.any(Number),
        successfulChecks: expect.any(Number),
        failedChecks: expect.any(Number),
        averageResponseTime: expect.any(Number),
        uptimePercentage: expect.any(Number),
        checkTypeDistribution: expect.any(Object),
        failureRateByCheck: expect.any(Object),
        averageResponseTimeByCheck: expect.any(Object)
      });
    });
  });

  describe('Alert Management', () => {
    test('should get active alerts', async () => {
      const alerts = await HealthCheckManager.getActiveAlerts();

      expect(Array.isArray(alerts)).toBe(true);
    });

    test('should resolve alert', async () => {
      // Create a mock alert
      const alerts = (HealthCheckManager as any).alerts;
      const mockAlert = {
        id: 'test_alert',
        checkId: 'test_check',
        checkName: 'Test Check',
        alertType: 'failure',
        message: 'Test alert',
        timestamp: new Date(),
        resolved: false,
        consecutiveFailures: 3,
        details: {}
      };
      alerts.push(mockAlert);

      const result = await HealthCheckManager.resolveAlert('test_alert');

      expect(result).toBe(true);
      expect(mockAlert.resolved).toBe(true);
      expect(mockAlert.resolvedAt).toBeDefined();
    });

    test('should handle non-existent alert resolution', async () => {
      const result = await HealthCheckManager.resolveAlert('non_existent');

      expect(result).toBe(false);
    });
  });

  describe('testHealthCheckEndpoint', () => {
    test('should test health check endpoint successfully', async () => {
      const mockCheck: HealthCheckDefinition = {
        id: 'test_endpoint',
        name: 'Test Endpoint',
        type: 'http',
        enabled: true,
        endpoint: 'http://localhost:3000/test',
        expectedStatus: 200
      };

      const result = await HealthCheckManager.testHealthCheckEndpoint(mockCheck);

      expect(result).toMatchObject({
        checkId: 'test_endpoint',
        checkName: 'Test Endpoint',
        status: 'healthy',
        responseTime: expect.any(Number),
        timestamp: expect.any(Date),
        message: expect.stringContaining('HTTP check passed'),
        consecutiveFailures: 0
      });
    });
  });

  describe('resetHealthCheckStatistics', () => {
    test('should reset health check statistics', async () => {
      // Populate some data first
      await HealthCheckManager.runAllHealthChecks();

      const result = await HealthCheckManager.resetHealthCheckStatistics();

      expect(result).toMatchObject({
        statisticsReset: true,
        alertsCleared: true,
        consecutiveFailuresReset: true
      });
    });
  });

  describe('Health Check Types', () => {
    test('should perform TCP check', async () => {
      const tcpCheck: HealthCheckDefinition = {
        id: 'tcp_check',
        name: 'TCP Check',
        type: 'tcp',
        enabled: true,
        endpoint: 'localhost',
        port: 3000,
        timeoutSeconds: 5
      };

      const result = await HealthCheckManager.executeHealthCheck(tcpCheck);

      expect(result.status).toBe('healthy');
      expect(result.message).toContain('TCP check passed');
    });

    test('should perform filesystem check', async () => {
      const fsCheck: HealthCheckDefinition = {
        id: 'fs_check',
        name: 'Filesystem Check',
        type: 'filesystem',
        enabled: true,
        filesystemPath: '/tmp',
        timeoutSeconds: 5
      };

      const result = await HealthCheckManager.executeHealthCheck(fsCheck);

      expect(result.status).toBe('healthy');
      expect(result.message).toContain('Filesystem check passed');
    });

    test('should perform memory check', async () => {
      const memoryCheck: HealthCheckDefinition = {
        id: 'memory_check',
        name: 'Memory Check',
        type: 'memory',
        enabled: true,
        thresholdWarning: 80,
        thresholdCritical: 90
      };

      const result = await HealthCheckManager.executeHealthCheck(memoryCheck);

      expect(['healthy', 'warning', 'unhealthy']).toContain(result.status);
      expect(result.message).toContain('Memory usage');
    });

    test('should perform CPU check', async () => {
      const cpuCheck: HealthCheckDefinition = {
        id: 'cpu_check',
        name: 'CPU Check',
        type: 'cpu',
        enabled: true,
        thresholdWarning: 80,
        thresholdCritical: 90
      };

      const result = await HealthCheckManager.executeHealthCheck(cpuCheck);

      expect(['healthy', 'warning', 'unhealthy']).toContain(result.status);
      expect(result.message).toContain('CPU usage');
    });

    test('should perform disk check', async () => {
      const diskCheck: HealthCheckDefinition = {
        id: 'disk_check',
        name: 'Disk Check',
        type: 'disk',
        enabled: true,
        thresholdWarning: 85,
        thresholdCritical: 90
      };

      const result = await HealthCheckManager.executeHealthCheck(diskCheck);

      expect(['healthy', 'warning', 'unhealthy']).toContain(result.status);
      expect(result.message).toContain('Disk usage');
    });

    test('should perform custom check', async () => {
      const customCheck: HealthCheckDefinition = {
        id: 'custom_check',
        name: 'Custom Check',
        type: 'custom',
        enabled: true,
        customFunction: 'testFunction'
      };

      const result = await HealthCheckManager.executeHealthCheck(customCheck);

      expect(result.status).toBe('healthy');
      expect(result.message).toContain('Custom check passed');
    });

    test('should handle unknown check type', async () => {
      const unknownCheck: HealthCheckDefinition = {
        id: 'unknown_check',
        name: 'Unknown Check',
        type: 'unknown' as any,
        enabled: true
      };

      const result = await HealthCheckManager.executeHealthCheck(unknownCheck);

      expect(result.status).toBe('unhealthy');
      expect(result.message).toContain('Unknown check type');
    });
  });

  describe('Error Handling', () => {
    test('should handle configuration errors gracefully', async () => {
      mockSettingsCacheService.getCASetting.mockRejectedValue(new Error('Config error'));

      const result = await HealthCheckManager.runAllHealthChecks();

      expect(result.overallStatus).toBe('unhealthy');
      expect(result.totalChecks).toBe(0);
    });

    test('should handle individual check failures', async () => {
      const originalPerformHttpCheck = HealthCheckManager.prototype['performHttpCheck'];
      HealthCheckManager.prototype['performHttpCheck'] = jest.fn().mockRejectedValue(new Error('Check failed'));

      const httpCheck: HealthCheckDefinition = {
        id: 'failing_check',
        name: 'Failing Check',
        type: 'http',
        enabled: true,
        endpoint: 'http://localhost:3000/fail'
      };

      const result = await HealthCheckManager.executeHealthCheck(httpCheck);

      expect(result.status).toBe('unhealthy');
      expect(result.error).toBe('Check failed');

      HealthCheckManager.prototype['performHttpCheck'] = originalPerformHttpCheck;
    });
  });

  describe('Integration Tests', () => {
    test('should handle complete health check workflow', async () => {
      // Test that all public methods exist and are callable
      expect(typeof HealthCheckManager.runAllHealthChecks).toBe('function');
      expect(typeof HealthCheckManager.executeHealthCheck).toBe('function');
      expect(typeof HealthCheckManager.getHealthCheckStatistics).toBe('function');
      expect(typeof HealthCheckManager.getActiveAlerts).toBe('function');
      expect(typeof HealthCheckManager.resolveAlert).toBe('function');
      expect(typeof HealthCheckManager.testHealthCheckEndpoint).toBe('function');
      expect(typeof HealthCheckManager.resetHealthCheckStatistics).toBe('function');
    });

    test('should maintain state between operations', async () => {
      // Run health checks
      await HealthCheckManager.runAllHealthChecks();

      // Get statistics
      const stats = await HealthCheckManager.getHealthCheckStatistics();

      expect(stats.totalChecks).toBeGreaterThan(0);

      // Reset statistics
      await HealthCheckManager.resetHealthCheckStatistics();

      // Verify reset worked
      const newStats = await HealthCheckManager.getHealthCheckStatistics();
      expect(newStats.totalChecks).toBe(0);
    });
  });

  describe('Shutdown', () => {
    test('should shutdown cleanly', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      HealthCheckManager.shutdown();

      expect(consoleSpy).toHaveBeenCalledWith('Health Check Manager shut down');
      consoleSpy.mockRestore();
    });
  });

  describe('Alerting System', () => {
    test('should create failure alerts', async () => {
      const originalPerformHttpCheck = HealthCheckManager.prototype['performHttpCheck'];
      HealthCheckManager.prototype['performHttpCheck'] = jest.fn().mockResolvedValue({
        status: 'unhealthy',
        message: 'HTTP check failed',
        details: { error: 'Connection failed' }
      });

      const failingCheck: HealthCheckDefinition = {
        id: 'failing_alert_check',
        name: 'Failing Alert Check',
        type: 'http',
        enabled: true,
        endpoint: 'http://localhost:3000/fail'
      };

      // Simulate multiple failures to trigger alert
      for (let i = 0; i < 3; i++) {
        await HealthCheckManager.executeHealthCheck(failingCheck);
      }

      const alerts = await HealthCheckManager.getActiveAlerts();

      expect(alerts.length).toBeGreaterThan(0);
      expect(alerts[0]).toMatchObject({
        checkId: 'failing_alert_check',
        checkName: 'Failing Alert Check',
        alertType: 'failure',
        resolved: false,
        consecutiveFailures: expect.any(Number)
      });

      HealthCheckManager.prototype['performHttpCheck'] = originalPerformHttpCheck;
    });

    test('should create recovery alerts', async () => {
      const originalPerformHttpCheck = HealthCheckManager.prototype['performHttpCheck'];

      // First fail the check
      HealthCheckManager.prototype['performHttpCheck'] = jest.fn().mockResolvedValue({
        status: 'unhealthy',
        message: 'HTTP check failed',
        details: { error: 'Connection failed' }
      });

      const recoveryCheck: HealthCheckDefinition = {
        id: 'recovery_check',
        name: 'Recovery Check',
        type: 'http',
        enabled: true,
        endpoint: 'http://localhost:3000/recover'
      };

      await HealthCheckManager.executeHealthCheck(recoveryCheck);

      // Then recover
      HealthCheckManager.prototype['performHttpCheck'] = jest.fn().mockResolvedValue({
        status: 'healthy',
        message: 'HTTP check passed',
        details: { statusCode: 200 }
      });

      await HealthCheckManager.executeHealthCheck(recoveryCheck);

      const alerts = await HealthCheckManager.getActiveAlerts();
      const recoveryAlerts = alerts.filter(a => a.alertType === 'recovery');

      expect(recoveryAlerts.length).toBeGreaterThan(0);

      HealthCheckManager.prototype['performHttpCheck'] = originalPerformHttpCheck;
    });
  });

  describe('Statistics Calculations', () => {
    test('should calculate uptime percentage', async () => {
      const uptime = await HealthCheckManager.prototype['calculateUptimePercentage']();

      expect(typeof uptime).toBe('number');
      expect(uptime).toBeGreaterThanOrEqual(0);
      expect(uptime).toBeLessThanOrEqual(100);
    });

    test('should get check type distribution', async () => {
      const distribution = await HealthCheckManager.prototype['getCheckTypeDistribution']();

      expect(typeof distribution).toBe('object');
      expect(distribution.http).toBeDefined();
      expect(distribution.database).toBeDefined();
    });

    test('should calculate failure rates by check', async () => {
      // Run health checks to populate data
      await HealthCheckManager.runAllHealthChecks();

      const failureRates = await HealthCheckManager.prototype['getFailureRateByCheck']();

      expect(typeof failureRates).toBe('object');
      expect(Object.keys(failureRates).length).toBeGreaterThan(0);
    });

    test('should calculate average response times by check', async () => {
      // Run health checks to populate data
      await HealthCheckManager.runAllHealthChecks();

      const responseTimes = await HealthCheckManager.prototype['getAverageResponseTimeByCheck']();

      expect(typeof responseTimes).toBe('object');
      expect(Object.keys(responseTimes).length).toBeGreaterThan(0);
    });
  });
});
