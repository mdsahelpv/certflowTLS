import { db } from '@/lib/db';
import { NotificationType, NotificationEvent, CertificateStatus } from '@prisma/client';
import { AuditService } from './audit';

export interface NotificationData {
  type: NotificationType;
  event: NotificationEvent;
  recipient: string;
  daysBefore?: number;
  enabled?: boolean;
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
      },
    });
  }

  static async getNotifications(): Promise<any[]> {
    return await db.notificationSetting.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  static async updateNotification(id: string, data: Partial<NotificationData>): Promise<void> {
    await db.notificationSetting.update({
      where: { id },
      data,
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
          await this.sendWebhook(setting.recipient, payload);
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
    
    // Mock email sending
    if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
      throw new Error('SMTP configuration not found');
    }
    
    // In production, implement actual email sending here
    // Example using nodemailer:
    /*
    const transporter = nodemailer.createTransport({
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

  private static async sendWebhook(url: string, payload: NotificationPayload): Promise<void> {
    // This is a mock implementation - in production, use actual HTTP requests
    console.log(`Sending webhook to ${url}:`);
    console.log('Payload:', payload);
    
    // Mock webhook sending
    if (!url.startsWith('http')) {
      throw new Error('Invalid webhook URL');
    }
    
    // In production, implement actual webhook sending here
    /*
    await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    */
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