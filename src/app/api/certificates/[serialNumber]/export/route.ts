import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { CertificateExporter } from '@/lib/export';

export async function POST(
  request: Request,
  { params }: { params: { serialNumber: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const permissions = session.user.permissions as string[];
    if (!permissions.includes('certificate:export')) {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const { format, includePrivateKey, password } = await request.json();
    const { serialNumber } = params;

    // Get certificate from database
    const certificate = await db.certificate.findUnique({
      where: { serialNumber },
      include: {
        issuedBy: {
          select: { username: true, name: true }
        }
      }
    });

    if (!certificate) {
      return NextResponse.json(
        { error: 'Certificate not found' },
        { status: 404 }
      );
    }

    // Decrypt private key if needed
    let privateKey: string | undefined;
    if (includePrivateKey && certificate.privateKey) {
      try {
        const encryptedKey = JSON.parse(certificate.privateKey);
        const { Encryption } = await import('@/lib/crypto');
        privateKey = Encryption.decrypt(encryptedKey.encrypted, encryptedKey.iv, encryptedKey.tag);
      } catch (error) {
        console.error('Failed to decrypt private key:', error);
        return NextResponse.json(
          { error: 'Failed to decrypt private key' },
          { status: 500 }
        );
      }
    }

    // Export certificate
    const blob = await CertificateExporter.exportCertificate(
      certificate.certificate,
      privateKey,
      { format, includePrivateKey, password }
    );

    // Generate filename
    const filename = CertificateExporter.getExportFileName(
      'certificate',
      serialNumber,
      format
    );

    // Log export action
    const { AuditService } = await import('@/lib/audit');
    await AuditService.log({
      action: 'EXPORT_PERFORMED',
      userId: session.user.id,
      username: session.user.username,
      description: `Certificate ${serialNumber} exported in ${format} format`,
      metadata: {
        serialNumber,
        format,
        includePrivateKey,
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
    console.error('Failed to export certificate:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to export certificate' },
      { status: 500 }
    );
  }
}