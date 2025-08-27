import { POST } from '@/app/api/certificates/issue/route';
import { CAService } from '@/lib/ca';
import { db } from '@/lib/db';

// Mock the services
jest.mock('@/lib/ca');
jest.mock('@/lib/db');
jest.mock('next-auth', () => ({
  getServerSession: jest.fn(),
}));
jest.mock('next/server', () => ({
  NextResponse: {
    json: jest.fn((data, init) => ({
      status: init?.status || 200,
      headers: new Headers(init?.headers || {}),
      json: jest.fn().mockResolvedValue(data),
    })),
  },
}));

const mockedCAService = CAService as jest.Mocked<typeof CAService>;
const mockedDb = db as jest.Mocked<typeof db>;
const { getServerSession } = require('next-auth');

describe('POST /api/certificates/issue', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const createMockRequest = (body: any, headers: Record<string, string> = {}) => {
    const mockRequest = {
      url: 'http://localhost:3000/api/certificates/issue',
      method: 'POST',
      headers: new Headers({
        'Content-Type': 'application/json',
        ...headers,
      }),
      json: jest.fn().mockResolvedValue(body),
    } as any;
    
    return mockRequest;
  };

  const createMockResponse = (data: any, status: number = 200, headers: Record<string, string> = {}) => {
    const mockResponse = {
      status,
      headers: new Headers({
        'Content-Type': 'application/json',
        ...headers,
      }),
      json: jest.fn().mockResolvedValue(data),
    } as any;
    
    return mockResponse;
  };

  const mockUser = {
    id: 'user-123',
    username: 'testuser',
    role: 'OPERATOR',
    isActive: true,
  };

  const mockCertificateData = {
    subjectDN: 'CN=test.example.com',
    certificateType: 'SERVER',
    keyAlgorithm: 'RSA',
    keySize: 2048,
    validityDays: 365,
    sans: ['test.example.com', '*.test.example.com'],
  };

  describe('Authentication and Authorization', () => {
    it('should return 401 if no authorization header', async () => {
      const request = createMockRequest(mockCertificateData);

      const response = await POST(request);

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toBe('Unauthorized');
    });

    it('should return 401 if invalid token', async () => {
      (getServerSession as jest.Mock).mockResolvedValue(null);

      const request = createMockRequest(mockCertificateData, {
        'Authorization': 'Bearer invalid-token',
      });

      const response = await POST(request);

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toBe('Unauthorized');
    });

    it('should return 403 if user lacks OPERATOR permissions', async () => {
      const userWithoutPermissions = {
        user: {
          ...mockUser,
          role: 'VIEWER',
          permissions: ['certificate:view'],
        },
      };

      (getServerSession as jest.Mock).mockResolvedValue(userWithoutPermissions);

      const request = createMockRequest(mockCertificateData, {
        'Authorization': 'Bearer valid-token',
      });

      const response = await POST(request);

      expect(response.status).toBe(403);
      const data = await response.json();
      expect(data.error).toBe('Insufficient permissions');
    });

    it('should return 403 if user is inactive', async () => {
      const inactiveUser = {
        user: {
          ...mockUser,
          isActive: false,
          permissions: ['certificate:issue'],
        },
      };

      (getServerSession as jest.Mock).mockResolvedValue(inactiveUser);

      const request = createMockRequest(mockCertificateData, {
        'Authorization': 'Bearer valid-token',
      });

      const response = await POST(request);

      expect(response.status).toBe(403);
      const data = await response.json();
      expect(data.error).toBe('Insufficient permissions');
    });
  });

  describe('Input Validation', () => {
    beforeEach(() => {
      (getServerSession as jest.Mock).mockResolvedValue({
        user: {
          ...mockUser,
          permissions: ['certificate:issue'],
        },
      });
    });

    it('should return 400 if subjectDN is missing', async () => {
      const invalidData = { ...mockCertificateData };
      delete invalidData.subjectDN;

      const request = createMockRequest(invalidData, {
        'Authorization': 'Bearer valid-token',
      });

      const response = await POST(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Missing required fields');
    });

    it('should return 400 if certificateType is missing', async () => {
      const invalidData = { ...mockCertificateData };
      delete invalidData.certificateType;

      const request = createMockRequest(invalidData, {
        'Authorization': 'Bearer valid-token',
      });

      const response = await POST(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Missing required fields');
    });

    it('should return 400 if keyAlgorithm is missing', async () => {
      const invalidData = { ...mockCertificateData };
      delete invalidData.keyAlgorithm;

      const request = createMockRequest(invalidData, {
        'Authorization': 'Bearer valid-token',
      });

      const response = await POST(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Missing required fields');
    });

    it('should return 400 if keySize is missing for RSA', async () => {
      const invalidData = {
        ...mockCertificateData,
        keyAlgorithm: 'RSA',
      };
      delete invalidData.keySize;

      const request = createMockRequest(invalidData, {
        'Authorization': 'Bearer valid-token',
      });

      const response = await POST(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Key size is required for RSA algorithm');
    });

    it('should return 400 if curve is missing for ECDSA', async () => {
      const invalidData = {
        ...mockCertificateData,
        keyAlgorithm: 'ECDSA',
        curve: undefined,
      };

      const request = createMockRequest(invalidData, {
        'Authorization': 'Bearer valid-token',
      });

      const response = await POST(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Curve is required for ECDSA algorithm');
    });

    it('should return 400 if validityDays is invalid', async () => {
      const invalidData = {
        ...mockCertificateData,
        validityDays: 0,
      };

      const request = createMockRequest(invalidData, {
        'Authorization': 'Bearer valid-token',
      });

      const response = await POST(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Validity days must be between 1 and 3650');
    });

    it('should return 400 if validityDays exceeds maximum', async () => {
      const invalidData = {
        ...mockCertificateData,
        validityDays: 4000,
      };

      const request = createMockRequest(invalidData, {
        'Authorization': 'Bearer valid-token',
      });

      const response = await POST(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Validity days must be between 1 and 3650');
    });

    it('should return 400 if SANs contain invalid domains', async () => {
      const invalidData = {
        ...mockCertificateData,
        sans: ['invalid-domain', '*.invalid'],
      };

      const request = createMockRequest(invalidData, {
        'Authorization': 'Bearer valid-token',
      });

      const response = await POST(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Invalid SAN domains provided');
    });
  });

  describe('Certificate Issuance', () => {
    beforeEach(() => {
      (getServerSession as jest.Mock).mockResolvedValue({
        user: {
          ...mockUser,
          permissions: ['certificate:issue'],
        },
      });
    });

    it('should successfully issue a certificate', async () => {
      const mockIssuedCertificate = {
        id: 'cert-123',
        serialNumber: '1234567890ABCDEF',
        subjectDN: mockCertificateData.subjectDN,
        status: 'ACTIVE',
        validFrom: new Date(),
        validTo: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      };

      mockedCAService.issueCertificate.mockResolvedValue(mockIssuedCertificate);

      const request = createMockRequest(mockCertificateData, {
        'Authorization': 'Bearer valid-token',
      });

      const response = await POST(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.certificate).toEqual(mockIssuedCertificate);
      expect(data.message).toBe('Certificate issued successfully');

      expect(mockedCAService.issueCertificate).toHaveBeenCalledWith({
        ...mockCertificateData,
        issuedById: mockUser.id,
      });
    });

    it('should handle CA service errors gracefully', async () => {
      const errorMessage = 'CA is not active';
      mockedCAService.issueCertificate.mockRejectedValue(new Error(errorMessage));

      const request = createMockRequest(mockCertificateData, {
        'Authorization': 'Bearer valid-token',
      });

      const response = await POST(request);

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.error).toBe('Failed to issue certificate');
      expect(data.details).toBe(errorMessage);
    });

    it('should handle unexpected errors', async () => {
      mockedCAService.issueCertificate.mockRejectedValue(new Error('Unexpected error'));

      const request = createMockRequest(mockCertificateData, {
        'Authorization': 'Bearer valid-token',
      });

      const response = await POST(request);

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.error).toBe('Internal server error');
    });
  });

  describe('Business Logic Validation', () => {
    beforeEach(() => {
      (getServerSession as jest.Mock).mockResolvedValue({
        user: {
          ...mockUser,
          permissions: ['certificate:issue'],
        },
      });
    });

    it('should validate RSA key sizes', async () => {
      const invalidData = {
        ...mockCertificateData,
        keyAlgorithm: 'RSA',
        keySize: 1024, // Too small
      };

      const request = createMockRequest(invalidData, {
        'Authorization': 'Bearer valid-token',
      });

      const response = await POST(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('RSA key size must be at least 2048 bits');
    });

    it('should validate ECDSA curves', async () => {
      const invalidData = {
        ...mockCertificateData,
        keyAlgorithm: 'ECDSA',
        curve: 'INVALID_CURVE',
      };

      const request = createMockRequest(invalidData, {
        'Authorization': 'Bearer valid-token',
      });

      const response = await POST(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Invalid ECDSA curve. Supported curves: P-256, P-384, P-521');
    });

    it('should validate Ed25519 algorithm', async () => {
      const validData = {
        ...mockCertificateData,
        keyAlgorithm: 'ED25519',
        keySize: undefined,
        curve: undefined,
      };

      const mockIssuedCertificate = {
        id: 'cert-123',
        serialNumber: '1234567890ABCDEF',
        subjectDN: validData.subjectDN,
        status: 'ACTIVE',
      };

      mockedCAService.issueCertificate.mockResolvedValue(mockIssuedCertificate);

      const request = createMockRequest(validData, {
        'Authorization': 'Bearer valid-token',
      });

      const response = await POST(request);

      expect(response.status).toBe(200);
    });

    it('should validate certificate types', async () => {
      const invalidData = {
        ...mockCertificateData,
        certificateType: 'INVALID_TYPE',
      };

      const request = createMockRequest(invalidData, {
        'Authorization': 'Bearer valid-token',
      });

      const response = await POST(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Invalid certificate type. Supported types: SERVER, CLIENT, CODE_SIGNING, EMAIL');
    });
  });

  describe('Response Format', () => {
    beforeEach(() => {
      (getServerSession as jest.Mock).mockResolvedValue({
        user: {
          ...mockUser,
          permissions: ['certificate:issue'],
        },
      });
    });

    it('should return proper response headers', async () => {
      const mockIssuedCertificate = {
        id: 'cert-123',
        serialNumber: '1234567890ABCDEF',
        subjectDN: mockCertificateData.subjectDN,
        status: 'ACTIVE',
      };

      mockedCAService.issueCertificate.mockResolvedValue(mockIssuedCertificate);

      const request = createMockRequest(mockCertificateData, {
        'Authorization': 'Bearer valid-token',
      });

      const response = await POST(request);

      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('application/json');
      expect(response.headers.get('Cache-Control')).toBe('no-cache, no-store, must-revalidate');
    });

    it('should include audit information in response', async () => {
      const mockIssuedCertificate = {
        id: 'cert-123',
        serialNumber: '1234567890ABCDEF',
        subjectDN: mockCertificateData.subjectDN,
        status: 'ACTIVE',
        createdAt: new Date(),
        issuedBy: { username: mockUser.username },
      };

      mockedCAService.issueCertificate.mockResolvedValue(mockIssuedCertificate);

      const request = createMockRequest(mockCertificateData, {
        'Authorization': 'Bearer valid-token',
      });

      const response = await POST(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.certificate).toHaveProperty('createdAt');
      expect(data.certificate.issuedBy).toHaveProperty('username');
    });
  });

  describe('Edge Cases', () => {
    beforeEach(() => {
      (getServerSession as jest.Mock).mockResolvedValue({
        user: {
          ...mockUser,
          permissions: ['certificate:issue'],
        },
      });
    });

    it('should handle empty SANs array', async () => {
      const dataWithoutSans = {
        ...mockCertificateData,
        sans: [],
      };

      const mockIssuedCertificate = {
        id: 'cert-123',
        serialNumber: '1234567890ABCDEF',
        subjectDN: dataWithoutSans.subjectDN,
        status: 'ACTIVE',
      };

      mockedCAService.issueCertificate.mockResolvedValue(mockIssuedCertificate);

      const request = createMockRequest(dataWithoutSans, {
        'Authorization': 'Bearer valid-token',
      });

      const response = await POST(request);

      expect(response.status).toBe(200);
    });

    it('should handle missing optional fields', async () => {
      const minimalData = {
        subjectDN: 'CN=test.example.com',
        certificateType: 'SERVER',
        keyAlgorithm: 'RSA',
        keySize: 2048,
      };

      const mockIssuedCertificate = {
        id: 'cert-123',
        serialNumber: '1234567890ABCDEF',
        subjectDN: minimalData.subjectDN,
        status: 'ACTIVE',
      };

      mockedCAService.issueCertificate.mockResolvedValue(mockIssuedCertificate);

            const request = createMockRequest(minimalData, {
        'Authorization': 'Bearer valid-token',
      });

      const response = await POST(request);

      expect(response.status).toBe(200);
    });

    it('should handle malformed JSON in request body', async () => {
      const request = createMockRequest('invalid-json', {
        'Authorization': 'Bearer valid-token',
      });

      const response = await POST(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Invalid JSON in request body');
    });
  });
});