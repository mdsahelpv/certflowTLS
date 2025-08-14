import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { CAService } from '@/lib/ca';

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    
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

    await CAService.revokeCertificate(serialNumber, reason || 'UNSPECIFIED', session.user.id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to revoke certificate:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to revoke certificate' },
      { status: 500 }
    );
  }
}