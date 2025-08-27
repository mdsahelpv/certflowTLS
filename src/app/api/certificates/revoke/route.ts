import { NextResponse } from 'next/server';
import { getApiSession } from '@/lib/api-auth';
import { CAService } from '@/lib/ca';

export async function POST(request: Request) {
  try {
    const session = await getApiSession(request);
    
    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const permissions = session.user.permissions as string[];
    if (!permissions.includes('certificate:revoke')) {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const { serialNumber, reason } = await request.json();
    
    if (!serialNumber) {
      return NextResponse.json(
        { error: 'Serial number is required' },
        { status: 400 }
      );
    }

    // Enforce reason to allowed enum values
    const validReasons = [
      'UNSPECIFIED','KEY_COMPROMISE','CA_COMPROMISE','AFFILIATION_CHANGED','SUPERSEDED','CESSATION_OF_OPERATION','CERTIFICATE_HOLD','REMOVE_FROM_CRL','PRIVILEGE_WITHDRAWN','AA_COMPROMISE'
    ];
    const safeReason = validReasons.includes(reason) ? reason : 'UNSPECIFIED';

    await CAService.revokeCertificate(serialNumber, safeReason, session.user.id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to revoke certificate:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to revoke certificate' },
      { status: 500 }
    );
  }
}