import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { CAService } from '@/lib/ca';
import { AuthService } from '@/lib/auth';

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session || session.user.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const config = await request.json();
    
    // Validate required fields
    if (!config.subjectDN || !config.keyAlgorithm) {
      return NextResponse.json(
        { error: 'Missing required fields: subjectDN and keyAlgorithm' },
        { status: 400 }
      );
    }

    // Restrict algorithms to those supported by signer
    const validAlgorithms = ['RSA', 'ECDSA'];
    if (!validAlgorithms.includes(config.keyAlgorithm)) {
      return NextResponse.json(
        { error: `Invalid key algorithm. Supported: ${validAlgorithms.join(', ')}` },
        { status: 400 }
      );
    }

    // Multi-CA support: allow multiple CA records

    // Initialize CA
    const result = await CAService.initializeCA(config);

    return NextResponse.json(result);
  } catch (error) {
    console.error('Failed to initialize CA:', error);
    return NextResponse.json(
      { error: 'Failed to initialize CA' },
      { status: 500 }
    );
  }
}