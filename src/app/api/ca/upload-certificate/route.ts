import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { CAService } from '@/lib/ca';

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session || session.user.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { certificate, caId } = await request.json();
    
    if (!certificate) {
      return NextResponse.json(
        { error: 'Certificate is required' },
        { status: 400 }
      );
    }

    // Basic certificate validation
    if (!certificate.includes('-----BEGIN CERTIFICATE-----') || 
        !certificate.includes('-----END CERTIFICATE-----')) {
      return NextResponse.json(
        { error: 'Invalid certificate format. Must be in PEM format.' },
        { status: 400 }
      );
    }

    // Upload certificate to specific CA
    await CAService.uploadCACertificate(certificate, caId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to upload CA certificate:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to upload certificate' },
      { status: 500 }
    );
  }
}