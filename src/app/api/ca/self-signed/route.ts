import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { CAService } from '@/lib/ca';
import { KeyAlgorithm } from '@prisma/client';

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      name,
      subjectDN,
      keyAlgorithm,
      keySize,
      curve,
      validityDays,
      force,
    } = body || {};

    if (!subjectDN || !keyAlgorithm) {
      return NextResponse.json({ error: 'subjectDN and keyAlgorithm are required' }, { status: 400 });
    }

    const validAlgorithms = ['RSA', 'ECDSA'];
    if (!validAlgorithms.includes(keyAlgorithm)) {
      return NextResponse.json({ error: `Invalid keyAlgorithm. Supported: ${validAlgorithms.join(', ')}` }, { status: 400 });
    }

    const result = await CAService.createSelfSignedCA({
      name,
      subjectDN,
      keyAlgorithm: keyAlgorithm as KeyAlgorithm,
      keySize,
      curve,
      validityDays,
      force: !!force,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to create CA' }, { status: 500 });
  }
}

