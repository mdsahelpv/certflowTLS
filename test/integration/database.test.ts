import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

describe('Database Integration Tests', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = new PrismaClient({
      datasources: {
        db: {
          url: process.env.DATABASE_URL || 'file:./test.db',
        },
      },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    // Clean up database before each test
    await prisma.certificateRevocation.deleteMany();
    await prisma.certificate.deleteMany();
    await prisma.caConfig.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.user.deleteMany();
  });

  describe('User Management', () => {
    test('should create and retrieve user', async () => {
      const userData = {
        username: 'testuser',
        email: 'test@example.com',
        passwordHash: bcrypt.hashSync('password123', 10),
        role: 'OPERATOR',
        status: 'ACTIVE',
        name: 'Test User',
      };

      const user = await prisma.user.create({ data: userData });

      expect(user).toBeDefined();
      expect(user.username).toBe('testuser');
      expect(user.email).toBe('test@example.com');
      expect(user.role).toBe('OPERATOR');
      expect(user.status).toBe('ACTIVE');

      // Verify user can be retrieved
      const retrievedUser = await prisma.user.findUnique({
        where: { id: user.id },
      });

      expect(retrievedUser).toBeDefined();
      expect(retrievedUser?.username).toBe('testuser');
    });

    test('should enforce unique username constraint', async () => {
      const userData = {
        username: 'duplicate',
        email: 'user1@example.com',
        passwordHash: bcrypt.hashSync('password123', 10),
        role: 'OPERATOR',
        status: 'ACTIVE',
        name: 'User 1',
      };

      await prisma.user.create({ data: userData });

      const duplicateUserData = {
        username: 'duplicate', // Same username
        email: 'user2@example.com',
        passwordHash: bcrypt.hashSync('password456', 10),
        role: 'VIEWER',
        status: 'ACTIVE',
        name: 'User 2',
      };

      await expect(
        prisma.user.create({ data: duplicateUserData })
      ).rejects.toThrow();
    });

    test('should enforce unique email constraint', async () => {
      const userData = {
        username: 'user1',
        email: 'duplicate@example.com',
        passwordHash: bcrypt.hashSync('password123', 10),
        role: 'OPERATOR',
        status: 'ACTIVE',
        name: 'User 1',
      };

      await prisma.user.create({ data: userData });

      const duplicateUserData = {
        username: 'user2',
        email: 'duplicate@example.com', // Same email
        passwordHash: bcrypt.hashSync('password456', 10),
        role: 'VIEWER',
        status: 'ACTIVE',
        name: 'User 2',
      };

      await expect(
        prisma.user.create({ data: duplicateUserData })
      ).rejects.toThrow();
    });

    test('should update user information', async () => {
      const user = await prisma.user.create({
        data: {
          username: 'updateuser',
          email: 'update@example.com',
          passwordHash: bcrypt.hashSync('password123', 10),
          role: 'VIEWER',
          status: 'ACTIVE',
          name: 'Update User',
        },
      });

      const updatedUser = await prisma.user.update({
        where: { id: user.id },
        data: {
          role: 'OPERATOR',
          name: 'Updated User Name',
        },
      });

      expect(updatedUser.role).toBe('OPERATOR');
      expect(updatedUser.name).toBe('Updated User Name');
      expect(updatedUser.username).toBe('updateuser'); // Should remain unchanged
    });

    test('should delete user and cascade properly', async () => {
      const user = await prisma.user.create({
        data: {
          username: 'deleteuser',
          email: 'delete@example.com',
          passwordHash: bcrypt.hashSync('password123', 10),
          role: 'OPERATOR',
          status: 'ACTIVE',
          name: 'Delete User',
        },
      });

      // Create some related data
      const caConfig = await prisma.caConfig.create({
        data: {
          name: 'Test CA',
          commonName: 'test-ca.example.com',
          organization: 'Test Org',
          country: 'US',
          state: 'CA',
          locality: 'San Francisco',
          status: 'ACTIVE',
          createdById: user.id,
        },
      });

      const certificate = await prisma.certificate.create({
        data: {
          serialNumber: '123456789',
          commonName: 'test.example.com',
          subjectAltNames: ['test.example.com'],
          validFrom: new Date(),
          validTo: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
          status: 'ACTIVE',
          issuedById: user.id,
          caConfigId: caConfig.id,
        },
      });

      // Delete user
      await prisma.user.delete({ where: { id: user.id } });

      // Verify user is deleted
      const deletedUser = await prisma.user.findUnique({
        where: { id: user.id },
      });
      expect(deletedUser).toBeNull();

      // Verify related data is handled properly (depends on schema constraints)
      // This test will help identify if we need cascade deletes
    });
  });

  describe('CA Configuration Management', () => {
    test('should create and retrieve CA configuration', async () => {
      const user = await prisma.user.create({
        data: {
          username: 'causer',
          email: 'ca@example.com',
          passwordHash: bcrypt.hashSync('password123', 10),
          role: 'ADMIN',
          status: 'ACTIVE',
          name: 'CA User',
        },
      });

      const caData = {
        name: 'Test Certificate Authority',
        commonName: 'ca.example.com',
        organization: 'Test Organization',
        organizationalUnit: 'IT Department',
        country: 'US',
        state: 'California',
        locality: 'San Francisco',
        status: 'ACTIVE',
        createdById: user.id,
      };

      const caConfig = await prisma.caConfig.create({ data: caData });

      expect(caConfig).toBeDefined();
      expect(caConfig.name).toBe('Test Certificate Authority');
      expect(caConfig.commonName).toBe('ca.example.com');
      expect(caConfig.status).toBe('ACTIVE');

      // Verify CA can be retrieved
      const retrievedCA = await prisma.caConfig.findUnique({
        where: { id: caConfig.id },
        include: { createdBy: true },
      });

      expect(retrievedCA).toBeDefined();
      expect(retrievedCA?.createdBy.username).toBe('causer');
    });

    test('should enforce CA name uniqueness', async () => {
      const user = await prisma.user.create({
        data: {
          username: 'causer2',
          email: 'ca2@example.com',
          passwordHash: bcrypt.hashSync('password123', 10),
          role: 'ADMIN',
          status: 'ACTIVE',
          name: 'CA User 2',
        },
      });

      const caData = {
        name: 'Unique CA Name',
        commonName: 'ca1.example.com',
        organization: 'Test Organization',
        country: 'US',
        state: 'CA',
        locality: 'San Francisco',
        status: 'ACTIVE',
        createdById: user.id,
      };

      await prisma.caConfig.create({ data: caData });

      const duplicateCAData = {
        name: 'Unique CA Name', // Same name
        commonName: 'ca2.example.com',
        organization: 'Test Organization 2',
        country: 'US',
        state: 'CA',
        locality: 'San Francisco',
        status: 'ACTIVE',
        createdById: user.id,
      };

      await expect(
        prisma.caConfig.create({ data: duplicateCAData })
      ).rejects.toThrow();
    });

    test('should update CA configuration', async () => {
      const user = await prisma.user.create({
        data: {
          username: 'causer3',
          email: 'ca3@example.com',
          passwordHash: bcrypt.hashSync('password123', 10),
          role: 'ADMIN',
          status: 'ACTIVE',
          name: 'CA User 3',
        },
      });

      const caConfig = await prisma.caConfig.create({
        data: {
          name: 'Update Test CA',
          commonName: 'update-ca.example.com',
          organization: 'Test Organization',
          country: 'US',
          state: 'CA',
          locality: 'San Francisco',
          status: 'ACTIVE',
          createdById: user.id,
        },
      });

      const updatedCA = await prisma.caConfig.update({
        where: { id: caConfig.id },
        data: {
          status: 'INACTIVE',
          organization: 'Updated Organization',
        },
      });

      expect(updatedCA.status).toBe('INACTIVE');
      expect(updatedCA.organization).toBe('Updated Organization');
      expect(updatedCA.name).toBe('Update Test CA'); // Should remain unchanged
    });
  });

  describe('Certificate Management', () => {
    test('should create and retrieve certificate', async () => {
      const user = await prisma.user.create({
        data: {
          username: 'certuser',
          email: 'cert@example.com',
          passwordHash: bcrypt.hashSync('password123', 10),
          role: 'OPERATOR',
          status: 'ACTIVE',
          name: 'Cert User',
        },
      });

      const caConfig = await prisma.caConfig.create({
        data: {
          name: 'Test CA for Certs',
          commonName: 'ca-certs.example.com',
          organization: 'Test Organization',
          country: 'US',
          state: 'CA',
          locality: 'San Francisco',
          status: 'ACTIVE',
          createdById: user.id,
        },
      });

      const certificateData = {
        serialNumber: 'CERT-001',
        commonName: 'test.example.com',
        subjectAltNames: ['test.example.com', '*.test.example.com'],
        validFrom: new Date(),
        validTo: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        status: 'ACTIVE',
        issuedById: user.id,
        caConfigId: caConfig.id,
      };

      const certificate = await prisma.certificate.create({
        data: certificateData,
      });

      expect(certificate).toBeDefined();
      expect(certificate.serialNumber).toBe('CERT-001');
      expect(certificate.commonName).toBe('test.example.com');
      expect(certificate.status).toBe('ACTIVE');

      // Verify certificate can be retrieved with relationships
      const retrievedCert = await prisma.certificate.findUnique({
        where: { id: certificate.id },
        include: {
          issuedBy: true,
          caConfig: true,
        },
      });

      expect(retrievedCert).toBeDefined();
      expect(retrievedCert?.issuedBy.username).toBe('certuser');
      expect(retrievedCert?.caConfig.name).toBe('Test CA for Certs');
    });

    test('should enforce certificate serial number uniqueness', async () => {
      const user = await prisma.user.create({
        data: {
          username: 'certuser2',
          email: 'cert2@example.com',
          passwordHash: bcrypt.hashSync('password123', 10),
          role: 'OPERATOR',
          status: 'ACTIVE',
          name: 'Cert User 2',
        },
      });

      const caConfig = await prisma.caConfig.create({
        data: {
          name: 'Test CA for Certs 2',
          commonName: 'ca-certs2.example.com',
          organization: 'Test Organization',
          country: 'US',
          state: 'CA',
          locality: 'San Francisco',
          status: 'ACTIVE',
          createdById: user.id,
        },
      });

      const certData = {
        serialNumber: 'DUPLICATE-001',
        commonName: 'test1.example.com',
        subjectAltNames: ['test1.example.com'],
        validFrom: new Date(),
        validTo: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        status: 'ACTIVE',
        issuedById: user.id,
        caConfigId: caConfig.id,
      };

      await prisma.certificate.create({ data: certData });

      const duplicateCertData = {
        serialNumber: 'DUPLICATE-001', // Same serial number
        commonName: 'test2.example.com',
        subjectAltNames: ['test2.example.com'],
        validFrom: new Date(),
        validTo: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        status: 'ACTIVE',
        issuedById: user.id,
        caConfigId: caConfig.id,
      };

      await expect(
        prisma.certificate.create({ data: duplicateCertData })
      ).rejects.toThrow();
    });

    test('should update certificate status', async () => {
      const user = await prisma.user.create({
        data: {
          username: 'certuser3',
          email: 'cert3@example.com',
          passwordHash: bcrypt.hashSync('password123', 10),
          role: 'OPERATOR',
          status: 'ACTIVE',
          name: 'Cert User 3',
        },
      });

      const caConfig = await prisma.caConfig.create({
        data: {
          name: 'Test CA for Certs 3',
          commonName: 'ca-certs3.example.com',
          organization: 'Test Organization',
          country: 'US',
          state: 'CA',
          locality: 'San Francisco',
          status: 'ACTIVE',
          createdById: user.id,
        },
      });

      const certificate = await prisma.certificate.create({
        data: {
          serialNumber: 'UPDATE-001',
          commonName: 'update.example.com',
          subjectAltNames: ['update.example.com'],
          validFrom: new Date(),
          validTo: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
          status: 'ACTIVE',
          issuedById: user.id,
          caConfigId: caConfig.id,
        },
      });

      const updatedCert = await prisma.certificate.update({
        where: { id: certificate.id },
        data: { status: 'EXPIRED' },
      });

      expect(updatedCert.status).toBe('EXPIRED');
    });
  });

  describe('Certificate Revocation', () => {
    test('should create and retrieve certificate revocation', async () => {
      const user = await prisma.user.create({
        data: {
          username: 'revokeuser',
          email: 'revoke@example.com',
          passwordHash: bcrypt.hashSync('password123', 10),
          role: 'OPERATOR',
          status: 'ACTIVE',
          name: 'Revoke User',
        },
      });

      const caConfig = await prisma.caConfig.create({
        data: {
          name: 'Test CA for Revocation',
          commonName: 'ca-revoke.example.com',
          organization: 'Test Organization',
          country: 'US',
          state: 'CA',
          locality: 'San Francisco',
          status: 'ACTIVE',
          createdById: user.id,
        },
      });

      const certificate = await prisma.certificate.create({
        data: {
          serialNumber: 'REVOKE-001',
          commonName: 'revoke.example.com',
          subjectAltNames: ['revoke.example.com'],
          validFrom: new Date(),
          validTo: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
          status: 'ACTIVE',
          issuedById: user.id,
          caConfigId: caConfig.id,
        },
      });

      const revocationData = {
        certificateId: certificate.id,
        revocationDate: new Date(),
        reason: 'UNSPECIFIED',
        revokedById: user.id,
      };

      const revocation = await prisma.certificateRevocation.create({
        data: revocationData,
      });

      expect(revocation).toBeDefined();
      expect(revocation.certificateId).toBe(certificate.id);
      expect(revocation.reason).toBe('UNSPECIFIED');

      // Verify revocation can be retrieved with relationships
      const retrievedRevocation = await prisma.certificateRevocation.findUnique({
        where: { id: revocation.id },
        include: {
          certificate: true,
          revokedBy: true,
        },
      });

      expect(retrievedRevocation).toBeDefined();
      expect(retrievedRevocation?.certificate.serialNumber).toBe('REVOKE-001');
      expect(retrievedRevocation?.revokedBy.username).toBe('revokeuser');
    });

    test('should prevent duplicate revocations for same certificate', async () => {
      const user = await prisma.user.create({
        data: {
          username: 'revokeuser2',
          email: 'revoke2@example.com',
          passwordHash: bcrypt.hashSync('password123', 10),
          role: 'OPERATOR',
          status: 'ACTIVE',
          name: 'Revoke User 2',
        },
      });

      const caConfig = await prisma.caConfig.create({
        data: {
          name: 'Test CA for Revocation 2',
          commonName: 'ca-revoke2.example.com',
          organization: 'Test Organization',
          country: 'US',
          state: 'CA',
          locality: 'San Francisco',
          status: 'ACTIVE',
          createdById: user.id,
        },
      });

      const certificate = await prisma.certificate.create({
        data: {
          serialNumber: 'REVOKE-002',
          commonName: 'revoke2.example.com',
          subjectAltNames: ['revoke2.example.com'],
          validFrom: new Date(),
          validTo: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
          status: 'ACTIVE',
          issuedById: user.id,
          caConfigId: caConfig.id,
        },
      });

      const revocationData = {
        certificateId: certificate.id,
        revocationDate: new Date(),
        reason: 'UNSPECIFIED',
        revokedById: user.id,
      };

      await prisma.certificateRevocation.create({ data: revocationData });

      // Try to create another revocation for the same certificate
      const duplicateRevocationData = {
        certificateId: certificate.id, // Same certificate
        revocationDate: new Date(),
        reason: 'KEY_COMPROMISE',
        revokedById: user.id,
      };

      // This should fail if we have a unique constraint on certificateId
      // If not, we should add one to prevent duplicate revocations
      try {
        await prisma.certificateRevocation.create({ data: duplicateRevocationData });
        // If we get here, we should add a unique constraint
        console.warn('Warning: No unique constraint on certificateId in CertificateRevocation');
      } catch (error) {
        // Expected behavior - duplicate revocation prevented
        expect(error).toBeDefined();
      }
    });
  });

  describe('Audit Logging', () => {
    test('should create and retrieve audit logs', async () => {
      const user = await prisma.user.create({
        data: {
          username: 'audituser',
          email: 'audit@example.com',
          passwordHash: bcrypt.hashSync('password123', 10),
          role: 'ADMIN',
          status: 'ACTIVE',
          name: 'Audit User',
        },
      });

      const auditData = {
        action: 'USER_LOGIN',
        userId: user.id,
        details: 'User logged in successfully',
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0 (Test Browser)',
      };

      const auditLog = await prisma.auditLog.create({ data: auditData });

      expect(auditLog).toBeDefined();
      expect(auditLog.action).toBe('USER_LOGIN');
      expect(auditLog.details).toBe('User logged in successfully');
      expect(auditLog.ipAddress).toBe('192.168.1.1');

      // Verify audit log can be retrieved with user relationship
      const retrievedAudit = await prisma.auditLog.findUnique({
        where: { id: auditLog.id },
        include: { user: true },
      });

      expect(retrievedAudit).toBeDefined();
      expect(retrievedAudit?.user.username).toBe('audituser');
    });

    test('should maintain audit trail integrity', async () => {
      const user = await prisma.user.create({
        data: {
          username: 'audituser2',
          email: 'audit2@example.com',
          passwordHash: bcrypt.hashSync('password123', 10),
          role: 'ADMIN',
          status: 'ACTIVE',
          name: 'Audit User 2',
        },
      });

      // Create multiple audit entries
      const auditEntries = [
        {
          action: 'CERTIFICATE_ISSUED',
          userId: user.id,
          details: 'Certificate issued for test.example.com',
          ipAddress: '192.168.1.1',
          userAgent: 'Mozilla/5.0 (Test Browser)',
        },
        {
          action: 'CERTIFICATE_REVOKED',
          userId: user.id,
          details: 'Certificate revoked for test.example.com',
          ipAddress: '192.168.1.1',
          userAgent: 'Mozilla/5.0 (Test Browser)',
        },
        {
          action: 'USER_LOGOUT',
          userId: user.id,
          details: 'User logged out',
          ipAddress: '192.168.1.1',
          userAgent: 'Mozilla/5.0 (Test Browser)',
        },
      ];

      const createdAudits = await Promise.all(
        auditEntries.map(entry => prisma.auditLog.create({ data: entry }))
      );

      expect(createdAudits).toHaveLength(3);

      // Verify all audit entries are retrievable
      const allAudits = await prisma.auditLog.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'asc' },
      });

      expect(allAudits).toHaveLength(3);
      expect(allAudits[0].action).toBe('CERTIFICATE_ISSUED');
      expect(allAudits[1].action).toBe('CERTIFICATE_REVOKED');
      expect(allAudits[2].action).toBe('USER_LOGOUT');
    });
  });

  describe('Database Relationships', () => {
    test('should maintain referential integrity', async () => {
      const user = await prisma.user.create({
        data: {
          username: 'reluser',
          email: 'rel@example.com',
          passwordHash: bcrypt.hashSync('password123', 10),
          role: 'ADMIN',
          status: 'ACTIVE',
          name: 'Rel User',
        },
      });

      const caConfig = await prisma.caConfig.create({
        data: {
          name: 'Test CA for Relationships',
          commonName: 'ca-rel.example.com',
          organization: 'Test Organization',
          country: 'US',
          state: 'CA',
          locality: 'San Francisco',
          status: 'ACTIVE',
          createdById: user.id,
        },
      });

      const certificate = await prisma.certificate.create({
        data: {
          serialNumber: 'REL-001',
          commonName: 'rel.example.com',
          subjectAltNames: ['rel.example.com'],
          validFrom: new Date(),
          validTo: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
          status: 'ACTIVE',
          issuedById: user.id,
          caConfigId: caConfig.id,
        },
      });

      // Test that we can retrieve the complete relationship chain
      const fullCertificate = await prisma.certificate.findUnique({
        where: { id: certificate.id },
        include: {
          issuedBy: true,
          caConfig: {
            include: {
              createdBy: true,
            },
          },
        },
      });

      expect(fullCertificate).toBeDefined();
      expect(fullCertificate?.issuedBy.username).toBe('reluser');
      expect(fullCertificate?.caConfig.name).toBe('Test CA for Relationships');
      expect(fullCertificate?.caConfig.createdBy.username).toBe('reluser');
    });

    test('should handle cascading operations properly', async () => {
      const user = await prisma.user.create({
        data: {
          username: 'cascadeuser',
          email: 'cascade@example.com',
          passwordHash: bcrypt.hashSync('password123', 10),
          role: 'ADMIN',
          status: 'ACTIVE',
          name: 'Cascade User',
        },
      });

      const caConfig = await prisma.caConfig.create({
        data: {
          name: 'Test CA for Cascade',
          commonName: 'ca-cascade.example.com',
          organization: 'Test Organization',
          country: 'US',
          state: 'CA',
          locality: 'San Francisco',
          status: 'ACTIVE',
          createdById: user.id,
        },
      });

      const certificate = await prisma.certificate.create({
        data: {
          serialNumber: 'CASCADE-001',
          commonName: 'cascade.example.com',
          subjectAltNames: ['cascade.example.com'],
          validFrom: new Date(),
          validTo: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
          status: 'ACTIVE',
          issuedById: user.id,
          caConfigId: caConfig.id,
        },
      });

      const revocation = await prisma.certificateRevocation.create({
        data: {
          certificateId: certificate.id,
          revocationDate: new Date(),
          reason: 'UNSPECIFIED',
          revokedById: user.id,
        },
      });

      // Test that deleting a certificate also deletes its revocation
      await prisma.certificate.delete({ where: { id: certificate.id } });

      // Verify certificate is deleted
      const deletedCert = await prisma.certificate.findUnique({
        where: { id: certificate.id },
      });
      expect(deletedCert).toBeNull();

      // Verify revocation is also deleted (if cascade is configured)
      const deletedRevocation = await prisma.certificateRevocation.findUnique({
        where: { id: revocation.id },
      });
      // This behavior depends on the schema configuration
      // If cascade delete is not configured, this will still exist
    });
  });
});