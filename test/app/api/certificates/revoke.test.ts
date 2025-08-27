import { NextRequest } from 'next/server';
import { POST } from '@/app/api/certificates/revoke/route';
import { CAService } from '@/lib/ca';
import { AuthService } from '@/lib/auth';

// Mock the services
jest.mock('@/lib/ca');
jest.mock('@/lib/auth');

const mockedCAService = CAService as jest.Mocked<typeof CAService>;
const mockedAuthService = AuthService as jest.Mocked<typeof AuthService>;

describe('POST /api/certificates/revoke', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const createMockRequest = (body: any, headers: Record<string, string> = {}) => {
    return new NextRequest('http://localhost:3000/api/certificates/revoke', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: JSON.stringify(body),
    });
  };

  const mockUser = {
    id: 'user-123',
    username: 'testuser',
    role: 'OPERATOR',
    isActive: true,
  };

  describe('Authentication and Authorization', () => {
    it('should return 401 if no authorization header', async () => {
      const request = createMockRequest({
        serialNumber: '1234567890ABCDEF',
        reason: 'KEY_COMPROMISE',
      });

      const response = await POST(request);

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toBe('Unauthorized');
    });

    it('should return 401 if invalid token', async () => {
      mockedAuthService.verifyToken.mockResolvedValue(null);

      const request = createMockRequest({
        serialNumber: '1234567890ABCDEF',
        reason: 'KEY_COMPROMISE',
      }, {
        'Authorization': 'Bearer invalid-token',
      });

      const response = await POST(request);

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toBe('Unauthorized');
    });

    it('should return 403 if user lacks OPERATOR permissions', async () => {
      const userWithoutPermissions = {
        ...mockUser,
        role: 'VIEWER',
      };

      mockedAuthService.verifyToken.mockResolvedValue(userWithoutPermissions);

      const request = createMockRequest({
        serialNumber: '1234567890ABCDEF',
        reason: 'KEY_COMPROMISE',
      }, {
        'Authorization': 'Bearer valid-token',
      });

      const response = await POST(request);

      expect(response.status).toBe(403);
      const data = await response.json();
      expect(data.error).toBe('Insufficient permissions');
    });

    it('should return 403 if user is inactive', async () => {
      const inactiveUser = {
        ...mockUser,
        isActive: false,
      };

      mockedAuthService.verifyToken.mockResolvedValue(inactiveUser);

      const request = createMockRequest({
        serialNumber: '1234567890ABCDEF',
        reason: 'KEY_COMPROMISE',
      }, {
        'Authorization': 'Bearer valid-token',
      });

      const response = await POST(request);

      expect(response.status).toBe(403);
      const data = await response.json();
      expect(data.error).toBe('User account is inactive');
    });
  });

  describe('Input Validation', () => {
    beforeEach(() => {
      mockedAuthService.verifyToken.mockResolvedValue(mockUser);
    });

    it('should return 400 if serialNumber is missing', async () => {
      const request = createMockRequest({
        reason: 'KEY_COMPROMISE',
      }, {
        'Authorization': 'Bearer valid-token',
      });

      const response = await POST(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Serial number is required');
    });

    it('should return 400 if reason is missing', async () => {
      const request = createMockRequest({
        serialNumber: '1234567890ABCDEF',
      }, {
        'Authorization': 'Bearer valid-token',
      });

      const response = await POST(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Revocation reason is required');
    });

    it('should return 400 if reason is invalid', async () => {
      const request = createMockRequest({
        serialNumber: '1234567890ABCDEF',
        reason: 'INVALID_REASON',
      }, {
        'Authorization': 'Bearer valid-token',
      });

      const response = await POST(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Invalid revocation reason');
    });

    it('should accept valid revocation reasons', async () => {
      const validReasons = [
        'UNSPECIFIED',
        'KEY_COMPROMISE',
        'CA_COMPROMISE',
        'AFFILIATION_CHANGED',
        'SUPERSEDED',
        'CESSATION_OF_OPERATION',
        'CERTIFICATE_HOLD',
        'REMOVE_FROM_CRL',
        'PRIVILEGE_WITHDRAWN',
        'AA_COMPROMISE',
      ];

      for (const reason of validReasons) {
        const request = createMockRequest({
          serialNumber: '1234567890ABCDEF',
          reason,
        }, {
          'Authorization': 'Bearer valid-token',
        });

        mockedCAService.revokeCertificate.mockResolvedValue();

        const response = await POST(request);

        expect(response.status).toBe(200);
      }
    });
  });

  describe('Certificate Revocation', () => {
    beforeEach(() => {
      mockedAuthService.verifyToken.mockResolvedValue(mockUser);
    });

    it('should successfully revoke a certificate', async () => {
      const revocationData = {
        serialNumber: '1234567890ABCDEF',
        reason: 'KEY_COMPROMISE',
      };

      mockedCAService.revokeCertificate.mockResolvedValue();

      const request = createMockRequest(revocationData, {
        'Authorization': 'Bearer valid-token',
      });

      const response = await POST(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.message).toBe('Certificate revoked successfully');

      expect(mockedCAService.revokeCertificate).toHaveBeenCalledWith(
        revocationData.serialNumber,
        revocationData.reason,
        mockUser.id
      );
    });

    it('should handle CA service errors gracefully', async () => {
      const errorMessage = 'Certificate not found';
      mockedCAService.revokeCertificate.mockRejectedValue(new Error(errorMessage));

      const request = createMockRequest({
        serialNumber: 'INVALID',
        reason: 'KEY_COMPROMISE',
      }, {
        'Authorization': 'Bearer valid-token',
      });

      const response = await POST(request);

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.error).toBe('Failed to revoke certificate');
      expect(data.details).toBe(errorMessage);
    });

    it('should handle unexpected errors', async () => {
      mockedCAService.revokeCertificate.mockRejectedValue(new Error('Unexpected error'));

      const request = createMockRequest({
        serialNumber: '1234567890ABCDEF',
        reason: 'KEY_COMPROMISE',
      }, {
        'Authorization': 'Bearer valid-token',
      });

      const response = await POST(request);

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.error).toBe('Internal server error');
    });
  });

  describe('Response Format', () => {
    beforeEach(() => {
      mockedAuthService.verifyToken.mockResolvedValue(mockUser);
    });

    it('should return proper response headers', async () => {
      const revocationData = {
        serialNumber: '1234567890ABCDEF',
        reason: 'KEY_COMPROMISE',
      };

      mockedCAService.revokeCertificate.mockResolvedValue();

      const request = createMockRequest(revocationData, {
        'Authorization': 'Bearer valid-token',
      });

      const response = await POST(request);

      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('application/json');
      expect(response.headers.get('Cache-Control')).toBe('no-cache, no-store, must-revalidate');
    });

    it('should include audit information in response', async () => {
      const revocationData = {
        serialNumber: '1234567890ABCDEF',
        reason: 'KEY_COMPROMISE',
      };

      mockedCAService.revokeCertificate.mockResolvedValue();

      const request = createMockRequest(revocationData, {
        'Authorization': 'Bearer valid-token',
      });

      const response = await POST(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.message).toBe('Certificate revoked successfully');
      expect(data.serialNumber).toBe(revocationData.serialNumber);
      expect(data.reason).toBe(revocationData.reason);
    });
  });

  describe('Edge Cases', () => {
    beforeEach(() => {
      mockedAuthService.verifyToken.mockResolvedValue(mockUser);
    });

    it('should handle malformed JSON in request body', async () => {
      const request = new NextRequest('http://localhost:3000/api/certificates/revoke', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer valid-token',
        },
        body: 'invalid-json',
      });

      const response = await POST(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Invalid JSON in request body');
    });

    it('should handle empty request body', async () => {
      const request = new NextRequest('http://localhost:3000/api/certificates/revoke', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer valid-token',
        },
        body: '',
      });

      const response = await POST(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Request body is required');
    });

    it('should handle missing request body', async () => {
      const request = new NextRequest('http://localhost:3000/api/certificates/revoke', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer valid-token',
        },
      });

      const response = await POST(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Request body is required');
    });
  });

  describe('Security Considerations', () => {
    it('should validate CSRF token if provided', async () => {
      // This test would check CSRF validation if implemented
      // For now, we'll just ensure the endpoint works with proper auth
      mockedAuthService.verifyToken.mockResolvedValue(mockUser);

      const request = createMockRequest({
        serialNumber: '1234567890ABCDEF',
        reason: 'KEY_COMPROMISE',
      }, {
        'Authorization': 'Bearer valid-token',
        'X-CSRF-Token': 'valid-csrf-token',
      });

      mockedCAService.revokeCertificate.mockResolvedValue();

      const response = await POST(request);

      expect(response.status).toBe(200);
    });

    it('should log security events for failed attempts', async () => {
      // This test would check security logging if implemented
      // For now, we'll just ensure failed auth attempts return proper status
      mockedAuthService.verifyToken.mockResolvedValue(null);

      const request = createMockRequest({
        serialNumber: '1234567890ABCDEF',
        reason: 'KEY_COMPROMISE',
      }, {
        'Authorization': 'Bearer invalid-token',
      });

      const response = await POST(request);

      expect(response.status).toBe(401);
    });
  });
});