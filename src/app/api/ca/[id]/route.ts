import { NextResponse } from 'next/server';
import { getApiSession } from '@/lib/api-auth';
import { db } from '@/lib/db';
import { AuditService } from '@/lib/audit';
import { AuditAction } from '@prisma/client';
import forge from 'node-forge';

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getApiSession(request as any);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = params;
    if (!id) {
      return NextResponse.json({ error: 'CA id is required' }, { status: 400 });
    }

    const ca = await db.cAConfig.findUnique({ where: { id } });
    if (!ca) {
      return NextResponse.json({ error: 'CA not found' }, { status: 404 });
    }

    // Derive certificate details using forge (best effort)
    let certInfo: any = null;
    let chainInfo: any = null;
    try {
      if (ca.certificate) {
        const cert = forge.pki.certificateFromPem(ca.certificate);
        const subjectCN = cert.subject.getField('CN')?.value || null;
        const issuerCN = cert.issuer.getField('CN')?.value || null;
        const selfSigned = subjectCN && issuerCN && subjectCN === issuerCN;

        certInfo = {
          subjectCN,
          issuerCN,
          selfSigned,
          notBefore: cert.validity.notBefore,
          notAfter: cert.validity.notAfter,
          publicKeyType: cert.publicKey?.type || null,
        };
      }
    } catch {}

    try {
      if (ca.certificateChain) {
        const regex = /-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g;
        const blocks = ca.certificateChain.match(regex) || [];
        const parsed = blocks.map((b) => {
          try {
            const c = forge.pki.certificateFromPem(b);
            return {
              subjectCN: c.subject.getField('CN')?.value || null,
              issuerCN: c.issuer.getField('CN')?.value || null,
              notBefore: c.validity.notBefore,
              notAfter: c.validity.notAfter,
            };
          } catch {
            return null;
          }
        }).filter(Boolean);
        const root = parsed.length ? parsed[parsed.length - 1] : null;
        chainInfo = { count: parsed.length, entries: parsed, rootCN: root?.issuerCN || root?.subjectCN || null };
      }
    } catch {}

    return NextResponse.json({
      id: ca.id,
      name: ca.name,
      subjectDN: ca.subjectDN,
      status: ca.status,
      keyAlgorithm: ca.keyAlgorithm,
      keySize: ca.keySize,
      curve: ca.curve,
      validFrom: ca.validFrom,
      validTo: ca.validTo,
      crlNumber: ca.crlNumber,
      crlDistributionPoint: ca.crlDistributionPoint,
      ocspUrl: ca.ocspUrl,
      hasCertificate: !!ca.certificate,
      hasCertificateChain: !!ca.certificateChain,
      certificateInfo: certInfo,
      certificateChainInfo: chainInfo,
    });
  } catch (error) {
    console.error('Failed to fetch CA details:', error);
    return NextResponse.json({ error: 'Failed to fetch CA details' }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getApiSession(request as any);
    if (!session || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = params;
    if (!id) {
      return NextResponse.json({ error: 'CA id is required' }, { status: 400 });
    }

    // Delete certificates, CRLs, and CA config in a transaction; tolerate partial audit failures
    try {
      await db.$transaction(async (tx) => {
        await tx.certificateRevocation.deleteMany({ where: { certificate: { caId: id } as any } });
        await tx.certificate.deleteMany({ where: { caId: id } });
        await tx.cRL.deleteMany({ where: { caId: id } });
        await tx.cAConfig.delete({ where: { id } });
      });
    } catch (e) {
      console.error('CA delete transaction failed', e);
      return NextResponse.json({ error: 'Failed to delete CA' }, { status: 500 });
    }

    try {
      await AuditService.log({
        action: AuditAction.CA_DELETED,
        userId: session.user.id,
        username: session.user.username,
        description: `CA deleted: ${id}`,
        metadata: { caId: id }
      });
    } catch (e) {
      console.warn('Audit log failed for CA delete', e);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete CA:', error);
    return NextResponse.json({ error: 'Failed to delete CA' }, { status: 500 });
  }
}

