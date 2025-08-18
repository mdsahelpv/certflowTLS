import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { AuditService } from '@/lib/audit';
import { AuditAction } from '@prisma/client';

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = params;
    if (!id) {
      return NextResponse.json({ error: 'CA id is required' }, { status: 400 });
    }

    // Delete certificates, CRLs, and CA config in a transaction
    await db.$transaction(async (tx) => {
      await tx.certificateRevocation.deleteMany({ where: { certificate: { caId: id } as any } });
      await tx.certificate.deleteMany({ where: { caId: id } });
      await tx.cRL.deleteMany({ where: { caId: id } });
      await tx.cAConfig.delete({ where: { id } });
    });

    await AuditService.log({
      action: AuditAction.CA_DELETED,
      userId: session.user.id,
      username: session.user.username,
      description: `CA deleted: ${id}`,
      metadata: { caId: id }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete CA:', error);
    return NextResponse.json({ error: 'Failed to delete CA' }, { status: 500 });
  }
}

