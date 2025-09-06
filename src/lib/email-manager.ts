/**
 * Email Manager
 *
 * Comprehensive email management system for SMTP configuration,
 * template management, and email delivery with queue processing
 */

import { SettingsCacheService } from './settings-cache';
import { AuditService } from './audit';

// Email Template interface
export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  htmlBody: string;
  textBody?: string;
  variables?: Array<{
    name: string;
    type: 'string' | 'number' | 'boolean' | 'date';
    required: boolean;
    defaultValue?: any;
    description?: string;
  }>;
  category: 'security' | 'certificate' | 'system' | 'notification' | 'alert';
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdBy?: string;
  updatedBy?: string;
}

// Email Queue Item interface
export interface EmailQueueItem {
  id: string;
  templateId: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  variables: Record<string, any>;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  status: 'queued' | 'sending' | 'sent' | 'failed' | 'cancelled';
  scheduledAt?: Date;
  sentAt?: Date;
  errorMessage?: string;
  retryCount: number;
  maxRetries: number;
  createdAt: Date;
  updatedAt: Date;
  messageId?: string;
  deliveryAttempts: Array<{
    attemptAt: Date;
    success: boolean;
    errorMessage?: string;
    responseTime: number;
  }>;
}

// SMTP Configuration interface
export interface SMTPConfig {
  enabled: boolean;
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string;
  fromEmail: string;
  fromName: string;
  replyToEmail?: string;
  connectionTimeout?: number;
  greetingTimeout?: number;
  socketTimeout?: number;
  pool?: boolean;
  maxConnections?: number;
  rateLimit?: number;
  tls?: {
    rejectUnauthorized?: boolean;
    minVersion?: 'TLSv1' | 'TLSv1.1' | 'TLSv1.2' | 'TLSv1.3';
    ciphers?: string;
  };
}

// Email Delivery Statistics interface
export interface EmailDeliveryStats {
  totalSent: number;
  totalFailed: number;
  totalQueued: number;
  deliveryRate: number;
  averageDeliveryTime: number;
  bounceRate: number;
  complaintRate: number;
  unsubscribeRate: number;
  last24Hours: {
    sent: number;
    failed: number;
    queued: number;
  };
  last7Days: {
    sent: number;
    failed: number;
    queued: number;
  };
  last30Days: {
    sent: number;
    failed: number;
    queued: number;
  };
  topFailureReasons: Array<{
    reason: string;
    count: number;
    percentage: number;
  }>;
  deliveryByHour: Array<{
    hour: number;
    sent: number;
    failed: number;
  }>;
}

// Email Manager Class
export class EmailManager {
  private static emailQueue: EmailQueueItem[] = [];
  private static processingInterval: NodeJS.Timeout | null = null;
  private static readonly MAX_QUEUE_SIZE = 10000;
  private static readonly MAX_CONCURRENT_SENDS = 5;
  private static readonly PROCESSING_INTERVAL_MS = 5000; // 5 seconds
  private static readonly MAX_RETRY_ATTEMPTS = 3;
  private static readonly RETRY_DELAY_MS = 60000; // 1 minute

  // Initialize the email manager
  static async initialize(): Promise<void> {
    try {
      await this.startQueueProcessing();
      console.log('Email Manager initialized');
    } catch (error) {
      console.error('Failed to initialize Email Manager:', error);
    }
  }

