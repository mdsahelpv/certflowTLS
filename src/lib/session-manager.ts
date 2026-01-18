/**
 * Session Manager
 *
 * Advanced session management with concurrent session limits,
 * activity tracking, and cleanup utilities
 */

import { SettingsCacheService } from './settings-cache';
import { AuditService } from './audit';
import crypto from 'crypto';

// Session information interface
export interface SessionInfo {
  id: string;
  userId: string;
  createdAt: Date;
  lastActivity: Date;
  ipAddress: string;
  userAgent: string;
  isRemembered: boolean;
  expiresAt: Date;
}

// Concurrent session limit result
export interface SessionLimitResult {
  allowed: boolean;
  currentSessions: number;
  maxSessions: number;
  sessionsToTerminate: string[];
  message: string;
}

// Session activity log
export interface SessionActivity {
  sessionId: string;
  userId: string;
  action: 'login' | 'logout' | 'activity' | 'expired' | 'terminated';
  timestamp: Date;
  ipAddress: string;
  userAgent: string;
  metadata?: Record<string, any>;
}

// Session Manager Class
export class SessionManager {
  // Check concurrent session limits
  static async checkConcurrentSessionLimit(
    userId: string,
    currentSessionId?: string
  ): Promise<SessionLimitResult> {
    try {
      // Get session configuration
      const sessionConfig = await SettingsCacheService.getSecurityPolicy('session_config');
      const maxSessions = sessionConfig?.config?.maxConcurrentSessions || 5;

      // Get current active sessions for user
      const activeSessions = await this.getActiveSessionsForUser(userId);
      const currentCount = activeSessions.length;

      // Exclude current session if updating existing session
      const effectiveCount = currentSessionId
        ? currentCount
        : currentCount;

      const result: SessionLimitResult = {
        allowed: effectiveCount < maxSessions,
        currentSessions: effectiveCount,
        maxSessions,
        sessionsToTerminate: [],
        message: ''
      };

      if (effectiveCount >= maxSessions) {
        // Calculate which sessions to terminate (oldest first)
        const sessionsToKeep = maxSessions - (currentSessionId ? 1 : 0);
        const sortedSessions = activeSessions
          .filter(s => s.id !== currentSessionId)
          .sort((a, b) => a.lastActivity.getTime() - b.lastActivity.getTime());

        result.sessionsToTerminate = sortedSessions
          .slice(0, sortedSessions.length - sessionsToKeep + 1)
          .map(s => s.id);

        result.message = `Maximum concurrent sessions (${maxSessions}) exceeded. ${result.sessionsToTerminate.length
          } oldest sessions will be terminated.`;
      } else {
        result.message = `Session allowed. ${effectiveCount}/${maxSessions} sessions active.`;
      }

      return result;
    } catch (error) {
      console.error('Error checking concurrent session limit:', error);
      // Allow session on error to prevent lockouts
      return {
        allowed: true,
        currentSessions: 0,
        maxSessions: 5,
        sessionsToTerminate: [],
        message: 'Session limit check failed, allowing session'
      };
    }
  }

  // Get active sessions for a user
  static async getActiveSessionsForUser(userId: string): Promise<SessionInfo[]> {
    try {
      // This would integrate with your session store (Redis, database, etc.)
      // For now, return mock data
      const mockSessions: SessionInfo[] = [
        // Mock sessions would be returned here
      ];

      // TODO: Implement actual session retrieval
      // Example:
      // const sessions = await getSessionsFromStore(userId);
      // return sessions.filter(s => s.isActive && !s.isExpired);

      return mockSessions;
    } catch (error) {
      console.error('Error getting active sessions for user:', error);
      return [];
    }
  }

  // Terminate sessions
  static async terminateSessions(sessionIds: string[], reason: string = 'concurrent_limit'): Promise<number> {
    try {
      let terminated = 0;

      for (const sessionId of sessionIds) {
        try {
          // Terminate session in your session store
          // TODO: Implement actual session termination
          // Example:
          // await terminateSessionInStore(sessionId);

          // Log the termination
          await this.logSessionActivity({
            sessionId,
            userId: 'unknown', // Would need to be determined
            action: 'terminated',
            timestamp: new Date(),
            ipAddress: 'system',
            userAgent: 'system',
            metadata: { reason, terminatedBy: 'system' }
          });

          terminated++;
        } catch (error) {
          console.error(`Error terminating session ${sessionId}:`, error);
        }
      }

      return terminated;
    } catch (error) {
      console.error('Error terminating sessions:', error);
      return 0;
    }
  }

