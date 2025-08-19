import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { CAService } from '@/lib/ca';
import forge from 'node-forge';

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session || session.user.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { certificate, certificateChain, caId } = await request.json();
    
    if (!certificate) {
      return NextResponse.json(
        { error: 'Certificate is required' },
        { status: 400 }
      );
    }

    // Robust PEM handling: auto-split bundles and separate main cert vs chain
    const extractPemCerts = (text?: string): string[] => {
      if (!text || typeof text !== 'string') return [];
      const regex = /-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g;
      const matches = text.match(regex) || [];
      return matches.map(m => m.trim());
    };

    const certBlocks = extractPemCerts(certificate);
    if (certBlocks.length === 0) {
      return NextResponse.json(
        { error: 'Invalid certificate input. Provide a valid PEM certificate or bundle.' },
        { status: 400 }
      );
    }
    const mainCertificatePem = certBlocks[0];
    const extraFromMain = certBlocks.slice(1);
    const chainBlocks = extractPemCerts(certificateChain);
    const combinedChain = [...extraFromMain, ...chainBlocks];

    // Validate primary certificate can be parsed
    try {
      forge.pki.certificateFromPem(mainCertificatePem);
    } catch {
      return NextResponse.json(
        { error: 'Unable to parse the primary certificate. Ensure it is a valid X.509 PEM certificate.' },
        { status: 400 }
      );
    }

    // Upload certificate to specific CA with normalized chain
    await CAService.uploadCACertificate(
      mainCertificatePem,
      caId,
      combinedChain.length ? combinedChain.join('\n') + '\n' : undefined
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to upload CA certificate:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to upload certificate' },
      { status: 500 }
    );
  }
}