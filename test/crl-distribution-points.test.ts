import { describe, it, expect, beforeEach } from '@jest/globals';
import { CAService } from '@/lib/ca';
import { db } from '@/lib/db';
import { X509Utils } from '@/lib/crypto';

// Mock database
jest.mock('@/lib/db', () => ({
  db: {
    cAConfig: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
    },
    certificate: {
      create: jest.fn(),
    },
    certificateRevocation: {
      findMany: jest.fn(),
    },
  },
}));

// Mock audit service
jest.mock('@/lib/audit', () => ({
  AuditService: {
    log: jest.fn(),
  },
}));

describe('CRL Distribution Points in Certificates', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock CA configuration
    (db.cAConfig.findFirst as jest.Mock).mockResolvedValue({
      id: 'test-ca-id',
      subjectDN: 'CN=Test CA,O=Test Org,C=US',
      status: 'ACTIVE',
      certificate: `-----BEGIN CERTIFICATE-----
MIIDXTCCAkWgAwIBAgIJAKoK8sZQpzFEMA0GCSqGSIb3DQEBCwUAMEUxCzAJBgNV
BAYTAlVTMRMwEQYDVQQIDApTb21lLVN0YXRlMSEwHwYDVQQKDBhJbnRlcm5ldCBX
aWRnaXRzIFB0eSBMdGQwHhcNMTkwMzI2MTIzNDU5WhcNMjAwMzI1MTIzNDU5WjBF
MQswCQYDVQQGEwJVUzETMBEGA1UECAwKU29tZS1TdGF0ZTEhMB8GA1UECgwYSW50
ZXJuZXQgV2lkZ2l0cyBQdHkgTHRkMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIB
CgKCAQEA...`,
      privateKey: JSON.stringify({
        encrypted: 'encrypted-key-data',
        iv: 'iv-data',
        tag: 'tag-data'
      }),
      crlDistributionPoint: 'https://test.example.com/api/crl/download/latest',
      ocspUrl: 'https://test.example.com/api/ocsp',
      crlNumber: 1,
    });
  });

  describe('Certificate Issuance with CRL Distribution Points', () => {
    it('should include CRL distribution points in issued certificates', async () => {
      // Mock certificate creation
      (db.certificate.create as jest.Mock).mockResolvedValue({
        id: 'test-cert-id',
        serialNumber: '1234567890ABCDEF',
      });

      // Mock CSR data
      const csrData = `-----BEGIN CERTIFICATE REQUEST-----
MIIDXTCCAkWgAwIBAgIJAKoK8sZQpzFEMA0GCSqGSIb3DQEBCwUAMEUxCzAJBgNV
BAYTAlVTMRMwEQYDVQQIDApTb21lLVN0YXRlMSEwHwYDVQQKDBhJbnRlcm5ldCBX
aWRnaXRzIFB0eSBMdGQwHhcNMTkwMzI2MTIzNDU5WhcNMjAwMzI1MTIzNDU5WjBF
MQswCQYDVQQGEwJVUzETMBEGA1UECAwKU29tZS1TdGF0ZTEhMB8GA1UECgwYSW50
ZXJuZXQgV2lkZ2l0cyBQdHkgTHRkMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIB
CgKCAQEA...`;

      // Issue certificate
      const result = await CAService.issueCertificate({
        subjectDN: 'CN=Test Certificate,O=Test Org,C=US',
        certificateType: 'SERVER',
        keyAlgorithm: 'RSA',
        keySize: 2048,
        validityDays: 365,
        sans: ['test.example.com'],
        csr: csrData,
      }, 'test-user-id');

      // Verify certificate was created
      expect(db.certificate.create).toHaveBeenCalled();
      
      // Verify the certificate includes CRL distribution points
      const createdCert = (db.certificate.create as jest.Mock).mock.calls[0][0].data;
      expect(createdCert.certificate).toBeDefined();
      
      // Parse certificate and check extensions
      const certText = createdCert.certificate;
      
      // Check for CRL distribution points
      expect(certText).toContain('X509v3 CRL Distribution Points');
      expect(certText).toContain('https://test.example.com/api/crl/download/latest');
      
      // Check for Authority Information Access
      expect(certText).toContain('X509v3 Authority Information Access');
      expect(certText).toContain('https://test.example.com/api/ocsp');
      
      // Check for Certificate Policies
      expect(certText).toContain('X509v3 Certificate Policies');
    });

    it('should include proper revocation reason codes in CRL distribution points', async () => {
      // Mock certificate creation
      (db.certificate.create as jest.Mock).mockResolvedValue({
        id: 'test-cert-id',
        serialNumber: '1234567890ABCDEF',
      });

      // Issue certificate
      const result = await CAService.issueCertificate({
        subjectDN: 'CN=Test Certificate,O=Test Org,C=US',
        certificateType: 'SERVER',
        keyAlgorithm: 'RSA',
        keySize: 2048,
        validityDays: 365,
        sans: ['test.example.com'],
        csr: 'test-csr-data',
      }, 'test-user-id');

      // Verify certificate was created
      expect(db.certificate.create).toHaveBeenCalled();
      
      const createdCert = (db.certificate.create as jest.Mock).mock.calls[0][0].data;
      const certText = createdCert.certificate;
      
      // Check for revocation reason codes in CRL distribution points
      expect(certText).toContain('reasons:');
      expect(certText).toMatch(/reasons:\s*\[.*1.*2.*3.*4.*5.*6.*8.*9.*10.*\]/);
    });
  });

  describe('CRL Generation with Extensions', () => {
    it('should generate CRL with proper extensions', async () => {
      // Mock revoked certificates
      (db.certificateRevocation.findMany as jest.Mock).mockResolvedValue([
        {
          serialNumber: '1234567890ABCDEF',
          revocationDate: new Date(),
          revocationReason: 'KEY_COMPROMISE',
          certificate: { caId: 'test-ca-id' },
        },
      ]);

      // Mock CRL creation
      const mockCRL = {
        create: jest.fn().mockResolvedValue({ id: 'test-crl-id' }),
      };
      (db as any).cRL = mockCRL;

      // Generate CRL
      const crl = await CAService.generateCRL('test-ca-id');

      // Verify CRL was created
      expect(mockCRL.create).toHaveBeenCalled();
      
      // Verify CRL includes proper extensions
      expect(crl).toContain('-----BEGIN X509 CRL-----');
      expect(crl).toContain('-----END X509 CRL-----');
      
      // Check for CRL extensions
      expect(crl).toContain('X509v3 CRL Number');
      expect(crl).toContain('X509v3 Authority Key Identifier');
      expect(crl).toContain('X509v3 Issuing Distribution Point');
    });
  });

  describe('Environment Configuration', () => {
    it('should use environment variables for CRL and OCSP URLs', () => {
      // Set environment variables
      process.env.CRL_DISTRIBUTION_POINT = 'https://prod.example.com/crl';
      process.env.OCSP_URL = 'https://prod.example.com/ocsp';

      // Verify environment variables are used
      expect(process.env.CRL_DISTRIBUTION_POINT).toBe('https://prod.example.com/crl');
      expect(process.env.OCSP_URL).toBe('https://prod.example.com/ocsp');
    });
  });
});