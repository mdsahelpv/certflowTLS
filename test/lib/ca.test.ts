import { CAService } from '@/lib/ca';
import { db } from '@/lib/db';
import { CAStatus, KeyAlgorithm } from '@prisma/client';

// Mock the database
jest.mock('@/lib/db', () => ({
  db: {
    cAConfig: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      findMany: jest.fn(),
    },
    certificate: {
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      findUnique: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
      groupBy: jest.fn(),
    },
    cRL: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    certificateRevocation: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

// Mock the crypto module
jest.mock('@/lib/crypto', () => ({
  CSRUtils: {
    generateKeyPair: jest.fn(),
    generateCSR: jest.fn(),
  },
  CertificateUtils: {
    parseDN: jest.fn(),
    generateSerialNumber: jest.fn(),
    generateFingerprint: jest.fn(),
  },
  Encryption: {
    encrypt: jest.fn(),
    decrypt: jest.fn(),
  },
  X509Utils: {
    parseCertificateDates: jest.fn(),
    signCertificateFromCSR: jest.fn(),
  },
}));

// Mock the audit service
jest.mock('@/lib/audit', () => ({
  AuditService: {
    log: jest.fn(),
  },
}));

// Mock the notifications module
jest.mock('@/lib/notifications', () => ({
  publishCRLToEndpoints: jest.fn(),
}));

const mockedDb = db as jest.Mocked<typeof db>;
const mockedCrypto = require('@/lib/crypto');
const mockedAudit = require('@/lib/audit');
const mockedNotifications = require('@/lib/notifications');

describe('CAService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup default mocks
    mockedCrypto.CSRUtils.generateKeyPair.mockReturnValue({
      privateKey: 'mock-private-key',
      publicKey: 'mock-public-key',
    });
    
    mockedCrypto.CSRUtils.generateCSR.mockReturnValue('mock-csr-pem');
    mockedCrypto.CertificateUtils.parseDN.mockReturnValue({
      C: 'US',
      ST: 'California',
      L: 'San Francisco',
      O: 'Test Org',
      OU: 'IT',
      CN: 'Test CA',
    });
    
    mockedCrypto.Encryption.encrypt.mockReturnValue({
      encrypted: 'encrypted-key',
      iv: 'iv',
      tag: 'tag',
    });
    
    mockedCrypto.Encryption.decrypt.mockReturnValue('decrypted-private-key');
    
    mockedCrypto.X509Utils.parseCertificateDates.mockReturnValue({
      notBefore: new Date('2024-01-01'),
      notAfter: new Date('2025-01-01'),
    });
    
    mockedCrypto.CertificateUtils.generateSerialNumber.mockReturnValue('1234567890ABCDEF');
    
    mockedCrypto.X509Utils.signCertificateFromCSR.mockReturnValue('signed-certificate-pem');
    
    mockedCrypto.CertificateUtils.generateFingerprint.mockReturnValue('mock-fingerprint-123');
  });

  describe('initializeCA', () => {
    it('should initialize CA with RSA algorithm', async () => {
      const config = {
        subjectDN: 'C=US, ST=California, L=San Francisco, O=Test Org, OU=IT, CN=Test CA',
        keyAlgorithm: KeyAlgorithm.RSA,
        keySize: 2048,
      };

      mockedDb.cAConfig.create.mockResolvedValue({
        id: 'ca-123',
        name: 'Test CA',
        subjectDN: config.subjectDN,
        privateKey: 'encrypted-key',
        csr: 'mock-csr-pem',
        keyAlgorithm: KeyAlgorithm.RSA,
        keySize: 2048,
        status: CAStatus.INITIALIZING,
      });

      const result = await CAService.initializeCA(config);

      expect(result).toEqual({
        caId: 'ca-123',
        csr: 'mock-csr-pem',
        privateKey: 'mock-private-key',
      });

      expect(mockedCrypto.CSRUtils.generateKeyPair).toHaveBeenCalledWith(
        KeyAlgorithm.RSA,
        2048,
        undefined
      );
      
      expect(mockedDb.cAConfig.create).toHaveBeenCalledWith({
        data: {
          name: null,
          subjectDN: config.subjectDN,
          privateKey: JSON.stringify({
            encrypted: 'encrypted-key',
            iv: 'iv',
            tag: 'tag',
          }),
          csr: 'mock-csr-pem',
          keyAlgorithm: KeyAlgorithm.RSA,
          keySize: 2048,
          curve: undefined,
          status: CAStatus.INITIALIZING,
          crlDistributionPoint: 'http://localhost:3000/api/crl/download/latest',
          ocspUrl: 'http://localhost:3000/api/ocsp',
        },
      });
    });

    it('should initialize CA with ECDSA algorithm', async () => {
      const config = {
        subjectDN: 'C=US, ST=California, L=San Francisco, O=Test Org, OU=IT, CN=Test CA',
        keyAlgorithm: KeyAlgorithm.ECDSA,
        curve: 'P-256',
      };

      mockedDb.cAConfig.create.mockResolvedValue({
        id: 'ca-456',
        name: 'Test ECDSA CA',
        subjectDN: config.subjectDN,
        privateKey: 'encrypted-key',
        csr: 'mock-csr-pem',
        keyAlgorithm: KeyAlgorithm.ECDSA,
        curve: 'P-256',
        status: CAStatus.INITIALIZING,
      });

      const result = await CAService.initializeCA(config);

      expect(result).toEqual({
        caId: 'ca-456',
        csr: 'mock-csr-pem',
        privateKey: 'mock-private-key',
      });

      expect(mockedCrypto.CSRUtils.generateKeyPair).toHaveBeenCalledWith(
        KeyAlgorithm.ECDSA,
        undefined,
        'P-256'
      );
    });

    it('should log audit event when CA is initialized', async () => {
      const config = {
        subjectDN: 'C=US, ST=California, L=San Francisco, O=Test Org, OU=IT, CN=Test CA',
        keyAlgorithm: KeyAlgorithm.RSA,
        keySize: 2048,
      };

      mockedDb.cAConfig.create.mockResolvedValue({
        id: 'ca-123',
        name: 'Test CA',
        subjectDN: config.subjectDN,
        privateKey: 'encrypted-key',
        csr: 'mock-csr-pem',
        keyAlgorithm: KeyAlgorithm.RSA,
        keySize: 2048,
        status: CAStatus.INITIALIZING,
      });

      await CAService.initializeCA(config);

      expect(mockedAudit.AuditService.log).toHaveBeenCalledWith({
        action: 'CA_CSR_GENERATED',
        description: `CA CSR generated for ${config.subjectDN}`,
        metadata: { 
          subjectDN: config.subjectDN, 
          keyAlgorithm: config.keyAlgorithm 
        },
      });
    });
  });

  describe('uploadCACertificate', () => {
    it('should upload CA certificate and activate CA', async () => {
      const certificate = '-----BEGIN CERTIFICATE-----\nmock-certificate\n-----END CERTIFICATE-----';
      const certificateChain = '-----BEGIN CERTIFICATE-----\nmock-chain\n-----END CERTIFICATE-----';
      
      const existingCA = {
        id: 'ca-123',
        name: 'Test CA',
        subjectDN: 'C=US, ST=California, L=San Francisco, O=Test Org, OU=IT, CN=Test CA',
        status: CAStatus.INITIALIZING,
        crlDistributionPoint: 'https://example.com/crl',
        ocspUrl: 'https://example.com/ocsp',
      };

      mockedDb.cAConfig.findFirst.mockResolvedValue(existingCA);
      mockedDb.cAConfig.update.mockResolvedValue({
        ...existingCA,
        status: CAStatus.ACTIVE,
        certificate,
        certificateChain,
        validFrom: new Date('2024-01-01'),
        validTo: new Date('2025-01-01'),
      });

      await CAService.uploadCACertificate(certificate, undefined, certificateChain);

      expect(mockedDb.cAConfig.update).toHaveBeenCalledWith({
        where: { id: existingCA.id },
        data: {
          certificate,
          certificateChain,
          status: CAStatus.ACTIVE,
          validFrom: new Date('2024-01-01'),
          validTo: new Date('2025-01-01'),
          crlDistributionPoint: 'https://example.com/crl',
          ocspUrl: 'https://example.com/ocsp',
        },
      });

      expect(mockedAudit.AuditService.log).toHaveBeenCalledWith({
        action: 'CA_CERTIFICATE_UPLOADED',
        description: 'CA certificate uploaded and activated',
        metadata: { subjectDN: existingCA.subjectDN },
      });
    });

    it('should throw error if no CA configuration exists', async () => {
      mockedDb.cAConfig.findFirst.mockResolvedValue(null);

      await expect(
        CAService.uploadCACertificate('mock-certificate')
      ).rejects.toThrow('CA configuration not found. Please initialize CA first.');
    });
  });

  describe('getCAStatus', () => {
    it('should return CA status information', async () => {
      const mockCA = {
        id: 'ca-123',
        name: 'Test CA',
        subjectDN: 'C=US, ST=California, L=San Francisco, O=Test Org, OU=IT, CN=Test CA',
        status: CAStatus.ACTIVE,
        validFrom: new Date('2024-01-01'),
        validTo: new Date('2025-01-01'),
        certificate: 'mock-cert',
        privateKey: 'encrypted-key',
      };

      mockedDb.cAConfig.findMany.mockResolvedValue([mockCA]);
      mockedDb.certificate.groupBy.mockResolvedValue([]);

      const result = await CAService.getCAStatus();

      expect(result).toEqual([{
        id: 'ca-123',
        name: 'Test CA',
        subjectDN: 'C=US, ST=California, L=San Francisco, O=Test Org, OU=IT, CN=Test CA',
        status: CAStatus.ACTIVE,
        validFrom: new Date('2024-01-01'),
        validTo: new Date('2025-01-01'),
        certificateCount: 0,
      }]);
    });

    it('should return empty array if no CA exists', async () => {
      mockedDb.cAConfig.findMany.mockResolvedValue([]);

      const result = await CAService.getCAStatus();

      expect(result).toEqual([]);
    });
  });

  describe('getCertificates', () => {
    it('should return certificates with pagination', async () => {
      const mockCertificates = [
        {
          id: 'cert-1',
          serialNumber: '1234567890ABCDEF',
          subjectDN: 'CN=test.example.com',
          issuerDN: 'CN=Test CA',
          status: 'ACTIVE',
          validFrom: new Date('2024-01-01'),
          validTo: new Date('2025-01-01'),
        },
        {
          id: 'cert-2',
          serialNumber: 'FEDCBA0987654321',
          subjectDN: 'CN=test2.example.com',
          issuerDN: 'CN=Test CA',
          status: 'ACTIVE',
          validFrom: new Date('2024-01-01'),
          validTo: new Date('2025-01-01'),
        },
      ];

      mockedDb.certificate.findMany.mockResolvedValue(mockCertificates);
      mockedDb.certificate.count.mockResolvedValue(2);

      const result = await CAService.getCertificates({
        limit: 10,
        offset: 0,
      });

      expect(result).toEqual({ certificates: mockCertificates, total: 2 });
      expect(mockedDb.certificate.findMany).toHaveBeenCalledWith({
        take: 10,
        skip: 0,
        orderBy: { createdAt: 'desc' },
        include: {
          issuedBy: { select: { id: true, name: true, username: true } },
          revocation: { include: { revokedBy: { select: { id: true, name: true, username: true } } } },
        },
        where: {},
      });
    });

    it('should apply filters when provided', async () => {
      const filters = {
        limit: 5,
        offset: 0,
        type: 'SERVER',
        status: 'ACTIVE',
        subjectDN: 'test.example.com',
      };

      mockedDb.certificate.findMany.mockResolvedValue([]);
      mockedDb.certificate.count.mockResolvedValue(0);

      await CAService.getCertificates(filters);

      expect(mockedDb.certificate.findMany).toHaveBeenCalledWith({
        take: 5,
        skip: 0,
        where: {
          type: 'SERVER',
          status: 'ACTIVE',
          subjectDN: { contains: 'test.example.com', mode: 'insensitive' },
        },
        orderBy: { createdAt: 'desc' },
        include: {
          issuedBy: { select: { id: true, name: true, username: true } },
          revocation: { include: { revokedBy: { select: { id: true, name: true, username: true } } } },
        },
      });
    });
  });

  describe('issueCertificate', () => {
    it('should issue a new certificate', async () => {
      const mockUser = {
        id: 'user-123',
        username: 'testuser',
        role: 'OPERATOR',
        isActive: true,
      };
      
      const certificateData = {
        subjectDN: 'CN=test.example.com',
        certificateType: 'SERVER',
        keyAlgorithm: KeyAlgorithm.RSA,
        keySize: 2048,
        validityDays: 365,
        sans: ['test.example.com', '*.test.example.com'],
      };

      const mockCA = {
        id: 'ca-123',
        status: CAStatus.ACTIVE,
        certificate: 'mock-ca-cert',
        privateKey: JSON.stringify({
          encrypted: 'encrypted-ca-key',
          iv: 'iv',
          tag: 'tag',
        }),
      };

      mockedDb.cAConfig.findFirst.mockResolvedValue(mockCA);
      mockedDb.certificate.create.mockResolvedValue({
        id: 'cert-123',
        serialNumber: '1234567890ABCDEF',
        subjectDN: certificateData.subjectDN,
        status: 'ACTIVE',
      });

      const result = await CAService.issueCertificate(certificateData, mockUser.id);

      expect(result).toHaveProperty('certificate');
      expect(result).toHaveProperty('serialNumber');
      expect(result).toHaveProperty('fingerprint');
      expect(result).toHaveProperty('privateKey');

      expect(mockedDb.certificate.create).toHaveBeenCalled();
      expect(mockedAudit.AuditService.log).toHaveBeenCalledWith({
        action: 'CERTIFICATE_ISSUED',
        userId: mockUser.id,
        description: `Certificate issued for ${certificateData.subjectDN}`,
        metadata: {
          serialNumber: '1234567890ABCDEF',
          subjectDN: certificateData.subjectDN,
          certificateType: certificateData.certificateType,
          validityDays: certificateData.validityDays,
        },
      });
    });

    it('should throw error if CA is not active', async () => {
      const certificateData = {
        subjectDN: 'CN=test.example.com',
        certificateType: 'SERVER',
        keyAlgorithm: KeyAlgorithm.RSA,
        keySize: 2048,
        validityDays: 365,
      };

      mockedDb.cAConfig.findFirst.mockResolvedValue({
        id: 'ca-123',
        status: CAStatus.INITIALIZING,
      });

      await expect(
        CAService.issueCertificate(certificateData)
      ).rejects.toThrow('CA is not active. Please upload CA certificate first.');
    });
  });

  describe('revokeCertificate', () => {
    it('should revoke a certificate', async () => {
      const serialNumber = '1234567890ABCDEF';
      const reason = 'KEY_COMPROMISE';
      const userId = 'user-123';

      const mockCertificate = {
        id: 'cert-123',
        serialNumber,
        subjectDN: 'CN=test.example.com',
        status: 'ACTIVE',
        caId: 'ca-123',
      };

      const mockCA = {
        id: 'ca-123',
        status: CAStatus.ACTIVE,
        certificate: 'mock-ca-cert',
        privateKey: JSON.stringify({
          encrypted: 'encrypted-ca-key',
          iv: 'iv',
          tag: 'tag',
        }),
      };

      mockedDb.certificate.findUnique.mockResolvedValue(mockCertificate);
      mockedDb.cAConfig.findUnique.mockResolvedValue(mockCA);
      mockedDb.certificate.update.mockResolvedValue({
        ...mockCertificate,
        status: 'REVOKED',
        revokedAt: new Date(),
        revocationReason: reason,
      });

      mockedDb.certificateRevocation.create.mockResolvedValue({
        id: 'rev-123',
        certificateId: 'cert-123',
        serialNumber,
        revocationDate: new Date(),
        revocationReason: reason,
        revokedById: userId,
      });
      
      mockedDb.certificateRevocation.findMany.mockResolvedValue([]);

      await CAService.revokeCertificate(serialNumber, reason, userId);

      expect(mockedDb.certificate.update).toHaveBeenCalledWith({
        where: { serialNumber },
        data: {
          status: 'REVOKED',
          revokedAt: expect.any(Date),
          revocationReason: reason,
        },
      });

      expect(mockedAudit.AuditService.log).toHaveBeenCalledWith({
        action: 'CERTIFICATE_REVOKED',
        userId: 'user-123',
        description: `Certificate ${serialNumber} revoked`,
        metadata: {
          serialNumber,
          subjectDN: 'CN=test.example.com',
          revocationReason: reason,
        },
      });
    });

    it('should throw error if certificate not found', async () => {
      mockedDb.certificate.findUnique.mockResolvedValue(null);

      await expect(
        CAService.revokeCertificate('INVALID', 'KEY_COMPROMISE', 'user-123')
      ).rejects.toThrow('Certificate not found');
    });

    it('should throw error if certificate already revoked', async () => {
      const mockCertificate = {
        id: 'cert-123',
        serialNumber: '1234567890ABCDEF',
        status: 'REVOKED',
      };

      mockedDb.certificate.findUnique.mockResolvedValue(mockCertificate);

      await expect(
        CAService.revokeCertificate('1234567890ABCDEF', 'KEY_COMPROMISE', 'user-123')
      ).rejects.toThrow('Certificate is already revoked');
    });
  });

  describe('startCRLScheduler', () => {
    it('should start CRL scheduler', () => {
      // Mock setInterval
      const mockSetInterval = jest.spyOn(global, 'setInterval');
      
      CAService.startCRLScheduler();

      expect(mockSetInterval).toHaveBeenCalled();
      
      mockSetInterval.mockRestore();
    });
  });
});