  // Force logout user from all sessions
  static async forceUserLogout(userId: string, reason: string = 'admin_action'): Promise<number> {
    try {
      const activeSessions = await this.getActiveSessionsForUser(userId);
      const sessionIds = activeSessions.map(s => s.id);

      return await this.terminateSessions(sessionIds, reason);
    } catch (error) {
      console.error('Error forcing user logout:', error);
      return 0;
    }
  }

  // Update session activity
  static async updateSessionActivity(sessionId: string, userId: string, ipAddress: string, userAgent: string): Promise<void> {
    try {
      // Update session last activity in your session store
      // TODO: Implement actual session activity update
      // Example:
      // await updateSessionActivityInStore(sessionId, new Date());

      // Log the activity
      await this.logSessionActivity({
        sessionId,
        userId,
        action: 'activity',
        timestamp: new Date(),
        ipAddress,
        userAgent
      });
    } catch (error) {
      console.error('Error updating session activity:', error);
    }
  }

  // Check if session should be extended on activity
  static async shouldExtendSession(sessionId: string): Promise<boolean> {
    try {
      const sessionConfig = await SettingsCacheService.getSecurityPolicy('session_config');
      return sessionConfig?.config?.extendOnActivity ?? true;
    } catch (error) {
      console.error('Error checking session extension:', error);
      return true; // Default to extending on error
    }
  }

  // Extend session expiry
  static async extendSession(sessionId: string, userId: string): Promise<void> {
    try {
      const sessionConfig = await SettingsCacheService.getSecurityPolicy('session_config');
      const timeoutMinutes = sessionConfig?.config?.timeoutMinutes || 30;

      // Calculate new expiry time
      const newExpiry = new Date();
      newExpiry.setMinutes(newExpiry.getMinutes() + timeoutMinutes);

      // Update session expiry in your session store
      // TODO: Implement actual session extension
      // Example:
      // await extendSessionInStore(sessionId, newExpiry);

      // Log the extension
      await this.logSessionActivity({
        sessionId,
        userId,
        action: 'activity',
        timestamp: new Date(),
        ipAddress: 'system',
        userAgent: 'system',
        metadata: { extendedTo: newExpiry.toISOString() }
      });
    } catch (error) {
      console.error('Error extending session:', error);
    }
  }

  // Clean up expired sessions
  static async cleanupExpiredSessions(): Promise<{ deleted: number; errors: string[] }> {
    try {
      const result = {
        deleted: 0,
        errors: [] as string[]
      };

      // Get all expired sessions from your session store
      // TODO: Implement actual expired session cleanup
      // Example:
      // const expiredSessions = await findExpiredSessions();
      // for (const session of expiredSessions) {
      //   try {
      //     await terminateSessionInStore(session.id);
      //     await this.logSessionActivity({
      //       sessionId: session.id,
      //       userId: session.userId,
      //       action: 'expired',
      //       timestamp: new Date(),
      //       ipAddress: 'system',
      //       userAgent: 'system'
      //     });
      //     result.deleted++;
      //   } catch (error) {
      //     result.errors.push(`Failed to cleanup session ${session.id}: ${error}`);
      //   }
      // }

      // Update last cleanup time
      await SettingsCacheService.setSystemConfig('last_session_cleanup', new Date().toISOString());

      return result;
    } catch (error) {
      console.error('Error cleaning up expired sessions:', error);
      return {
        deleted: 0,
        errors: [`Cleanup failed: ${error}`]
      };
    }
  }

