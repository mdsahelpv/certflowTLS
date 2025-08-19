import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { CAService } from '@/lib/ca';

export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check permissions
    const permissions = session.user.permissions as string[];
    if (!permissions.includes('crl:view')) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const { crlPem } = await request.json();

    if (!crlPem) {
      return NextResponse.json({ error: 'CRL PEM data is required' }, { status: 400 });
    }

    // Validate CRL
    const validation = await CAService.validateCRL(crlPem);

    return NextResponse.json({
      success: true,
      validation,
    });
  } catch (error) {
    console.error('CRL validation error:', error);
    
    return NextResponse.json(
      { 
        error: 'Failed to validate CRL',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check permissions
    const permissions = session.user.permissions as string[];
    if (!permissions.includes('crl:view')) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    // Get CRL statistics (optionally scoped by caId)
    const { searchParams } = new URL(request.url);
    const caId = searchParams.get('caId') || undefined;
    const statistics = await CAService.getCRLStatistics(caId);

    return NextResponse.json({
      success: true,
      statistics,
    });
  } catch (error) {
    console.error('CRL statistics error:', error);
    
    return NextResponse.json(
      { 
        error: 'Failed to get CRL statistics',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}
