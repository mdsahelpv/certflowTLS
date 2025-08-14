import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';

export async function GET(
  request: Request,
  { params }: { params: { crlNumber: string } }
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
    if (!permissions.includes('crl:manage')) {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const crlNumber = parseInt(params.crlNumber);
    
    const crl = await db.cRL.findFirst({
      where: { crlNumber }
    });

    if (!crl) {
      return NextResponse.json(
        { error: 'CRL not found' },
        { status: 404 }
      );
    }

    return new NextResponse(crl.crlData, {
      headers: {
        'Content-Type': 'application/x-pkcs7-crl',
        'Content-Disposition': `attachment; filename="crl-${crlNumber}.crl"`
      }
    });
  } catch (error) {
    console.error('Failed to download CRL:', error);
    return NextResponse.json(
      { error: 'Failed to download CRL' },
      { status: 500 }
    );
  }
}