import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { AuditService } from '@/lib/audit';
import { CertificateExporter } from '@/lib/export';

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
    if (!permissions.includes('audit:export')) {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const format = searchParams.get('format') || 'CSV';
    const filters: any = {};

    if (searchParams.get('action')) {
      filters.action = searchParams.get('action');
    }

    if (searchParams.get('username')) {
      filters.username = searchParams.get('username');
    }

    if (searchParams.get('startDate')) {
      filters.startDate = new Date(searchParams.get('startDate')!);
    }

    if (searchParams.get('endDate')) {
      filters.endDate = new Date(searchParams.get('endDate')!);
    }

    // Get audit logs
    const { logs } = await AuditService.getAuditLogs({
      ...filters,
      limit: 10000, // Large limit for export
      offset: 0
    });

    // Export audit logs
    const blob = await CertificateExporter.exportAuditLogs(logs, format as 'CSV' | 'JSON');

    // Generate filename
    const filename = CertificateExporter.getExportFileName(
      'audit',
      'logs',
      format
    );

    // Log export action
    await AuditService.log({
      action: 'EXPORT_PERFORMED',
      userId: session.user.id,
      username: session.user.username,
      description: `Audit logs exported in ${format} format`,
      metadata: {
        format,
        recordCount: logs.length,
        exportedBy: session.user.username,
        filters
      },
    });

    return new NextResponse(blob, {
      headers: {
        'Content-Type': blob.type,
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('Failed to export audit logs:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to export audit logs' },
      { status: 500 }
    );
  }
}