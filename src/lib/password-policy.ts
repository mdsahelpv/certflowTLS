/**
 * Password Policy Enforcement
 *
 * Middleware and utilities for enforcing password policies
 * across user registration and password change operations
 */

import bcrypt from 'bcryptjs';
import { SettingsCacheService } from './settings-cache';
import { SettingsValidation } from './settings-validation';

// Password policy enforcement result
export interface PasswordValidationResult {
  isValid: boolean;
  errors: string[];
  warnings?: string[];
  strength: 'weak' | 'medium' | 'strong';
}

// Password history entry
export interface PasswordHistoryEntry {
  hash: string;
  createdAt: Date;
  expiresAt?: Date;
}

// Password policy enforcement class
export class PasswordPolicyEnforcer {
  // Validate password against current policy
  static async validatePassword(password: string, userId?: string): Promise<PasswordValidationResult> {
    const result: PasswordValidationResult = {
      isValid: false,
      errors: [],
      warnings: [],
      strength: 'weak'
    };

    // Ensure warnings array exists
    if (!result.warnings) {
      result.warnings = [];
    }

    try {
      // Get current password policy
      const policySetting = await SettingsCacheService.getSecurityPolicy('password_policy');
      const policy = policySetting?.config || {
        minLength: 8,
        requireUppercase: true,
        requireLowercase: true,
        requireNumbers: true,
        requireSpecialChars: true,
        preventReuse: 5,
        expiryDays: 90,
      };

      // Basic validation checks
      if (!password || password.length === 0) {
        result.errors.push('Password is required');
        return result;
      }

      // Length validation
      if (password.length < policy.minLength) {
        result.errors.push(`Password must be at least ${policy.minLength} characters long`);
      }

      // Character requirements
      if (policy.requireUppercase && !/[A-Z]/.test(password)) {
        result.errors.push('Password must contain at least one uppercase letter');
      }

      if (policy.requireLowercase && !/[a-z]/.test(password)) {
        result.errors.push('Password must contain at least one lowercase letter');
      }

      if (policy.requireNumbers && !/\d/.test(password)) {
        result.errors.push('Password must contain at least one number');
      }

      if (policy.requireSpecialChars && !/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
        result.errors.push('Password must contain at least one special character');
      }

      // Check for password reuse if userId is provided
      if (userId && policy.preventReuse > 0) {
        const isReused = await this.checkPasswordReuse(password, userId, policy.preventReuse);
        if (isReused) {
          result.errors.push(`Password cannot be the same as your last ${policy.preventReuse} passwords`);
        }
      }

      // Calculate password strength
      result.strength = this.calculatePasswordStrength(password, policy);

      // Add warnings for weak passwords
      if (result.strength === 'weak') {
        result.warnings.push('Password strength is weak. Consider using a stronger password.');
      }

      // Check for common weak passwords
      if (this.isCommonWeakPassword(password)) {
        result.errors.push('Password is too common. Please choose a more unique password.');
      }

      result.isValid = result.errors.length === 0;

      return result;
    } catch (error) {
      console.error('Error validating password:', error);
      result.errors.push('Password validation failed');
      return result;
    }
  }

  // Check if password has been used recently
  static async checkPasswordReuse(password: string, userId: string, preventReuseCount: number): Promise<boolean> {
    try {
      // Get user's recent password history
      const user = await SettingsCacheService.getSecurityPolicy(`user_${userId}_passwords`);
      const passwordHistory: PasswordHistoryEntry[] = user?.config?.history || [];

      // Check against recent passwords
      for (const entry of passwordHistory.slice(0, preventReuseCount)) {
        const isMatch = await bcrypt.compare(password, entry.hash);
        if (isMatch) {
          return true; // Password was reused
        }
      }

      return false; // Password not reused
    } catch (error) {
      console.error('Error checking password reuse:', error);
      return false; // Allow password change if check fails
    }
  }

  // Add password to user's history
  static async addPasswordToHistory(userId: string, password: string): Promise<void> {
    try {
      // Hash the password for storage
      const hash = await bcrypt.hash(password, 12);

      // Get current history
      const user = await SettingsCacheService.getSecurityPolicy(`user_${userId}_passwords`);
      const passwordHistory: PasswordHistoryEntry[] = user?.config?.history || [];

      // Add new password to history
      const newEntry: PasswordHistoryEntry = {
        hash,
        createdAt: new Date()
      };

      passwordHistory.unshift(newEntry);

      // Keep only last 10 passwords in history
      const trimmedHistory = passwordHistory.slice(0, 10);

      // Update user's password history
      await SettingsCacheService.setSecurityPolicy(
        `user_${userId}_passwords`,
        'User Password History',
        { history: trimmedHistory },
        userId
      );
    } catch (error) {
      console.error('Error adding password to history:', error);
      // Don't throw error - password change should still succeed
    }
  }

  // Check if password is expired for a user
  static async isPasswordExpired(userId: string): Promise<boolean> {
    try {
      // Get user's password creation date
      const user = await SettingsCacheService.getSecurityPolicy(`user_${userId}_password_created`);
      const passwordCreated = user?.config?.createdAt;

      if (!passwordCreated) {
        return false; // No creation date stored, assume not expired
      }

      // Get password expiry policy
      const policySetting = await SettingsCacheService.getSecurityPolicy('password_policy');
      const expiryDays = policySetting?.config?.expiryDays || 90;

      const expiryDate = new Date(passwordCreated);
      expiryDate.setDate(expiryDate.getDate() + expiryDays);

      return new Date() > expiryDate;
    } catch (error) {
      console.error('Error checking password expiry:', error);
      return false; // Don't block login if check fails
    }
  }

