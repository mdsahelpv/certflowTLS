import { db } from '@/lib/db';
import { AuthService } from '@/lib/auth';
import { NotificationService } from '@/lib/notifications';
import { logger } from '@/lib/logger';
import { CAStatus, KeyAlgorithm } from '@prisma/client';
import { CSRUtils, CertificateUtils, Encryption } from '@/lib/crypto';
import forge from 'node-forge';
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

      // If any CA exists (regardless of status), do nothing. Admin may manage it.
      const existing = await db.cAConfig.findMany({ take: 1 });
      if (existing.length > 0) {
        logger.ca.info('Existing CA configuration detected; skipping demo CA creation', {
          status: existing[0].status,
          id: existing[0].id,
        });
        return;
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

      // Generate key pair
      const { privateKey, publicKey } = CSRUtils.generateKeyPair(keyAlgorithm, keyAlgorithm === 'RSA' ? keySize : undefined, keyAlgorithm === 'ECDSA' ? curve : undefined);

      // Create self-signed CA certificate using forge with minimal CA extensions (basicConstraints, keyUsage, SKI/AKI)
      const cert = forge.pki.createCertificate();

      // Convert Node.js SPKI format to node-forge compatible format
      let forgePublicKey: any;
      let forgePrivateKey: any;

      try {
        // For RSA keys, convert from PKCS#8 to PKCS#1 format that node-forge expects
        if (keyAlgorithm === 'RSA') {
          // Load the private key and extract public key in node-forge format
          const pkcs8PrivateKey = forge.pki.privateKeyFromPem(privateKey);
          const rsaPrivateKey = pkcs8PrivateKey as forge.pki.rsa.PrivateKey;

          // Create RSA public key from the private key
          const rsaPublicKey = forge.pki.rsa.setPublicKey(rsaPrivateKey.n, rsaPrivateKey.e);
          forgePublicKey = rsaPublicKey;
          forgePrivateKey = rsaPrivateKey;
        } else {
          // For other algorithms, use the PEM directly
          forgePublicKey = forge.pki.publicKeyFromPem(publicKey);
          forgePrivateKey = forge.pki.privateKeyFromPem(privateKey);
        }

        cert.publicKey = forgePublicKey;
      } catch (keyError) {
        logger.ca.error('Failed to convert key formats for node-forge', {
          error: keyError instanceof Error ? keyError.message : String(keyError),
          algorithm: keyAlgorithm
        });
        throw new Error('Key format conversion failed');
      }

      cert.serialNumber = new forge.jsbn.BigInteger(forge.util.bytesToHex(forge.random.getBytesSync(16)), 16).toString(16);
      const now = new Date();
      cert.validity.notBefore = now;
      cert.validity.notAfter = new Date(now.getTime() + validityDays * 24 * 60 * 60 * 1000);
      const subjectParts = CertificateUtils.parseDN(subjectDN);
      const attrs: any[] = [];
      if (subjectParts.C) attrs.push({ name: 'countryName', value: subjectParts.C });
      if (subjectParts.ST) attrs.push({ name: 'stateOrProvinceName', value: subjectParts.ST });
      if (subjectParts.L) attrs.push({ name: 'localityName', value: subjectParts.L });
      if (subjectParts.O) attrs.push({ name: 'organizationName', value: subjectParts.O });
      if (subjectParts.OU) attrs.push({ name: 'organizationalUnitName', value: subjectParts.OU });
      if (subjectParts.CN) attrs.push({ name: 'commonName', value: subjectParts.CN });
      cert.setSubject(attrs);
      cert.setIssuer(attrs);

      // Compute Subject Key Identifier from public key
      try {
        const publicKeyDer = forge.asn1.toDer(forge.pki.publicKeyToAsn1(cert.publicKey)).getBytes();
        const sha1 = forge.md.sha1.create();
        sha1.update(publicKeyDer);
        const skiBytes = sha1.digest().getBytes();
        const extensions: any[] = [
          { name: 'basicConstraints', value: { cA: true }, critical: true },
          { name: 'keyUsage', value: { keyCertSign: true, cRLSign: true }, critical: true },
          { name: 'subjectKeyIdentifier', value: skiBytes, critical: false },
          { name: 'authorityKeyIdentifier', value: { keyIdentifier: skiBytes }, critical: false },
        ];
        try { cert.setExtensions(extensions as any); } catch {}
      } catch (extensionError) {
        logger.ca.warn('Failed to set certificate extensions, using minimal extensions', {
          error: extensionError instanceof Error ? extensionError.message : String(extensionError)
        });
        // Fallback to minimal extensions
        const minimalExtensions: any[] = [
          { name: 'basicConstraints', value: { cA: true }, critical: true },
          { name: 'keyUsage', value: { keyCertSign: true, cRLSign: true }, critical: true },
        ];
        try { cert.setExtensions(minimalExtensions as any); } catch {}
      }

      cert.sign(forgePrivateKey, forge.md.sha256.create());
      const certificate = forge.pki.certificateToPem(cert);

      const notBefore = cert.validity.notBefore;
      const notAfter = cert.validity.notAfter;
      const encryptedKey = Encryption.encrypt(privateKey);

      // Store CA configuration as ACTIVE
      const ca = await db.cAConfig.create({
        data: {
          name: 'Demo CA',
          subjectDN,
          privateKey: JSON.stringify(encryptedKey),
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
