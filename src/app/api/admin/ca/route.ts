import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';

// Certificate Authority configuration interface
interface CAConfig {
  renewalPolicy: {
    autoRenewalEnabled: boolean;
    renewalThresholdDays: number;
    maxRenewalAttempts: number;
    renewalNotificationDays: number;
  };
  certificateTemplates: {
    defaultValidityDays: number;
    defaultKeySize: number;
    defaultAlgorithm: string;
    allowCustomExtensions: boolean;
  };
  crlSettings: {
    enabled: boolean;
    updateIntervalHours: number;
    includeRevokedCerts: boolean;
    crlDistributionPoints: string[];
  };
  ocspSettings: {
    enabled: boolean;
    responderUrl: string;
    cacheTimeoutMinutes: number;
    includeNextUpdate: boolean;
  };
}

// GET - Retrieve current CA configuration
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

    // Get CA configuration from environment or database
    const config: CAConfig = {
      renewalPolicy: {
        autoRenewalEnabled: process.env.CA_AUTO_RENEWAL_ENABLED === 'true',
        renewalThresholdDays: parseInt(process.env.CA_RENEWAL_THRESHOLD_DAYS || '30'),
        maxRenewalAttempts: parseInt(process.env.CA_MAX_RENEWAL_ATTEMPTS || '3'),
        renewalNotificationDays: parseInt(process.env.CA_RENEWAL_NOTIFICATION_DAYS || '7'),
      },
      certificateTemplates: {
        defaultValidityDays: parseInt(process.env.CA_DEFAULT_VALIDITY_DAYS || '365'),
        defaultKeySize: parseInt(process.env.CA_DEFAULT_KEY_SIZE || '2048'),
        defaultAlgorithm: process.env.CA_DEFAULT_ALGORITHM || 'RSA',
        allowCustomExtensions: process.env.CA_ALLOW_CUSTOM_EXTENSIONS === 'true',
      },
      crlSettings: {
        enabled: process.env.CRL_ENABLED === 'true',
        updateIntervalHours: parseInt(process.env.CRL_UPDATE_INTERVAL_HOURS || '24'),
        includeRevokedCerts: process.env.CRL_INCLUDE_REVOKED_CERTS === 'true',
        crlDistributionPoints: (process.env.CRL_DISTRIBUTION_POINTS || '').split(',').filter(Boolean),
      },
      ocspSettings: {
        enabled: process.env.OCSP_ENABLED === 'true',
        responderUrl: process.env.OCSP_RESPONDER_URL || '',
        cacheTimeoutMinutes: parseInt(process.env.OCSP_CACHE_TIMEOUT_MINUTES || '60'),
        includeNextUpdate: process.env.OCSP_INCLUDE_NEXT_UPDATE === 'true',
      },
    };

    return NextResponse.json(config);
  } catch (error) {
    console.error('Error fetching CA config:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST - Update CA configuration
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
      case 'updateRenewalPolicy':
        // Update renewal policy settings
        if (updateConfig.renewalPolicy) {
          const policy = updateConfig.renewalPolicy;
          process.env.CA_AUTO_RENEWAL_ENABLED = policy.autoRenewalEnabled?.toString();
          process.env.CA_RENEWAL_THRESHOLD_DAYS = policy.renewalThresholdDays?.toString();
          process.env.CA_MAX_RENEWAL_ATTEMPTS = policy.maxRenewalAttempts?.toString();
          process.env.CA_RENEWAL_NOTIFICATION_DAYS = policy.renewalNotificationDays?.toString();
        }
        return NextResponse.json({
          success: true,
          message: 'CA renewal policy updated successfully'
        });

      case 'updateCertificateTemplates':
        // Update certificate template settings
        if (updateConfig.certificateTemplates) {
          const templates = updateConfig.certificateTemplates;
          process.env.CA_DEFAULT_VALIDITY_DAYS = templates.defaultValidityDays?.toString();
          process.env.CA_DEFAULT_KEY_SIZE = templates.defaultKeySize?.toString();
          process.env.CA_DEFAULT_ALGORITHM = templates.defaultAlgorithm;
          process.env.CA_ALLOW_CUSTOM_EXTENSIONS = templates.allowCustomExtensions?.toString();
        }
        return NextResponse.json({
          success: true,
          message: 'Certificate templates updated successfully'
        });

      case 'updateCrlSettings':
        // Update CRL settings
        if (updateConfig.crlSettings) {
          const crl = updateConfig.crlSettings;
          process.env.CRL_ENABLED = crl.enabled?.toString();
          process.env.CRL_UPDATE_INTERVAL_HOURS = crl.updateIntervalHours?.toString();
          process.env.CRL_INCLUDE_REVOKED_CERTS = crl.includeRevokedCerts?.toString();
          process.env.CRL_DISTRIBUTION_POINTS = crl.crlDistributionPoints?.join(',');
        }
        return NextResponse.json({
          success: true,
          message: 'CRL settings updated successfully'
        });

      case 'updateOcspSettings':
        // Update OCSP settings
        if (updateConfig.ocspSettings) {
          const ocsp = updateConfig.ocspSettings;
          process.env.OCSP_ENABLED = ocsp.enabled?.toString();
          process.env.OCSP_RESPONDER_URL = ocsp.responderUrl;
          process.env.OCSP_CACHE_TIMEOUT_MINUTES = ocsp.cacheTimeoutMinutes?.toString();
          process.env.OCSP_INCLUDE_NEXT_UPDATE = ocsp.includeNextUpdate?.toString();
        }
        return NextResponse.json({
          success: true,
          message: 'OCSP settings updated successfully'
        });

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Error updating CA config:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
