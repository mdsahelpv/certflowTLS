import { PasswordPolicyEnforcer, validatePassword, addPasswordToHistory, isPasswordExpired, updatePasswordCreationDate } from '@/lib/password-policy';
import { SettingsCacheService } from '@/lib/settings-cache';

// Mock the settings cache service
jest.mock('@/lib/settings-cache', () => ({
  SettingsCacheService: {
    getSecurityPolicy: jest.fn(),
    setSecurityPolicy: jest.fn(),
  },
}));

const mockedSettingsCache = SettingsCacheService as jest.Mocked<typeof SettingsCacheService>;

describe('PasswordPolicyEnforcer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('validatePassword', () => {
    beforeEach(() => {
      mockedSettingsCache.getSecurityPolicy.mockResolvedValue({
        config: {
          minLength: 8,
          requireUppercase: true,
          requireLowercase: true,
          requireNumbers: true,
          requireSpecialChars: true,
          preventReuse: 5,
          expiryDays: 90
        }
      });
    });

    it('should validate strong password', async () => {
      const result = await PasswordPolicyEnforcer.validatePassword('StrongP@ss123');

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.strength).toBe('strong');
    });

    it('should reject password that is too short', async () => {
      const result = await PasswordPolicyEnforcer.validatePassword('Short1!');

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Password must be at least 8 characters long');
    });

    it('should reject password without uppercase', async () => {
      const result = await PasswordPolicyEnforcer.validatePassword('lowercase123!');

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Password must contain at least one uppercase letter');
    });

    it('should reject password without lowercase', async () => {
      const result = await PasswordPolicyEnforcer.validatePassword('UPPERCASE123!');

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Password must contain at least one lowercase letter');
    });

    it('should reject password without numbers', async () => {
      const result = await PasswordPolicyEnforcer.validatePassword('Password!');

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Password must contain at least one number');
    });

    it('should reject password without special characters', async () => {
      const result = await PasswordPolicyEnforcer.validatePassword('Password123');

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Password must contain at least one special character');
    });

    it('should detect common weak passwords', async () => {
      const result = await PasswordPolicyEnforcer.validatePassword('Password123!');

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Password is too common. Please choose a more unique password.');
    });

    it('should provide warnings for weak passwords', async () => {
      const result = await PasswordPolicyEnforcer.validatePassword('WeakPassword123!');

      expect(result.isValid).toBe(true); // Meets minimum requirements
      expect(result.warnings).toContain('Password strength is weak. Consider using a stronger password.');
    });

    it('should check password reuse when userId provided', async () => {
      // Mock the password history lookup
      const mockHistory = {
        config: {
          history: [{
            hash: await require('bcryptjs').hash('OldPassword123!', 12),
            createdAt: new Date()
          }]
        }
      };

      mockedSettingsCache.getSecurityPolicy
        .mockResolvedValueOnce(mockHistory) // For password policy
        .mockResolvedValueOnce(mockHistory); // For password history

      const result = await PasswordPolicyEnforcer.validatePassword('OldPassword123!', 'user1');

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Password cannot be the same as your last 5 passwords');
    });
  });

  describe('calculatePasswordStrength', () => {
    it('should calculate weak password strength', () => {
      const result = PasswordPolicyEnforcer['calculatePasswordStrength']('weak', {
        minLength: 8,
        requireUppercase: true,
        requireLowercase: true,
        requireNumbers: true,
        requireSpecialChars: true
      });

      expect(result).toBe('weak');
    });

    it('should calculate medium password strength', () => {
      const result = PasswordPolicyEnforcer['calculatePasswordStrength']('Medium123!', {
        minLength: 8,
        requireUppercase: true,
        requireLowercase: true,
        requireNumbers: true,
        requireSpecialChars: true
      });

      expect(result).toBe('medium');
    });

    it('should calculate strong password strength', () => {
      const result = PasswordPolicyEnforcer['calculatePasswordStrength']('VeryStrongP@ssw0rd123!', {
        minLength: 8,
        requireUppercase: true,
        requireLowercase: true,
        requireNumbers: true,
        requireSpecialChars: true
      });

      expect(result).toBe('strong');
    });
  });

  describe('isCommonWeakPassword', () => {
    it('should detect common weak passwords', () => {
      const weakPasswords = ['password', '123456', 'qwerty', 'admin'];

      weakPasswords.forEach(password => {
        const result = PasswordPolicyEnforcer['isCommonWeakPassword'](password);
        expect(result).toBe(true);
      });
    });

    it('should allow strong passwords', () => {
      const result = PasswordPolicyEnforcer['isCommonWeakPassword']('MyUniqueP@ss123!');
      expect(result).toBe(false);
    });
  });

  describe('generatePasswordFeedback', () => {
    it('should generate feedback for weak password', () => {
      const feedback = PasswordPolicyEnforcer.generatePasswordFeedback('weak');

      expect(feedback).toContain('Use at least 8 characters');
      expect(feedback).toContain('Include at least one uppercase letter');
      expect(feedback).toContain('Include at least one number');
      expect(feedback).toContain('Include at least one special character');
    });

    it('should generate minimal feedback for strong password', () => {
      const feedback = PasswordPolicyEnforcer.generatePasswordFeedback('StrongP@ss123!');

      expect(feedback).toHaveLength(0);
    });
  });

  describe('addPasswordToHistory', () => {
    it('should add password to user history', async () => {
      mockedSettingsCache.getSecurityPolicy.mockResolvedValue({
        config: { history: [] }
      });
      mockedSettingsCache.setSecurityPolicy.mockResolvedValue();

      await PasswordPolicyEnforcer.addPasswordToHistory('user1', 'NewPassword123!');

      expect(mockedSettingsCache.setSecurityPolicy).toHaveBeenCalledWith(
        'user_user1_passwords',
        'User Password History',
        expect.objectContaining({
          history: expect.any(Array)
        }),
        'user1'
      );
    });

    it('should limit history to 10 entries', async () => {
      const existingHistory = Array.from({ length: 10 }, (_, i) => ({
        hash: `hash${i}`,
        createdAt: new Date()
      }));

      mockedSettingsCache.getSecurityPolicy.mockResolvedValue({
        config: { history: existingHistory }
      });
      mockedSettingsCache.setSecurityPolicy.mockResolvedValue();

      await PasswordPolicyEnforcer.addPasswordToHistory('user1', 'NewPassword123!');

      const setCall = mockedSettingsCache.setSecurityPolicy.mock.calls[0];
      const history = setCall[2].history;

      expect(history).toHaveLength(10); // Should maintain max 10 entries
      expect(history[0].hash).not.toBe('hash0'); // New password should be first
    });
  });

  describe('isPasswordExpired', () => {
    it('should return false for non-expired password', async () => {
      const recentDate = new Date();
      recentDate.setDate(recentDate.getDate() - 30); // 30 days ago

      mockedSettingsCache.getSecurityPolicy
        .mockResolvedValueOnce({ config: { createdAt: recentDate.toISOString() } }) // Password created
        .mockResolvedValueOnce({ config: { expiryDays: 90 } }); // Policy

      const result = await PasswordPolicyEnforcer.isPasswordExpired('user1');

      expect(result).toBe(false);
    });

    it('should return true for expired password', async () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 100); // 100 days ago

      mockedSettingsCache.getSecurityPolicy
        .mockResolvedValueOnce({ config: { createdAt: oldDate.toISOString() } }) // Password created
        .mockResolvedValueOnce({ config: { expiryDays: 90 } }); // Policy

      const result = await PasswordPolicyEnforcer.isPasswordExpired('user1');

      expect(result).toBe(true);
    });

    it('should return false when no creation date stored', async () => {
      mockedSettingsCache.getSecurityPolicy.mockResolvedValue(null);

      const result = await PasswordPolicyEnforcer.isPasswordExpired('user1');

      expect(result).toBe(false);
    });
  });

  describe('updatePasswordCreationDate', () => {
    it('should update password creation date', async () => {
      mockedSettingsCache.setSecurityPolicy.mockResolvedValue();

      await PasswordPolicyEnforcer.updatePasswordCreationDate('user1');

      expect(mockedSettingsCache.setSecurityPolicy).toHaveBeenCalledWith(
        'user_user1_password_created',
        'User Password Creation Date',
        expect.objectContaining({
          createdAt: expect.any(String)
        }),
        'user1'
      );
    });
  });

  describe('getPasswordPolicySummary', () => {
    it('should return password policy summary', async () => {
      mockedSettingsCache.getSecurityPolicy.mockResolvedValue({
        config: {
          minLength: 12,
          requireUppercase: true,
          requireLowercase: true,
          requireNumbers: true,
          requireSpecialChars: true,
          preventReuse: 3,
          expiryDays: 60
        }
      });

      const result = await PasswordPolicyEnforcer.getPasswordPolicySummary();

      expect(result).toEqual({
        minLength: 12,
        requirements: [
          'At least one uppercase letter',
          'At least one lowercase letter',
          'At least one number',
          'At least one special character'
        ],
        preventReuse: 3,
        expiryDays: 60
      });
    });

    it('should handle missing policy gracefully', async () => {
      mockedSettingsCache.getSecurityPolicy.mockResolvedValue(null);

      const result = await PasswordPolicyEnforcer.getPasswordPolicySummary();

      expect(result.minLength).toBe(8);
      expect(result.requirements).toHaveLength(4);
    });
  });
});

