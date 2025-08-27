import { NextResponse } from 'next/server';
import { getApiSession } from '@/lib/api-auth';
import { CAService } from '@/lib/ca';
import { CertificateType, CertificateStatus } from '@prisma/client';

export async function GET(request: Request) {
  try {
    const session = await getApiSession(request);
    
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
    // Parse and clamp pagination
    let limit = parseInt(searchParams.get('limit') || '20', 10);
    let page = parseInt(searchParams.get('page') || '1', 10);
    if (!Number.isFinite(limit) || limit < 1) limit = 20;
    if (limit > 100) limit = 100;
    if (!Number.isFinite(page) || page < 1) page = 1;

    const filters: any = {
      limit,
      offset: (page - 1) * limit,
    };

    if (searchParams.get('type')) {
      const type = searchParams.get('type') as string;
      const allowedTypes: string[] = Object.values(CertificateType);
      if (allowedTypes.includes(type)) {
        filters.type = type as CertificateType;
      }
    }

    if (searchParams.get('status')) {
      const status = searchParams.get('status') as string;
      const allowedStatus: string[] = Object.values(CertificateStatus);
      if (allowedStatus.includes(status)) {
        filters.status = status as CertificateStatus;
      }
    }

    if (searchParams.get('subjectDN')) {
      filters.subjectDN = searchParams.get('subjectDN') || undefined;
    }

    // filters.offset already computed from page above

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