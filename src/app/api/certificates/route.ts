import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { CAService } from '@/lib/ca';
import { CertificateType, CertificateStatus } from '@prisma/client';

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const permissions = session.user.permissions as string[];
    if (!permissions.includes('certificate:view')) {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const filters: any = {
      limit: parseInt(searchParams.get('limit') || '20'),
      offset: parseInt(searchParams.get('offset') || '0'),
    };

    if (searchParams.get('type')) {
      filters.type = searchParams.get('type') as CertificateType;
    }

    if (searchParams.get('status')) {
      filters.status = searchParams.get('status') as CertificateStatus;
    }

    if (searchParams.get('subjectDN')) {
      filters.subjectDN = searchParams.get('subjectDN') || undefined;
    }

    // Handle page parameter
    const page = parseInt(searchParams.get('page') || '1');
    filters.offset = (page - 1) * filters.limit;

    const result = await CAService.getCertificates(filters);

    return NextResponse.json(result);
  } catch (error) {
    console.error('Failed to fetch certificates:', error);
    return NextResponse.json(
      { error: 'Failed to fetch certificates' },
      { status: 500 }
    );
  }
}