import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { CAService } from '@/lib/ca';

export async function POST(
  request: Request,
  { params }: { params: { serialNumber: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const permissions = session.user.permissions as string[];
    if (!permissions.includes('certificate:renew')) {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const { serialNumber } = params;
    
    const result = await CAService.renewCertificate(serialNumber, session.user.id);

    return NextResponse.json(result);
  } catch (error) {
    console.error('Failed to renew certificate:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to renew certificate' },
      { status: 500 }
    );
  }
}