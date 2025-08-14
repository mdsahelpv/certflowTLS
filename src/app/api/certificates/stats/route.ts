import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { CertificateStatus } from '@prisma/client';

export async function GET() {
  try {
    const now = new Date();
    const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const [
      totalCertificates,
      activeCertificates,
      expiredCertificates,
      revokedCertificates,
      expiringSoon
    ] = await Promise.all([
      db.certificate.count(),
      db.certificate.count({ where: { status: CertificateStatus.ACTIVE } }),
      db.certificate.count({ where: { status: CertificateStatus.EXPIRED } }),
      db.certificate.count({ where: { status: CertificateStatus.REVOKED } }),
      db.certificate.count({
        where: {
          status: CertificateStatus.ACTIVE,
          validTo: {
            lte: thirtyDaysFromNow,
            gte: now
          }
        }
      })
    ]);

    return NextResponse.json({
      totalCertificates,
      activeCertificates,
      expiredCertificates,
      revokedCertificates,
      expiringSoon
    });
  } catch (error) {
    console.error('Failed to get certificate stats:', error);
    return NextResponse.json(
      { error: 'Failed to get certificate stats' },
      { status: 500 }
    );
  }
}