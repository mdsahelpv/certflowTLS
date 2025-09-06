import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { PrismaClient } from '@prisma/client';
import { SettingsValidation } from '@/lib/settings-validation';
import { AuditService } from '@/lib/audit';

// Mock Next.js API routes
jest.mock('next/server', () => ({
  NextRequest: class MockNextRequest {
    constructor(url: string, options?: any) {
      this.url = url;
      this.method = options?.method || 'GET';
      this.headers = new Map();
      this.cookies = {
        get: jest.fn(),
        getAll: jest.fn(() => []),
        set: jest.fn(),
        delete: jest.fn(),
      };
      this.nextUrl = new URL(url);
    }
    url: string;
    method: string;
    headers: Map<string, string>;
    cookies: any;
    nextUrl: URL;
    json() { return Promise.resolve({}); }
    text() { return Promise.resolve(''); }
  },
  NextResponse: {
    json: jest.fn((data: any, options?: { status?: number }) => ({
      status: options?.status || 200,
      json: () => Promise.resolve(data),
      headers: new Map([['content-type', 'application/json']]),
    })),
    redirect: jest.fn((url: string) => ({
      status: 302,
      headers: new Map([['location', url]]),
    })),
  },
}));

// Mock authentication
jest.mock('next-auth', () => ({
  getServerSession: jest.fn(() => Promise.resolve({
    user: {
      id: 'test-admin-id',
      username: 'testadmin',
      email: 'admin@test.com',
      role: 'ADMIN',
      permissions: ['admin:manage', 'ca:manage', 'certificate:issue']
    },
    expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
  }))
}));

// Mock audit service
jest.mock('@/lib/audit', () => ({
  AuditService: {
    log: jest.fn(() => Promise.resolve())
  }
}));

