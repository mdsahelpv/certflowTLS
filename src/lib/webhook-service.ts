import { NotificationPayload } from './notifications';
import crypto from 'crypto';

export interface WebhookConfig {
  url: string;
  timeout?: number;
  retries?: number;
  retryDelay?: number;
  headers?: Record<string, string>;
  secret?: string; // For webhook signature verification
}

export interface WebhookResponse {
  success: boolean;
  statusCode?: number;
  responseTime?: number;
  error?: string;
  retries?: number;
}

export interface WebhookDeliveryAttempt {
  id: string;
  webhookId: string;
  url: string;
  payload: NotificationPayload;
  status: 'pending' | 'sent' | 'failed' | 'retrying';
  statusCode?: number;
  responseTime?: number;
  error?: string;
  retries: number;
  maxRetries: number;
  createdAt: Date;
  sentAt?: Date;
}

export class WebhookService {
  private static readonly DEFAULT_TIMEOUT = 10000; // 10 seconds
  private static readonly DEFAULT_RETRIES = 3;
  private static readonly DEFAULT_RETRY_DELAY = 1000; // 1 second
  private static readonly MAX_RETRY_DELAY = 30000; // 30 seconds

  /**
   * Send webhook with retry logic and proper error handling
   */
  static async sendWebhook(
    config: WebhookConfig,
    payload: NotificationPayload
  ): Promise<WebhookResponse> {
    const startTime = Date.now();
    const maxRetries = config.retries || this.DEFAULT_RETRIES;
    const timeout = config.timeout || this.DEFAULT_TIMEOUT;
    const retryDelay = config.retryDelay || this.DEFAULT_RETRY_DELAY;

    let lastError: string | undefined;
    let retries = 0;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await this.makeWebhookRequest(config, payload, timeout);
        const responseTime = Date.now() - startTime;

        if (response.ok) {
          return {
            success: true,
            statusCode: response.status,
            responseTime,
            retries
          };
        } else {
          lastError = `HTTP ${response.status}: ${response.statusText}`;

          // Don't retry on client errors (4xx) except 429 (rate limit)
          if (response.status >= 400 && response.status < 500 && response.status !== 429) {
            break;
          }
        }
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);

        // Don't retry on network errors that are likely permanent
        if (this.isPermanentError(error)) {
          break;
        }
      }

      retries = attempt;

      // Wait before retry (exponential backoff)
      if (attempt < maxRetries) {
        const delay = Math.min(retryDelay * Math.pow(2, attempt), this.MAX_RETRY_DELAY);
        await this.sleep(delay);
      }
    }

    return {
      success: false,
      statusCode: undefined,
      responseTime: Date.now() - startTime,
      error: lastError,
      retries
    };
  }

  /**
   * Make the actual HTTP request
   */
  private static async makeWebhookRequest(
    config: WebhookConfig,
    payload: NotificationPayload,
    timeout: number
  ): Promise<Response> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'Enterprise-CA-Webhook/1.0',
      'X-Webhook-Event': payload.event,
      'X-Webhook-Timestamp': Date.now().toString(),
      ...config.headers
    };

    // Add webhook signature if secret is provided
    if (config.secret) {
      const signature = this.generateWebhookSignature(payload, config.secret);
      headers['X-Webhook-Signature'] = signature;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(config.url, {
        method: 'POST',
        headers,
        body: JSON.stringify(this.formatWebhookPayload(payload)),
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  /**
   * Generate HMAC signature for webhook payload
   */
  private static generateWebhookSignature(payload: NotificationPayload, secret: string): string {
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(JSON.stringify(payload));
    return `sha256=${hmac.digest('hex')}`;
  }

  /**
   * Format payload for webhook delivery
   */
  private static formatWebhookPayload(payload: NotificationPayload): any {
    return {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      ...payload
    };
  }

  /**
   * Check if error is permanent
   */
  private static isPermanentError(error: any): boolean {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      return false; // Network errors should be retried
    }

    if (error.name === 'AbortError') {
      return false; // Timeout errors should be retried
    }

    // Add other permanent error conditions as needed
    return false;
  }

  /**
   * Sleep utility for retry delays
   */
  private static sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Validate webhook URL
   */
  static validateWebhookUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      return ['http:', 'https:'].includes(parsed.protocol);
    } catch {
      return false;
    }
  }

  /**
   * Test webhook endpoint
   */
  static async testWebhook(config: WebhookConfig): Promise<WebhookResponse> {
    const testPayload: NotificationPayload = {
      event: 'SECURITY_ALERT' as any,
      subject: 'Webhook Test',
      message: 'This is a test webhook to verify the endpoint is working correctly.',
      metadata: {
        test: true,
        timestamp: new Date().toISOString()
      }
    };

    return this.sendWebhook(config, testPayload);
  }
}