// Test utility functions
describe('Password Policy Utilities', () => {
  describe('validatePassword', () => {
    it('should be accessible as a utility function', async () => {
      mockedSettingsCache.getSecurityPolicy.mockResolvedValue({
        config: {
          minLength: 8,
          requireUppercase: true,
          requireLowercase: true,
          requireNumbers: true,
          requireSpecialChars: true,
          preventReuse: 5,
          expiryDays: 90
        }
      });

      const result = await validatePassword('TestPassword123!');

      expect(result).toHaveProperty('isValid');
      expect(result).toHaveProperty('errors');
      expect(result).toHaveProperty('strength');
    });
  });

  describe('addPasswordToHistory', () => {
    it('should be accessible as a utility function', async () => {
      mockedSettingsCache.getSecurityPolicy.mockResolvedValue({
        config: { history: [] }
      });
      mockedSettingsCache.setSecurityPolicy.mockResolvedValue();

      await addPasswordToHistory('user1', 'Password123!');

      expect(mockedSettingsCache.setSecurityPolicy).toHaveBeenCalled();
    });
  });

  describe('isPasswordExpired', () => {
    it('should be accessible as a utility function', async () => {
      mockedSettingsCache.getSecurityPolicy.mockResolvedValue(null);

      const result = await isPasswordExpired('user1');

      expect(result).toBe(false);
    });
  });

  describe('updatePasswordCreationDate', () => {
    it('should be accessible as a utility function', async () => {
      mockedSettingsCache.setSecurityPolicy.mockResolvedValue();

      await updatePasswordCreationDate('user1');

      expect(mockedSettingsCache.setSecurityPolicy).toHaveBeenCalled();
    });
  });
});
