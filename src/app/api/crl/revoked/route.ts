import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const caId = searchParams.get('caId') || undefined;

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
      where: caId ? ({ certificate: { caId } } as any) : undefined,
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