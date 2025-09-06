import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { SettingsValidation } from '@/lib/settings-validation';
import { AuditService } from '@/lib/audit';
import { SettingsCacheService } from '@/lib/settings-cache';

// Security configuration interface
interface SecurityConfig {
  passwordPolicy: {
    minLength: number;
    requireUppercase: boolean;
    requireLowercase: boolean;
    requireNumbers: boolean;
    requireSpecialChars: boolean;
    preventReuse: number;
    expiryDays: number;
  };
  sessionConfig: {
    timeoutMinutes: number;
    maxConcurrentSessions: number;
    extendOnActivity: boolean;
    rememberMeDays: number;
  };
  auditConfig: {
    enabled: boolean;
    logLevel: string;
    retentionDays: number;
    alertOnSuspicious: boolean;
  };
}

// GET - Retrieve current security configuration
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

    // Get security configuration from database with caching
    const [
      passwordPolicy,
      sessionConfig,
      auditConfig
    ] = await Promise.all([
      SettingsCacheService.getSecurityPolicy('password_policy'),
      SettingsCacheService.getSecurityPolicy('session_config'),
      SettingsCacheService.getSecurityPolicy('audit_config')
    ]);

    // Build response configuration
    const config: SecurityConfig = {
      passwordPolicy: passwordPolicy?.config || {
        minLength: 8,
        requireUppercase: true,
        requireLowercase: true,
        requireNumbers: true,
        requireSpecialChars: true,
        preventReuse: 5,
        expiryDays: 90,
      },
      sessionConfig: sessionConfig?.config || {
        timeoutMinutes: 30,
        maxConcurrentSessions: 5,
        extendOnActivity: true,
        rememberMeDays: 30,
      },
      auditConfig: auditConfig?.config || {
        enabled: true,
        logLevel: 'info',
        retentionDays: 365,
        alertOnSuspicious: true,
      },
    };

    return NextResponse.json(config);
  } catch (error) {
    console.error('Error fetching security config:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST - Update security configuration
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
      case 'updatePasswordPolicy':
        // Validate password policy
        if (!updateConfig.passwordPolicy) {
          return NextResponse.json({ error: 'Password policy configuration is required' }, { status: 400 });
        }

        const passwordValidation = SettingsValidation.validatePasswordPolicy(updateConfig.passwordPolicy);
        if (!passwordValidation.isValid) {
          return NextResponse.json({
            error: 'Invalid password policy configuration',
            details: passwordValidation.errors
          }, { status: 400 });
        }

        // Get current policy for audit logging
        const currentPasswordPolicy = await SettingsCacheService.getSecurityPolicy('password_policy');

        // Update password policy in database
        await SettingsCacheService.setSecurityPolicy(
          'password_policy',
          'Password Policy',
          updateConfig.passwordPolicy,
          userId
        );

        // Log the change
        await AuditService.logPasswordPolicyChange(
          userId,
          username,
          currentPasswordPolicy?.config,
          updateConfig.passwordPolicy
        );

        return NextResponse.json({
          success: true,
          message: 'Password policy updated successfully'
        });

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

      case 'updateAuditConfig':
        // Validate audit configuration
        if (!updateConfig.auditConfig) {
          return NextResponse.json({ error: 'Audit configuration is required' }, { status: 400 });
        }

        const auditValidation = SettingsValidation.validateAuditConfig(updateConfig.auditConfig);
        if (!auditValidation.isValid) {
          return NextResponse.json({
            error: 'Invalid audit configuration',
            details: auditValidation.errors
          }, { status: 400 });
        }

        // Get current config for audit logging
        const currentAuditConfig = await SettingsCacheService.getSecurityPolicy('audit_config');

        // Update audit configuration in database
        await SettingsCacheService.setSecurityPolicy(
          'audit_config',
          'Audit Configuration',
          updateConfig.auditConfig,
          userId
        );

        // Log the change
        await AuditService.logAuditConfigChange(
          userId,
          username,
          currentAuditConfig?.config,
          updateConfig.auditConfig
        );

        return NextResponse.json({
          success: true,
          message: 'Audit configuration updated successfully'
        });

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Error updating security config:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
