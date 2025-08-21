import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(
	request: Request,
	{ params }: { params: { crlNumber: string } }
) {
	try {
		const crlNumber = parseInt(params.crlNumber, 10);
		if (!Number.isFinite(crlNumber)) {
			return NextResponse.json({ error: 'Invalid crlNumber' }, { status: 400 });
		}
		const crl = await db.cRL.findFirst({ where: { crlNumber } });
		if (!crl) {
			return NextResponse.json({ error: 'CRL not found' }, { status: 404 });
		}
		return new NextResponse(crl.crlData, {
			headers: {
				'Content-Type': 'application/x-pkcs7-crl',
				'Cache-Control': 'public, max-age=60, s-maxage=300',
			}
		});
	} catch (error) {
		return NextResponse.json({ error: 'Failed to download CRL' }, { status: 500 });
	}
}