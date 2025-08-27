import { db } from '@/lib/db';
import { AuthService } from '@/lib/auth';
import { NotificationService } from '@/lib/notifications';
import { logger } from '@/lib/logger';
import { CAStatus, KeyAlgorithm } from '@prisma/client';
import { CSRUtils, CertificateUtils, Encryption, X509Utils } from '@/lib/crypto';
import { AuditService } from '@/lib/audit';

export class SystemInitializer {
  static async initialize(): Promise<void> {
    try {
      logger.info('Initializing system...');
      
      // Create default admin user if not exists
      await this.createDefaultAdmin();
      
      // Start notification scheduler
      await this.startNotificationScheduler();
      
      // Create default system configurations
      await this.createSystemConfigs();

      // Ensure a demo CA exists and is ACTIVE (or activate existing initializing CA)
      await this.ensureDemoCA();
      
      logger.info('System initialization completed successfully');
    } catch (error) {
      logger.error('System initialization failed', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
    }
  }

  private static async createDefaultAdmin(): Promise<void> {
    try {
      const adminUsername = process.env.ADMIN_USERNAME;
      const adminPassword = process.env.ADMIN_PASSWORD;

      if (!adminUsername || !adminPassword) {
        logger.warn('ADMIN_USERNAME or ADMIN_PASSWORD not set; skipping default admin creation');
        return;
      }

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
        logger.auth.info(`Default admin user created`, { username: adminUsername });
      } else {
        logger.auth.info(`Default admin user already exists`, { username: adminUsername });
      }
    } catch (error) {
      logger.auth.error('Failed to create default admin user', {
        error: error instanceof Error ? error.message : String(error),
        username: process.env.ADMIN_USERNAME
      });
    }
  }

