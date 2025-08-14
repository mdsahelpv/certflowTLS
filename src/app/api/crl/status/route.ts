import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';

export async function GET() {
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

    // Get current CRL
    const currentCRL = await db.cRL.findFirst({
      orderBy: { crlNumber: 'desc' }
    });

    // Get all revoked certificates
    const revokedCertificates = await db.certificateRevocation.findMany({
      include: {
        certificate: {
          select: {
            subjectDN: true,
            validTo: true
          }
        },
        revokedBy: {
          select: {
            username: true,
            name: true
          }
        }
      },
      orderBy: { revocationDate: 'desc' }
    });

    const totalRevoked = revokedCertificates.length;

    return NextResponse.json({
      currentCRL,
      revokedCertificates,
      totalRevoked
    });
  } catch (error) {
    console.error('Failed to fetch CRL status:', error);
    return NextResponse.json(
      { error: 'Failed to fetch CRL status' },
      { status: 500 }
    );
  }
}