import { NextRequest, NextResponse } from 'next/server';
import { CertificateValidationService } from '@/lib/certificate-validation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

// Simple in-memory rate limiting (in production, use Redis or similar)
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const userLimit = rateLimitMap.get(userId);
  
  if (!userLimit || now > userLimit.resetTime) {
    // Reset or create new limit
    rateLimitMap.set(userId, { count: 1, resetTime: now + 60000 }); // 1 minute window
    return true;
  }
  
  if (userLimit.count >= 10) { // Max 10 validations per minute
    return false;
  }
  
  userLimit.count++;
  return true;
}

export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check rate limiting
    if (!checkRateLimit(session.user.id)) {
      return NextResponse.json({ 
        error: 'Rate limit exceeded. Maximum 10 validations per minute.' 
      }, { status: 429 });
    }

    const body = await request.json();
    const { certificatePem, options } = body;

    if (!certificatePem) {
      return NextResponse.json({ error: 'Certificate PEM is required' }, { status: 400 });
    }

    // Basic PEM format validation
    if (!/^-----BEGIN CERTIFICATE-----[\s\S]+-----END CERTIFICATE-----$/.test(certificatePem.trim())) {
      return NextResponse.json({ 
        error: 'Invalid certificate format. Please provide a valid PEM certificate.' 
      }, { status: 400 });
    }

    // Size limit check (max 50KB for certificate)
    if (certificatePem.length > 50000) {
      return NextResponse.json({ 
        error: 'Certificate too large. Maximum size is 50KB.' 
      }, { status: 400 });
    }

    // Validate certificate with user context
    const result = await CertificateValidationService.validateCertificate(
      certificatePem.trim(),
      options,
      session.user.id,
      session.user.username
    );

    return NextResponse.json({
      success: true,
      result
    });

  } catch (error) {
    console.error('Certificate validation error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    switch (action) {
      case 'health':
        // Health check endpoint
        return NextResponse.json({ 
          success: true, 
          status: 'healthy',
          timestamp: new Date().toISOString(),
          service: 'certificate-validation'
        });

      case 'statistics':
        try {
          const stats = await CertificateValidationService.getValidationStatistics();
          return NextResponse.json({ success: true, statistics: stats });
        } catch (error) {
          console.error('Failed to get validation statistics:', error);
          return NextResponse.json({ error: 'Failed to retrieve statistics' }, { status: 500 });
        }

      case 'pending':
        try {
          const pendingCerts = await CertificateValidationService.getCertificatesForValidation();
          return NextResponse.json({ success: true, certificates: pendingCerts });
        } catch (error) {
          console.error('Failed to get pending certificates:', error);
          return NextResponse.json({ error: 'Failed to retrieve pending certificates' }, { status: 500 });
        }

      case 'cache-clear':
        try {
          const cleared = await CertificateValidationService.clearValidationCache();
          return NextResponse.json({ success: true, message: 'Cache cleared', cleared });
        } catch (error) {
          console.error('Failed to clear cache:', error);
          return NextResponse.json({ error: 'Failed to clear cache' }, { status: 500 });
        }

      case 'cache-stats':
        try {
          const stats = await CertificateValidationService.getCacheStatistics();
          return NextResponse.json({ success: true, statistics: stats });
        } catch (error) {
          console.error('Failed to get cache statistics:', error);
          return NextResponse.json({ error: 'Failed to retrieve cache statistics' }, { status: 500 });
        }

      default:
        return NextResponse.json({ 
          error: 'Invalid action. Valid actions: health, statistics, pending, cache-clear, cache-stats' 
        }, { status: 400 });
    }

  } catch (error) {
    console.error('Certificate validation error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
