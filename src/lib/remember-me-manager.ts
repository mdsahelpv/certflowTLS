/**
 * Remember Me Manager
 *
 * Secure token-based authentication for extended sessions
 * Implements secure token generation, validation, and cleanup
 */

import { SettingsCacheService } from './settings-cache';
import { AuditService } from './audit';
import { db } from '@/lib/db';
import crypto from 'crypto';

// Remember me token interface
export interface RememberMeToken {
  id: string;
  userId: string;
  token: string;
  createdAt: Date;
  expiresAt: Date;
  lastUsedAt?: Date;
  ipAddress: string;
  userAgent: string;
  deviceInfo?: {
    browser?: string;
    os?: string;
    device?: string;
  };
}

// Remember me configuration
export interface RememberMeConfig {
  enabled: boolean;
  tokenExpiryDays: number;
  maxTokensPerUser: number;
  requireSecureConnection: boolean;
  allowMultipleDevices: boolean;
}

// Token validation result
export interface TokenValidationResult {
  valid: boolean;
  userId?: string;
  token?: RememberMeToken;
  reason?: string;
}

// Remember Me Manager Class
export class RememberMeManager {
  // Generate secure random token
  private static generateSecureToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  // Create remember me token for user
  static async createToken(
    userId: string,
    ipAddress: string,
    userAgent: string
  ): Promise<RememberMeToken> {
    try {
      // Get remember me configuration
      const config = await this.getConfig();

      if (!config.enabled) {
        throw new Error('Remember me functionality is disabled');
      }

      // Check if we need to clean up expired tokens first
      await this.cleanupExpiredTokens(userId);

      // Check current token count for user
      const currentTokens = await this.getUserTokens(userId);
      if (currentTokens.length >= config.maxTokensPerUser) {
        // Remove oldest token if at limit
        if (currentTokens.length > 0) {
          const oldestToken = currentTokens.sort((a, b) =>
            a.createdAt.getTime() - b.createdAt.getTime()
          )[0];
          await this.removeToken(oldestToken.id);
        }
      }

      // Parse device info from user agent
      const deviceInfo = this.parseUserAgent(userAgent);

      // Generate new token
      const tokenId = `remember_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const tokenValue = this.generateSecureToken();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + config.tokenExpiryDays);

      const token: RememberMeToken = {
        id: tokenId,
        userId,
        token: tokenValue,
        createdAt: new Date(),
        expiresAt,
        ipAddress,
        userAgent,
        deviceInfo
      };

      // Store token
      await this.storeToken(token);

      // Log token creation
      await AuditService.log({
        action: 'LOGIN' as any,
        userId,
        username: userId, // Would need proper username lookup
        description: 'Remember me token created',
        metadata: {
          tokenId,
          ipAddress,
          userAgent,
          deviceInfo,
          expiresAt: expiresAt.toISOString()
        }
      });

      return token;
    } catch (error) {
      console.error('Error creating remember me token:', error);
      throw error;
    }
  }

  // Validate remember me token
  static async validateToken(tokenValue: string, ipAddress: string): Promise<TokenValidationResult> {
    try {
      const config = await this.getConfig();

      if (!config.enabled) {
        return { valid: false, reason: 'Remember me functionality is disabled' };
      }

      // Find token in storage
      const token = await this.findTokenByValue(tokenValue);

      if (!token) {
        return { valid: false, reason: 'Token not found' };
      }

      // Check if token is expired
      if (token.expiresAt < new Date()) {
        await this.removeToken(token.id);
        return { valid: false, reason: 'Token expired' };
      }

      // Check IP address consistency (optional security feature)
      if (!config.allowMultipleDevices && token.ipAddress !== ipAddress) {
        // Log suspicious activity
        await AuditService.log({
          action: 'CONFIG_UPDATED' as any, // Use existing action
          userId: token.userId,
          username: token.userId,
          description: 'Remember me token used from different IP',
          metadata: {
            tokenId: token.id,
            originalIP: token.ipAddress,
            currentIP: ipAddress,
            userAgent: token.userAgent
          }
        });

        // Optionally invalidate token for security
        if (config.requireSecureConnection) {
          await this.removeToken(token.id);
          return { valid: false, reason: 'IP address mismatch' };
        }
      }

      // Update last used timestamp
      await this.updateTokenUsage(token.id, ipAddress);

      return { valid: true, userId: token.userId, token };
    } catch (error) {
      console.error('Error validating remember me token:', error);
      return { valid: false, reason: 'Validation error' };
    }
  }

  // Remove remember me token
  static async removeToken(tokenId: string): Promise<boolean> {
    try {
      // Remove from storage
      const tokenKey = `remember_token_${tokenId}`;
      SettingsCacheService.invalidateKey(tokenKey);

      // Also remove from user's token list
      const token = await this.findTokenById(tokenId);
      if (token) {
        await this.removeTokenFromUserList(token.userId, tokenId);
      }

      return true;
    } catch (error) {
      console.error('Error removing remember me token:', error);
      return false;
    }
  }

  // Remove all tokens for a user
  static async removeAllUserTokens(userId: string): Promise<number> {
    try {
      const userTokens = await this.getUserTokens(userId);
      let removed = 0;

      for (const token of userTokens) {
        if (await this.removeToken(token.id)) {
          removed++;
        }
      }

      // Log the action
      await AuditService.log({
        action: 'USER_UPDATED' as any,
        userId,
        username: userId,
        description: `All remember me tokens removed: ${removed} tokens`,
        metadata: { tokensRemoved: removed }
      });

      return removed;
    } catch (error) {
      console.error('Error removing all user tokens:', error);
      return 0;
    }
  }

  // Get all tokens for a user
  static async getUserTokens(userId: string): Promise<RememberMeToken[]> {
    try {
      const userTokensKey = `user_remember_tokens_${userId}`;
      const userTokensData = await SettingsCacheService.getSecurityPolicy(userTokensKey);

      if (!userTokensData?.config?.tokens) {
        return [];
      }

      const tokenIds: string[] = userTokensData.config.tokens;
      const tokens: RememberMeToken[] = [];

      for (const tokenId of tokenIds) {
        const token = await this.findTokenById(tokenId);
        if (token) {
          tokens.push(token);
        }
      }

      return tokens;
    } catch (error) {
      console.error('Error getting user tokens:', error);
      return [];
    }
  }

  // Clean up expired tokens for a user
  static async cleanupExpiredTokens(userId: string): Promise<number> {
    try {
      const userTokens = await this.getUserTokens(userId);
      const now = new Date();
      let cleaned = 0;

      for (const token of userTokens) {
        if (token.expiresAt < now) {
          await this.removeToken(token.id);
          cleaned++;
        }
      }

      return cleaned;
    } catch (error) {
      console.error('Error cleaning up expired tokens:', error);
      return 0;
    }
  }

  // Clean up all expired tokens (system-wide)
  static async cleanupAllExpiredTokens(): Promise<number> {
    try {
      // This would need to iterate through all users and their tokens
      // For now, return 0 as this requires more complex implementation
      return 0;
    } catch (error) {
      console.error('Error cleaning up all expired tokens:', error);
      return 0;
    }
  }

  // Get remember me configuration
  static async getConfig(): Promise<RememberMeConfig> {
    try {
      const configData = await SettingsCacheService.getSecurityPolicy('remember_me_config');

      return configData?.config || {
        enabled: true,
        tokenExpiryDays: 30,
        maxTokensPerUser: 5,
        requireSecureConnection: false,
        allowMultipleDevices: true
      };
    } catch (error) {
      console.error('Error getting remember me config:', error);
      return {
        enabled: true,
        tokenExpiryDays: 30,
        maxTokensPerUser: 5,
        requireSecureConnection: false,
        allowMultipleDevices: true
      };
    }
  }

  // Update remember me configuration
  static async updateConfig(config: Partial<RememberMeConfig>): Promise<void> {
    try {
      const currentConfig = await this.getConfig();
      const updatedConfig = { ...currentConfig, ...config };

      await SettingsCacheService.setSecurityPolicy(
        'remember_me_config',
        'Remember Me Configuration',
        updatedConfig,
        'system'
      );

      // Log configuration change
      await AuditService.log({
        action: 'CONFIG_UPDATED' as any,
        userId: 'system',
        username: 'system',
        description: 'Remember me configuration updated',
        metadata: { oldConfig: currentConfig, newConfig: updatedConfig }
      });
    } catch (error) {
      console.error('Error updating remember me config:', error);
      throw error;
    }
  }

  // Private helper methods

  private static async storeToken(token: RememberMeToken): Promise<void> {
    // Store individual token
    const tokenKey = `remember_token_${token.id}`;
    await SettingsCacheService.setSecurityPolicy(
      tokenKey,
      'Remember Me Token',
      token,
      token.userId
    );

    // Add to user's token list
    await this.addTokenToUserList(token.userId, token.id);
  }

  private static async addTokenToUserList(userId: string, tokenId: string): Promise<void> {
    const userTokensKey = `user_remember_tokens_${userId}`;
    const userTokensData = await SettingsCacheService.getSecurityPolicy(userTokensKey);
    const tokens: string[] = userTokensData?.config?.tokens || [];

    if (!tokens.includes(tokenId)) {
      tokens.push(tokenId);
      await SettingsCacheService.setSecurityPolicy(
        userTokensKey,
        'User Remember Me Tokens',
        { tokens },
        userId
      );
    }
  }

  private static async removeTokenFromUserList(userId: string, tokenId: string): Promise<void> {
    const userTokensKey = `user_remember_tokens_${userId}`;
    const userTokensData = await SettingsCacheService.getSecurityPolicy(userTokensKey);

    if (userTokensData?.config?.tokens) {
      const tokens: string[] = userTokensData.config.tokens.filter((id: string) => id !== tokenId);
      await SettingsCacheService.setSecurityPolicy(
        userTokensKey,
        'User Remember Me Tokens',
        { tokens },
        userId
      );
    }
  }

  private static async findTokenByValue(tokenValue: string): Promise<RememberMeToken | null> {
    try {
      // This is inefficient for production - would need a proper index
      // For now, we'll need to search through all tokens
      // In production, this should be implemented with proper database indexing
      return null; // Placeholder
    } catch (error) {
      console.error('Error finding token by value:', error);
      return null;
    }
  }

  private static async findTokenById(tokenId: string): Promise<RememberMeToken | null> {
    try {
      const tokenKey = `remember_token_${tokenId}`;
      const tokenData = await SettingsCacheService.getSecurityPolicy(tokenKey);

      return tokenData?.config || null;
    } catch (error) {
      console.error('Error finding token by ID:', error);
      return null;
    }
  }

  private static async updateTokenUsage(tokenId: string, ipAddress: string): Promise<void> {
    try {
      const token = await this.findTokenById(tokenId);
      if (token) {
        token.lastUsedAt = new Date();
        await this.storeToken(token);
      }
    } catch (error) {
      console.error('Error updating token usage:', error);
    }
  }

  private static parseUserAgent(userAgent: string): { browser?: string; os?: string; device?: string } {
    const deviceInfo: { browser?: string; os?: string; device?: string } = {};

    try {
      // Simple user agent parsing
      if (userAgent.includes('Chrome')) deviceInfo.browser = 'Chrome';
      else if (userAgent.includes('Firefox')) deviceInfo.browser = 'Firefox';
      else if (userAgent.includes('Safari')) deviceInfo.browser = 'Safari';
      else if (userAgent.includes('Edge')) deviceInfo.browser = 'Edge';
      else deviceInfo.browser = 'Unknown';

      if (userAgent.includes('Windows')) deviceInfo.os = 'Windows';
      else if (userAgent.includes('Mac')) deviceInfo.os = 'macOS';
      else if (userAgent.includes('Linux')) deviceInfo.os = 'Linux';
      else if (userAgent.includes('Android')) deviceInfo.os = 'Android';
      else if (userAgent.includes('iOS')) deviceInfo.os = 'iOS';
      else deviceInfo.os = 'Unknown';

      if (userAgent.includes('Mobile')) deviceInfo.device = 'Mobile';
      else if (userAgent.includes('Tablet')) deviceInfo.device = 'Tablet';
      else deviceInfo.device = 'Desktop';
    } catch (error) {
      console.error('Error parsing user agent:', error);
    }

    return deviceInfo;
  }
}

// Export utilities
export const createRememberMeToken = RememberMeManager.createToken.bind(RememberMeManager);
export const validateRememberMeToken = RememberMeManager.validateToken.bind(RememberMeManager);
export const removeRememberMeToken = RememberMeManager.removeToken.bind(RememberMeManager);
export const removeAllUserRememberMeTokens = RememberMeManager.removeAllUserTokens.bind(RememberMeManager);
export const getUserRememberMeTokens = RememberMeManager.getUserTokens.bind(RememberMeManager);
export const cleanupExpiredRememberMeTokens = RememberMeManager.cleanupExpiredTokens.bind(RememberMeManager);
export const getRememberMeConfig = RememberMeManager.getConfig.bind(RememberMeManager);
export const updateRememberMeConfig = RememberMeManager.updateConfig.bind(RememberMeManager);

export default RememberMeManager;
