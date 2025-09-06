/**
 * Password Expiry Notifications
 *
 * Automated system for notifying users about upcoming password expiry
 * Integrates with notification settings and user management
 */

import { db } from '@/lib/db';
import { SettingsCacheService } from './settings-cache';
import { AuditService } from './audit';
import { PasswordPolicyEnforcer } from './password-policy';

// Password expiry notification configuration
export interface PasswordExpiryConfig {
  enabled: boolean;
  daysBeforeExpiry: number[];
  notificationType: 'email' | 'in_app' | 'both';
  reminderFrequency: 'once' | 'daily' | 'weekly';
  customMessage?: string;
}

// User password expiry status
export interface UserPasswordExpiryStatus {
  userId: string;
  username: string;
  email: string;
  passwordCreatedAt: Date;
  daysUntilExpiry: number;
  isExpired: boolean;
  lastNotifiedAt?: Date;
}

// Notification result
export interface PasswordExpiryNotificationResult {
  processed: number;
  notified: number;
  errors: string[];
  notificationsSent: {
    email: number;
    inApp: number;
  };
}

// Password Expiry Notifications Service
export class PasswordExpiryNotificationsService {
  // Get password expiry configuration
  static async getExpiryConfig(): Promise<PasswordExpiryConfig> {
    try {
      const config = await SettingsCacheService.getSecurityPolicy('password_expiry_notifications');
      return config?.config || {
        enabled: true,
        daysBeforeExpiry: [30, 14, 7, 3, 1],
        notificationType: 'both',
        reminderFrequency: 'once',
        customMessage: 'Your password will expire soon. Please change it to maintain account security.'
      };
    } catch (error) {
      console.error('Error getting password expiry config:', error);
      return {
        enabled: true,
        daysBeforeExpiry: [30, 14, 7, 3, 1],
        notificationType: 'both',
        reminderFrequency: 'once',
        customMessage: 'Your password will expire soon. Please change it to maintain account security.'
      };
    }
  }

  // Update password expiry configuration
  static async updateExpiryConfig(config: PasswordExpiryConfig, userId: string, username: string): Promise<void> {
    try {
      await SettingsCacheService.setSecurityPolicy(
        'password_expiry_notifications',
        'Password Expiry Notifications',
        config,
        userId
      );

      // Log the configuration change
      await AuditService.logAuditConfigChange(
        userId,
        username,
        {}, // old config
        config
      );
    } catch (error) {
      console.error('Error updating password expiry config:', error);
      throw new Error('Failed to update password expiry configuration');
    }
  }

