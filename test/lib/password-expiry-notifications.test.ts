import { PasswordExpiryNotificationsService, sendPasswordExpiryNotifications, getPasswordExpiryStatistics } from '@/lib/password-expiry-notifications';
import { SettingsCacheService } from '@/lib/settings-cache';
import { AuditService } from '@/lib/audit';
import { db } from '@/lib/db';

// Mock dependencies
jest.mock('@/lib/settings-cache', () => ({
  SettingsCacheService: {
    getSecurityPolicy: jest.fn(),
    setSecurityPolicy: jest.fn(),
  },
}));

jest.mock('@/lib/audit', () => ({
  AuditService: {
    log: jest.fn(),
  },
}));

jest.mock('@/lib/db', () => ({
  db: {
    user: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
    notificationHistory: {
      create: jest.fn(),
    },
  },
}));

const mockedSettingsCache = SettingsCacheService as jest.Mocked<typeof SettingsCacheService>;
const mockedAuditService = AuditService as jest.Mocked<typeof AuditService>;
const mockedDb = db as jest.Mocked<typeof db>;

describe('PasswordExpiryNotificationsService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getExpiryConfig', () => {
    it('should return default config when none exists', async () => {
      mockedSettingsCache.getSecurityPolicy.mockResolvedValue(null);

      const config = await PasswordExpiryNotificationsService.getExpiryConfig();

      expect(config).toEqual({
        enabled: true,
        daysBeforeExpiry: [30, 14, 7, 3, 1],
        notificationType: 'both',
        reminderFrequency: 'once',
        customMessage: 'Your password will expire soon. Please change it to maintain account security.'
      });
    });

    it('should return stored config', async () => {
      const storedConfig = {
        enabled: false,
        daysBeforeExpiry: [14, 7, 3],
        notificationType: 'email' as const,
        reminderFrequency: 'daily' as const,
        customMessage: 'Custom message'
      };

      mockedSettingsCache.getSecurityPolicy.mockResolvedValue({
        config: storedConfig
      });

      const config = await PasswordExpiryNotificationsService.getExpiryConfig();

      expect(config).toEqual(storedConfig);
    });
  });

  describe('getUsersWithExpiringPasswords', () => {
    beforeEach(() => {
      mockedSettingsCache.getSecurityPolicy
        .mockResolvedValueOnce({ config: { expiryDays: 90 } }) // Password policy
        .mockResolvedValue(null); // User password creation date
    });

    it('should return empty array when notifications disabled', async () => {
      mockedSettingsCache.getSecurityPolicy.mockResolvedValueOnce({
        config: { enabled: false }
      });

      const users = await PasswordExpiryNotificationsService.getUsersWithExpiringPasswords();

      expect(users).toHaveLength(0);
    });

    it('should find users with expiring passwords', async () => {
      const mockUsers = [
        {
          id: 'user1',
          username: 'testuser',
          email: 'test@example.com',
          createdAt: new Date(Date.now() - 80 * 24 * 60 * 60 * 1000), // 80 days ago
        }
      ];

      mockedDb.user.findMany.mockResolvedValue(mockUsers);
      mockedSettingsCache.getSecurityPolicy.mockResolvedValue(null); // No last notification

      const users = await PasswordExpiryNotificationsService.getUsersWithExpiringPasswords();

      expect(users).toHaveLength(1);
      expect(users[0].userId).toBe('user1');
      expect(users[0].daysUntilExpiry).toBe(10); // 90 - 80 = 10 days left
    });

    it('should not include users outside notification window', async () => {
      const mockUsers = [
        {
          id: 'user1',
          username: 'testuser',
          email: 'test@example.com',
          createdAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000), // 20 days ago
        }
      ];

      mockedDb.user.findMany.mockResolvedValue(mockUsers);

      const users = await PasswordExpiryNotificationsService.getUsersWithExpiringPasswords();

      expect(users).toHaveLength(0); // 70 days left, outside 30-day notification window
    });
  });

  describe('sendExpiryNotifications', () => {
    beforeEach(() => {
      mockedSettingsCache.getSecurityPolicy.mockResolvedValue({
        config: {
          enabled: true,
          daysBeforeExpiry: [30, 14, 7, 3, 1],
          notificationType: 'both',
          reminderFrequency: 'once'
        }
      });
    });

    it('should process notifications successfully', async () => {
      const mockUsers = [
        {
          userId: 'user1',
          username: 'testuser',
          email: 'test@example.com',
          passwordCreatedAt: new Date(Date.now() - 80 * 24 * 60 * 60 * 1000),
          daysUntilExpiry: 10,
          isExpired: false,
          lastNotifiedAt: undefined
        }
      ];

      // Mock the methods
      const getUsersSpy = jest.spyOn(PasswordExpiryNotificationsService, 'getUsersWithExpiringPasswords');
      getUsersSpy.mockResolvedValue(mockUsers);

      const sendToUserSpy = jest.spyOn(PasswordExpiryNotificationsService as any, 'sendNotificationToUser');
      sendToUserSpy.mockResolvedValue({ email: true, inApp: true });

      const updateLastSpy = jest.spyOn(PasswordExpiryNotificationsService as any, 'updateLastNotificationDate');
      updateLastSpy.mockResolvedValue();

      mockedAuditService.log.mockResolvedValue({} as any);

      const result = await PasswordExpiryNotificationsService.sendExpiryNotifications();

      expect(result.processed).toBe(1);
      expect(result.notified).toBe(1);
      expect(result.notificationsSent.email).toBe(1);
      expect(result.notificationsSent.inApp).toBe(1);
    });

    it('should handle errors gracefully', async () => {
      const getUsersSpy = jest.spyOn(PasswordExpiryNotificationsService, 'getUsersWithExpiringPasswords');
      getUsersSpy.mockRejectedValue(new Error('Database error'));

      const result = await PasswordExpiryNotificationsService.sendExpiryNotifications();

      expect(result.processed).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('System error');
    });
  });

  describe('sendNotificationToUser', () => {
    it('should send both email and in-app notifications', async () => {
      const user = {
        userId: 'user1',
        username: 'testuser',
        email: 'test@example.com',
        passwordCreatedAt: new Date(),
        daysUntilExpiry: 7,
        isExpired: false,
        lastNotifiedAt: undefined
      };

      const config = {
        enabled: true,
        daysBeforeExpiry: [30, 14, 7, 3, 1],
        notificationType: 'both' as const,
        reminderFrequency: 'once' as const,
        customMessage: 'Test message'
      };

      // Mock notification creation
      mockedDb.notificationHistory.create.mockResolvedValue({} as any);

      const result = await (PasswordExpiryNotificationsService as any).sendNotificationToUser(user, config);

      expect(result).toEqual({ email: true, inApp: true });
      expect(mockedDb.notificationHistory.create).toHaveBeenCalledWith({
        data: {
          type: 'EMAIL',
          event: 'CERTIFICATE_EXPIRY',
          recipient: 'test@example.com',
          subject: 'Password Expiry Notice',
          message: expect.stringContaining('7 days'),
          status: 'pending'
        }
      });
    });

    it('should handle expired passwords correctly', async () => {
      const user = {
        userId: 'user1',
        username: 'testuser',
        email: 'test@example.com',
        passwordCreatedAt: new Date(),
        daysUntilExpiry: -5,
        isExpired: true,
        lastNotifiedAt: undefined
      };

      const config = {
        enabled: true,
        daysBeforeExpiry: [30, 14, 7, 3, 1],
        notificationType: 'email' as const,
        reminderFrequency: 'once' as const,
        customMessage: 'Test message'
      };

      mockedDb.notificationHistory.create.mockResolvedValue({} as any);

      const result = await (PasswordExpiryNotificationsService as any).sendNotificationToUser(user, config);

      expect(result).toEqual({ email: true, inApp: false });
      const createCall = mockedDb.notificationHistory.create.mock.calls[0][0].data;
      expect(createCall.message).toContain('has expired');
    });
  });

  describe('generateExpiryMessage', () => {
    it('should generate message for expiring password', () => {
      const user = {
        userId: 'user1',
        username: 'testuser',
        email: 'test@example.com',
        passwordCreatedAt: new Date(),
        daysUntilExpiry: 7,
        isExpired: false,
        lastNotifiedAt: undefined
      };

      const config = {
        enabled: true,
        daysBeforeExpiry: [30, 14, 7, 3, 1],
        notificationType: 'both' as const,
        reminderFrequency: 'once' as const,
        customMessage: 'Custom message'
      };

      const message = (PasswordExpiryNotificationsService as any).generateExpiryMessage(user, config);

      expect(message).toContain('7 days');
      expect(message).toContain('Custom message');
    });

    it('should generate message for expired password', () => {
      const user = {
        userId: 'user1',
        username: 'testuser',
        email: 'test@example.com',
        passwordCreatedAt: new Date(),
        daysUntilExpiry: -1,
        isExpired: true,
        lastNotifiedAt: undefined
      };

      const config = {
        enabled: true,
        daysBeforeExpiry: [30, 14, 7, 3, 1],
        notificationType: 'both' as const,
        reminderFrequency: 'once' as const,
        customMessage: 'Custom message'
      };

      const message = (PasswordExpiryNotificationsService as any).generateExpiryMessage(user, config);

      expect(message).toContain('has expired');
      expect(message).toContain('Custom message');
    });
  });

  describe('shouldSendNotification', () => {
    it('should send notification for first time', () => {
      const user = {
        userId: 'user1',
        username: 'testuser',
        email: 'test@example.com',
        passwordCreatedAt: new Date(),
        daysUntilExpiry: 7,
        isExpired: false,
        lastNotifiedAt: undefined
      };

      const config = {
        enabled: true,
        daysBeforeExpiry: [30, 14, 7, 3, 1],
        notificationType: 'both' as const,
        reminderFrequency: 'once' as const,
        customMessage: 'Test message'
      };

      const result = (PasswordExpiryNotificationsService as any).shouldSendNotification(user, config);

      expect(result).toBe(true);
    });

    it('should not send notification for once frequency after first notification', () => {
      const user = {
        userId: 'user1',
        username: 'testuser',
        email: 'test@example.com',
        passwordCreatedAt: new Date(),
        daysUntilExpiry: 7,
        isExpired: false,
        lastNotifiedAt: new Date()
      };

      const config = {
        enabled: true,
        daysBeforeExpiry: [30, 14, 7, 3, 1],
        notificationType: 'both' as const,
        reminderFrequency: 'once' as const,
        customMessage: 'Test message'
      };

      const result = (PasswordExpiryNotificationsService as any).shouldSendNotification(user, config);

      expect(result).toBe(false);
    });

    it('should send daily reminders', () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      const user = {
        userId: 'user1',
        username: 'testuser',
        email: 'test@example.com',
        passwordCreatedAt: new Date(),
        daysUntilExpiry: 7,
        isExpired: false,
        lastNotifiedAt: yesterday
      };

      const config = {
        enabled: true,
        daysBeforeExpiry: [30, 14, 7, 3, 1],
        notificationType: 'both' as const,
        reminderFrequency: 'daily' as const,
        customMessage: 'Test message'
      };

      const result = (PasswordExpiryNotificationsService as any).shouldSendNotification(user, config);

      expect(result).toBe(true);
    });
  });

  describe('getExpiryStatistics', () => {
    it('should return comprehensive statistics', async () => {
      const mockUsers = [
        {
          userId: 'user1',
          username: 'testuser',
          email: 'test@example.com',
          passwordCreatedAt: new Date(),
          daysUntilExpiry: 7,
          isExpired: false,
          lastNotifiedAt: new Date()
        },
        {
          userId: 'user2',
          username: 'testuser2',
          email: 'test2@example.com',
          passwordCreatedAt: new Date(),
          daysUntilExpiry: -1,
          isExpired: true,
          lastNotifiedAt: undefined
        }
      ];

      const getUsersSpy = jest.spyOn(PasswordExpiryNotificationsService, 'getUsersWithExpiringPasswords');
      getUsersSpy.mockResolvedValue(mockUsers);

      const config = {
        enabled: true,
        daysBeforeExpiry: [30, 14, 7, 3, 1],
        notificationType: 'both' as const,
        reminderFrequency: 'once' as const,
        customMessage: 'Test message'
      };

      const getConfigSpy = jest.spyOn(PasswordExpiryNotificationsService, 'getExpiryConfig');
      getConfigSpy.mockResolvedValue(config);

      const stats = await PasswordExpiryNotificationsService.getExpiryStatistics();

      expect(stats.totalUsers).toBe(2);
      expect(stats.expiringSoon).toBe(1);
      expect(stats.expired).toBe(1);
      expect(stats.notifiedToday).toBe(1);
      expect(stats.config).toEqual(config);
    });
  });

  describe('notifyUserPasswordExpiry', () => {
    it('should send notification to specific user', async () => {
      const mockUser = {
        id: 'user1',
        username: 'testuser',
        email: 'test@example.com',
        createdAt: new Date(Date.now() - 80 * 24 * 60 * 60 * 1000)
      };

      mockedDb.user.findUnique.mockResolvedValue(mockUser);
      mockedSettingsCache.getSecurityPolicy
        .mockResolvedValueOnce({ config: { createdAt: mockUser.createdAt.toISOString() } })
        .mockResolvedValueOnce({ config: { expiryDays: 90 } })
        .mockResolvedValue({
          config: {
            enabled: true,
            daysBeforeExpiry: [30, 14, 7, 3, 1],
            notificationType: 'both',
            reminderFrequency: 'once'
          }
        });

      const sendToUserSpy = jest.spyOn(PasswordExpiryNotificationsService as any, 'sendNotificationToUser');
      sendToUserSpy.mockResolvedValue({ email: true, inApp: true });

      const updateLastSpy = jest.spyOn(PasswordExpiryNotificationsService as any, 'updateLastNotificationDate');
      updateLastSpy.mockResolvedValue();

      const result = await PasswordExpiryNotificationsService.notifyUserPasswordExpiry('user1');

      expect(result).toBe(true);
      expect(sendToUserSpy).toHaveBeenCalled();
      expect(updateLastSpy).toHaveBeenCalled();
    });

    it('should return false for non-existent user', async () => {
      mockedDb.user.findUnique.mockResolvedValue(null);

      const result = await PasswordExpiryNotificationsService.notifyUserPasswordExpiry('nonexistent');

      expect(result).toBe(false);
    });
  });
});