  // Get session statistics
  static async getSessionStatistics(): Promise<{
    totalActiveSessions: number;
    sessionsByUser: { userId: string; username: string; sessionCount: number }[];
    expiredSessions: number;
    averageSessionDuration: number;
    lastCleanup: Date | null;
  }> {
    try {
      // Get last cleanup time
      const lastCleanupStr = await SettingsCacheService.getSystemConfig('last_session_cleanup');
      const lastCleanup = lastCleanupStr ? new Date(lastCleanupStr) : null;

      // This would integrate with your session store for real statistics
      // For now, return mock statistics
      const stats = {
        totalActiveSessions: 0,
        sessionsByUser: [],
        expiredSessions: 0,
        averageSessionDuration: 0,
        lastCleanup
      };

      // TODO: Implement actual session statistics
      // Example:
      // const activeSessions = await getAllActiveSessions();
      // const expiredCount = await getExpiredSessionsCount();
      // const userStats = await getSessionsGroupedByUser();
      // const avgDuration = await calculateAverageSessionDuration();

      return stats;
    } catch (error) {
      console.error('Error getting session statistics:', error);
      return {
        totalActiveSessions: 0,
        sessionsByUser: [],
        expiredSessions: 0,
        averageSessionDuration: 0,
        lastCleanup: null
      };
    }
  }

  // Log session activity
  private static async logSessionActivity(activity: SessionActivity): Promise<void> {
    try {
      // Store activity log (could be in database or separate logging system)
      await AuditService.log({
        action: 'LOGIN' as any, // Use existing audit action or create new one
        userId: activity.userId,
        username: activity.userId, // Would need proper username lookup
        description: `Session ${activity.action}: ${activity.sessionId}`,
        metadata: {
          sessionId: activity.sessionId,
          action: activity.action,
          ipAddress: activity.ipAddress,
          userAgent: activity.userAgent,
          ...activity.metadata
        }
      });
    } catch (error) {
      console.error('Error logging session activity:', error);
    }
  }

  // Validate remember me token
  static async validateRememberMeToken(token: string): Promise<{ valid: boolean; userId?: string }> {
    try {
      // This would validate remember me tokens from your token store
      // TODO: Implement actual remember me token validation
      // Example:
      // const tokenData = await validateTokenInStore(token);
      // if (tokenData && tokenData.expiresAt > new Date()) {
      //   return { valid: true, userId: tokenData.userId };
      // }

      return { valid: false };
    } catch (error) {
      console.error('Error validating remember me token:', error);
      return { valid: false };
    }
  }

  // Create remember me token
  static async createRememberMeToken(userId: string): Promise<string> {
    try {
      const sessionConfig = await SettingsCacheService.getSecurityPolicy('session_config');
      const rememberMeDays = sessionConfig?.config?.rememberMeDays || 30;

      // Calculate expiry
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + rememberMeDays);

      // Generate secure token
      const token = crypto.randomBytes(32).toString('hex');

      // Store token in your token store
      // TODO: Implement actual token storage
      // Example:
      // await storeRememberMeToken(token, userId, expiresAt);

      return token;
    } catch (error) {
      console.error('Error creating remember me token:', error);
      throw new Error('Failed to create remember me token');
    }
  }

  // Clean up expired remember me tokens
  static async cleanupExpiredRememberMeTokens(): Promise<number> {
    try {
      // Clean up expired tokens from your token store
      // TODO: Implement actual token cleanup
      // Example:
      // const deleted = await deleteExpiredTokens();

      return 0;
    } catch (error) {
      console.error('Error cleaning up expired remember me tokens:', error);
      return 0;
    }
  }
}

// Export utilities
export const checkConcurrentSessionLimit = SessionManager.checkConcurrentSessionLimit.bind(SessionManager);
export const getActiveSessionsForUser = SessionManager.getActiveSessionsForUser.bind(SessionManager);
export const terminateSessions = SessionManager.terminateSessions.bind(SessionManager);
export const forceUserLogout = SessionManager.forceUserLogout.bind(SessionManager);
export const updateSessionActivity = SessionManager.updateSessionActivity.bind(SessionManager);
export const shouldExtendSession = SessionManager.shouldExtendSession.bind(SessionManager);
export const extendSession = SessionManager.extendSession.bind(SessionManager);
export const cleanupExpiredSessions = SessionManager.cleanupExpiredSessions.bind(SessionManager);
export const getSessionStatistics = SessionManager.getSessionStatistics.bind(SessionManager);
export const validateRememberMeToken = SessionManager.validateRememberMeToken.bind(SessionManager);
export const createRememberMeToken = SessionManager.createRememberMeToken.bind(SessionManager);
export const cleanupExpiredRememberMeTokens = SessionManager.cleanupExpiredRememberMeTokens.bind(SessionManager);

export default SessionManager;
