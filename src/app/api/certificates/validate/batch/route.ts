import { NextRequest, NextResponse } from 'next/server';
import { CertificateValidationService } from '@/lib/certificate-validation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check permissions
    const permissions = (session.user as any).permissions || [];
    if (!permissions.includes('certificate:validate')) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const body = await request.json();
    const { certificateIds, options } = body;

    if (!certificateIds || !Array.isArray(certificateIds) || certificateIds.length === 0) {
      return NextResponse.json({ error: 'Certificate IDs array is required' }, { status: 400 });
    }

    // Limit batch size for performance
    if (certificateIds.length > 100) {
      return NextResponse.json({ error: 'Batch size cannot exceed 100 certificates' }, { status: 400 });
    }

    // Batch validate certificates
    const results = await CertificateValidationService.batchValidateCertificates(certificateIds, options);

    // Calculate summary
    const validCount = results.filter(r => r.result.isValid).length;
    const invalidCount = results.length - validCount;
    const expiredCount = results.filter(r => r.result.expiration.expired).length;
    const revokedCount = results.filter(r => r.result.issues.some(issue => issue.includes('revoked'))).length;

    return NextResponse.json({
      success: true,
      summary: {
        total: results.length,
        valid: validCount,
        invalid: invalidCount,
        expired: expiredCount,
        revoked: revokedCount
      },
      results
    });

  } catch (error) {
    console.error('Batch certificate validation error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
