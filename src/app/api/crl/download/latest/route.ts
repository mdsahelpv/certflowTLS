import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
	try {
		const latest = await db.cRL.findFirst({ orderBy: { crlNumber: 'desc' } });
		if (!latest) {
			return NextResponse.json({ error: 'CRL not found' }, { status: 404 });
		}
		return new NextResponse(latest.crlData, {
			headers: {
				'Content-Type': 'application/x-pkcs7-crl',
				'Cache-Control': 'public, max-age=60, s-maxage=300',
			}
		});
	} catch (error) {
		return NextResponse.json({ error: 'Failed to fetch latest CRL' }, { status: 500 });
	}
}