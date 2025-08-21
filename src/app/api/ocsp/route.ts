import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
	try {
		const { searchParams } = new URL(request.url);
		const serialNumber = searchParams.get('serialNumber');
		if (!serialNumber) {
			return NextResponse.json({ error: 'serialNumber is required' }, { status: 400 });
		}
		const cert = await db.certificate.findUnique({ where: { serialNumber } });
		if (!cert) {
			return NextResponse.json({ status: 'unknown' });
		}
		if (cert.status === 'REVOKED') {
			return NextResponse.json({ status: 'revoked', revokedAt: cert.revokedAt });
		}
		if (cert.status === 'EXPIRED' || new Date() > cert.validTo) {
			return NextResponse.json({ status: 'expired' });
		}
		return NextResponse.json({ status: 'good', validTo: cert.validTo });
	} catch (error) {
		return NextResponse.json({ error: 'OCSP check failed' }, { status: 500 });
	}
}