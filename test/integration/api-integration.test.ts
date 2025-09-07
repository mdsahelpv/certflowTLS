import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

describe('Database Integration Tests', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    // Ensure DATABASE_URL is set for tests
    process.env.DATABASE_URL = 'file:./prisma/db/custom.db';
    prisma = new PrismaClient();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    // Clean up database using transaction for atomicity
    try {
      await prisma.$transaction(async (tx) => {
        // Delete in reverse order of dependencies to avoid foreign key constraints
        await tx.certificateRevocation.deleteMany();
        await tx.certificate.deleteMany();
        await tx.cAConfig.deleteMany();
        await tx.auditLog.deleteMany();
        await tx.user.deleteMany();
      });
    } catch (error) {
      console.log('Database cleanup error:', (error as Error).message);
      // If transaction fails, try individual deletes
      try {
        await prisma.certificateRevocation.deleteMany();
        await prisma.certificate.deleteMany();
        await prisma.cAConfig.deleteMany();
        await prisma.auditLog.deleteMany();
        await prisma.user.deleteMany();
      } catch (individualError) {
        console.log('Individual cleanup also failed:', (individualError as Error).message);
      }
    }
  });

  describe('User Management', () => {
    test('should create and retrieve users', async () => {
      // Create test user
      const testUser = await prisma.user.create({
        data: {
          username: 'testuser',
          email: 'test@example.com',
          password: bcrypt.hashSync('password123', 10),
          role: 'OPERATOR',
          status: 'ACTIVE',
          name: 'Test User',
        },
      });

      expect(testUser.id).toBeDefined();
      expect(testUser.username).toBe('testuser');
      expect(testUser.email).toBe('test@example.com');
      expect(testUser.role).toBe('OPERATOR');

      // Retrieve user
      const retrievedUser = await prisma.user.findUnique({
        where: { id: testUser.id },
      });

      expect(retrievedUser).toBeDefined();
      expect(retrievedUser?.username).toBe('testuser');
    });

    test('should enforce unique constraints', async () => {
      // Create first user
      await prisma.user.create({
        data: {
          username: 'uniqueuser',
          email: 'unique@example.com',
          password: bcrypt.hashSync('password123', 10),
          role: 'VIEWER',
          status: 'ACTIVE',
        },
      });

      // Try to create user with same username - should fail
      await expect(
        prisma.user.create({
          data: {
            username: 'uniqueuser', // Same username
            email: 'different@example.com',
            password: bcrypt.hashSync('password123', 10),
            role: 'VIEWER',
            status: 'ACTIVE',
          },
        })
      ).rejects.toThrow();

      // Try to create user with same email - should fail
      await expect(
        prisma.user.create({
          data: {
            username: 'differentuser',
            email: 'unique@example.com', // Same email
            password: bcrypt.hashSync('password123', 10),
            role: 'VIEWER',
            status: 'ACTIVE',
          },
        })
      ).rejects.toThrow();
    });
  });

  describe('Certificate Authority Management', () => {
    test('should create and manage CA configurations', async () => {
      // Create test CA
      const testCA = await prisma.cAConfig.create({
        data: {
          name: 'Test CA',
          subjectDN: 'CN=test-ca.example.com,O=Test Organization,C=US',
          privateKey: '-----BEGIN PRIVATE KEY-----\nMOCK_PRIVATE_KEY\n-----END PRIVATE KEY-----',
          certificate: '-----BEGIN CERTIFICATE-----\nMOCK_CERTIFICATE\n-----END CERTIFICATE-----',
          status: 'ACTIVE',
          validFrom: new Date(),
          validTo: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
          crlDistributionPoint: 'http://localhost:3000/api/crl/download/latest',
          ocspUrl: 'http://localhost:3000/api/ocsp',
          crlNumber: 0,
        },
      });

      expect(testCA.id).toBeDefined();
      expect(testCA.name).toBe('Test CA');
      expect(testCA.status).toBe('ACTIVE');

      // Retrieve CA
      const retrievedCA = await prisma.cAConfig.findUnique({
        where: { id: testCA.id },
      });

      expect(retrievedCA).toBeDefined();
      expect(retrievedCA?.name).toBe('Test CA');
    });

    test('should find active CA', async () => {
      // Create active CA
      await prisma.cAConfig.create({
        data: {
          name: 'Active CA',
          subjectDN: 'CN=active-ca.example.com,O=Test Organization,C=US',
          privateKey: '-----BEGIN PRIVATE KEY-----\nMOCK_PRIVATE_KEY\n-----END PRIVATE KEY-----',
          certificate: '-----BEGIN CERTIFICATE-----\nMOCK_CERTIFICATE\n-----END CERTIFICATE-----',
          status: 'ACTIVE',
          validFrom: new Date(),
          validTo: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
          crlNumber: 0,
        },
      });

      // Create inactive CA
      await prisma.cAConfig.create({
        data: {
          name: 'Inactive CA',
          subjectDN: 'CN=inactive-ca.example.com,O=Test Organization,C=US',
          privateKey: '-----BEGIN PRIVATE KEY-----\nMOCK_PRIVATE_KEY\n-----END PRIVATE KEY-----',
          certificate: '-----BEGIN CERTIFICATE-----\nMOCK_CERTIFICATE\n-----END CERTIFICATE-----',
          status: 'INITIALIZING',
          validFrom: new Date(),
          validTo: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
          crlNumber: 0,
        },
      });

      // Find active CA
      const activeCA = await prisma.cAConfig.findFirst({
        where: { status: 'ACTIVE' },
      });

      expect(activeCA).toBeDefined();
      expect(activeCA?.name).toBe('Active CA');
      expect(activeCA?.status).toBe('ACTIVE');
    });
  });

  describe('Certificate Management', () => {
    let testUser: any;
    let testCA: any;

    beforeEach(async () => {
      // Create test user and CA for certificate tests
      testUser = await prisma.user.create({
        data: {
          username: 'certuser',
          email: 'cert@example.com',
          password: bcrypt.hashSync('password123', 10),
          role: 'OPERATOR',
          status: 'ACTIVE',
          name: 'Certificate User',
        },
      });

      testCA = await prisma.cAConfig.create({
        data: {
          name: 'Certificate CA',
          subjectDN: 'CN=cert-ca.example.com,O=Test Organization,C=US',
          privateKey: '-----BEGIN PRIVATE KEY-----\nMOCK_PRIVATE_KEY\n-----END PRIVATE KEY-----',
          certificate: '-----BEGIN CERTIFICATE-----\nMOCK_CERTIFICATE\n-----END CERTIFICATE-----',
          status: 'ACTIVE',
          validFrom: new Date(),
          validTo: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
          crlNumber: 0,
        },
      });
    });

    test('should create and manage certificates', async () => {
      // Create test certificate
      const testCert = await prisma.certificate.create({
        data: {
          serialNumber: 'CERT-TEST-001',
          subjectDN: 'CN=test.example.com',
          issuerDN: 'CN=cert-ca.example.com',
          certificate: '-----BEGIN CERTIFICATE-----\nMOCK_CERTIFICATE\n-----END CERTIFICATE-----',
          type: 'SERVER',
          keyAlgorithm: 'RSA',
          sans: JSON.stringify(['test.example.com']),
          validFrom: new Date(),
          validTo: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
          status: 'ACTIVE',
          issuedById: testUser.id,
          caId: testCA.id,
        },
      });

      expect(testCert.id).toBeDefined();
      expect(testCert.serialNumber).toBe('CERT-TEST-001');
      expect(testCert.subjectDN).toBe('CN=test.example.com');
      expect(testCert.status).toBe('ACTIVE');

      // Retrieve certificate with relations
      const retrievedCert = await prisma.certificate.findUnique({
        where: { id: testCert.id },
        include: { issuedBy: true, ca: true },
      });

      expect(retrievedCert).toBeDefined();
      expect(retrievedCert?.issuedBy?.username).toBe('certuser');
      expect(retrievedCert?.ca?.name).toBe('Certificate CA');
    });

    test('should enforce certificate serial number uniqueness', async () => {
      // Create first certificate
      await prisma.certificate.create({
        data: {
          serialNumber: 'UNIQUE-CERT-001',
          subjectDN: 'CN=unique1.example.com',
          issuerDN: 'CN=cert-ca.example.com',
          certificate: '-----BEGIN CERTIFICATE-----\nMOCK_CERTIFICATE\n-----END CERTIFICATE-----',
          type: 'SERVER',
          keyAlgorithm: 'RSA',
          validFrom: new Date(),
          validTo: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
          status: 'ACTIVE',
          issuedById: testUser.id,
          caId: testCA.id,
        },
      });

      // Try to create certificate with same serial number - should fail
      await expect(
        prisma.certificate.create({
          data: {
            serialNumber: 'UNIQUE-CERT-001', // Same serial number
            subjectDN: 'CN=unique2.example.com',
            issuerDN: 'CN=cert-ca.example.com',
            certificate: '-----BEGIN CERTIFICATE-----\nMOCK_CERTIFICATE\n-----END CERTIFICATE-----',
            type: 'SERVER',
            keyAlgorithm: 'RSA',
            validFrom: new Date(),
            validTo: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
            status: 'ACTIVE',
            issuedById: testUser.id,
            caId: testCA.id,
          },
        })
      ).rejects.toThrow();
    });
  });

  describe('Certificate Revocation', () => {
    let testUser: any;
    let testCA: any;
    let testCert: any;

    beforeEach(async () => {
      // Create test entities
      testUser = await prisma.user.create({
        data: {
          username: 'revokeuser',
          email: 'revoke@example.com',
          password: bcrypt.hashSync('password123', 10),
          role: 'OPERATOR',
          status: 'ACTIVE',
          name: 'Revoke User',
        },
      });

      testCA = await prisma.cAConfig.create({
        data: {
          name: 'Revoke CA',
          subjectDN: 'CN=revoke-ca.example.com,O=Test Organization,C=US',
          privateKey: '-----BEGIN PRIVATE KEY-----\nMOCK_PRIVATE_KEY\n-----END PRIVATE KEY-----',
          certificate: '-----BEGIN CERTIFICATE-----\nMOCK_CERTIFICATE\n-----END CERTIFICATE-----',
          status: 'ACTIVE',
          validFrom: new Date(),
          validTo: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
          crlNumber: 0,
        },
      });

      testCert = await prisma.certificate.create({
        data: {
          serialNumber: 'REVOKE-CERT-001',
          subjectDN: 'CN=revoke-test.example.com',
          issuerDN: 'CN=revoke-ca.example.com',
          certificate: '-----BEGIN CERTIFICATE-----\nMOCK_CERTIFICATE\n-----END CERTIFICATE-----',
          type: 'SERVER',
          keyAlgorithm: 'RSA',
          validFrom: new Date(),
          validTo: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
          status: 'ACTIVE',
          issuedById: testUser.id,
          caId: testCA.id,
        },
      });
    });

    test('should create and manage certificate revocations', async () => {
      // Create revocation record
      const revocation = await prisma.certificateRevocation.create({
        data: {
          certificateId: testCert.id,
          serialNumber: testCert.serialNumber,
          revocationDate: new Date(),
          revocationReason: 'UNSPECIFIED',
          revokedById: testUser.id,
        },
      });

      expect(revocation.id).toBeDefined();
      expect(revocation.certificateId).toBe(testCert.id);
      expect(revocation.revocationReason).toBe('UNSPECIFIED');

      // Retrieve revocation with relations
      const retrievedRevocation = await prisma.certificateRevocation.findUnique({
        where: { id: revocation.id },
        include: { certificate: true, revokedBy: true },
      });

      expect(retrievedRevocation).toBeDefined();
      expect(retrievedRevocation?.certificate?.subjectDN).toBe('CN=revoke-test.example.com');
      expect(retrievedRevocation?.revokedBy?.username).toBe('revokeuser');
    });

    test('should enforce unique certificate revocation', async () => {
      // Create first revocation
      await prisma.certificateRevocation.create({
        data: {
          certificateId: testCert.id,
          serialNumber: testCert.serialNumber,
          revocationDate: new Date(),
          revocationReason: 'UNSPECIFIED',
          revokedById: testUser.id,
        },
      });

      // Try to create another revocation for same certificate - should fail
      await expect(
        prisma.certificateRevocation.create({
          data: {
            certificateId: testCert.id, // Same certificate
            serialNumber: testCert.serialNumber,
            revocationDate: new Date(),
            revocationReason: 'KEY_COMPROMISE',
            revokedById: testUser.id,
          },
        })
      ).rejects.toThrow();
    });
  });

  describe('Audit Logging', () => {
    let testUser: any;

    beforeEach(async () => {
      testUser = await prisma.user.create({
        data: {
          username: 'audituser',
          email: 'audit@example.com',
          password: bcrypt.hashSync('password123', 10),
          role: 'OPERATOR',
          status: 'ACTIVE',
          name: 'Audit User',
        },
      });
    });

    test('should create and retrieve audit logs', async () => {
      // Create audit log
      const auditLog = await prisma.auditLog.create({
        data: {
          action: 'CERTIFICATE_ISSUED',
          userId: testUser.id,
          username: testUser.username,
          ipAddress: '127.0.0.1',
          description: 'Certificate issued for test.example.com',
          metadata: JSON.stringify({ serialNumber: 'TEST-001' }),
        },
      });

      expect(auditLog.id).toBeDefined();
      expect(auditLog.action).toBe('CERTIFICATE_ISSUED');
      expect(auditLog.userId).toBe(testUser.id);
      expect(auditLog.description).toContain('test.example.com');

      // Retrieve audit log with user relation
      const retrievedLog = await prisma.auditLog.findUnique({
        where: { id: auditLog.id },
        include: { user: true },
      });

      expect(retrievedLog).toBeDefined();
      expect(retrievedLog?.user?.username).toBe('audituser');
    });

    test('should query audit logs by various criteria', async () => {
      // Create multiple audit logs
      await prisma.auditLog.create({
        data: {
          action: 'CERTIFICATE_ISSUED',
          userId: testUser.id,
          username: testUser.username,
          description: 'Certificate issued',
        },
      });

      await prisma.auditLog.create({
        data: {
          action: 'CERTIFICATE_REVOKED',
          userId: testUser.id,
          username: testUser.username,
          description: 'Certificate revoked',
        },
      });

      // Query by user
      const userLogs = await prisma.auditLog.findMany({
        where: { userId: testUser.id },
      });
      expect(userLogs.length).toBe(2);

      // Query by action
      const issuedLogs = await prisma.auditLog.findMany({
        where: { action: 'CERTIFICATE_ISSUED' },
      });
      expect(issuedLogs.length).toBe(1);
      expect(issuedLogs[0].action).toBe('CERTIFICATE_ISSUED');
    });
  });
});
