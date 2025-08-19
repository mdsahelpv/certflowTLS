import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const caId = searchParams.get('caId') || undefined;
    const crls = await db.cRL.findMany({
      where: caId ? { caId } : undefined,
      orderBy: { crlNumber: 'desc' },
      take: 10
    });

    return NextResponse.json(crls);
  } catch (error) {
    console.error('Failed to fetch CRLs:', error);
    return NextResponse.json(
      { error: 'Failed to fetch CRLs' },
      { status: 500 }
    );
  }
}