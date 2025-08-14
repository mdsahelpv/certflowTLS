import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  try {
    const crls = await db.cRL.findMany({
      orderBy: { crlNumber: 'desc' },
      take: 10 // Return last 10 CRLs
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