  // Update user's password creation date
  static async updatePasswordCreationDate(userId: string): Promise<void> {
    try {
      await SettingsCacheService.setSecurityPolicy(
        `user_${userId}_password_created`,
        'User Password Creation Date',
        { createdAt: new Date().toISOString() },
        userId
      );
    } catch (error) {
      console.error('Error updating password creation date:', error);
    }
  }

  // Calculate password strength
  private static calculatePasswordStrength(password: string, policy: any): 'weak' | 'medium' | 'strong' {
    let score = 0;

    // Length scoring
    if (password.length >= policy.minLength) score += 1;
    if (password.length >= 12) score += 1;
    if (password.length >= 16) score += 1;

    // Character variety scoring
    if (/[A-Z]/.test(password)) score += 1;
    if (/[a-z]/.test(password)) score += 1;
    if (/\d/.test(password)) score += 1;
    if (/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) score += 1;

    // Complexity scoring
    if (password.length >= 8 && /[A-Z]/.test(password) && /[a-z]/.test(password) && /\d/.test(password)) score += 1;

    if (score >= 7) return 'strong';
    if (score >= 4) return 'medium';
    return 'weak';
  }

  // Check for common weak passwords
  private static isCommonWeakPassword(password: string): boolean {
    const commonPasswords = [
      'password', '123456', '123456789', 'qwerty', 'abc123',
      'password123', 'admin', 'letmein', 'welcome', 'monkey',
      '1234567890', 'password1', 'qwerty123', 'welcome123'
    ];

    return commonPasswords.includes(password.toLowerCase());
  }

  // Generate password strength feedback
  static generatePasswordFeedback(password: string): string[] {
    const feedback: string[] = [];

    if (password.length < 8) {
      feedback.push('Use at least 8 characters');
    }

    if (!/[A-Z]/.test(password)) {
      feedback.push('Include at least one uppercase letter');
    }

    if (!/[a-z]/.test(password)) {
      feedback.push('Include at least one lowercase letter');
    }

    if (!/\d/.test(password)) {
      feedback.push('Include at least one number');
    }

    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
      feedback.push('Include at least one special character');
    }

    if (this.isCommonWeakPassword(password)) {
      feedback.push('Avoid common passwords');
    }

    return feedback;
  }

  // Middleware for password validation in API routes
  static createPasswordValidationMiddleware() {
    return async (password: string, userId?: string): Promise<PasswordValidationResult> => {
      return await this.validatePassword(password, userId);
    };
  }

  // Utility to enforce password policy on user creation
  static async enforcePasswordPolicyOnUserCreation(password: string): Promise<PasswordValidationResult> {
    return await this.validatePassword(password);
  }

  // Utility to enforce password policy on password change
  static async enforcePasswordPolicyOnPasswordChange(password: string, userId: string): Promise<PasswordValidationResult> {
    return await this.validatePassword(password, userId);
  }

  // Get password policy summary for display
  static async getPasswordPolicySummary(): Promise<{
    minLength: number;
    requirements: string[];
    preventReuse: number;
    expiryDays: number;
  }> {
    try {
      const policySetting = await SettingsCacheService.getSecurityPolicy('password_policy');
      const policy = policySetting?.config || {
        minLength: 8,
        requireUppercase: true,
        requireLowercase: true,
        requireNumbers: true,
        requireSpecialChars: true,
        preventReuse: 5,
        expiryDays: 90,
      };

      const requirements: string[] = [];
      if (policy.requireUppercase) requirements.push('At least one uppercase letter');
      if (policy.requireLowercase) requirements.push('At least one lowercase letter');
      if (policy.requireNumbers) requirements.push('At least one number');
      if (policy.requireSpecialChars) requirements.push('At least one special character');

      return {
        minLength: policy.minLength,
        requirements,
        preventReuse: policy.preventReuse,
        expiryDays: policy.expiryDays
      };
    } catch (error) {
      console.error('Error getting password policy summary:', error);
      return {
        minLength: 8,
        requirements: ['At least one uppercase letter', 'At least one lowercase letter', 'At least one number', 'At least one special character'],
        preventReuse: 5,
        expiryDays: 90
      };
    }
  }
}

// Export utilities
export const validatePassword = PasswordPolicyEnforcer.validatePassword.bind(PasswordPolicyEnforcer);
export const enforcePasswordPolicy = PasswordPolicyEnforcer.createPasswordValidationMiddleware();
export const addPasswordToHistory = PasswordPolicyEnforcer.addPasswordToHistory.bind(PasswordPolicyEnforcer);
export const isPasswordExpired = PasswordPolicyEnforcer.isPasswordExpired.bind(PasswordPolicyEnforcer);
export const updatePasswordCreationDate = PasswordPolicyEnforcer.updatePasswordCreationDate.bind(PasswordPolicyEnforcer);
export const generatePasswordFeedback = PasswordPolicyEnforcer.generatePasswordFeedback.bind(PasswordPolicyEnforcer);
export const getPasswordPolicySummary = PasswordPolicyEnforcer.getPasswordPolicySummary.bind(PasswordPolicyEnforcer);

export default PasswordPolicyEnforcer;
