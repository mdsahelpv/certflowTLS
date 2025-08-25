import { Encryption, CertificateUtils, CSRUtils, CRLUtils, X509Utils } from '@/lib/crypto'
import forge from 'node-forge'

// We will not mock node-forge for these tests, as they are integration tests for the crypto logic.
// const mockedForge = forge as jest.Mocked<typeof forge>

describe('Encryption', () => {
  const originalKey = process.env.ENCRYPTION_KEY
  
  beforeEach(() => {
    process.env.ENCRYPTION_KEY = 'test-32-character-encryption-key'
    jest.clearAllMocks()
  })

  afterEach(() => {
    process.env.ENCRYPTION_KEY = originalKey
  })

  describe('encrypt', () => {
    it('should encrypt text with AES-256-GCM', () => {
      const text = 'sensitive data'
      
      // Mock crypto.randomBytes
      const mockRandomBytes = jest.spyOn(require('crypto'), 'randomBytes')
      mockRandomBytes.mockReturnValue(Buffer.from('1234567890123456'))
      
      // Mock createCipheriv
      const mockCipher = {
        update: jest.fn().mockReturnValue(Buffer.from('encrypted')),
        final: jest.fn().mockReturnValue(Buffer.from('final')),
        getAuthTag: jest.fn().mockReturnValue(Buffer.from('auth-tag')),
      }
      const mockCreateCipheriv = jest.spyOn(require('crypto'), 'createCipheriv')
      mockCreateCipheriv.mockReturnValue(mockCipher as any)
      
      const result = Encryption.encrypt(text)
      
      expect(result).toHaveProperty('encrypted')
      expect(result).toHaveProperty('iv')
      expect(result).toHaveProperty('tag')
      expect(mockCreateCipheriv).toHaveBeenCalledWith('aes-256-gcm', expect.any(Buffer), expect.any(Buffer))

      // Restore the mock
      mockRandomBytes.mockRestore()
    })

    it('should throw error in production without encryption key', () => {
      process.env.NODE_ENV = 'production'
      delete process.env.ENCRYPTION_KEY
      
      expect(() => Encryption.encrypt('test')).toThrow('ENCRYPTION_KEY is required in production')
      
      process.env.NODE_ENV = 'test'
    })

    it('should use development fallback key in non-production', () => {
      delete process.env.ENCRYPTION_KEY
      
      expect(() => Encryption.encrypt('test')).not.toThrow()
    })
  })

  describe('decrypt', () => {
    it('should decrypt encrypted text', () => {
      const encrypted = 'encrypted-data'
      const iv = '0123456789abcdef0123456789abcdef'
      const tag = '0123456789abcdef0123456789abcdef'
      
      // Mock createDecipheriv
      const mockDecipher = {
        setAuthTag: jest.fn(),
        update: jest.fn().mockReturnValue(Buffer.from('decrypted')),
        final: jest.fn().mockReturnValue(Buffer.from('final')),
      }
      const mockCreateDecipheriv = jest.spyOn(require('crypto'), 'createDecipheriv')
      mockCreateDecipheriv.mockReturnValue(mockDecipher as any)
      
      const result = Encryption.decrypt(encrypted, iv, tag)
      
      expect(mockDecipher.setAuthTag).toHaveBeenCalledWith(Buffer.from(tag, 'hex'))
      expect(result).toBe('decryptedfinal')
    })
  })
})

describe('CertificateUtils', () => {
  describe('generateSerialNumber', () => {
    it('should generate 32-character hex string', () => {
      const serial = CertificateUtils.generateSerialNumber()
      
      expect(serial).toHaveLength(32)
      expect(serial).toMatch(/^[0-9A-F]+$/)
    })

    it('should generate unique serial numbers', () => {
      const serial1 = CertificateUtils.generateSerialNumber()
      const serial2 = CertificateUtils.generateSerialNumber()
      
      expect(serial1).not.toBe(serial2)
    })
  })

  describe('generateFingerprint', () => {
    it('should generate SHA-256 fingerprint', () => {
      const certificate = 'test certificate content'
      const fingerprint = CertificateUtils.generateFingerprint(certificate)
      
      expect(fingerprint).toMatch(/^[0-9A-F:]+$/)
      expect(fingerprint.split(':')).toHaveLength(32)
    })
  })

  describe('formatDN', () => {
    it('should format DN parts correctly', () => {
      const parts = {
        C: 'US',
        ST: 'California',
        L: 'San Francisco',
        O: 'Test Org',
        OU: 'IT Department',
        CN: 'test.example.com',
      }
      
      const result = CertificateUtils.formatDN(parts)
      
      expect(result).toBe('C=US,ST=California,L=San Francisco,O=Test Org,OU=IT Department,CN=test.example.com')
    })

    it('should handle missing DN parts', () => {
      const parts = {
        C: 'US',
        CN: 'test.example.com',
      }
      
      const result = CertificateUtils.formatDN(parts)
      
      expect(result).toBe('C=US,CN=test.example.com')
    })
  })

  describe('parseDN', () => {
    it('should parse DN string correctly', () => {
      const dn = 'C=US,ST=California,L=San Francisco,O=Test Org,CN=test.example.com'
      
      const result = CertificateUtils.parseDN(dn)
      
      expect(result).toEqual({
        C: 'US',
        ST: 'California',
        L: 'San Francisco',
        O: 'Test Org',
        CN: 'test.example.com',
      })
    })

    it('should handle DN with spaces', () => {
      const dn = 'C=US, ST=California , L=San Francisco'
      
      const result = CertificateUtils.parseDN(dn)
      
      expect(result).toEqual({
        C: 'US',
        ST: 'California',
        L: 'San Francisco',
      })
    })
  })
})

