import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
	const contentType = request.headers.get('content-type') || '';
	if (!contentType.includes('application/ocsp-request')) {
		return NextResponse.json({ error: 'Unsupported media type' }, { status: 415 });
	}
	return new NextResponse('Not Implemented', {
		status: 501,
		headers: { 'Content-Type': 'text/plain' }
	});
}