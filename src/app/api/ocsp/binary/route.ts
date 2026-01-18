import { NextRequest, NextResponse } from 'next/server';
import forge from 'node-forge';
import { db } from '@/lib/db';
import { buildBasicOCSPResponseRSA } from '@/lib/ocsp';
import { Encryption } from '@/lib/crypto';

export async function POST(request: NextRequest) {
	const contentType = request.headers.get('content-type') || '';
	if (!contentType.includes('application/ocsp-request')) {
		return NextResponse.json({ error: 'Unsupported media type' }, { status: 415 });
	}
	try {
		const buf = new Uint8Array(await request.arrayBuffer());
		const asn1 = forge.asn1.fromDer(forge.util.createBuffer(buf as any));
		// Heuristic extraction of serial number
		let serialHex: string | null = null;
		(function visit(node: any) {
			if (!node || serialHex) return;
			if (node.type === forge.asn1.Type.INTEGER && node.value) {
				try {
					serialHex = forge.util.bytesToHex(node.value);
					return;
				} catch { }
			}
			if (node.value && Array.isArray(node.value)) {
				for (const child of node.value) visit(child);
			}
		})(asn1);

		if (!serialHex) {
			return new NextResponse('Malformed OCSP request', { status: 400 });
		}
		// Lookup certificate
		const cert = await db.certificate.findUnique({ where: { serialNumber: serialHex.toUpperCase() } });
		let status: 'good' | 'revoked' | 'unknown' = 'unknown';
		if (cert) {
			if (cert.status === 'REVOKED') status = 'revoked';
			else if (cert.status === 'EXPIRED' || new Date() > cert.validTo) status = 'unknown';
			else status = 'good';
		}
		// Get issuer (active CA)
		const ca = await db.cAConfig.findFirst({ where: { status: 'ACTIVE' } });
		if (!ca || !ca.certificate) {
			return new NextResponse('tryLater', { status: 503 });
		}
		const enc = JSON.parse(ca.privateKey);
		const caPriv = Encryption.decrypt(enc.encrypted, enc.iv, enc.tag);
		const resp = buildBasicOCSPResponseRSA({
			issuerCertPem: ca.certificate,
			issuerPrivateKeyPem: caPriv,
			serialHex: (cert?.serialNumber || serialHex).replace(/^0x/, ''),
			status,
		});
		return new NextResponse(resp, {
			status: 200,
			headers: { 'Content-Type': 'application/ocsp-response' },
		});
	} catch (e) {
		return new NextResponse('Malformed OCSP request', { status: 400 });
	}
}