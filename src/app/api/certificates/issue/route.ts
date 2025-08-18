import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { CAService } from '@/lib/ca';

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const permissions = session.user.permissions as string[];
    if (!permissions.includes('certificate:issue')) {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const data = await request.json();
    
    // Validate required fields
    if (!data.subjectDN || !data.certificateType || !data.keyAlgorithm || !data.validityDays) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Validate certificate type
    const validTypes = ['SERVER', 'CLIENT', 'CA'];
    if (!validTypes.includes(data.certificateType)) {
      return NextResponse.json(
        { error: 'Invalid certificate type' },
        { status: 400 }
      );
    }

    // Validate key algorithm (Ed25519 not supported by current X.509 signer)
    const validAlgorithms = ['RSA', 'ECDSA'];
    if (!validAlgorithms.includes(data.keyAlgorithm)) {
      return NextResponse.json(
        { error: `Invalid key algorithm. Supported: ${validAlgorithms.join(', ')}` },
        { status: 400 }
      );
    }

    // If using external CSR, validate it and forbid private key upload
    if (data.csr) {
      if (typeof data.csr !== 'string' || !data.csr.includes('-----BEGIN CERTIFICATE REQUEST-----')) {
        return NextResponse.json(
          { error: 'Invalid CSR format' },
          { status: 400 }
        );
      }
      if (data.privateKey) {
        return NextResponse.json(
          { error: 'Private key upload is not allowed' },
          { status: 400 }
        );
      }
    }

    // Enforce sane validityDays bounds
    const validityDays = Number(data.validityDays);
    if (!Number.isInteger(validityDays) || validityDays < 1 || validityDays > 3989) {
      return NextResponse.json(
        { error: 'validityDays must be an integer between 1 and 3989' },
        { status: 400 }
      );
    }

    // Basic SAN validation (optional)
    if (data.sans && !Array.isArray(data.sans)) {
      return NextResponse.json(
        { error: 'sans must be an array of DNS names' },
        { status: 400 }
      );
    }

    // Issue certificate
    const result = await CAService.issueCertificate(data, session.user.id);

    return NextResponse.json(result);
  } catch (error) {
    console.error('Failed to issue certificate:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to issue certificate' },
      { status: 500 }
    );
  }
}