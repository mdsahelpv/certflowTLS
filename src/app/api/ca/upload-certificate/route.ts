import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { CAService } from '@/lib/ca';
import forge from 'node-forge';

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { certificate, certificateChain, caId, certificateBinary, certificateBinaryFormat, chainBinary, chainBinaryFormat } = body || {};

    const allowExtended = process.env.ALLOW_EXTENDED_CERT_FORMATS === 'true';
    if (!certificate && !(allowExtended && certificateBinary)) {
      return NextResponse.json({ error: 'Certificate is required' }, { status: 400 });
    }

    const extractPemCerts = (text?: string): string[] => {
      if (!text || typeof text !== 'string') return [];
      const regex = /-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g;
      const matches = text.match(regex) || [];
      return matches.map(m => m.trim());
    };

    const toPemFromDer = (derBytes: Uint8Array): string | null => {
      try {
        const asn1 = forge.asn1.fromDer(forge.util.createBuffer(derBytes as any));
        const cert = forge.pki.certificateFromAsn1(asn1);
        return forge.pki.certificateToPem(cert);
      } catch {
        return null;
      }
    };

    const extractFromPkcs7 = (bytesOrText: Uint8Array | string): string[] => {
      try {
        if (typeof bytesOrText === 'string') {
          const msg = forge.pkcs7.messageFromPem(bytesOrText);
          const certs = (msg as any).certificates || [];
          return certs.map((c: any) => forge.pki.certificateToPem(c));
        }
      } catch {}
      try {
        const asn1 = forge.asn1.fromDer(forge.util.createBuffer(bytesOrText as any));
        const msg = forge.pkcs7.messageFromAsn1(asn1);
        const certs = (msg as any).certificates || [];
        return certs.map((c: any) => forge.pki.certificateToPem(c));
      } catch {
        return [];
      }
    };

    let certBlocks: string[] = [];
    let chainBlocks: string[] = [];

    if (certificate) {
      certBlocks = extractPemCerts(certificate);
      chainBlocks = extractPemCerts(certificateChain);
    } else if (allowExtended && certificateBinary) {
      const bin = Buffer.from(certificateBinary, 'base64');
      const format = (certificateBinaryFormat || '').toLowerCase();
      if (format === 'der' || format === 'application/x-x509-ca-cert') {
        const pem = toPemFromDer(new Uint8Array(bin));
        if (pem) certBlocks = [pem];
      } else if (format === 'p7b' || format === 'pkcs7' || format === 'application/x-pkcs7-certificates') {
        certBlocks = extractFromPkcs7(new Uint8Array(bin));
      }
      if (chainBinary) {
        const chainBin = Buffer.from(chainBinary, 'base64');
        const cfmt = (chainBinaryFormat || '').toLowerCase();
        if (cfmt === 'der') {
          const pem = toPemFromDer(new Uint8Array(chainBin));
          if (pem) chainBlocks.push(pem);
        } else if (cfmt === 'p7b' || cfmt === 'pkcs7' || cfmt === 'application/x-pkcs7-certificates') {
          chainBlocks.push(...extractFromPkcs7(new Uint8Array(chainBin)));
        }
      }
    }

    if (certBlocks.length === 0) {
      return NextResponse.json({ error: 'Invalid certificate input. Provide a valid PEM/DER/PKCS#7 certificate.' }, { status: 400 });
    }

    // Choose CA certificate (prefer CA=true)
    let mainCertificatePem = certBlocks[0];
    try {
      for (const pem of certBlocks) {
        const cert = forge.pki.certificateFromPem(pem);
        const bc = (cert as any).extensions?.find((e: any) => e.name === 'basicConstraints');
        if (bc && bc.cA === true) { mainCertificatePem = pem; break; }
      }
    } catch {}
    const extraFromMain = certBlocks.filter(pem => pem !== mainCertificatePem);
    const combinedChain = [...extraFromMain, ...chainBlocks];

    // Validate primary certificate is a CA and currently valid
    try {
      const cert = forge.pki.certificateFromPem(mainCertificatePem);
      const now = new Date();
      const validity = (cert as any).validity;
      if (validity?.notBefore && validity?.notAfter) {
        if (now < validity.notBefore || now > validity.notAfter) {
          return NextResponse.json({ error: 'Certificate is not currently valid (date range).' }, { status: 400 });
        }
      }
      const bc = (cert as any).extensions?.find((e: any) => e.name === 'basicConstraints');
      if (!bc || bc.cA !== true) {
        return NextResponse.json({ error: 'Uploaded certificate is not a CA certificate (basicConstraints CA=true required).' }, { status: 400 });
      }
      const ku = (cert as any).extensions?.find((e: any) => e.name === 'keyUsage');
      if (ku && ku.keyCertSign !== true) {
        return NextResponse.json({ error: 'CA certificate must have keyCertSign in key usage.' }, { status: 400 });
      }
    } catch {
      return NextResponse.json({ error: 'Unable to parse the primary certificate. Ensure it is a valid X.509 certificate.' }, { status: 400 });
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