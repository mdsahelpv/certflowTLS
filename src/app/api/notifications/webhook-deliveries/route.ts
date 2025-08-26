import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { WebhookService } from '@/lib/webhook-service';

export async function GET(request: NextRequest) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check permissions
    const permissions = (session.user as any).permissions || [];
    if (!permissions.includes('notifications:manage')) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    const where: any = {};
    if (status) {
      where.status = status;
    }

    const [deliveries, total] = await Promise.all([
      db.webhookDelivery.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        include: {
          notificationSetting: {
            select: {
              id: true,
              type: true,
              event: true,
              recipient: true,
            }
          }
        }
      }),
      db.webhookDelivery.count({ where })
    ]);

    return NextResponse.json({
      deliveries,
      total,
      limit,
      offset
    });

  } catch (error) {
    console.error('Failed to fetch webhook deliveries:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check permissions
    const permissions = (session.user as any).permissions || [];
    if (!permissions.includes('notifications:manage')) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const body = await request.json();
    const { deliveryId } = body;

    if (!deliveryId) {
      return NextResponse.json({ error: 'Delivery ID is required' }, { status: 400 });
    }

    // Get the delivery record
    const delivery = await db.webhookDelivery.findUnique({
      where: { id: deliveryId },
      include: {
        notificationSetting: true
      }
    });

    if (!delivery) {
      return NextResponse.json({ error: 'Delivery not found' }, { status: 404 });
    }

    if (delivery.status === 'sent') {
      return NextResponse.json({ error: 'Delivery already successful' }, { status: 400 });
    }

    // Parse webhook configuration
    const webhookConfig = {
      url: delivery.url,
      ...(delivery.notificationSetting?.webhookConfig 
        ? JSON.parse(delivery.notificationSetting.webhookConfig) 
        : {})
    };

    // Retry the webhook
    const response = await WebhookService.sendWebhook(webhookConfig, delivery.payload as any);

    // Update delivery record
    await db.webhookDelivery.update({
      where: { id: deliveryId },
      data: {
        status: response.success ? 'sent' : 'failed',
        statusCode: response.statusCode,
        responseTime: response.responseTime,
        error: response.error,
        retries: (delivery.retries || 0) + 1,
        sentAt: response.success ? new Date() : undefined,
      },
    });

    return NextResponse.json({
      success: response.success,
      statusCode: response.statusCode,
      responseTime: response.responseTime,
      error: response.error,
      retries: response.retries,
      message: response.success 
        ? 'Webhook retry successful' 
        : `Webhook retry failed: ${response.error}`
    });

  } catch (error) {
    console.error('Webhook retry error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}