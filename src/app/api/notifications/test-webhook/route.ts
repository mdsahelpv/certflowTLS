import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { WebhookService, WebhookConfig } from '@/lib/webhook-service';

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
    const { url, config } = body;

    if (!url) {
      return NextResponse.json({ error: 'Webhook URL is required' }, { status: 400 });
    }

    // Validate URL
    if (!WebhookService.validateWebhookUrl(url)) {
      return NextResponse.json({ error: 'Invalid webhook URL' }, { status: 400 });
    }

    // Test webhook configuration
    const webhookConfig: WebhookConfig = {
      url,
      ...config
    };

    const result = await WebhookService.testWebhook(webhookConfig);

    return NextResponse.json({
      success: result.success,
      statusCode: result.statusCode,
      responseTime: result.responseTime,
      error: result.error,
      retries: result.retries,
      message: result.success 
        ? 'Webhook test successful' 
        : `Webhook test failed: ${result.error}`
    });

  } catch (error) {
    console.error('Webhook test error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}