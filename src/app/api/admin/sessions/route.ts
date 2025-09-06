import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { SettingsValidation } from '@/lib/settings-validation';
import { AuditService } from '@/lib/audit';
import { SettingsCacheService } from '@/lib/settings-cache';

// Session configuration interface
interface SessionConfig {
  timeoutMinutes: number;
  maxConcurrentSessions: number;
  extendOnActivity: boolean;
  rememberMeDays: number;
  cleanupIntervalHours: number;
  enableActivityTracking: boolean;
}

// Session statistics interface
interface SessionStats {
  totalActiveSessions: number;
  sessionsByUser: { userId: string; username: string; sessionCount: number }[];
  expiredSessions: number;
  averageSessionDuration: number;
  lastCleanup: Date | null;
}

// GET - Retrieve current session configuration and statistics
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const permissions = (session.user as any).permissions || [];
    if (!permissions.includes('config:manage')) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    // Get session configuration from database with caching
    const [
      sessionConfig,
      sessionStats
    ] = await Promise.all([
      SettingsCacheService.getSecurityPolicy('session_config'),
      getSessionStatistics()
    ]);

    // Build response configuration
    const config: SessionConfig = sessionConfig?.config || {
      timeoutMinutes: 30,
      maxConcurrentSessions: 5,
      extendOnActivity: true,
      rememberMeDays: 30,
      cleanupIntervalHours: 24,
      enableActivityTracking: true
    };

    return NextResponse.json({
      config,
      statistics: sessionStats
    });
  } catch (error) {
    console.error('Error fetching session config:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST - Update session configuration
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const permissions = (session.user as any).permissions || [];
    if (!permissions.includes('config:manage')) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const body = await request.json();
    const { action, config: updateConfig } = body;
    const userId = (session.user as any).id;
    const username = (session.user as any).username || session.user.email;

    switch (action) {
      case 'updateSessionConfig':
        // Validate session configuration
        if (!updateConfig.sessionConfig) {
          return NextResponse.json({ error: 'Session configuration is required' }, { status: 400 });
        }

        const sessionValidation = SettingsValidation.validateSessionConfig(updateConfig.sessionConfig);
        if (!sessionValidation.isValid) {
          return NextResponse.json({
            error: 'Invalid session configuration',
            details: sessionValidation.errors
          }, { status: 400 });
        }

        // Get current config for audit logging
        const currentSessionConfig = await SettingsCacheService.getSecurityPolicy('session_config');

        // Update session configuration in database
        await SettingsCacheService.setSecurityPolicy(
          'session_config',
          'Session Configuration',
          updateConfig.sessionConfig,
          userId
        );

        // Log the change
        await AuditService.logSessionConfigChange(
          userId,
          username,
          currentSessionConfig?.config,
          updateConfig.sessionConfig
        );

        return NextResponse.json({
          success: true,
          message: 'Session configuration updated successfully'
        });

      case 'cleanupExpiredSessions':
        // Perform session cleanup
        const cleanupResult = await performSessionCleanup();

        // Log the cleanup
        await AuditService.log({
          action: 'CONFIG_UPDATED' as any,
          userId,
          username,
          description: `Session cleanup performed: ${cleanupResult.deleted} sessions removed`,
          metadata: cleanupResult
        });

        return NextResponse.json({
          success: true,
          message: `Session cleanup completed: ${cleanupResult.deleted} sessions removed`,
          result: cleanupResult
        });

      case 'forceLogoutUser':
        // Force logout a specific user
        const { targetUserId } = updateConfig;

        if (!targetUserId) {
          return NextResponse.json({ error: 'Target user ID is required' }, { status: 400 });
        }

        const logoutResult = await forceUserLogout(targetUserId);

        // Log the forced logout
        await AuditService.log({
          action: 'USER_UPDATED' as any,
          userId,
          username,
          description: `Forced logout for user ${targetUserId}`,
          metadata: { targetUserId, sessionsTerminated: logoutResult }
        });

        return NextResponse.json({
          success: true,
          message: `User ${targetUserId} has been logged out from ${logoutResult} sessions`,
          result: logoutResult
        });

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Error updating session config:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Helper function to get session statistics
async function getSessionStatistics(): Promise<SessionStats> {
  try {
    // This would integrate with your session store (Redis, database, etc.)
    // For now, return mock statistics
    const stats: SessionStats = {
      totalActiveSessions: 0,
      sessionsByUser: [],
      expiredSessions: 0,
      averageSessionDuration: 0,
      lastCleanup: null
    };

    // TODO: Implement actual session statistics from your session store
    // Example:
    // const activeSessions = await getActiveSessionsFromStore();
    // const expiredSessions = await getExpiredSessionsCount();
    // const userSessionCounts = await getSessionsGroupedByUser();

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

// Helper function to perform session cleanup
async function performSessionCleanup(): Promise<{ deleted: number; errors: string[] }> {
  try {
    // This would integrate with your session store to clean up expired sessions
    // For now, return mock result
    const result = {
      deleted: 0,
      errors: [] as string[]
    };

    // TODO: Implement actual session cleanup
    // Example:
    // const expiredSessions = await findExpiredSessions();
    // const deleted = await deleteSessions(expiredSessions);

    // Update last cleanup time
    await SettingsCacheService.setSystemConfig('last_session_cleanup', new Date().toISOString());

    return result;
  } catch (error) {
    console.error('Error performing session cleanup:', error);
    return {
      deleted: 0,
      errors: [`Cleanup failed: ${error}`]
    };
  }
}

// Helper function to force user logout
async function forceUserLogout(userId: string): Promise<number> {
  try {
    // This would integrate with your session store to terminate user's sessions
    // For now, return mock result
    const terminatedSessions = 0;

    // TODO: Implement actual user logout
    // Example:
    // const userSessions = await findSessionsByUser(userId);
    // const terminated = await terminateSessions(userSessions);

    return terminatedSessions;
  } catch (error) {
    console.error('Error forcing user logout:', error);
    return 0;
  }
}
