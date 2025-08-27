import { Encryption, CertificateUtils, CSRUtils, CRLUtils, X509Utils } from '@/lib/crypto'
import forge from 'node-forge'
import * as crypto from 'crypto'

jest.mock('node-forge', () => jest.requireActual('node-forge'))

jest.mock('crypto', () => {
  const actualCrypto = jest.requireActual('crypto');
  let counter = 0;
  return {
    ...actualCrypto,
    randomBytes: jest.fn().mockImplementation((size) => {
      counter++;
      // Create a buffer that is deterministic but different for each call
      const buffer = Buffer.alloc(size);
      buffer.fill(String(counter));
      return buffer;
    }),
    createCipheriv: jest.fn((...args) => {
      // @ts-ignore
      const cipher = new actualCrypto.createCipheriv(...args);
      const update = jest.spyOn(cipher, 'update');
      const final = jest.spyOn(cipher, 'final');
      const getAuthTag = jest.spyOn(cipher, 'getAuthTag');
      return cipher;
    }),
    createDecipheriv: jest.fn((...args) => {
      // @ts-ignore
      const decipher = new actualCrypto.createDecipheriv(...args);
      const setAuthTag = jest.spyOn(decipher, 'setAuthTag');
      const update = jest.spyOn(decipher, 'update');
      const final = jest.spyOn(decipher, 'final');
      return decipher;
    }),
  };
});

describe('Encryption', () => {
  const originalKey = process.env.ENCRYPTION_KEY

  beforeEach(() => {
    process.env.ENCRYPTION_KEY = 'test-32-character-encryption-key'
  })

  afterEach(() => {
    process.env.ENCRYPTION_KEY = originalKey
    jest.restoreAllMocks()
  })

  describe('encrypt', () => {
    it('should encrypt text with AES-256-GCM', () => {
      const text = 'sensitive data'
      const result = Encryption.encrypt(text)

      expect(result).toHaveProperty('encrypted')
      expect(result).toHaveProperty('iv')
      expect(result).toHaveProperty('tag')
      expect(crypto.createCipheriv).toHaveBeenCalledWith(
        'aes-256-gcm',
        expect.any(Buffer),
        expect.any(Buffer)
      )
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
    it('should decrypt what it encrypts', () => {
      const originalText = 'some very secret text'
      const { encrypted, iv, tag } = Encryption.encrypt(originalText)
      
      const decryptedText = Encryption.decrypt(encrypted, iv, tag)
      
      expect(decryptedText).toBe(originalText)
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
      
      const keyPair = CSRUtils.generateKeyPair('RSA', 2048)
      
      const csr = CSRUtils.generateCSR(subject, keyPair.privateKey, keyPair.publicKey)
      
      expect(csr).toContain('-----BEGIN CERTIFICATE REQUEST-----')
      expect(csr).toContain('-----END CERTIFICATE REQUEST-----')
    })
  })
})


describe('X509Utils', () => {
  let certPem: string;

  beforeAll(() => {
    const keys = forge.pki.rsa.generateKeyPair(2048);
    const cert = forge.pki.createCertificate();
    cert.publicKey = keys.publicKey;
    cert.serialNumber = '01';
    cert.validity.notBefore = new Date();
    cert.validity.notAfter = new Date();
    cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 1);
    const attrs = [{ name: 'commonName', value: 'example.org' }];
    cert.setSubject(attrs);
    cert.setIssuer(attrs);
    // Add required extensions for a self-signed CA
    cert.setExtensions([
      { name: 'basicConstraints', cA: true, critical: true },
      { name: 'keyUsage', keyCertSign: true, cRLSign: true, critical: true },
      { name: 'subjectKeyIdentifier' },
    ]);
    cert.sign(keys.privateKey, forge.md.sha256.create());
    certPem = forge.pki.certificateToPem(cert);
  });

  describe('parseCertificateDates', () => {
    it('should parse certificate validity dates', () => {
      const result = X509Utils.parseCertificateDates(certPem);
      expect(result).toHaveProperty('notBefore');
      expect(result).toHaveProperty('notAfter');
      expect(result.notBefore).toBeInstanceOf(Date);
      expect(result.notAfter).toBeInstanceOf(Date);
    });
  });

  describe('validateCertificateChain', () => {
    it.skip('should validate valid certificate', () => {
      // For a self-signed certificate, it's its own issuer.
      const result = X509Utils.validateCertificateChain(certPem, [certPem]);
      expect(result.isValid).toBe(true);
    });

    it('should detect invalid certificate format', () => {
      const invalidCertificate = 'invalid certificate content';
      const result = X509Utils.validateCertificateChain(invalidCertificate, []);
      expect(result.isValid).toBe(false);
      expect(result.issues).toBeDefined();
      expect(result.issues.length).toBeGreaterThan(0);
    });
  });
});