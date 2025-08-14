import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { CAService } from '@/lib/ca';
import { AuditService } from '@/lib/audit';

export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check permissions
    const permissions = session.user.permissions as string[];
    if (!permissions.includes('crl:manage')) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const { type = 'full' } = await request.json();

    let crl: string;
    let description: string;

    if (type === 'delta') {
      crl = await CAService.generateDeltaCRL();
      description = 'Delta CRL generated successfully';
    } else {
      crl = await CAService.generateCRL();
      description = 'Full CRL generated successfully';
    }

    // Log audit event
    await AuditService.log({
      action: 'CRL_GENERATED',
      description,
      userId: session.user.id,
      username: session.user.username,
      metadata: {
        crlType: type,
        timestamp: new Date().toISOString(),
      },
    });

    return NextResponse.json({
      success: true,
      message: description,
      crl,
      type,
    });
  } catch (error) {
    console.error('CRL generation error:', error);
    
    // Log audit event for failure
    try {
      const session = await getServerSession(authOptions);
      if (session) {
        await AuditService.log({
          action: 'CRL_GENERATED',
          description: `CRL generation failed: ${error instanceof Error ? error.message : String(error)}`,
          userId: session.user.id,
          username: session.user.username,
          metadata: {
            error: error instanceof Error ? error.message : String(error),
            timestamp: new Date().toISOString(),
          },
        });
      }
    } catch (auditError) {
      console.error('Failed to log audit event:', auditError);
    }

    return NextResponse.json(
      { 
        error: 'Failed to generate CRL',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}