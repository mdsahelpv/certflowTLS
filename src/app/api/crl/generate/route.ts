import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { CAService } from '@/lib/ca';

export async function POST() {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const permissions = session.user.permissions as string[];
    if (!permissions.includes('crl:manage')) {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const crl = await CAService.generateCRL();

    return NextResponse.json({ crl });
  } catch (error) {
    console.error('Failed to generate CRL:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate CRL' },
      { status: 500 }
    );
  }
}