  // Send email using template
  static async sendEmail(
    templateId: string,
    recipient: string | string[],
    variables: Record<string, any> = {},
    options: {
      priority?: 'low' | 'normal' | 'high' | 'urgent';
      cc?: string[];
      bcc?: string[];
      scheduledAt?: Date;
      maxRetries?: number;
    } = {}
  ): Promise<{ queued: boolean; messageId?: string; error?: string }> {
    try {
      const smtpConfig = await this.getSMTPConfig();
      if (!smtpConfig.enabled) {
        return {
          queued: false,
          error: 'SMTP is not enabled'
        };
      }

      const template = await this.getEmailTemplate(templateId);
      if (!template || !template.enabled) {
        return {
          queued: false,
          error: 'Email template not found or disabled'
        };
      }

      const recipients = Array.isArray(recipient) ? recipient : [recipient];
      const messageId = `email_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      const queueItem: EmailQueueItem = {
        id: messageId,
        templateId,
        to: recipients,
        cc: options.cc,
        bcc: options.bcc,
        variables,
        priority: options.priority || 'normal',
        status: options.scheduledAt ? 'queued' : 'queued',
        scheduledAt: options.scheduledAt,
        retryCount: 0,
        maxRetries: options.maxRetries || this.MAX_RETRY_ATTEMPTS,
        createdAt: new Date(),
        updatedAt: new Date(),
        deliveryAttempts: []
      };

      // Check queue size limit
      if (this.emailQueue.length >= this.MAX_QUEUE_SIZE) {
        return {
          queued: false,
          error: 'Email queue is full'
        };
      }

      this.emailQueue.push(queueItem);

      // Log email queued
      await AuditService.log({
        action: 'USER_UPDATED' as any,
        userId: 'system',
        username: 'system',
        description: `Email queued: ${template.name} to ${recipients.join(', ')}`,
        metadata: {
          messageId,
          templateId,
          recipients,
          priority: queueItem.priority
        }
      });

      return {
        queued: true,
        messageId
      };
    } catch (error) {
      console.error('Error queuing email:', error);
      return {
        queued: false,
        error: String(error)
      };
    }
  }

  // Send test email
  static async sendTestEmail(recipient: string): Promise<{ sent: boolean; messageId?: string; error?: string }> {
    try {
      const smtpConfig = await this.getSMTPConfig();
      if (!smtpConfig.enabled) {
        return {
          sent: false,
          error: 'SMTP is not enabled'
        };
      }

      const testTemplate: EmailTemplate = {
        id: 'test_email',
        name: 'SMTP Test Email',
        subject: 'SMTP Configuration Test',
        htmlBody: '<h1>SMTP Test</h1><p>This is a test email to verify your SMTP configuration.</p><p>Sent at: {{timestamp}}</p>',
        textBody: 'SMTP Test\n\nThis is a test email to verify your SMTP configuration.\n\nSent at: {{timestamp}}',
        variables: [
          { name: 'timestamp', type: 'date', required: true, description: 'Current timestamp' }
        ],
        category: 'system',
        enabled: true,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const variables = {
        timestamp: new Date().toISOString()
      };

      return await this.sendEmailDirect(testTemplate, [recipient], variables);
    } catch (error) {
      console.error('Error sending test email:', error);
      return {
        sent: false,
        error: String(error)
      };
    }
  }

  // Test SMTP connection
  static async testSMTPConnection(): Promise<{ connected: boolean; responseTime: number; error?: string }> {
    try {
      const smtpConfig = await this.getSMTPConfig();
      if (!smtpConfig.enabled) {
        return {
          connected: false,
          responseTime: 0,
          error: 'SMTP is not enabled'
        };
      }

      const startTime = Date.now();

      // This would test actual SMTP connection
      // For now, simulate connection test
      await new Promise(resolve => setTimeout(resolve, 100)); // Simulate network delay

      const responseTime = Date.now() - startTime;

      // Log connection test
      await AuditService.log({
        action: 'USER_UPDATED' as any,
        userId: 'system',
        username: 'system',
        description: 'SMTP connection test performed',
        metadata: {
          responseTime,
          success: true
        }
      });

      return {
        connected: true,
        responseTime
      };
    } catch (error) {
      console.error('Error testing SMTP connection:', error);
      return {
        connected: false,
        responseTime: 0,
        error: String(error)
      };
    }
  }

  // Get email templates
  static async getEmailTemplates(category?: string): Promise<EmailTemplate[]> {
    try {
      // This would retrieve templates from database
      // For now, return mock templates
      const templates: EmailTemplate[] = [
        {
          id: 'certificate-expiring',
          name: 'Certificate Expiring Notification',
          subject: 'Certificate Expiration Notice - {{certificateName}}',
          htmlBody: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h1 style="color: #d32f2f;">Certificate Expiration Notice</h1>
              <p>Dear Administrator,</p>
              <p>Your certificate <strong>{{certificateName}}</strong> is expiring soon.</p>
              <div style="background-color: #fff3e0; padding: 15px; border-left: 4px solid #ff9800; margin: 20px 0;">
                <strong>Certificate Details:</strong><br>
                Name: {{certificateName}}<br>
                Expires: {{expiryDate}}<br>
                Days until expiry: {{daysUntilExpiry}}
              </div>
              <p>Please take appropriate action to renew or replace this certificate before it expires.</p>
              <p>Best regards,<br>Certificate Authority System</p>
            </div>
          `,
          textBody: `
Certificate Expiration Notice

Dear Administrator,

Your certificate {{certificateName}} is expiring soon.

Certificate Details:
Name: {{certificateName}}
Expires: {{expiryDate}}
Days until expiry: {{daysUntilExpiry}}

Please take appropriate action to renew or replace this certificate before it expires.

Best regards,
Certificate Authority System
          `,
          variables: [
            { name: 'certificateName', type: 'string', required: true, description: 'Name of the certificate' },
            { name: 'expiryDate', type: 'date', required: true, description: 'Expiration date' },
            { name: 'daysUntilExpiry', type: 'number', required: true, description: 'Days until expiry' }
          ],
          category: 'certificate',
          enabled: true,
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          id: 'security-alert',
          name: 'Security Alert Notification',
          subject: 'Security Alert: {{alertType}}',
          htmlBody: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h1 style="color: #d32f2f;">Security Alert</h1>
              <p>Dear Administrator,</p>
              <p>A security alert has been detected in your system.</p>
              <div style="background-color: #ffebee; padding: 15px; border-left: 4px solid #f44336; margin: 20px 0;">
                <strong>Alert Details:</strong><br>
                Type: {{alertType}}<br>
                Message: {{alertMessage}}<br>
                Time: {{timestamp}}<br>
                Severity: {{severity}}
              </div>
              <p>Please review this alert and take appropriate action if necessary.</p>
              <p>Best regards,<br>Security Monitoring System</p>
            </div>
          `,
          textBody: `
Security Alert

Dear Administrator,

A security alert has been detected in your system.

Alert Details:
Type: {{alertType}}
Message: {{alertMessage}}
Time: {{timestamp}}
Severity: {{severity}}

Please review this alert and take appropriate action if necessary.

Best regards,
Security Monitoring System
          `,
          variables: [
            { name: 'alertType', type: 'string', required: true, description: 'Type of security alert' },
            { name: 'alertMessage', type: 'string', required: true, description: 'Alert message' },
            { name: 'timestamp', type: 'date', required: true, description: 'Alert timestamp' },
            { name: 'severity', type: 'string', required: true, description: 'Alert severity level' }
          ],
          category: 'security',
          enabled: true,
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          id: 'system-health',
          name: 'System Health Report',
          subject: 'Daily System Health Report',
          htmlBody: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h1 style="color: #1976d2;">Daily System Health Report</h1>
              <p>Dear Administrator,</p>
              <p>Here is your daily system health report.</p>
              <div style="background-color: #e3f2fd; padding: 15px; margin: 20px 0;">
                <strong>System Status:</strong> {{overallStatus}}<br>
                <strong>Report Date:</strong> {{reportDate}}<br>
                <strong>Monitoring Period:</strong> {{monitoringPeriod}}
              </div>
              <h3>Key Metrics:</h3>
              <ul>
                <li>CPU Usage: {{cpuUsage}}%</li>
                <li>Memory Usage: {{memoryUsage}}%</li>
                <li>Disk Usage: {{diskUsage}}%</li>
                <li>Active Connections: {{activeConnections}}</li>
              </ul>
              <p>For detailed information, please log into the admin dashboard.</p>
              <p>Best regards,<br>System Monitoring</p>
            </div>
          `,
          textBody: `
Daily System Health Report

Dear Administrator,

Here is your daily system health report.

System Status: {{overallStatus}}
Report Date: {{reportDate}}
Monitoring Period: {{monitoringPeriod}}

Key Metrics:
- CPU Usage: {{cpuUsage}}%
- Memory Usage: {{memoryUsage}}%
- Disk Usage: {{diskUsage}}%
- Active Connections: {{activeConnections}}

For detailed information, please log into the admin dashboard.

Best regards,
System Monitoring
          `,
          variables: [
            { name: 'overallStatus', type: 'string', required: true, description: 'Overall system status' },
            { name: 'reportDate', type: 'date', required: true, description: 'Report date' },
            { name: 'monitoringPeriod', type: 'string', required: true, description: 'Monitoring period' },
            { name: 'cpuUsage', type: 'number', required: true, description: 'CPU usage percentage' },
            { name: 'memoryUsage', type: 'number', required: true, description: 'Memory usage percentage' },
            { name: 'diskUsage', type: 'number', required: true, description: 'Disk usage percentage' },
            { name: 'activeConnections', type: 'number', required: true, description: 'Active connections count' }
          ],
          category: 'system',
          enabled: true,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ];

      let filteredTemplates = templates;
      if (category) {
        filteredTemplates = templates.filter(t => t.category === category);
      }

      return filteredTemplates;
    } catch (error) {
      console.error('Error getting email templates:', error);
      return [];
    }
  }

  // Create email template
  static async createEmailTemplate(template: Omit<EmailTemplate, 'id' | 'createdAt' | 'updatedAt'>, userId: string): Promise<{ id: string; created: boolean }> {
    try {
      const templateId = `template_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      const newTemplate: EmailTemplate = {
        ...template,
        id: templateId,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: userId
      };

      // TODO: Save to database
      // await db.emailTemplate.create({ data: newTemplate });

      // Log template creation
      await AuditService.log({
        action: 'USER_UPDATED' as any,
        userId,
        username: userId,
        description: `Email template created: ${template.name}`,
        metadata: {
          templateId,
          templateName: template.name,
          category: template.category
        }
      });

      return {
        id: templateId,
        created: true
      };
    } catch (error) {
      console.error('Error creating email template:', error);
      return {
        id: '',
        created: false
      };
    }
  }

  // Update email template
  static async updateEmailTemplate(templateId: string, updates: Partial<EmailTemplate>, userId: string): Promise<{ updated: boolean }> {
    try {
      // TODO: Update in database
      // await db.emailTemplate.update({
      //   where: { id: templateId },
      //   data: {
      //     ...updates,
      //     updatedAt: new Date(),
      //     updatedBy: userId
      //   }
      // });

      // Log template update
      await AuditService.log({
        action: 'USER_UPDATED' as any,
        userId,
        username: userId,
        description: `Email template updated: ${templateId}`,
        metadata: {
          templateId,
          updates: Object.keys(updates)
        }
      });

      return { updated: true };
    } catch (error) {
      console.error('Error updating email template:', error);
      return { updated: false };
    }
  }

  // Delete email template
  static async deleteEmailTemplate(templateId: string, userId: string): Promise<{ deleted: boolean }> {
    try {
      // TODO: Delete from database
      // await db.emailTemplate.delete({
      //   where: { id: templateId }
      // });

      // Log template deletion
      await AuditService.log({
        action: 'USER_UPDATED' as any,
        userId,
        username: userId,
        description: `Email template deleted: ${templateId}`,
        metadata: {
          templateId
        }
      });

      return { deleted: true };
    } catch (error) {
      console.error('Error deleting email template:', error);
      return { deleted: false };
    }
  }

  // Get email delivery statistics
  static async getDeliveryStats(): Promise<EmailDeliveryStats> {
    try {
      // This would calculate statistics from database
      // For now, return mock data
      const stats: EmailDeliveryStats = {
        totalSent: 1250,
        totalFailed: 25,
        totalQueued: this.emailQueue.length,
        deliveryRate: 98.0,
        averageDeliveryTime: 2.3,
        bounceRate: 1.2,
        complaintRate: 0.1,
        unsubscribeRate: 0.3,
        last24Hours: {
          sent: 45,
          failed: 1,
          queued: this.emailQueue.filter(q => q.createdAt >= new Date(Date.now() - 24 * 60 * 60 * 1000)).length
        },
        last7Days: {
          sent: 320,
          failed: 8,
          queued: this.emailQueue.filter(q => q.createdAt >= new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)).length
        },
        last30Days: {
          sent: 1250,
          failed: 25,
          queued: this.emailQueue.filter(q => q.createdAt >= new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)).length
        },
        topFailureReasons: [
          { reason: 'Invalid recipient', count: 8, percentage: 32 },
          { reason: 'Mailbox full', count: 6, percentage: 24 },
          { reason: 'SMTP timeout', count: 5, percentage: 20 },
          { reason: 'Authentication failed', count: 4, percentage: 16 },
          { reason: 'Other', count: 2, percentage: 8 }
        ],
        deliveryByHour: Array.from({ length: 24 }, (_, hour) => ({
          hour,
          sent: Math.floor(Math.random() * 50),
          failed: Math.floor(Math.random() * 5)
        }))
      };

      return stats;
    } catch (error) {
      console.error('Error getting delivery stats:', error);
      return {
        totalSent: 0,
        totalFailed: 0,
        totalQueued: 0,
        deliveryRate: 0,
        averageDeliveryTime: 0,
        bounceRate: 0,
        complaintRate: 0,
        unsubscribeRate: 0,
        last24Hours: { sent: 0, failed: 0, queued: 0 },
        last7Days: { sent: 0, failed: 0, queued: 0 },
        last30Days: { sent: 0, failed: 0, queued: 0 },
        topFailureReasons: [],
        deliveryByHour: []
      };
    }
  }

  // Get email queue
  static async getEmailQueue(status?: string): Promise<EmailQueueItem[]> {
    try {
      let filteredQueue = this.emailQueue;

      if (status && status !== 'all') {
        filteredQueue = this.emailQueue.filter(item => item.status === status);
      }

      // Sort by priority and creation time
      filteredQueue.sort((a, b) => {
        const priorityOrder = { urgent: 4, high: 3, normal: 2, low: 1 };
        const priorityDiff = priorityOrder[b.priority] - priorityOrder[a.priority];
        if (priorityDiff !== 0) return priorityDiff;
        return a.createdAt.getTime() - b.createdAt.getTime();
      });

      return filteredQueue.slice(0, 100); // Return first 100 items
    } catch (error) {
      console.error('Error getting email queue:', error);
      return [];
    }
  }

  // Retry failed emails
  static async retryFailedEmails(maxRetries: number = 3): Promise<{ emailsRetried: number; emailsSent: number; emailsFailed: number }> {
    try {
      const failedEmails = this.emailQueue.filter(
        item => item.status === 'failed' && item.retryCount < maxRetries
      );

      let emailsSent = 0;
      let emailsFailed = 0;

      for (const email of failedEmails) {
        email.retryCount++;
        email.status = 'queued';
        email.updatedAt = new Date();
      }

      // Log retry operation
      await AuditService.log({
        action: 'USER_UPDATED' as any,
        userId: 'system',
        username: 'system',
        description: `Failed emails retry initiated: ${failedEmails.length} emails`,
        metadata: {
          emailsRetried: failedEmails.length,
          maxRetries
        }
      });

      return {
        emailsRetried: failedEmails.length,
        emailsSent,
        emailsFailed
      };
    } catch (error) {
      console.error('Error retrying failed emails:', error);
      return {
        emailsRetried: 0,
        emailsSent: 0,
        emailsFailed: 0
      };
    }
  }

  // Clear email queue
  static async clearEmailQueue(status: string = 'all'): Promise<{ emailsCleared: number }> {
    try {
      const initialLength = this.emailQueue.length;

      if (status === 'all') {
        this.emailQueue = [];
      } else {
        this.emailQueue = this.emailQueue.filter(item => item.status !== status);
      }

      const emailsCleared = initialLength - this.emailQueue.length;

      // Log queue clear
      await AuditService.log({
        action: 'USER_UPDATED' as any,
        userId: 'system',
        username: 'system',
        description: `Email queue cleared: ${emailsCleared} emails removed`,
        metadata: {
          status,
          emailsCleared
        }
      });

      return { emailsCleared };
    } catch (error) {
      console.error('Error clearing email queue:', error);
      return { emailsCleared: 0 };
    }
  }

  // Private helper methods

  private static async getSMTPConfig(): Promise<SMTPConfig> {
    try {
      const configData = await SettingsCacheService.getCASetting('smtp_config');

      return configData?.config || {
        enabled: false,
        host: '',
        port: 587,
        secure: false,
        username: '',
        password: '',
        fromEmail: '',
        fromName: '',
        connectionTimeout: 30000,
        greetingTimeout: 30000,
        socketTimeout: 30000,
        pool: false,
        maxConnections: 5,
        rateLimit: 10
      };
    } catch (error) {
      console.error('Error getting SMTP config:', error);
      throw error;
    }
  }

  private static async getEmailTemplate(templateId: string): Promise<EmailTemplate | null> {
    try {
      const templates = await this.getEmailTemplates();
      return templates.find(t => t.id === templateId) || null;
    } catch (error) {
      console.error('Error getting email template:', error);
      return null;
    }
  }

  private static async sendEmailDirect(
    template: EmailTemplate,
    recipients: string[],
    variables: Record<string, any>
  ): Promise<{ sent: boolean; messageId?: string; error?: string }> {
    try {
      const smtpConfig = await this.getSMTPConfig();

      // Render template
      const renderedContent = this.renderTemplate(template, variables);

      // This would send email using actual SMTP
      // For now, simulate sending
      await new Promise(resolve => setTimeout(resolve, 100)); // Simulate network delay

      const messageId = `email_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Log email sent
      await AuditService.log({
        action: 'USER_UPDATED' as any,
        userId: 'system',
        username: 'system',
        description: `Email sent: ${template.name} to ${recipients.join(', ')}`,
        metadata: {
          messageId,
          templateId: template.id,
          recipients,
          subject: renderedContent.subject
        }
      });

      return {
        sent: true,
        messageId
      };
    } catch (error) {
      console.error('Error sending email directly:', error);
      return {
        sent: false,
        error: String(error)
      };
    }
  }

  private static renderTemplate(template: EmailTemplate, variables: Record<string, any>): {
    subject: string;
    htmlBody: string;
    textBody?: string;
  } {
    try {
      let subject = template.subject;
      let htmlBody = template.htmlBody;
      let textBody = template.textBody;

      // Replace variables in subject
      for (const [key, value] of Object.entries(variables)) {
        const regex = new RegExp(`{{${key}}}`, 'g');
        subject = subject.replace(regex, String(value));
        htmlBody = htmlBody.replace(regex, String(value));
        if (textBody) {
          textBody = textBody.replace(regex, String(value));
        }
      }

      return {
        subject,
        htmlBody,
        textBody
      };
    } catch (error) {
      console.error('Error rendering template:', error);
      return {
        subject: template.subject,
        htmlBody: template.htmlBody,
        textBody: template.textBody
      };
    }
  }

  private static async startQueueProcessing(): Promise<void> {
    try {
      this.processingInterval = setInterval(async () => {
        try {
          await this.processEmailQueue();
        } catch (error) {
          console.error('Error processing email queue:', error);
        }
      }, this.PROCESSING_INTERVAL_MS);
    } catch (error) {
      console.error('Error starting queue processing:', error);
    }
  }

  private static async processEmailQueue(): Promise<void> {
    try {
      const smtpConfig = await this.getSMTPConfig();
      if (!smtpConfig.enabled) return;

      // Get emails ready to send
      const emailsToSend = this.emailQueue
        .filter(item =>
          item.status === 'queued' &&
          (!item.scheduledAt || item.scheduledAt <= new Date())
        )
        .sort((a, b) => {
          // Sort by priority first, then by creation time
          const priorityOrder = { urgent: 4, high: 3, normal: 2, low: 1 };
          const priorityDiff = priorityOrder[b.priority] - priorityOrder[a.priority];
          if (priorityDiff !== 0) return priorityDiff;
          return a.createdAt.getTime() - b.createdAt.getTime();
        })
        .slice(0, this.MAX_CONCURRENT_SENDS);

      for (const email of emailsToSend) {
        try {
          email.status = 'sending';
          email.updatedAt = new Date();

          const template = await this.getEmailTemplate(email.templateId);
          if (!template || !template.enabled) {
            email.status = 'failed';
            email.errorMessage = 'Template not found or disabled';
            continue;
          }

          const result = await this.sendEmailDirect(template, email.to, email.variables);

          if (result.sent) {
            email.status = 'sent';
            email.sentAt = new Date();
            email.messageId = result.messageId;
          } else {
            email.status = 'failed';
            email.errorMessage = result.error;
            email.retryCount++;

            if (email.retryCount >= email.maxRetries) {
              email.status = 'failed';
            } else {
              // Schedule retry
              setTimeout(() => {
                email.status = 'queued';
                email.updatedAt = new Date();
              }, this.RETRY_DELAY_MS);
            }
          }

          email.updatedAt = new Date();
        } catch (error) {
          email.status = 'failed';
          email.errorMessage = String(error);
          email.retryCount++;
          email.updatedAt = new Date();

          if (email.retryCount >= email.maxRetries) {
            email.status = 'failed';
          }
        }
      }

      // Clean up old sent emails from queue (keep last 1000)
      if (this.emailQueue.length > 1000) {
        const sentEmails = this.emailQueue.filter(e => e.status === 'sent');
        const failedEmails = this.emailQueue.filter(e => e.status === 'failed');
        const queuedEmails = this.emailQueue.filter(e => e.status !== 'sent' && e.status !== 'failed');

        // Keep most recent sent emails
        sentEmails.sort((a, b) => b.sentAt!.getTime() - a.sentAt!.getTime());
        const recentSentEmails = sentEmails.slice(0, 500);

        this.emailQueue = [...queuedEmails, ...recentSentEmails, ...failedEmails];
      }
    } catch (error) {
      console.error('Error processing email queue:', error);
    }
  }

  // Shutdown the email manager
  static shutdown(): void {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }
    this.emailQueue = [];
    console.log('Email Manager shut down');
  }
}

// Export utilities
export const sendEmail = EmailManager.sendEmail.bind(EmailManager);
export const sendTestEmail = EmailManager.sendTestEmail.bind(EmailManager);
export const testSMTPConnection = EmailManager.testSMTPConnection.bind(EmailManager);
export const getEmailTemplates = EmailManager.getEmailTemplates.bind(EmailManager);
export const createEmailTemplate = EmailManager.createEmailTemplate.bind(EmailManager);
export const updateEmailTemplate = EmailManager.updateEmailTemplate.bind(EmailManager);
export const deleteEmailTemplate = EmailManager.deleteEmailTemplate.bind(EmailManager);
export const getDeliveryStats = EmailManager.getDeliveryStats.bind(EmailManager);
export const getEmailQueue = EmailManager.getEmailQueue.bind(EmailManager);
export const retryFailedEmails = EmailManager.retryFailedEmails.bind(EmailManager);
export const clearEmailQueue = EmailManager.clearEmailQueue.bind(EmailManager);
export const initializeEmailManager = EmailManager.initialize.bind(EmailManager);

export default EmailManager;
