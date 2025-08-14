import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  try {
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

    return NextResponse.json(revokedCertificates);
  } catch (error) {
    console.error('Failed to fetch revoked certificates:', error);
    return NextResponse.json(
      { error: 'Failed to fetch revoked certificates' },
      { status: 500 }
    );
  }
}