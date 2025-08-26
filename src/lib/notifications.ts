import { db } from '@/lib/db';
import { NotificationType, NotificationEvent, CertificateStatus } from '@prisma/client';
import { AuditService } from './audit';
import { WebhookService, WebhookConfig } from './webhook-service';

export interface NotificationData {
  type: NotificationType;
  event: NotificationEvent;
  recipient: string;
  daysBefore?: number;
  enabled?: boolean;
  webhookConfig?: WebhookConfig; // For webhook-specific settings
}

export interface NotificationPayload {
  event: NotificationEvent;
  subject: string;
  message: string;
  metadata?: Record<string, any>;
}

export class NotificationService {
  static async createNotification(data: NotificationData): Promise<void> {
    await db.notificationSetting.create({
      data: {
        type: data.type,
        event: data.event,
        recipient: data.recipient,
        daysBefore: data.daysBefore || 30,
        enabled: data.enabled ?? true,
        webhookConfig: data.webhookConfig ? JSON.stringify(data.webhookConfig) : null,
      },
    });
  }

  static async getNotifications(): Promise<any[]> {
    return await db.notificationSetting.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  static async updateNotification(id: string, data: Partial<NotificationData>): Promise<void> {
    const updateData: any = { ...data };
    if (data.webhookConfig) {
      updateData.webhookConfig = JSON.stringify(data.webhookConfig);
    }
    
    await db.notificationSetting.update({
      where: { id },
      data: updateData,
    });
  }

  static async deleteNotification(id: string): Promise<void> {
    await db.notificationSetting.delete({
      where: { id },
    });
  }

  static async sendNotification(payload: NotificationPayload): Promise<void> {
    const settings = await db.notificationSetting.findMany({
      where: {
        event: payload.event,
        enabled: true,
      },
    });

    for (const setting of settings) {
      try {
        if (setting.type === NotificationType.EMAIL) {
          await this.sendEmail(setting.recipient, payload.subject, payload.message);
        } else if (setting.type === NotificationType.WEBHOOK) {
          await this.sendWebhookWithTracking(setting, payload);
        }

        // Log notification history
        await db.notificationHistory.create({
          data: {
            type: setting.type,
            event: payload.event,
            recipient: setting.recipient,
            subject: payload.subject,
            message: payload.message,
            status: 'sent',
            sentAt: new Date(),
          },
        });
      } catch (error) {
        console.error(`Failed to send ${setting.type} notification to ${setting.recipient}:`, error);
        
        // Log failed notification
        await db.notificationHistory.create({
          data: {
            type: setting.type,
            event: payload.event,
            recipient: setting.recipient,
            subject: payload.subject,
            message: payload.message,
            status: 'failed',
          },
        });
      }
    }
  }

  private static async sendEmail(to: string, subject: string, message: string): Promise<void> {
    // This is a mock implementation - in production, use nodemailer or similar
    console.log(`Sending email to ${to}:`);
    console.log(`Subject: ${subject}`);
    console.log(`Message: ${message}`);
    
    // In production, implement actual email sending here
    /*
    const transporter = nodemailer.createTransporter({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    await transporter.sendMail({
      from: process.env.SMTP_FROM,
      to,
      subject,
      text: message,
    });
    */
  }

  private static async sendWebhookWithTracking(setting: any, payload: NotificationPayload): Promise<void> {
    // Parse webhook configuration
    const webhookConfig: WebhookConfig = {
      url: setting.recipient,
      ...(setting.webhookConfig ? JSON.parse(setting.webhookConfig) : {})
    };

    // Validate webhook URL
    if (!WebhookService.validateWebhookUrl(webhookConfig.url)) {
      throw new Error('Invalid webhook URL');
    }

    // Create delivery tracking record
    const delivery = await db.webhookDelivery.create({
      data: {
        webhookId: setting.id,
        url: webhookConfig.url,
        event: payload.event,
        payload: payload,
        status: 'pending',
        maxRetries: webhookConfig.retries || 3,
      },
    });

    try {
      // Send webhook
      const response = await WebhookService.sendWebhook(webhookConfig, payload);

      // Update delivery record
      await db.webhookDelivery.update({
        where: { id: delivery.id },
        data: {
          status: response.success ? 'sent' : 'failed',
          statusCode: response.statusCode,
          responseTime: response.responseTime,
          error: response.error,
          retries: response.retries || 0,
          sentAt: response.success ? new Date() : undefined,
        },
      });

      if (!response.success) {
        throw new Error(response.error || 'Webhook delivery failed');
      }
    } catch (error) {
      // Update delivery record with error
      await db.webhookDelivery.update({
        where: { id: delivery.id },
        data: {
          status: 'failed',
          error: error instanceof Error ? error.message : String(error),
          retries: 0,
        },
      });
      throw error;
    }
  }

  static async checkCertificateExpiry(): Promise<void> {
    const now = new Date();
    const notifications = await db.notificationSetting.findMany({
      where: {
        event: NotificationEvent.CERTIFICATE_EXPIRY,
        enabled: true,
      },
    });

    for (const notification of notifications) {
      const thresholdDate = new Date(now.getTime() + (notification.daysBefore || 30) * 24 * 60 * 60 * 1000);
      
      const expiringCertificates = await db.certificate.findMany({
        where: {
          status: CertificateStatus.ACTIVE,
          validTo: {
            lte: thresholdDate,
            gte: now,
          },
        },
      });

      for (const certificate of expiringCertificates) {
        const daysUntilExpiry = Math.ceil(
          (certificate.validTo.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)
        );

        const subject = `Certificate Expiring Soon - ${certificate.subjectDN}`;
        const message = `Certificate with serial number ${certificate.serialNumber} for ${certificate.subjectDN} will expire in ${daysUntilExpiry} days on ${certificate.validTo.toLocaleDateString()}.`;

        await this.sendNotification({
          event: NotificationEvent.CERTIFICATE_EXPIRY,
          subject,
          message,
          metadata: {
            certificateId: certificate.id,
            serialNumber: certificate.serialNumber,
            subjectDN: certificate.subjectDN,
            validTo: certificate.validTo,
            daysUntilExpiry,
          },
        });
      }
    }
  }

  static async checkCAExpiry(): Promise<void> {
    const now = new Date();
    const notifications = await db.notificationSetting.findMany({
      where: {
        event: NotificationEvent.CA_EXPIRY,
        enabled: true,
      },
    });

    for (const notification of notifications) {
      const thresholdDate = new Date(now.getTime() + (notification.daysBefore || 30) * 24 * 60 * 60 * 1000);
      
      const caConfigs = await db.cAConfig.findMany({
        where: {
          status: 'ACTIVE',
          validTo: {
            lte: thresholdDate,
            gte: now,
          },
        },
      });

      for (const caConfig of caConfigs) {
        const daysUntilExpiry = Math.ceil(
          (caConfig.validTo!.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)
        );

        const subject = `CA Certificate Expiring Soon - ${caConfig.subjectDN}`;
        const message = `CA certificate for ${caConfig.subjectDN} will expire in ${daysUntilExpiry} days on ${caConfig.validTo!.toLocaleDateString()}.`;

        await this.sendNotification({
          event: NotificationEvent.CA_EXPIRY,
          subject,
          message,
          metadata: {
            caConfigId: caConfig.id,
            subjectDN: caConfig.subjectDN,
            validTo: caConfig.validTo,
            daysUntilExpiry,
          },
        });
      }
    }
  }

  static async getNotificationHistory(filters?: {
    type?: NotificationType;
    event?: NotificationEvent;
    status?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ notifications: any[]; total: number }> {
    const where: any = {};

    if (filters?.type) {
      where.type = filters.type;
    }

    if (filters?.event) {
      where.event = filters.event;
    }

    if (filters?.status) {
      where.status = filters.status;
    }

    const [notifications, total] = await Promise.all([
      db.notificationHistory.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: filters?.limit || 50,
        skip: filters?.offset || 0,
      }),
      db.notificationHistory.count({ where })
    ]);

    return { notifications, total };
  }

  static async startNotificationScheduler(): Promise<void> {
    // Check for certificate expiry notifications every 6 hours
    setInterval(async () => {
      try {
        await this.checkCertificateExpiry();
        await this.checkCAExpiry();
      } catch (error) {
        console.error('Error in notification scheduler:', error);
      }
    }, 6 * 60 * 60 * 1000); // 6 hours

    // Run immediately on start
    try {
      await this.checkCertificateExpiry();
      await this.checkCAExpiry();
    } catch (error) {
      console.error('Error in initial notification check:', error);
    }
  }
}

export async function publishCRLToEndpoints(crlPem: string, endpoints: string[]): Promise<void> {
	const tasks = endpoints.map(async (url) => {
		try {
			await fetch(url, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/x-pkcs7-crl' },
				body: crlPem,
			});
		} catch (err) {
			console.error('Failed to publish CRL to', url, err);
		}
	});
	await Promise.allSettled(tasks);
}