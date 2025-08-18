import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { AuditService } from '@/lib/audit';
import { AuditAction } from '@prisma/client';

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
    if (!permissions.includes('audit:view')) {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    // Parse and clamp pagination
    let limit = parseInt(searchParams.get('limit') || '50', 10);
    let page = parseInt(searchParams.get('page') || '1', 10);
    if (!Number.isFinite(limit) || limit < 1) limit = 50;
    if (limit > 200) limit = 200;
    if (!Number.isFinite(page) || page < 1) page = 1;

    const filters: any = {
      limit,
      offset: (page - 1) * limit,
    };

    if (searchParams.get('action')) {
      const action = searchParams.get('action') as string;
      const allowed: string[] = Object.values(AuditAction);
      if (allowed.includes(action)) {
        filters.action = action as AuditAction;
      }
    }

    if (searchParams.get('username')) {
      filters.username = searchParams.get('username') || undefined;
    }

    if (searchParams.get('startDate')) {
      filters.startDate = new Date(searchParams.get('startDate')!);
    }

    if (searchParams.get('endDate')) {
      filters.endDate = new Date(searchParams.get('endDate')!);
    }

    // offset already computed from page

    const result = await AuditService.getAuditLogs(filters);

    return NextResponse.json(result);
  } catch (error) {
    console.error('Failed to fetch audit logs:', error);
    return NextResponse.json(
      { error: 'Failed to fetch audit logs' },
      { status: 500 }
    );
  }
}