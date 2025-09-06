import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { PrismaClient } from '@prisma/client';
import { NextRequest } from 'next/server';

// Import API route handlers
import { GET as getSecuritySettings, POST as updateSecuritySettings } from '@/app/api/admin/security/route';
import { GET as getCASettings, POST as updateCASettings } from '@/app/api/admin/ca/route';
import { GET as getNotifications, POST as updateNotifications } from '@/app/api/admin/notifications/route';
import { GET as getIntegrations, POST as updateIntegrations } from '@/app/api/admin/integrations/route';

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

describe('API Integration Full Test Suite', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = new PrismaClient();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    // Clear all test data
    await prisma.systemConfig.deleteMany();
    await prisma.user.deleteMany();
    await prisma.cAConfig.deleteMany();
    await prisma.notificationSetting.deleteMany();
    await prisma.webhookDelivery.deleteMany();

    // Create test admin user
    await prisma.user.create({
      data: {
        username: 'testadmin',
        email: 'admin@test.com',
        password: 'hashedpassword',
        role: 'ADMIN'
      }
    });
  });

  describe('Security Settings API Integration', () => {
    it('should retrieve security settings via API', async () => {
      // Create test security settings
      await prisma.systemConfig.createMany({
        data: [
          {
            key: 'passwordPolicy',
            value: JSON.stringify({
              minLength: 12,
              requireUppercase: true,
              requireLowercase: true,
              requireNumbers: true,
              requireSpecialChars: true,
              preventReuse: 5,
              expiryDays: 90
            }),
            description: 'Password policy'
          },
          {
            key: 'sessionConfig',
            value: JSON.stringify({
              timeoutMinutes: 30,
              maxConcurrentSessions: 3,
              extendOnActivity: true,
              rememberMeDays: 7
            }),
            description: 'Session configuration'
          }
        ]
      });

      // Create mock request
      const request = new NextRequest('http://localhost:3000/api/admin/security');

      // Call API
      const response = await getSecuritySettings(request);
      const result = await response.json();

      // Verify response
      expect(response.status).toBe(200);
      expect(result).toHaveProperty('passwordPolicy');
      expect(result).toHaveProperty('sessionConfig');
      expect(result.passwordPolicy.minLength).toBe(12);
      expect(result.sessionConfig.timeoutMinutes).toBe(30);
    });

    it('should update security settings via API', async () => {
      const updateData = {
        action: 'updatePasswordPolicy',
        policy: {
          minLength: 14,
          requireUppercase: true,
          requireLowercase: true,
          requireNumbers: true,
          requireSpecialChars: true,
          preventReuse: 10,
          expiryDays: 60
        }
      };

      // Create mock request
      const request = new NextRequest('http://localhost:3000/api/admin/security', {
        method: 'POST',
        body: JSON.stringify(updateData),
        headers: {
          'content-type': 'application/json'
        }
      });

      // Call API
      const response = await updateSecuritySettings(request);
      const result = await response.json();

      // Verify response
      expect(response.status).toBe(200);
      expect(result.success).toBe(true);

      // Verify database was updated
      const updatedPolicy = await prisma.systemConfig.findFirst({
        where: { key: 'passwordPolicy' }
      });

      expect(updatedPolicy).toBeTruthy();
      const policyData = JSON.parse(updatedPolicy!.value);
      expect(policyData.minLength).toBe(14);
      expect(policyData.preventReuse).toBe(10);
    });
  });

  describe('CA Settings API Integration', () => {
    it('should retrieve CA settings via API', async () => {
      // Create test CA
      await prisma.cAConfig.create({
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

      // Create test CA settings
      await prisma.systemConfig.createMany({
        data: [
          {
            key: 'caRenewalPolicy',
            value: JSON.stringify({
              enabled: true,
              autoRenewal: true,
              renewalThresholdDays: 30,
              maxRenewalAttempts: 3,
              notificationDaysBefore: 7,
              requireApproval: false,
              backupBeforeRenewal: true,
              testRenewalFirst: true
            }),
            description: 'CA renewal policy'
          }
        ]
      });

      // Create mock request
      const request = new NextRequest('http://localhost:3000/api/admin/ca');

      // Call API
      const response = await getCASettings(request);
      const result = await response.json();

      // Verify response
      expect(response.status).toBe(200);
      expect(result).toHaveProperty('caConfigs');
      expect(result).toHaveProperty('renewalPolicy');
      expect(result.caConfigs.length).toBeGreaterThan(0);
      expect(result.renewalPolicy.enabled).toBe(true);
    });

    it('should update CA renewal policy via API', async () => {
      const updateData = {
        action: 'updateRenewalPolicy',
        policy: {
          enabled: true,
          autoRenewal: false,
          renewalThresholdDays: 60,
          maxRenewalAttempts: 5,
          notificationDaysBefore: 14,
          requireApproval: true,
          backupBeforeRenewal: true,
          testRenewalFirst: true
        }
      };

      // Create mock request
      const request = new NextRequest('http://localhost:3000/api/admin/ca', {
        method: 'POST',
        body: JSON.stringify(updateData),
        headers: {
          'content-type': 'application/json'
        }
      });

      // Call API
      const response = await updateCASettings(request);
      const result = await response.json();

      // Verify response
      expect(response.status).toBe(200);
      expect(result.success).toBe(true);

      // Verify database was updated
      const updatedPolicy = await prisma.systemConfig.findFirst({
        where: { key: 'caRenewalPolicy' }
      });

      expect(updatedPolicy).toBeTruthy();
      const policyData = JSON.parse(updatedPolicy!.value);
      expect(policyData.autoRenewal).toBe(false);
      expect(policyData.renewalThresholdDays).toBe(60);
      expect(policyData.requireApproval).toBe(true);
    });
  });

  describe('Notifications API Integration', () => {
    it('should retrieve notification settings via API', async () => {
      // Create test notification settings
      await prisma.systemConfig.createMany({
        data: [
          {
            key: 'smtpConfig',
            value: JSON.stringify({
              enabled: true,
              host: 'smtp.gmail.com',
              port: 587,
              secure: false,
              username: 'noreply@example.com',
              password: 'app-password',
              fromEmail: 'noreply@example.com',
              fromName: 'Certificate Authority'
            }),
            description: 'SMTP configuration'
          },
          {
            key: 'notificationSettings',
            value: JSON.stringify({
              enabled: true,
              emailNotifications: true,
              webhookNotifications: false,
              notificationTypes: ['certificate_expiring', 'certificate_expired']
            }),
            description: 'Notification settings'
          }
        ]
      });

      // Create mock request
      const request = new NextRequest('http://localhost:3000/api/admin/notifications');

      // Call API
      const response = await getNotifications(request);
      const result = await response.json();

      // Verify response
      expect(response.status).toBe(200);
      expect(result).toHaveProperty('smtp');
      expect(result).toHaveProperty('settings');
      expect(result.smtp.enabled).toBe(true);
      expect(result.settings.emailNotifications).toBe(true);
    });

    it('should update SMTP configuration via API', async () => {
      const updateData = {
        action: 'updateSMTP',
        config: {
          enabled: true,
          host: 'smtp.office365.com',
          port: 587,
          secure: false,
          username: 'noreply@company.com',
          password: 'new-password',
          fromEmail: 'noreply@company.com',
          fromName: 'Company CA'
        }
      };

      // Create mock request
      const request = new NextRequest('http://localhost:3000/api/admin/notifications', {
        method: 'POST',
        body: JSON.stringify(updateData),
        headers: {
          'content-type': 'application/json'
        }
      });

      // Call API
      const response = await updateNotifications(request);
      const result = await response.json();

      // Verify response
      expect(response.status).toBe(200);
      expect(result.success).toBe(true);

      // Verify database was updated
      const updatedSMTP = await prisma.systemConfig.findFirst({
        where: { key: 'smtpConfig' }
      });

      expect(updatedSMTP).toBeTruthy();
      const smtpData = JSON.parse(updatedSMTP!.value);
      expect(smtpData.host).toBe('smtp.office365.com');
      expect(smtpData.username).toBe('noreply@company.com');
    });
  });

  describe('Integrations API Integration', () => {
    it('should retrieve integration settings via API', async () => {
      // Create test webhook
      await prisma.systemConfig.create({
        data: {
          key: 'webhook_test',
          value: JSON.stringify({
            id: 'webhook_test',
            name: 'Test Webhook',
            enabled: true,
            url: 'https://api.example.com/webhook',
            method: 'POST',
            events: ['alert_created', 'certificate_expiring']
          }),
          description: 'Test webhook configuration'
        }
      });

      // Create mock request
      const request = new NextRequest('http://localhost:3000/api/admin/integrations');

      // Call API
      const response = await getIntegrations(request);
      const result = await response.json();

      // Verify response
      expect(response.status).toBe(200);
      expect(result).toHaveProperty('webhooks');
      expect(result).toHaveProperty('externalIntegrations');
      expect(result).toHaveProperty('rateLimits');
      expect(result.webhooks.length).toBeGreaterThan(0);
    });

    it('should create webhook configuration via API', async () => {
      const webhookData = {
        action: 'createWebhook',
        config: {
          webhook: {
            name: 'New Test Webhook',
            description: 'Created via API test',
            enabled: true,
            url: 'https://api.test.com/webhook',
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            authentication: { type: 'none' },
            events: ['alert_created', 'certificate_expired'],
            timeout: 30000
          }
        }
      };

      // Create mock request
      const request = new NextRequest('http://localhost:3000/api/admin/integrations', {
        method: 'POST',
        body: JSON.stringify(webhookData),
        headers: {
          'content-type': 'application/json'
        }
      });

      // Call API
      const response = await updateIntegrations(request);
      const result = await response.json();

      // Verify response
      expect(response.status).toBe(200);
      expect(result.success).toBe(true);
      expect(result.result).toHaveProperty('id');

      // Verify database was updated
      const createdWebhook = await prisma.systemConfig.findFirst({
        where: { key: { startsWith: 'webhook_' } }
      });

      expect(createdWebhook).toBeTruthy();
      const webhookConfig = JSON.parse(createdWebhook!.value);
      expect(webhookConfig.name).toBe('New Test Webhook');
      expect(webhookConfig.url).toBe('https://api.test.com/webhook');
    });
  });

  describe('Cross-API Integration Workflows', () => {
    it('should handle complete admin settings workflow', async () => {
      // Step 1: Configure security settings
      const securityData = {
        action: 'updatePasswordPolicy',
        policy: {
          minLength: 12,
          requireUppercase: true,
          requireLowercase: true,
          requireNumbers: true,
          requireSpecialChars: true,
          preventReuse: 5,
          expiryDays: 90
        }
      };

      const securityRequest = new NextRequest('http://localhost:3000/api/admin/security', {
        method: 'POST',
        body: JSON.stringify(securityData),
        headers: { 'content-type': 'application/json' }
      });

      await updateSecuritySettings(securityRequest);

      // Step 2: Configure CA settings
      const caData = {
        action: 'updateRenewalPolicy',
        policy: {
          enabled: true,
          autoRenewal: true,
          renewalThresholdDays: 30,
          maxRenewalAttempts: 3,
          notificationDaysBefore: 7,
          requireApproval: false,
          backupBeforeRenewal: true,
          testRenewalFirst: true
        }
      };

      const caRequest = new NextRequest('http://localhost:3000/api/admin/ca', {
        method: 'POST',
        body: JSON.stringify(caData),
        headers: { 'content-type': 'application/json' }
      });

      await updateCASettings(caRequest);

      // Step 3: Configure notifications
      const notificationData = {
        action: 'updateSMTP',
        config: {
          enabled: true,
          host: 'smtp.gmail.com',
          port: 587,
          secure: false,
          username: 'noreply@example.com',
          password: 'app-password',
          fromEmail: 'noreply@example.com',
          fromName: 'Certificate Authority'
        }
      };

      const notificationRequest = new NextRequest('http://localhost:3000/api/admin/notifications', {
        method: 'POST',
        body: JSON.stringify(notificationData),
        headers: { 'content-type': 'application/json' }
      });

      await updateNotifications(notificationRequest);

      // Step 4: Configure integrations
      const integrationData = {
        action: 'createWebhook',
        config: {
          webhook: {
            name: 'Alert Webhook',
            description: 'Webhook for alerts',
            enabled: true,
            url: 'https://api.example.com/alerts',
            method: 'POST',
            events: ['alert_created', 'alert_escalated'],
            timeout: 30000
          }
        }
      };

      const integrationRequest = new NextRequest('http://localhost:3000/api/admin/integrations', {
        method: 'POST',
        body: JSON.stringify(integrationData),
        headers: { 'content-type': 'application/json' }
      });

      await updateIntegrations(integrationRequest);

      // Verify all settings were created
      const allSettings = await prisma.systemConfig.findMany();
      expect(allSettings.length).toBeGreaterThan(0);

      const settingKeys = allSettings.map(s => s.key);
      expect(settingKeys).toContain('passwordPolicy');
      expect(settingKeys).toContain('caRenewalPolicy');
      expect(settingKeys).toContain('smtpConfig');
      expect(settingKeys.some(key => key.startsWith('webhook_'))).toBe(true);
    });

    it('should validate settings across all APIs', async () => {
      // Test invalid data across different APIs
      const invalidSecurityData = {
        action: 'updatePasswordPolicy',
        policy: {
          minLength: 3, // Invalid: too short
          requireUppercase: true,
          requireLowercase: true,
          requireNumbers: true,
          requireSpecialChars: true,
          preventReuse: 5,
          expiryDays: 90
        }
      };

      const securityRequest = new NextRequest('http://localhost:3000/api/admin/security', {
        method: 'POST',
        body: JSON.stringify(invalidSecurityData),
        headers: { 'content-type': 'application/json' }
      });

      const securityResponse = await updateSecuritySettings(securityRequest);
      expect(securityResponse.status).toBe(400);

      // Test invalid CA data
      const invalidCAData = {
        action: 'updateRenewalPolicy',
        policy: {
          enabled: true,
          autoRenewal: true,
          renewalThresholdDays: 400, // Invalid: too long
          maxRenewalAttempts: 3,
          notificationDaysBefore: 7,
          requireApproval: false,
          backupBeforeRenewal: true,
          testRenewalFirst: true
        }
      };

      const caRequest = new NextRequest('http://localhost:3000/api/admin/ca', {
        method: 'POST',
        body: JSON.stringify(invalidCAData),
        headers: { 'content-type': 'application/json' }
      });

      const caResponse = await updateCASettings(caRequest);
      expect(caResponse.status).toBe(400);
    });

    it('should handle concurrent API requests', async () => {
      // Create multiple concurrent requests
      const requests = Array.from({ length: 5 }, (_, i) => ({
        action: 'createWebhook',
        config: {
          webhook: {
            name: `Concurrent Webhook ${i}`,
            description: `Test webhook ${i}`,
            enabled: true,
            url: `https://api${i}.example.com/webhook`,
            method: 'POST',
            events: ['alert_created'],
            timeout: 30000
          }
        }
      }));

      // Execute requests concurrently
      const responses = await Promise.all(
        requests.map(async (data) => {
          const request = new NextRequest('http://localhost:3000/api/admin/integrations', {
            method: 'POST',
            body: JSON.stringify(data),
            headers: { 'content-type': 'application/json' }
          });
          return await updateIntegrations(request);
        })
      );

      // Verify all requests succeeded
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });

      // Verify all webhooks were created
      const webhooks = await prisma.systemConfig.findMany({
        where: { key: { startsWith: 'webhook_' } }
      });

      expect(webhooks.length).toBe(5);
    });
  });

  describe('Error Handling Integration', () => {
    it('should handle authentication failures', async () => {
      // Mock authentication failure
      const originalGetServerSession = jest.requireMock('next-auth').getServerSession;
      jest.requireMock('next-auth').getServerSession.mockResolvedValueOnce(null);

      const request = new NextRequest('http://localhost:3000/api/admin/security');

      const response = await getSecuritySettings(request);
      expect(response.status).toBe(401);

      // Restore original mock
      jest.requireMock('next-auth').getServerSession = originalGetServerSession;
    });

    it('should handle insufficient permissions', async () => {
      // Mock insufficient permissions
      const originalGetServerSession = jest.requireMock('next-auth').getServerSession;
      jest.requireMock('next-auth').getServerSession.mockResolvedValueOnce({
        user: {
          id: 'test-user-id',
          username: 'testuser',
          email: 'user@test.com',
          role: 'VIEWER', // Insufficient permissions
          permissions: ['certificate:view']
        },
        expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      });

      const request = new NextRequest('http://localhost:3000/api/admin/security');

      const response = await getSecuritySettings(request);
      expect(response.status).toBe(403);

      // Restore original mock
      jest.requireMock('next-auth').getServerSession = originalGetServerSession;
    });

    it('should handle malformed JSON requests', async () => {
      const request = new NextRequest('http://localhost:3000/api/admin/security', {
        method: 'POST',
        body: 'invalid json',
        headers: { 'content-type': 'application/json' }
      });

      const response = await updateSecuritySettings(request);
      expect(response.status).toBe(500);
    });

    it('should handle database connection errors gracefully', async () => {
      // Mock database error
      const originalPrisma = prisma;
      prisma = {
        systemConfig: {
          findMany: jest.fn(() => Promise.reject(new Error('Database connection failed')))
        }
      } as any;

      const request = new NextRequest('http://localhost:3000/api/admin/security');

      const response = await getSecuritySettings(request);
      expect(response.status).toBe(500);

      // Restore original prisma
      prisma = originalPrisma;
    });
  });

  describe('Performance and Load Testing', () => {
    it('should handle multiple rapid requests', async () => {
      const requests = Array.from({ length: 10 }, () => {
        const request = new NextRequest('http://localhost:3000/api/admin/security');
        return getSecuritySettings(request);
      });

      const startTime = Date.now();
      const responses = await Promise.all(requests);
      const endTime = Date.now();

      // Verify all requests succeeded
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });

      // Verify reasonable response time (should be under 5 seconds for 10 requests)
      expect(endTime - startTime).toBeLessThan(5000);
    });

    it('should handle large payload requests', async () => {
      // Create large webhook configuration
      const largeWebhook = {
        action: 'createWebhook',
        config: {
          webhook: {
            name: 'Large Payload Webhook',
            description: 'Test webhook with large payload',
            enabled: true,
            url: 'https://api.example.com/webhook',
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            authentication: { type: 'none' },
            payload: {
              largeData: 'x'.repeat(10000), // 10KB of data
              nestedObject: {
                array: Array.from({ length: 100 }, (_, i) => ({ index: i, data: 'x'.repeat(100) }))
              }
            },
            events: ['alert_created', 'certificate_expiring', 'system_health_changed'],
            timeout: 60000
          }
        }
      };

      const request = new NextRequest('http://localhost:3000/api/admin/integrations', {
        method: 'POST',
        body: JSON.stringify(largeWebhook),
        headers: { 'content-type': 'application/json' }
      });

      const response = await updateIntegrations(request);
      expect(response.status).toBe(200);
    });
  });
});