// Test utility functions
describe('Password Expiry Notification Utilities', () => {
  describe('sendPasswordExpiryNotifications', () => {
    it('should be accessible as a utility function', async () => {
      const sendSpy = jest.spyOn(PasswordExpiryNotificationsService, 'sendExpiryNotifications');
      sendSpy.mockResolvedValue({
        processed: 0,
        notified: 0,
        errors: [],
        notificationsSent: { email: 0, inApp: 0 }
      });

      const result = await sendPasswordExpiryNotifications();

      expect(result).toHaveProperty('processed');
      expect(result).toHaveProperty('notified');
    });
  });

  describe('getPasswordExpiryStatistics', () => {
    it('should be accessible as a utility function', async () => {
      const statsSpy = jest.spyOn(PasswordExpiryNotificationsService, 'getExpiryStatistics');
      statsSpy.mockResolvedValue({
        totalUsers: 0,
        expiringSoon: 0,
        expired: 0,
        notifiedToday: 0,
        config: {
          enabled: true,
          daysBeforeExpiry: [30, 14, 7, 3, 1],
          notificationType: 'both',
          reminderFrequency: 'once'
        }
      });

      const result = await getPasswordExpiryStatistics();

      expect(result).toHaveProperty('totalUsers');
      expect(result).toHaveProperty('expiringSoon');
      expect(result).toHaveProperty('expired');
    });
  });
});
