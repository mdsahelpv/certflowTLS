import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { CertificateExporter } from '@/lib/export';

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
    if (!permissions.includes('crl:manage')) {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const { crlNumber, format } = await request.json();
    
    if (!crlNumber) {
      return NextResponse.json(
        { error: 'CRL number is required' },
        { status: 400 }
      );
    }

    // Get CRL from database
    const crl = await db.cRL.findFirst({
      where: { crlNumber: parseInt(crlNumber) }
    });

    if (!crl) {
      return NextResponse.json(
        { error: 'CRL not found' },
        { status: 404 }
      );
    }

    // Export CRL
    const blob = await CertificateExporter.exportCRL(crl.crlData, format);

    // Generate filename
    const filename = CertificateExporter.getExportFileName(
      'crl',
      crlNumber.toString(),
      format
    );

    // Log export action
    const { AuditService } = await import('@/lib/audit');
    await AuditService.log({
      action: 'EXPORT_PERFORMED',
      userId: session.user.id,
      username: session.user.username,
      description: `CRL #${crlNumber} exported in ${format} format`,
      metadata: {
        crlNumber,
        format,
        exportedBy: session.user.username
      },
    });

    return new NextResponse(blob, {
      headers: {
        'Content-Type': blob.type,
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('Failed to export CRL:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to export CRL' },
      { status: 500 }
    );
  }
}