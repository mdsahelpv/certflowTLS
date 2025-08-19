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

    // No additional permission required; any authenticated user may validate certificates

    const body = await request.json();
    const { certificatePem, options } = body;

    if (!certificatePem) {
      return NextResponse.json({ error: 'Certificate PEM is required' }, { status: 400 });
    }

    // Validate certificate
    const result = await CertificateValidationService.validateCertificate(certificatePem, options);

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

    // No additional permission required; any authenticated user may access validation endpoints

    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    switch (action) {
      case 'statistics':
        const stats = await CertificateValidationService.getValidationStatistics();
        return NextResponse.json({ success: true, statistics: stats });

      case 'pending':
        const pendingCerts = await CertificateValidationService.getCertificatesForValidation();
        return NextResponse.json({ success: true, certificates: pendingCerts });

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

  } catch (error) {
    console.error('Certificate validation error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