describe('Admin Settings Integration Tests', () => {
  let prisma: PrismaClient;
  let testUser: any;
  let testCA: any;

  beforeAll(async () => {
    // Initialize Prisma client for tests
    prisma = new PrismaClient();

    // Create test data
    testUser = await prisma.user.create({
      data: {
        username: 'testadmin',
        email: 'admin@test.com',
        password: 'hashedpassword',
        role: 'ADMIN'
      }
    });

    testCA = await prisma.cAConfig.create({
      data: {
        name: 'Test CA',
        subjectDN: 'CN=Test CA, O=Test Organization',
        privateKey: 'encrypted-private-key',
        status: 'ACTIVE',
        validFrom: new Date(),
        validTo: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        crlNumber: 1
      }
    });
  });

  afterAll(async () => {
    // Clean up test data
    if (testCA) {
      await prisma.cAConfig.deleteMany({ where: { name: 'Test CA' } });
    }
    if (testUser) {
      await prisma.user.deleteMany({ where: { username: 'testadmin' } });
    }
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    // Clear any existing test data
    await prisma.systemConfig.deleteMany();
    await prisma.notificationSetting.deleteMany();
    await prisma.webhookDelivery.deleteMany();

    // Reset all mocks
    jest.clearAllMocks();
  });

  describe('Security Settings Integration', () => {
    it('should create and retrieve password policy settings', async () => {
      const passwordPolicy = {
        minLength: 12,
        requireUppercase: true,
        requireLowercase: true,
        requireNumbers: true,
        requireSpecialChars: true,
        preventReuse: 5,
        expiryDays: 90
      };

      // Validate policy
      const validation = SettingsValidation.validatePasswordPolicy(passwordPolicy);
      expect(validation.isValid).toBe(true);

      // Store policy in database
      await prisma.systemConfig.create({
        data: {
          key: 'passwordPolicy',
          value: JSON.stringify(passwordPolicy),
          description: 'Password policy configuration'
        }
      });

      // Retrieve and verify
      const storedPolicy = await prisma.systemConfig.findFirst({
        where: { key: 'passwordPolicy' }
      });

      expect(storedPolicy).toBeTruthy();
      expect(JSON.parse(storedPolicy!.value)).toEqual(passwordPolicy);
    });

    it('should create and retrieve session configuration', async () => {
      const sessionConfig = {
        timeoutMinutes: 30,
        maxConcurrentSessions: 3,
        extendOnActivity: true,
        rememberMeDays: 7
      };

      // Validate configuration
      const validation = SettingsValidation.validateSessionConfig(sessionConfig);
      expect(validation.isValid).toBe(true);

      // Store configuration
      await prisma.systemConfig.create({
        data: {
          key: 'sessionConfig',
          value: JSON.stringify(sessionConfig),
          description: 'Session management configuration'
        }
      });

      // Retrieve and verify
      const storedConfig = await prisma.systemConfig.findFirst({
        where: { key: 'sessionConfig' }
      });

      expect(storedConfig).toBeTruthy();
      expect(JSON.parse(storedConfig!.value)).toEqual(sessionConfig);
    });

    it('should create and retrieve audit configuration', async () => {
      const auditConfig = {
        enabled: true,
        logLevel: 'info',
        retentionDays: 365,
        alertOnSuspicious: true,
        maxLogSize: 100,
        compressOldLogs: true,
        externalLogging: false,
        logSensitiveOperations: false
      };

      // Validate configuration
      const validation = SettingsValidation.validateAuditConfig(auditConfig);
      expect(validation.isValid).toBe(true);

      // Store configuration
      await prisma.systemConfig.create({
        data: {
          key: 'auditConfig',
          value: JSON.stringify(auditConfig),
          description: 'Audit logging configuration'
        }
      });

      // Retrieve and verify
      const storedConfig = await prisma.systemConfig.findFirst({
        where: { key: 'auditConfig' }
      });

      expect(storedConfig).toBeTruthy();
      expect(JSON.parse(storedConfig!.value)).toEqual(auditConfig);
    });
  });

  describe('Certificate Authority Settings Integration', () => {
    it('should create and retrieve CA renewal policy', async () => {
      const renewalPolicy = {
        enabled: true,
        autoRenewal: true,
        renewalThresholdDays: 30,
        maxRenewalAttempts: 3,
        notificationDaysBefore: 7,
        requireApproval: false,
        backupBeforeRenewal: true,
        testRenewalFirst: true
      };

      // Validate policy
      const validation = SettingsValidation.validateCARenewalPolicy(renewalPolicy);
      expect(validation.isValid).toBe(true);

      // Store policy
      await prisma.systemConfig.create({
        data: {
          key: 'caRenewalPolicy',
          value: JSON.stringify(renewalPolicy),
          description: 'CA renewal policy configuration'
        }
      });

      // Retrieve and verify
      const storedPolicy = await prisma.systemConfig.findFirst({
        where: { key: 'caRenewalPolicy' }
      });

      expect(storedPolicy).toBeTruthy();
      expect(JSON.parse(storedPolicy!.value)).toEqual(renewalPolicy);
    });

    it('should create and retrieve certificate template', async () => {
      const certificateTemplate = {
        name: 'Web Server Certificate',
        description: 'Template for web server certificates',
        enabled: true,
        defaultValidityDays: 365,
        defaultKeySize: '2048',
        defaultAlgorithm: 'RSA',
        allowCustomExtensions: false,
        keyUsage: ['digitalSignature', 'keyEncipherment'],
        extendedKeyUsage: ['serverAuth'],
        subjectAlternativeNames: true,
        basicConstraints: {
          ca: false
        }
      };

      // Validate template
      const validation = SettingsValidation.validateCertificateTemplate(certificateTemplate);
      expect(validation.isValid).toBe(true);

      // Store template
      await prisma.systemConfig.create({
        data: {
          key: 'certificateTemplate_webServer',
          value: JSON.stringify(certificateTemplate),
          description: 'Web server certificate template'
        }
      });

      // Retrieve and verify
      const storedTemplate = await prisma.systemConfig.findFirst({
        where: { key: 'certificateTemplate_webServer' }
      });

      expect(storedTemplate).toBeTruthy();
      expect(JSON.parse(storedTemplate!.value)).toEqual(certificateTemplate);
    });
  });

  describe('Notification Settings Integration', () => {
    it('should create and retrieve SMTP configuration', async () => {
      const smtpConfig = {
        enabled: true,
        host: 'smtp.gmail.com',
        port: 587,
        secure: false,
        username: 'noreply@example.com',
        password: 'app-password',
        fromEmail: 'noreply@example.com',
        fromName: 'Certificate Authority',
        connectionTimeout: 30000,
        greetingTimeout: 30000,
        socketTimeout: 30000,
        pool: true,
        maxConnections: 5,
        rateLimit: 50
      };

      // Validate configuration
      const validation = SettingsValidation.validateSMTPConfig(smtpConfig);
      expect(validation.isValid).toBe(true);

      // Store configuration
      await prisma.systemConfig.create({
        data: {
          key: 'smtpConfig',
          value: JSON.stringify(smtpConfig),
          description: 'SMTP configuration for email notifications'
        }
      });

      // Retrieve and verify
      const storedConfig = await prisma.systemConfig.findFirst({
        where: { key: 'smtpConfig' }
      });

      expect(storedConfig).toBeTruthy();
      expect(JSON.parse(storedConfig!.value)).toEqual(smtpConfig);
    });

    it('should create and retrieve notification settings', async () => {
      const notificationSettings = {
        enabled: true,
        emailNotifications: true,
        webhookNotifications: false,
        slackNotifications: false,
        smsNotifications: false,
        notificationTypes: [
          'certificate_expiring',
          'certificate_expired',
          'security_alert'
        ],
        escalationSettings: {
          enabled: true,
          escalationDelayMinutes: 30,
          escalationRecipients: ['admin@example.com'],
          maxEscalationLevels: 3
        },
        quietHours: {
          enabled: true,
          startTime: '22:00',
          endTime: '06:00',
          timezone: 'UTC'
        }
      };

      // Store notification settings
      await prisma.systemConfig.create({
        data: {
          key: 'notificationSettings',
          value: JSON.stringify(notificationSettings),
          description: 'Notification settings configuration'
        }
      });

      // Retrieve and verify
      const storedSettings = await prisma.systemConfig.findFirst({
        where: { key: 'notificationSettings' }
      });

      expect(storedSettings).toBeTruthy();
      expect(JSON.parse(storedSettings!.value)).toEqual(notificationSettings);
    });
  });

  describe('Cross-API Integration Tests', () => {
    it('should maintain data consistency across settings updates', async () => {
      // Create initial settings
      const initialSettings = {
        passwordPolicy: {
          minLength: 8,
          requireUppercase: true,
          requireLowercase: true,
          requireNumbers: true,
          requireSpecialChars: false,
          preventReuse: 3,
          expiryDays: 60
        },
        sessionConfig: {
          timeoutMinutes: 20,
          maxConcurrentSessions: 2,
          extendOnActivity: false,
          rememberMeDays: 3
        }
      };

      // Store initial settings
      await prisma.systemConfig.createMany({
        data: [
          {
            key: 'passwordPolicy',
            value: JSON.stringify(initialSettings.passwordPolicy),
            description: 'Password policy'
          },
          {
            key: 'sessionConfig',
            value: JSON.stringify(initialSettings.sessionConfig),
            description: 'Session configuration'
          }
        ]
      });

      // Update settings
      const updatedPasswordPolicy = {
        ...initialSettings.passwordPolicy,
        minLength: 12,
        requireSpecialChars: true,
        preventReuse: 5
      };

      await prisma.systemConfig.update({
        where: { key: 'passwordPolicy' },
        data: {
          value: JSON.stringify(updatedPasswordPolicy),
          updatedAt: new Date()
        }
      });

      // Verify updates
      const updatedPolicy = await prisma.systemConfig.findFirst({
        where: { key: 'passwordPolicy' }
      });

      expect(updatedPolicy).toBeTruthy();
      expect(JSON.parse(updatedPolicy!.value)).toEqual(updatedPasswordPolicy);

      // Verify other settings remain unchanged
      const sessionConfig = await prisma.systemConfig.findFirst({
        where: { key: 'sessionConfig' }
      });

      expect(sessionConfig).toBeTruthy();
      expect(JSON.parse(sessionConfig!.value)).toEqual(initialSettings.sessionConfig);
    });

    it('should handle concurrent settings updates', async () => {
      // Create initial setting
      await prisma.systemConfig.create({
        data: {
          key: 'concurrentTest',
          value: JSON.stringify({ counter: 0 }),
          description: 'Concurrent update test'
        }
      });

      // Simulate concurrent updates
      const updates = Array.from({ length: 10 }, (_, i) => i).map(async (i) => {
        const current = await prisma.systemConfig.findFirst({
          where: { key: 'concurrentTest' }
        });

        if (current) {
          const data = JSON.parse(current.value);
          await prisma.systemConfig.update({
            where: { key: 'concurrentTest' },
            data: {
              value: JSON.stringify({ counter: data.counter + 1 }),
              updatedAt: new Date()
            }
          });
        }
      });

      // Execute concurrent updates
      await Promise.all(updates);

      // Verify final state
      const final = await prisma.systemConfig.findFirst({
        where: { key: 'concurrentTest' }
      });

      expect(final).toBeTruthy();
      const finalData = JSON.parse(final!.value);
      expect(finalData.counter).toBe(10);
    });
  });

  describe('Audit Logging Integration', () => {
    it('should log settings changes with proper metadata', async () => {
      const mockAuditLog = jest.spyOn(AuditService, 'log');

      // Create a setting change
      const newSetting = {
        key: 'testSetting',
        value: JSON.stringify({ enabled: true }),
        description: 'Test setting for audit logging'
      };

      await prisma.systemConfig.create({
        data: newSetting
      });

      // Verify audit log was called
      expect(mockAuditLog).toHaveBeenCalledWith({
        action: 'USER_UPDATED',
        userId: 'test-admin-id',
        username: 'admin@test.com',
        description: expect.stringContaining('Test setting'),
        metadata: expect.objectContaining({
          key: 'testSetting'
        })
      });
    });

    it('should track setting update history', async () => {
      const mockAuditLog = jest.spyOn(AuditService, 'log');

      // Create initial setting
      await prisma.systemConfig.create({
        data: {
          key: 'historyTest',
          value: JSON.stringify({ version: 1 }),
          description: 'Setting for history tracking'
        }
      });

      // Update setting multiple times
      for (let i = 2; i <= 3; i++) {
        await prisma.systemConfig.update({
          where: { key: 'historyTest' },
          data: {
            value: JSON.stringify({ version: i }),
            updatedAt: new Date()
          }
        });
      }

      // Verify audit logs were created for each update
      expect(mockAuditLog).toHaveBeenCalledTimes(3);
      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'USER_UPDATED',
          description: expect.stringContaining('historyTest')
        })
      );
    });
  });

  describe('Settings Validation Integration', () => {
    it('should validate all settings before storage', async () => {
      const invalidSettings = [
        { key: 'passwordPolicy', value: { minLength: 3 } }, // Too short
        { key: 'sessionConfig', value: { timeoutMinutes: 2 } }, // Too short
        { key: 'auditConfig', value: { retentionDays: 4000 } } // Too long
      ];

      const validationResults = await Promise.all(
        invalidSettings.map(async (setting) => {
          const validation = SettingsValidation.validateAllSettings({
            [setting.key]: setting.value
          });
          return validation;
        })
      );

      // All should be invalid
      validationResults.forEach(result => {
        expect(result.isValid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
      });
    });

    it('should provide security warnings for risky configurations', async () => {
      const riskySettings = {
        passwordMinLength: 6, // Below recommended
        sessionTimeout: 600,  // Very long session
        maxConcurrentSessions: 10 // High concurrent sessions
      };

      const validation = SettingsValidation.validateAllSettings(riskySettings);

      expect(validation.warnings).toBeDefined();
      expect(validation.warnings!.length).toBeGreaterThan(0);
      expect(validation.warnings).toContain('Password minimum length is below recommended security standards (8 characters)');
    });
  });

  describe('Database Transaction Integrity', () => {
    it('should maintain consistency during failed operations', async () => {
      // Create initial settings
      await prisma.systemConfig.createMany({
        data: [
          { key: 'setting1', value: JSON.stringify({ value: 1 }), description: 'Setting 1' },
          { key: 'setting2', value: JSON.stringify({ value: 2 }), description: 'Setting 2' }
        ]
      });

      // Attempt an operation that might fail
      try {
        await prisma.$transaction(async (tx) => {
          // Update first setting
          await tx.systemConfig.update({
            where: { key: 'setting1' },
            data: { value: JSON.stringify({ value: 10 }) }
          });

          // Simulate failure
          throw new Error('Simulated transaction failure');
        });
      } catch (error) {
        // Expected to fail
      }

      // Verify settings were not modified (transaction rolled back)
      const setting1 = await prisma.systemConfig.findFirst({
        where: { key: 'setting1' }
      });
      const setting2 = await prisma.systemConfig.findFirst({
        where: { key: 'setting2' }
      });

      expect(JSON.parse(setting1!.value)).toEqual({ value: 1 });
      expect(JSON.parse(setting2!.value)).toEqual({ value: 2 });
    });

    it('should handle bulk settings operations atomically', async () => {
      const bulkSettings = Array.from({ length: 5 }, (_, i) => ({
        key: `bulkSetting${i}`,
        value: JSON.stringify({ index: i }),
        description: `Bulk setting ${i}`
      }));

      // Insert bulk settings
      await prisma.systemConfig.createMany({
        data: bulkSettings
      });

      // Verify all settings were created
      const createdSettings = await prisma.systemConfig.findMany({
        where: {
          key: {
            startsWith: 'bulkSetting'
          }
        }
      });

      expect(createdSettings).toHaveLength(5);
      createdSettings.forEach((setting, index) => {
        expect(JSON.parse(setting.value)).toEqual({ index });
      });
    });
  });
});
