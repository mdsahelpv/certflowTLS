import { db } from '@/lib/db';
import { AuthService } from '@/lib/auth';
import { NotificationService } from '@/lib/notifications';

export class SystemInitializer {
  static async initialize(): Promise<void> {
    try {
      console.log('Initializing system...');
      
      // Create default admin user if not exists
      await this.createDefaultAdmin();
      
      // Start notification scheduler
      await this.startNotificationScheduler();
      
      // Create default system configurations
      await this.createSystemConfigs();
      
      console.log('System initialization completed successfully');
    } catch (error) {
      console.error('System initialization failed:', error);
    }
  }

  private static async createDefaultAdmin(): Promise<void> {
    try {
      const adminUsername = process.env.ADMIN_USERNAME || 'admin';
      const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';

      const existingAdmin = await db.user.findUnique({
        where: { username: adminUsername },
      });

      if (!existingAdmin) {
        await AuthService.createUser({
          username: adminUsername,
          email: 'admin@localhost',
          password: adminPassword,
          name: 'Default Administrator',
          role: 'ADMIN',
        });
        console.log(`Default admin user '${adminUsername}' created`);
      } else {
        console.log(`Default admin user '${adminUsername}' already exists`);
      }
    } catch (error) {
      console.error('Failed to create default admin user:', error);
    }
  }

  private static async createSystemConfigs(): Promise<void> {
    const defaultConfigs = [
      {
        key: 'CA_KEY_SIZE',
        value: '2048',
        description: 'Default RSA key size for CA certificates',
        isEncrypted: false,
      },
      {
        key: 'CERTIFICATE_VALIDITY_DAYS',
        value: '365',
        description: 'Default certificate validity period in days',
        isEncrypted: false,
      },
      {
        key: 'CRL_UPDATE_INTERVAL_HOURS',
        value: '24',
        description: 'CRL update interval in hours',
        isEncrypted: false,
      },
      {
        key: 'NOTIFICATION_THRESHOLD_DAYS',
        value: '30',
        description: 'Days before expiry to send notifications',
        isEncrypted: false,
      },
      {
        key: 'MAX_LOGIN_ATTEMPTS',
        value: '5',
        description: 'Maximum login attempts before lockout',
        isEncrypted: false,
      },
      {
        key: 'SESSION_TIMEOUT_MINUTES',
        value: '30',
        description: 'Session timeout in minutes',
        isEncrypted: false,
      },
    ];

    for (const config of defaultConfigs) {
      try {
        const existingConfig = await db.systemConfig.findUnique({
          where: { key: config.key },
        });

        if (!existingConfig) {
          await db.systemConfig.create({
            data: config,
          });
          console.log(`System config '${config.key}' created`);
        }
      } catch (error) {
        console.error(`Failed to create system config '${config.key}':`, error);
      }
    }
  }

  private static async startNotificationScheduler(): Promise<void> {
    try {
      // Start the notification scheduler
      NotificationService.startNotificationScheduler();
      console.log('Notification scheduler started');
    } catch (error) {
      console.error('Failed to start notification scheduler:', error);
    }
  }

  static async healthCheck(): Promise<{
    status: 'healthy' | 'unhealthy';
    checks: {
      database: boolean;
      auth: boolean;
      notifications: boolean;
    };
    timestamp: string;
  }> {
    const checks = {
      database: false,
      auth: false,
      notifications: false,
    };

    try {
      // Check database connectivity
      await db.$queryRaw`SELECT 1`;
      checks.database = true;
    } catch (error) {
      console.error('Database health check failed:', error);
    }

    try {
      // Check authentication system
      const adminCount = await db.user.count({
        where: { role: 'ADMIN' },
      });
      checks.auth = adminCount > 0;
    } catch (error) {
      console.error('Auth health check failed:', error);
    }

    try {
      // Check notification system
      const notificationCount = await db.notificationSetting.count();
      checks.notifications = notificationCount >= 0; // At least 0 means the table exists
    } catch (error) {
      console.error('Notifications health check failed:', error);
    }

    const status = Object.values(checks).every(check => check) ? 'healthy' : 'unhealthy';

    return {
      status,
      checks,
      timestamp: new Date().toISOString(),
    };
  }
}