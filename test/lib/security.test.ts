import { SecurityMiddleware } from '@/lib/security';
import { db } from '@/lib/db';

// Mock the database
jest.mock('@/lib/db', () => ({
  db: {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
  },
}));

// Mock the logger
jest.mock('@/lib/logger', () => ({
  logger: {
    security: {
      warn: jest.fn(),
      error: jest.fn(),
      info: jest.fn(),
    },
  },
}));

const mockedDb = db as jest.Mocked<typeof db>;
const mockedLogger = require('@/lib/logger');

describe('SecurityMiddleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('checkRateLimit', () => {
    it('should allow request within rate limit', () => {
      const clientId = '127.0.0.1';
      const windowMs = 60000; // 1 minute
      const maxRequests = 100;

      const result = SecurityMiddleware.checkRateLimit(clientId, 'api');

      expect(result).toBe(true);
    });

    it('should block request when rate limit exceeded', () => {
      const clientId = '127.0.0.1';
      const windowMs = 1000; // 1 second
      const maxRequests = 1;

      // Make multiple requests to exceed the limit
      for (let i = 0; i < 100; i++) {
        SecurityMiddleware.checkRateLimit(clientId, 'api');
      }
      
      // Next request should be blocked
      const result = SecurityMiddleware.checkRateLimit(clientId, 'api');

      expect(result).toBe(false);
    });

    it('should enforce rate limit per client', () => {
      const clientId1 = 'unique-test-client-1';
      const clientId2 = 'unique-test-client-2';
      const endpoint = 'login'; // Use login endpoint which has lower limit (5)

      // Test first client
      expect(SecurityMiddleware.checkRateLimit(clientId1, endpoint)).toBe(true);
      expect(SecurityMiddleware.checkRateLimit(clientId1, endpoint)).toBe(true);
      expect(SecurityMiddleware.checkRateLimit(clientId1, endpoint)).toBe(true);
      expect(SecurityMiddleware.checkRateLimit(clientId1, endpoint)).toBe(true);
      expect(SecurityMiddleware.checkRateLimit(clientId1, endpoint)).toBe(true);
      expect(SecurityMiddleware.checkRateLimit(clientId1, endpoint)).toBe(false); // Should be blocked

      // Test second client (should be independent)
      expect(SecurityMiddleware.checkRateLimit(clientId2, endpoint)).toBe(true);
      expect(SecurityMiddleware.checkRateLimit(clientId2, endpoint)).toBe(true);
    });
  });

  describe('validateCertificateData', () => {
    it('should validate valid certificate data', () => {
      const data = {
        subjectDN: 'CN=test.example.com',
        certificateType: 'SERVER',
        keyAlgorithm: 'RSA',
        validityDays: 365,
        sans: ['test.example.com'],
      };

      const result = SecurityMiddleware.validateCertificateData(data);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject invalid certificate data', () => {
      const data = {
        subjectDN: '',
        certificateType: 'INVALID',
        keyAlgorithm: 'INVALID',
        validityDays: 0,
      };

      const result = SecurityMiddleware.validateCertificateData(data);

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('sanitizeInput', () => {
    it('should sanitize safe input', () => {
      const input = 'safe-input-123';

      const result = SecurityMiddleware.sanitizeInput(input);

      expect(result).toBe('safe-input-123');
    });

    it('should remove script tags', () => {
      const input = '<script>alert("xss")</script>';

      const result = SecurityMiddleware.sanitizeInput(input);

      expect(result).not.toContain('<script>');
      expect(result).not.toContain('</script>');
    });

    it('should remove event handlers', () => {
      const input = '<img src="x" onerror="alert(\'xss\')">';

      const result = SecurityMiddleware.sanitizeInput(input);

      expect(result).not.toContain('onerror');
    });

    it('should handle empty input', () => {
      const input = '';

      const result = SecurityMiddleware.sanitizeInput(input);

      expect(result).toBe('');
    });

    it('should handle non-string input', () => {
      const input = null as any;

      const result = SecurityMiddleware.sanitizeInput(input);

      expect(result).toBe(input);
    });
  });



  describe('validatePassword', () => {
    it('should validate strong password', () => {
      const password = 'StrongP@ssw0rd123';

      const result = SecurityMiddleware.validatePassword(password);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect weak password', () => {
      const password = 'weak';

      const result = SecurityMiddleware.validatePassword(password);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Password must be at least 8 characters long');
    });

    it('should detect missing uppercase', () => {
      const password = 'lowercase123';

      const result = SecurityMiddleware.validatePassword(password);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Password must contain at least one uppercase letter');
    });

    it('should detect missing lowercase', () => {
      const password = 'UPPERCASE123';

      const result = SecurityMiddleware.validatePassword(password);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Password must contain at least one lowercase letter');
    });

    it('should detect missing numbers', () => {
      const password = 'NoNumbers';

      const result = SecurityMiddleware.validatePassword(password);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Password must contain at least one number');
    });

    it('should detect missing special characters', () => {
      const password = 'NoSpecialChars123';

      const result = SecurityMiddleware.validatePassword(password);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Password must contain at least one special character');
    });
  });

  describe('generateSecureToken', () => {
    it('should generate token with specified length', () => {
      const length = 32;

      const token = SecurityMiddleware.generateSecureToken(length);

      expect(token).toHaveLength(length * 2); // hex encoding doubles length
      expect(token).toMatch(/^[a-f0-9]+$/);
    });

    it('should generate unique tokens', () => {
      const token1 = SecurityMiddleware.generateSecureToken(16);
      const token2 = SecurityMiddleware.generateSecureToken(16);

      expect(token1).not.toBe(token2);
    });

    it('should use default length when not specified', () => {
      const token = SecurityMiddleware.generateSecureToken();

      expect(token).toHaveLength(64); // 32 * 2 for hex encoding
    });
  });

  describe('validateCSR', () => {
    it('should validate valid CSR', () => {
      const csr = '-----BEGIN CERTIFICATE REQUEST-----\nMIIB...\n-----END CERTIFICATE REQUEST-----';

      const result = SecurityMiddleware.validateCSR(csr);

      expect(result).toBe(true);
    });

    it('should reject invalid CSR', () => {
      const csr = 'invalid-csr';

      const result = SecurityMiddleware.validateCSR(csr);

      expect(result).toBe(false);
    });
  });

  describe('validateCertificate', () => {
    it('should validate valid certificate', () => {
      const cert = '-----BEGIN CERTIFICATE-----\nMIIB...\n-----END CERTIFICATE-----';

      const result = SecurityMiddleware.validateCertificate(cert);

      expect(result).toBe(true);
    });

    it('should reject invalid certificate', () => {
      const cert = 'invalid-cert';

      const result = SecurityMiddleware.validateCertificate(cert);

      expect(result).toBe(false);
    });
  });
});