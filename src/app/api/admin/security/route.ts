import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';

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
  mfaConfig: {
    enabled: boolean;
    requiredForAdmins: boolean;
    allowedMethods: string[];
    gracePeriodHours: number;
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

    // Get security configuration from environment or database
    const config: SecurityConfig = {
      passwordPolicy: {
        minLength: parseInt(process.env.PASSWORD_MIN_LENGTH || '8'),
        requireUppercase: process.env.PASSWORD_REQUIRE_UPPERCASE === 'true',
        requireLowercase: process.env.PASSWORD_REQUIRE_LOWERCASE === 'true',
        requireNumbers: process.env.PASSWORD_REQUIRE_NUMBERS === 'true',
        requireSpecialChars: process.env.PASSWORD_REQUIRE_SPECIAL === 'true',
        preventReuse: parseInt(process.env.PASSWORD_PREVENT_REUSE || '5'),
        expiryDays: parseInt(process.env.PASSWORD_EXPIRY_DAYS || '90'),
      },
      sessionConfig: {
        timeoutMinutes: parseInt(process.env.SESSION_TIMEOUT_MINUTES || '30'),
        maxConcurrentSessions: parseInt(process.env.MAX_CONCURRENT_SESSIONS || '5'),
        extendOnActivity: process.env.SESSION_EXTEND_ON_ACTIVITY === 'true',
        rememberMeDays: parseInt(process.env.REMEMBER_ME_DAYS || '30'),
      },
      mfaConfig: {
        enabled: process.env.MFA_ENABLED === 'true',
        requiredForAdmins: process.env.MFA_REQUIRED_ADMINS === 'true',
        allowedMethods: (process.env.MFA_ALLOWED_METHODS || 'totp,email').split(','),
        gracePeriodHours: parseInt(process.env.MFA_GRACE_PERIOD_HOURS || '24'),
      },
      auditConfig: {
        enabled: process.env.AUDIT_ENABLED === 'true',
        logLevel: process.env.AUDIT_LOG_LEVEL || 'info',
        retentionDays: parseInt(process.env.AUDIT_RETENTION_DAYS || '365'),
        alertOnSuspicious: process.env.AUDIT_ALERT_SUSPICIOUS === 'true',
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

    switch (action) {
      case 'updatePasswordPolicy':
        // Update password policy settings
        if (updateConfig.passwordPolicy) {
          const policy = updateConfig.passwordPolicy;
          process.env.PASSWORD_MIN_LENGTH = policy.minLength?.toString();
          process.env.PASSWORD_REQUIRE_UPPERCASE = policy.requireUppercase?.toString();
          process.env.PASSWORD_REQUIRE_LOWERCASE = policy.requireLowercase?.toString();
          process.env.PASSWORD_REQUIRE_NUMBERS = policy.requireNumbers?.toString();
          process.env.PASSWORD_REQUIRE_SPECIAL = policy.requireSpecialChars?.toString();
          process.env.PASSWORD_PREVENT_REUSE = policy.preventReuse?.toString();
          process.env.PASSWORD_EXPIRY_DAYS = policy.expiryDays?.toString();
        }
        return NextResponse.json({
          success: true,
          message: 'Password policy updated successfully'
        });

      case 'updateSessionConfig':
        // Update session configuration
        if (updateConfig.sessionConfig) {
          const session = updateConfig.sessionConfig;
          process.env.SESSION_TIMEOUT_MINUTES = session.timeoutMinutes?.toString();
          process.env.MAX_CONCURRENT_SESSIONS = session.maxConcurrentSessions?.toString();
          process.env.SESSION_EXTEND_ON_ACTIVITY = session.extendOnActivity?.toString();
          process.env.REMEMBER_ME_DAYS = session.rememberMeDays?.toString();
        }
        return NextResponse.json({
          success: true,
          message: 'Session configuration updated successfully'
        });

      case 'updateMfaConfig':
        // Update MFA configuration
        if (updateConfig.mfaConfig) {
          const mfa = updateConfig.mfaConfig;
          process.env.MFA_ENABLED = mfa.enabled?.toString();
          process.env.MFA_REQUIRED_ADMINS = mfa.requiredForAdmins?.toString();
          process.env.MFA_ALLOWED_METHODS = mfa.allowedMethods?.join(',');
          process.env.MFA_GRACE_PERIOD_HOURS = mfa.gracePeriodHours?.toString();
        }
        return NextResponse.json({
          success: true,
          message: 'MFA configuration updated successfully'
        });

      case 'updateAuditConfig':
        // Update audit configuration
        if (updateConfig.auditConfig) {
          const audit = updateConfig.auditConfig;
          process.env.AUDIT_ENABLED = audit.enabled?.toString();
          process.env.AUDIT_LOG_LEVEL = audit.logLevel;
          process.env.AUDIT_RETENTION_DAYS = audit.retentionDays?.toString();
          process.env.AUDIT_ALERT_SUSPICIOUS = audit.alertOnSuspicious?.toString();
        }
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