  // Get users with expiring passwords
  static async getUsersWithExpiringPasswords(): Promise<UserPasswordExpiryStatus[]> {
    try {
      const config = await this.getExpiryConfig();
      if (!config.enabled) {
        return [];
      }

      // Get password policy for expiry days
      const policySetting = await SettingsCacheService.getSecurityPolicy('password_policy');
      const expiryDays = policySetting?.config?.expiryDays || 90;

      // Calculate the earliest date we need to check
      const maxDaysBefore = Math.max(...config.daysBeforeExpiry);
      const checkDate = new Date();
      checkDate.setDate(checkDate.getDate() + maxDaysBefore);

      // Get users whose passwords expire within the notification window
      const users = await db.user.findMany({
        where: {
          // This would need to be adjusted based on your user schema
          // Assuming you have a passwordLastChanged or similar field
          createdAt: {
            lte: checkDate
          }
        },
        select: {
          id: true,
          username: true,
          email: true,
          createdAt: true,
          // Add any other fields you need
        }
      });

      const expiringUsers: UserPasswordExpiryStatus[] = [];

      for (const user of users) {
        // Check if user has a custom password creation date
        const customPasswordDate = await SettingsCacheService.getSecurityPolicy(`user_${user.id}_password_created`);
        const passwordCreatedAt = customPasswordDate?.config?.createdAt
          ? new Date(customPasswordDate.config.createdAt)
          : user.createdAt;

        // Calculate days until expiry
        const expiryDate = new Date(passwordCreatedAt);
        expiryDate.setDate(expiryDate.getDate() + expiryDays);
        const daysUntilExpiry = Math.ceil((expiryDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));

        // Check if password is expired or within notification window
        const isExpired = daysUntilExpiry <= 0;
        const shouldNotify = isExpired || config.daysBeforeExpiry.includes(Math.abs(daysUntilExpiry));

        if (shouldNotify) {
          // Get last notification date
          const lastNotification = await SettingsCacheService.getSecurityPolicy(`user_${user.id}_password_expiry_notified`);
          const lastNotifiedAt = lastNotification?.config?.lastNotifiedAt
            ? new Date(lastNotification.config.lastNotifiedAt)
            : undefined;

          expiringUsers.push({
            userId: user.id,
            username: user.username || user.email,
            email: user.email,
            passwordCreatedAt,
            daysUntilExpiry,
            isExpired,
            lastNotifiedAt
          });
        }
      }

      return expiringUsers.sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry);
    } catch (error) {
      console.error('Error getting users with expiring passwords:', error);
      return [];
    }
  }

  // Send password expiry notifications
  static async sendExpiryNotifications(): Promise<PasswordExpiryNotificationResult> {
    const result: PasswordExpiryNotificationResult = {
      processed: 0,
      notified: 0,
      errors: [],
      notificationsSent: {
        email: 0,
        inApp: 0
      }
    };

    try {
      const config = await this.getExpiryConfig();
      if (!config.enabled) {
        return result;
      }

      const expiringUsers = await this.getUsersWithExpiringPasswords();
      result.processed = expiringUsers.length;

      for (const user of expiringUsers) {
        try {
          // Check if we should send notification based on frequency
          const shouldSendNotification = await this.shouldSendNotification(user, config);
          if (!shouldSendNotification) {
            continue;
          }

          // Send notifications
          const notificationSent = await this.sendNotificationToUser(user, config);
          if (notificationSent) {
            result.notified++;
            result.notificationsSent.email += notificationSent.email ? 1 : 0;
            result.notificationsSent.inApp += notificationSent.inApp ? 1 : 0;

            // Update last notification date
            await this.updateLastNotificationDate(user.userId);
          }
        } catch (error) {
          result.errors.push(`Failed to notify user ${user.username}: ${error}`);
        }
      }

      // Log the notification run
      await AuditService.log({
        action: 'CONFIG_UPDATED' as any,
        username: 'system',
        description: 'Password expiry notifications sent',
        metadata: {
          processed: result.processed,
          notified: result.notified,
          notificationsSent: result.notificationsSent
        }
      });

      return result;
    } catch (error) {
      console.error('Error sending password expiry notifications:', error);
      result.errors.push(`System error: ${error}`);
      return result;
    }
  }

  // Check if notification should be sent based on frequency
  private static async shouldSendNotification(
    user: UserPasswordExpiryStatus,
    config: PasswordExpiryConfig
  ): Promise<boolean> {
    if (!user.lastNotifiedAt) {
      return true; // Never notified before
    }

    const now = new Date();
    const daysSinceLastNotification = Math.floor((now.getTime() - user.lastNotifiedAt.getTime()) / (1000 * 60 * 60 * 24));

    switch (config.reminderFrequency) {
      case 'once':
        return false; // Only send once
      case 'daily':
        return daysSinceLastNotification >= 1;
      case 'weekly':
        return daysSinceLastNotification >= 7;
      default:
        return true;
    }
  }

  // Send notification to a specific user
  private static async sendNotificationToUser(
    user: UserPasswordExpiryStatus,
    config: PasswordExpiryConfig
  ): Promise<{ email: boolean; inApp: boolean }> {
    const result = { email: false, inApp: false };

    try {
      const message = this.generateExpiryMessage(user, config);

      // Send email notification
      if (config.notificationType === 'email' || config.notificationType === 'both') {
        await this.sendEmailNotification(user, message);
        result.email = true;
      }

      // Send in-app notification
      if (config.notificationType === 'in_app' || config.notificationType === 'both') {
        await this.sendInAppNotification(user, message);
        result.inApp = true;
      }

      return result;
    } catch (error) {
      console.error(`Error sending notification to user ${user.username}:`, error);
      return result;
    }
  }

  // Generate expiry notification message
  private static generateExpiryMessage(user: UserPasswordExpiryStatus, config: PasswordExpiryConfig): string {
    const customMessage = config.customMessage || 'Your password will expire soon. Please change it to maintain account security.';

    if (user.isExpired) {
      return `Your password has expired. ${customMessage}`;
    } else {
      const daysText = user.daysUntilExpiry === 1 ? '1 day' : `${user.daysUntilExpiry} days`;
      return `Your password will expire in ${daysText}. ${customMessage}`;
    }
  }

  // Send email notification
  private static async sendEmailNotification(user: UserPasswordExpiryStatus, message: string): Promise<void> {
    // This would integrate with your email service
    // For now, we'll log it - replace with actual email sending
    console.log(`Sending email to ${user.email}: ${message}`);

    // TODO: Integrate with your email service (e.g., SendGrid, AWS SES, etc.)
    // Example:
    // await emailService.send({
    //   to: user.email,
    //   subject: 'Password Expiry Notice',
    //   body: message
    // });
  }

  // Send in-app notification
  private static async sendInAppNotification(user: UserPasswordExpiryStatus, message: string): Promise<void> {
    try {
      // Create in-app notification in database
      await db.notificationHistory.create({
        data: {
          type: 'EMAIL', // Use EMAIL type for password expiry notifications
          event: 'CERTIFICATE_EXPIRY', // Reuse existing event type
          recipient: user.email,
          subject: 'Password Expiry Notice',
          message: message,
          status: 'pending'
        }
      });
    } catch (error) {
      console.error('Error creating in-app notification:', error);
      throw error;
    }
  }

  // Update last notification date for user
  private static async updateLastNotificationDate(userId: string): Promise<void> {
    try {
      await SettingsCacheService.setSecurityPolicy(
        `user_${userId}_password_expiry_notified`,
        'User Password Expiry Notification',
        { lastNotifiedAt: new Date().toISOString() },
        'system'
      );
    } catch (error) {
      console.error('Error updating last notification date:', error);
    }
  }

  // Get password expiry statistics
  static async getExpiryStatistics(): Promise<{
    totalUsers: number;
    expiringSoon: number;
    expired: number;
    notifiedToday: number;
    config: PasswordExpiryConfig;
  }> {
    try {
      const config = await this.getExpiryConfig();
      const expiringUsers = await this.getUsersWithExpiringPasswords();

      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      let expiringSoon = 0;
      let expired = 0;
      let notifiedToday = 0;

      for (const user of expiringUsers) {
        if (user.isExpired) {
          expired++;
        } else {
          expiringSoon++;
        }

        if (user.lastNotifiedAt && user.lastNotifiedAt >= today) {
          notifiedToday++;
        }
      }

      return {
        totalUsers: expiringUsers.length,
        expiringSoon,
        expired,
        notifiedToday,
        config
      };
    } catch (error) {
      console.error('Error getting expiry statistics:', error);
      return {
        totalUsers: 0,
        expiringSoon: 0,
        expired: 0,
        notifiedToday: 0,
        config: await this.getExpiryConfig()
      };
    }
  }

  // Manual notification for specific user
  static async notifyUserPasswordExpiry(userId: string): Promise<boolean> {
    try {
      const user = await db.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          username: true,
          email: true,
          createdAt: true
        }
      });

      if (!user) {
        throw new Error('User not found');
      }

      // Get password creation date
      const customPasswordDate = await SettingsCacheService.getSecurityPolicy(`user_${user.id}_password_created`);
      const passwordCreatedAt = customPasswordDate?.config?.createdAt
        ? new Date(customPasswordDate.config.createdAt)
        : user.createdAt;

      // Get expiry policy
      const policySetting = await SettingsCacheService.getSecurityPolicy('password_policy');
      const expiryDays = policySetting?.config?.expiryDays || 90;

      const expiryDate = new Date(passwordCreatedAt);
      expiryDate.setDate(expiryDate.getDate() + expiryDays);
      const daysUntilExpiry = Math.ceil((expiryDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));

      const userStatus: UserPasswordExpiryStatus = {
        userId: user.id,
        username: user.username || user.email,
        email: user.email,
        passwordCreatedAt,
        daysUntilExpiry,
        isExpired: daysUntilExpiry <= 0
      };

      const config = await this.getExpiryConfig();
      const notificationSent = await this.sendNotificationToUser(userStatus, config);

      if (notificationSent.email || notificationSent.inApp) {
        await this.updateLastNotificationDate(userId);
        return true;
      }

      return false;
    } catch (error) {
      console.error('Error sending manual password expiry notification:', error);
      return false;
    }
  }
}

// Export utilities
export const sendPasswordExpiryNotifications = PasswordExpiryNotificationsService.sendExpiryNotifications.bind(PasswordExpiryNotificationsService);
export const getPasswordExpiryStatistics = PasswordExpiryNotificationsService.getExpiryStatistics.bind(PasswordExpiryNotificationsService);
export const notifyUserPasswordExpiry = PasswordExpiryNotificationsService.notifyUserPasswordExpiry.bind(PasswordExpiryNotificationsService);
export const updatePasswordExpiryConfig = PasswordExpiryNotificationsService.updateExpiryConfig.bind(PasswordExpiryNotificationsService);

export default PasswordExpiryNotificationsService;