describe('CSRUtils', () => {
  describe('generateKeyPair', () => {
    it('should generate RSA key pair', () => {
      const keyPair = CSRUtils.generateKeyPair('RSA', 2048)
      
      expect(keyPair).toHaveProperty('privateKey')
      expect(keyPair).toHaveProperty('publicKey')
      expect(keyPair.privateKey).toContain('-----BEGIN PRIVATE KEY-----')
      expect(keyPair.publicKey).toContain('-----BEGIN PUBLIC KEY-----')
    })

    it('should generate ECDSA key pair', () => {
      const keyPair = CSRUtils.generateKeyPair('ECDSA', undefined, 'P-256')
      
      expect(keyPair).toHaveProperty('privateKey')
      expect(keyPair).toHaveProperty('publicKey')
    })

    it('should generate Ed25519 key pair', () => {
      const keyPair = CSRUtils.generateKeyPair('Ed25519')
      
      expect(keyPair).toHaveProperty('privateKey')
      expect(keyPair).toHaveProperty('publicKey')
    })
  })

  describe('generateCSR', () => {
    it('should generate CSR with subject DN', () => {
      const subject = {
        C: 'US',
        ST: 'California',
        O: 'Test Org',
        CN: 'test.example.com',
      }
      
      const keyPair = {
        privateKey: '-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----',
        publicKey: '-----BEGIN PUBLIC KEY-----\ntest\n-----END PUBLIC KEY-----',
      }
      
      const csr = CSRUtils.generateCSR(subject, keyPair.privateKey, keyPair.publicKey)
      
      expect(csr).toContain('-----BEGIN CERTIFICATE REQUEST-----')
      expect(csr).toContain('-----END CERTIFICATE REQUEST-----')
    })
  })
})

describe('CRLUtils', () => {
  describe('generateCRL', () => {
    it('should generate CRL with revoked certificates', () => {
      const caPrivateKey = '-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----'
      const caCertificate = '-----BEGIN CERTIFICATE-----\ntest\n-----END CERTIFICATE-----'
      const revokedCertificates = [
        {
          serialNumber: '123456789',
          revocationDate: new Date(),
          revocationReason: 'KEY_COMPROMISE',
        },
      ]
      
      const crl = CRLUtils.generateCRL(caPrivateKey, caCertificate, revokedCertificates, 1)
      
      expect(crl).toContain('-----BEGIN X509 CRL-----')
      expect(crl).toContain('-----END X509 CRL-----')
    })
  })
})

describe('X509Utils', () => {
  describe('parseCertificateDates', () => {
    it('should parse certificate validity dates', () => {
      const certificate = `
-----BEGIN CERTIFICATE-----
MIIDXTCCAkWgAwIBAgIJAKoK/OvH8TqLMA0GCSqGSIb3DQEBCwUAMEUxCzAJBgNV
BAYTAkFVMRMwEQYDVQQIDApTb21lLVN0YXRlMSEwHwYDVQQKDBhJbnRlcm5ldCBX
aWRnaXRzIFB0eSBMdGQwHhcNMTkwMTAxMDAwMDAwWhcNMjAwMTAxMDAwMDAwWjBF
MQswCQYDVQQGEwJBVTETMBEGA1UECAwKU29tZS1TdGF0ZTEhMB8GA1UECgwYSW50
ZXJuZXQgV2lkZ2l0cyBQdHkgTHRkMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIB
CgKCAQEA...
-----END CERTIFICATE-----
      `
      
      const result = X509Utils.parseCertificateDates(certificate)
      
      expect(result).toHaveProperty('notBefore')
      expect(result).toHaveProperty('notAfter')
      expect(result.notBefore).toBeInstanceOf(Date)
      expect(result.notAfter).toBeInstanceOf(Date)
    })
  })

  describe('validateCertificate', () => {
    it('should validate valid certificate', () => {
      const certificate = `
-----BEGIN CERTIFICATE-----
MIIDXTCCAkWgAwIBAgIJAKoK/OvH8TqLMA0GCSqGSIb3DQEBCwUAMEUxCzAJBgNV
BAYTAkFVMRMwEQYDVQQIDApTb21lLVN0YXRlMSEwHwYDVQQKDBhJbnRlcm5ldCBX
aWRnaXRzIFB0eSBMdGQwHhcNMTkwMTAxMDAwMDAwWhcNMjAwMTAxMDAwMDAwWjBF
MQswCQYDVQQGEwJBVTETMBEGA1UECAwKU29tZS1TdGF0ZTEhMB8GA1UECgwYSW50
ZXJuZXQgV2lkZ2l0cyBQdHkgTHRkMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIB
CgKCAQEA...
-----END CERTIFICATE-----
      `
      
      const result = X509Utils.validateCertificate(certificate)
      
      expect(result.isValid).toBe(true)
    })

    it('should detect invalid certificate format', () => {
      const invalidCertificate = 'invalid certificate content'
      
      const result = X509Utils.validateCertificate(invalidCertificate)
      
      expect(result.isValid).toBe(false)
      expect(result.error).toBeDefined()
    })
  })
})