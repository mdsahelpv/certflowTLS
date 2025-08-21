import { NextRequest, NextResponse } from 'next/server';
import forge from 'node-forge';

export async function POST(request: NextRequest) {
	const contentType = request.headers.get('content-type') || '';
	if (!contentType.includes('application/ocsp-request')) {
		return NextResponse.json({ error: 'Unsupported media type' }, { status: 415 });
	}
	try {
		const buf = new Uint8Array(await request.arrayBuffer());
		const asn1 = forge.asn1.fromDer(forge.util.createBuffer(buf as any));
		// Best-effort extraction of the first INTEGER value which should be the cert serial
		let serialHex: string | null = null;
		(function visit(node: any) {
			if (!node || serialHex) return;
			if (node.type === forge.asn1.Type.INTEGER && node.value) {
				try {
					serialHex = forge.util.bytesToHex(node.value);
					return;
				} catch {}
			}
			if (node.value && Array.isArray(node.value)) {
				for (const child of node.value) visit(child);
			}
		})(asn1);
		// Placeholder: in next step, build and return a signed BasicOCSPResponse
		return new NextResponse(`Not Implemented (serial=${serialHex || 'unknown'})`, {
			status: 501,
			headers: { 'Content-Type': 'text/plain' }
		});
	} catch (e) {
		return new NextResponse('Malformed OCSP request', { status: 400 });
	}
}