  private static async ensureDemoCA(): Promise<void> {
    try {
      const autoInitDisabled = process.env.DEMO_CA_AUTO_INIT === 'false';
      if (autoInitDisabled) {
        logger.ca.info('Demo CA auto-initialization disabled via DEMO_CA_AUTO_INIT=false');
        return;
      }

      // If a CA exists
      const existing = await db.cAConfig.findMany({ take: 1, orderBy: { createdAt: 'asc' } });
      if (existing.length > 0) {
        const ca = existing[0];
        if (ca.status === 'ACTIVE') {
          logger.ca.info('Active CA detected; skipping demo CA creation', { id: ca.id });
          return;
        }

        // Attempt to activate initializing CA by self-signing
        try {
          const subjectDN = ca.subjectDN || process.env.DEMO_CA_SUBJECT_DN || 'C=US,ST=California,L=San Francisco,O=Demo Organization,OU=Demo CA,CN=Demo Root CA';
          const keyAlgorithm = (ca.keyAlgorithm as any) || (process.env.DEMO_CA_ALGO || 'RSA');
          const keySize = ca.keySize || Number(process.env.DEMO_CA_RSA_BITS || '2048');
          const curve = ca.curve || process.env.DEMO_CA_EC_CURVE || 'P-256';
          const validityDays = Number(process.env.DEMO_CA_VALIDITY_DAYS || '3650');
          const crlUrl = ca.crlDistributionPoint || process.env.CRL_DISTRIBUTION_POINT || 'http://localhost:3000/api/crl/download/latest';
          const ocspUrl = ca.ocspUrl || process.env.OCSP_URL || 'http://localhost:3000/api/ocsp';

          let privateKeyPem: string | undefined;
          if (ca.privateKey) {
            try {
              const enc = JSON.parse(ca.privateKey);
              privateKeyPem = Encryption.decrypt(enc.encrypted, enc.iv, enc.tag);
            } catch {}
          }
          // If no private key, generate one and persist
          if (!privateKeyPem) {
            const { privateKey } = CSRUtils.generateKeyPair(keyAlgorithm as any, keyAlgorithm === 'RSA' ? keySize : undefined, keyAlgorithm === 'ECDSA' ? curve : undefined);
            privateKeyPem = privateKey;
            const encryptedKey = Encryption.encrypt(privateKeyPem);
            await db.cAConfig.update({ where: { id: ca.id }, data: { privateKey: JSON.stringify(encryptedKey), keyAlgorithm, keySize: keyAlgorithm === 'RSA' ? keySize : undefined, curve: keyAlgorithm === 'ECDSA' ? curve : undefined } });
          }

          // Build CSR and self-sign
          const subject = CertificateUtils.parseDN(subjectDN);
          const { publicKey } = CSRUtils.generateKeyPair(keyAlgorithm as any, keyAlgorithm === 'RSA' ? keySize : undefined, keyAlgorithm === 'ECDSA' ? curve : undefined);
          const csr = CSRUtils.generateCSR(subject, privateKeyPem, publicKey);
          const certificate = X509Utils.selfSignCSR(csr, privateKeyPem, validityDays, { crlDistributionPointUrl: crlUrl, ocspUrl });
          const { notBefore, notAfter } = X509Utils.parseCertificateDates(certificate);

          await db.cAConfig.update({
            where: { id: ca.id },
            data: {
              subjectDN,
              csr,
              certificate,
              status: 'ACTIVE',
              validFrom: notBefore,
              validTo: notAfter,
              crlDistributionPoint: crlUrl,
              ocspUrl,
            },
          });

          try {
            await AuditService.log({ action: 'CA_CERTIFICATE_UPLOADED', description: 'Initializing CA auto-activated on startup', metadata: { caId: ca.id, subjectDN } });
          } catch {}
          logger.ca.info('Initializing CA activated on startup', { id: ca.id });
          return;
        } catch (e) {
          logger.ca.warn('Failed to activate existing initializing CA on startup; will attempt to create demo CA if none', { error: e instanceof Error ? e.message : String(e), id: existing[0].id });
        }
      }

      // Defaults
      const subjectDN = process.env.DEMO_CA_SUBJECT_DN || 'C=US,ST=California,L=San Francisco,O=Demo Organization,OU=Demo CA,CN=Demo Root CA';
      const keyAlgorithm: KeyAlgorithm = (process.env.DEMO_CA_ALGO as KeyAlgorithm) || KeyAlgorithm.RSA;
      const keySize = Number(process.env.DEMO_CA_RSA_BITS || '2048');
      const curve = process.env.DEMO_CA_EC_CURVE || 'P-256';
      const validityDays = Number(process.env.DEMO_CA_VALIDITY_DAYS || '3650');
      const crlUrl = process.env.CRL_DISTRIBUTION_POINT || 'http://localhost:3000/api/crl/download/latest';
      const ocspUrl = process.env.OCSP_URL || 'http://localhost:3000/api/ocsp';

      logger.ca.info('Creating self-signed demo CA on startup');

      // Generate key pair and CSR
      const { privateKey, publicKey } = CSRUtils.generateKeyPair(keyAlgorithm, keyAlgorithm === 'RSA' ? keySize : undefined, keyAlgorithm === 'ECDSA' ? curve : undefined);
      const subject = CertificateUtils.parseDN(subjectDN);
      const csr = CSRUtils.generateCSR(subject, privateKey, publicKey);

      // Self-sign the CSR to produce a CA certificate
      const certificate = X509Utils.selfSignCSR(csr, privateKey, validityDays, {
        crlDistributionPointUrl: crlUrl,
        ocspUrl,
      });

      const { notBefore, notAfter } = X509Utils.parseCertificateDates(certificate);
      const encryptedKey = Encryption.encrypt(privateKey);

      // Store CA configuration as ACTIVE
      const ca = await db.cAConfig.create({
        data: {
          name: 'Demo CA',
          subjectDN,
          privateKey: JSON.stringify(encryptedKey),
          csr,
          certificate,
          keyAlgorithm,
          keySize: keyAlgorithm === 'RSA' ? keySize : undefined,
          curve: keyAlgorithm === 'ECDSA' ? curve : undefined,
          status: CAStatus.ACTIVE,
          validFrom: notBefore,
          validTo: notAfter,
          crlDistributionPoint: crlUrl,
          ocspUrl,
        },
      });

      await AuditService.log({
        action: 'CA_CERTIFICATE_UPLOADED',
        description: 'Demo CA initialized and activated on startup',
        metadata: { caId: ca.id, subjectDN },
      });

      logger.ca.info('Demo CA created and activated', { id: ca.id, validFrom: notBefore, validTo: notAfter });
    } catch (error) {
      logger.ca.error('Failed to create demo CA on startup', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
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
          logger.info(`System config created`, { key: config.key, value: config.value });
        }
      } catch (error) {
        logger.error(`Failed to create system config`, {
          key: config.key,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
  }

  private static async startNotificationScheduler(): Promise<void> {
    try {
      // Start the notification scheduler
      NotificationService.startNotificationScheduler();
      logger.notification.info('Notification scheduler started');
    } catch (error) {
      logger.notification.error('Failed to start notification scheduler', {
        error: error instanceof Error ? error.message : String(error)
      });
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
      logger.database.error('Database health check failed', {
        error: error instanceof Error ? error.message : String(error)
      });
    }

    try {
      // Check authentication system
      const adminCount = await db.user.count({
        where: { role: 'ADMIN' },
      });
      checks.auth = adminCount > 0;
    } catch (error) {
      logger.auth.error('Auth health check failed', {
        error: error instanceof Error ? error.message : String(error)
      });
    }

    try {
      // Check notification system
      const notificationCount = await db.notificationSetting.count();
      checks.notifications = notificationCount >= 0; // At least 0 means the table exists
    } catch (error) {
      logger.notification.error('Notifications health check failed', {
        error: error instanceof Error ? error.message : String(error)
      });
    }

    const status = Object.values(checks).every(check => check) ? 'healthy' : 'unhealthy';

    return {
      status,
      checks,
      timestamp: new Date().toISOString(),
    };
  }
}