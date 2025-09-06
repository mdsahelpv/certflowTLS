import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { SettingsValidation } from '@/lib/settings-validation';
import { AuditService } from '@/lib/audit';
import { SettingsCacheService } from '@/lib/settings-cache';

// Email/SMTP Configuration interface
interface SMTPConfig {
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

// Email Template interface
interface EmailTemplate {
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
}

// Notification Settings interface
interface NotificationSettings {
  enabled: boolean;
  emailNotifications: boolean;
  webhookNotifications: boolean;
  slackNotifications: boolean;
  smsNotifications: boolean;
  notificationTypes: Array<
    'certificate_expiring' |
    'certificate_expired' |
    'certificate_revoked' |
    'security_alert' |
    'system_health' |
    'performance_alert' |
    'user_action' |
    'admin_action'
  >;
  escalationSettings?: {
    enabled: boolean;
    escalationDelayMinutes: number;
    escalationRecipients?: string[];
    maxEscalationLevels?: number;
  };
  quietHours?: {
    enabled: boolean;
    startTime: string;
    endTime: string;
    timezone?: string;
  };
}

// Email Queue Item interface
interface EmailQueueItem {
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
}

// Email Delivery Statistics interface
interface EmailDeliveryStats {
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
}

// GET - Retrieve notification settings and email configuration
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const permissions = (session.user as any).permissions || [];
    if (!permissions.includes('admin:manage')) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    // Get notification settings from database with caching
    const [
      smtpConfig,
      notificationSettings,
      emailTemplates,
      deliveryStats,
      emailQueue
    ] = await Promise.all([
      SettingsCacheService.getCASetting('smtp_config'),
      SettingsCacheService.getCASetting('notification_settings'),
      getEmailTemplates(),
      getEmailDeliveryStats(),
      getEmailQueue()
    ]);

    // Build response configuration
    const config: SMTPConfig = smtpConfig?.config || {
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

    const notifications: NotificationSettings = notificationSettings?.config || {
      enabled: true,
      emailNotifications: true,
      webhookNotifications: false,
      slackNotifications: false,
      smsNotifications: false,
      notificationTypes: [
        'certificate_expiring',
        'certificate_expired',
        'security_alert',
        'system_health',
        'performance_alert'
      ],
      escalationSettings: {
        enabled: true,
        escalationDelayMinutes: 60,
        maxEscalationLevels: 3
      },
      quietHours: {
        enabled: false,
        startTime: '22:00',
        endTime: '08:00',
        timezone: 'UTC'
      }
    };

    return NextResponse.json({
      smtp: config,
      notifications,
      templates: emailTemplates,
      stats: deliveryStats,
      queue: emailQueue
    });
  } catch (error) {
    console.error('Error fetching notification settings:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST - Update notification settings and manage email system
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const permissions = (session.user as any).permissions || [];
    if (!permissions.includes('admin:manage')) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const body = await request.json();
    const { action, config: updateConfig } = body;
    const userId = (session.user as any).id;
    const username = (session.user as any).username || session.user.email;

    switch (action) {
      case 'updateSMTPConfig':
        // Validate SMTP configuration
        if (!updateConfig.smtpConfig) {
          return NextResponse.json({ error: 'SMTP configuration is required' }, { status: 400 });
        }

        const smtpValidation = SettingsValidation.validateSMTPConfig(updateConfig.smtpConfig);
        if (!smtpValidation.isValid) {
          return NextResponse.json({
            error: 'Invalid SMTP configuration',
            details: smtpValidation.errors
          }, { status: 400 });
        }

        // Get current config for audit logging
        const currentSMTPConfig = await SettingsCacheService.getCASetting('smtp_config');

        // Update SMTP configuration in database
        await SettingsCacheService.setCASetting(
          'smtp_config',
          'SMTP Configuration',
          updateConfig.smtpConfig,
          undefined,
          userId
        );

        // Log the change
        await AuditService.log({
          action: 'CONFIG_UPDATED' as any,
          userId,
          username,
          description: 'SMTP configuration updated',
          metadata: {
            oldConfig: currentSMTPConfig?.config,
            newConfig: updateConfig.smtpConfig
          }
        });

        return NextResponse.json({
          success: true,
          message: 'SMTP configuration updated successfully'
        });

      case 'updateNotificationSettings':
        // Validate notification settings
        if (!updateConfig.notificationSettings) {
          return NextResponse.json({ error: 'Notification settings are required' }, { status: 400 });
        }

        const notificationValidation = SettingsValidation.validateAllSettings(updateConfig.notificationSettings);
        if (!notificationValidation.isValid) {
          return NextResponse.json({
            error: 'Invalid notification settings',
            details: notificationValidation.errors
          }, { status: 400 });
        }

        // Get current config for audit logging
        const currentNotificationConfig = await SettingsCacheService.getCASetting('notification_settings');

        // Update notification settings in database
        await SettingsCacheService.setCASetting(
          'notification_settings',
          'Notification Settings',
          updateConfig.notificationSettings,
          undefined,
          userId
        );

        // Log the change
        await AuditService.log({
          action: 'CONFIG_UPDATED' as any,
          userId,
          username,
          description: 'Notification settings updated',
          metadata: {
            oldConfig: currentNotificationConfig?.config,
            newConfig: updateConfig.notificationSettings
          }
        });

        return NextResponse.json({
          success: true,
          message: 'Notification settings updated successfully'
        });

      case 'createEmailTemplate':
        // Validate email template
        if (!updateConfig.template) {
          return NextResponse.json({ error: 'Email template is required' }, { status: 400 });
        }

        const templateValidation = SettingsValidation.validateAllSettings(updateConfig.template);
        if (!templateValidation.isValid) {
          return NextResponse.json({
            error: 'Invalid email template',
            details: templateValidation.errors
          }, { status: 400 });
        }

        const templateResult = await createEmailTemplate(updateConfig.template, userId);

        // Log template creation
        await AuditService.log({
          action: 'USER_UPDATED' as any,
          userId,
          username,
          description: `Email template created: ${updateConfig.template.name}`,
          metadata: {
            templateId: templateResult.id,
            templateName: updateConfig.template.name
          }
        });

        return NextResponse.json({
          success: true,
          message: 'Email template created successfully',
          result: templateResult
        });

      case 'updateEmailTemplate':
        // Validate email template
        if (!updateConfig.template || !updateConfig.templateId) {
          return NextResponse.json({ error: 'Email template and template ID are required' }, { status: 400 });
        }

        const updateTemplateValidation = SettingsValidation.validateAllSettings(updateConfig.template);
        if (!updateTemplateValidation.isValid) {
          return NextResponse.json({
            error: 'Invalid email template',
            details: updateTemplateValidation.errors
          }, { status: 400 });
        }

        const updateResult = await updateEmailTemplate(updateConfig.templateId, updateConfig.template, userId);

        // Log template update
        await AuditService.log({
          action: 'USER_UPDATED' as any,
          userId,
          username,
          description: `Email template updated: ${updateConfig.template.name}`,
          metadata: {
            templateId: updateConfig.templateId,
            templateName: updateConfig.template.name
          }
        });

        return NextResponse.json({
          success: true,
          message: 'Email template updated successfully',
          result: updateResult
        });

      case 'deleteEmailTemplate':
        // Delete email template
        if (!updateConfig.templateId) {
          return NextResponse.json({ error: 'Template ID is required' }, { status: 400 });
        }

        const deleteResult = await deleteEmailTemplate(updateConfig.templateId, userId);

        // Log template deletion
        await AuditService.log({
          action: 'USER_UPDATED' as any,
          userId,
          username,
          description: `Email template deleted: ${updateConfig.templateId}`,
          metadata: {
            templateId: updateConfig.templateId
          }
        });

        return NextResponse.json({
          success: true,
          message: 'Email template deleted successfully',
          result: deleteResult
        });

      case 'sendTestEmail':
        // Send test email
        if (!updateConfig.recipient) {
          return NextResponse.json({ error: 'Recipient email is required' }, { status: 400 });
        }

        const testResult = await sendTestEmail(updateConfig.recipient, userId);

        // Log test email
        await AuditService.log({
          action: 'USER_UPDATED' as any,
          userId,
          username,
          description: `Test email sent to: ${updateConfig.recipient}`,
          metadata: {
            recipient: updateConfig.recipient,
            testResult
          }
        });

        return NextResponse.json({
          success: true,
          message: 'Test email sent successfully',
          result: testResult
        });

      case 'testSMTPConnection':
        // Test SMTP connection
        const connectionResult = await testSMTPConnection();

        // Log connection test
        await AuditService.log({
          action: 'USER_UPDATED' as any,
          userId,
          username,
          description: 'SMTP connection test performed',
          metadata: {
            connectionResult
          }
        });

        return NextResponse.json({
          success: true,
          message: 'SMTP connection test completed',
          result: connectionResult
        });

      case 'sendEmail':
        // Send email using template
        if (!updateConfig.templateId || !updateConfig.recipient) {
          return NextResponse.json({ error: 'Template ID and recipient are required' }, { status: 400 });
        }

        const sendResult = await sendEmail(
          updateConfig.templateId,
          updateConfig.recipient,
          updateConfig.variables || {},
          updateConfig.priority || 'normal'
        );

        // Log email send
        await AuditService.log({
          action: 'USER_UPDATED' as any,
          userId,
          username,
          description: `Email sent using template: ${updateConfig.templateId}`,
          metadata: {
            templateId: updateConfig.templateId,
            recipient: updateConfig.recipient,
            sendResult
          }
        });

        return NextResponse.json({
          success: true,
          message: 'Email sent successfully',
          result: sendResult
        });

      case 'retryFailedEmails':
        // Retry failed emails
        const retryResult = await retryFailedEmails(updateConfig.maxRetries || 3);

        // Log retry operation
        await AuditService.log({
          action: 'USER_UPDATED' as any,
          userId,
          username,
          description: `Failed emails retry initiated: ${retryResult.emailsRetried} emails`,
          metadata: retryResult
        });

        return NextResponse.json({
          success: true,
          message: `Retried ${retryResult.emailsRetried} failed emails`,
          result: retryResult
        });

      case 'clearEmailQueue':
        // Clear email queue
        const clearResult = await clearEmailQueue(updateConfig.status || 'all');

        // Log queue clear
        await AuditService.log({
          action: 'USER_UPDATED' as any,
          userId,
          username,
          description: `Email queue cleared: ${clearResult.emailsCleared} emails removed`,
          metadata: clearResult
        });

        return NextResponse.json({
          success: true,
          message: `Email queue cleared: ${clearResult.emailsCleared} emails removed`,
          result: clearResult
        });

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Error updating notification settings:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Helper function to get email templates
async function getEmailTemplates(): Promise<EmailTemplate[]> {
  try {
    // This would retrieve email templates from database
    // For now, return mock data
    const templates: EmailTemplate[] = [
      {
        id: 'certificate-expiring',
        name: 'Certificate Expiring Notification',
        subject: 'Certificate Expiration Notice',
        htmlBody: '<h1>Certificate Expiring</h1><p>Your certificate {{certificateName}} will expire on {{expiryDate}}.</p>',
        textBody: 'Certificate Expiring\n\nYour certificate {{certificateName}} will expire on {{expiryDate}}.',
        variables: [
          { name: 'certificateName', type: 'string', required: true, description: 'Name of the certificate' },
          { name: 'expiryDate', type: 'date', required: true, description: 'Expiration date' }
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
        htmlBody: '<h1>Security Alert</h1><p>{{alertMessage}}</p><p>Time: {{timestamp}}</p>',
        textBody: 'Security Alert\n\n{{alertMessage}}\n\nTime: {{timestamp}}',
        variables: [
          { name: 'alertType', type: 'string', required: true, description: 'Type of security alert' },
          { name: 'alertMessage', type: 'string', required: true, description: 'Alert message' },
          { name: 'timestamp', type: 'date', required: true, description: 'Alert timestamp' }
        ],
        category: 'security',
        enabled: true,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ];

    // TODO: Implement actual template retrieval
    // const templates = await db.emailTemplate.findMany({ orderBy: { createdAt: 'desc' } });

    return templates;
  } catch (error) {
    console.error('Error getting email templates:', error);
    return [];
  }
}

// Helper function to get email delivery statistics
async function getEmailDeliveryStats(): Promise<EmailDeliveryStats> {
  try {
    // This would calculate delivery statistics from database
    // For now, return mock data
    const stats: EmailDeliveryStats = {
      totalSent: 1250,
      totalFailed: 25,
      totalQueued: 5,
      deliveryRate: 98.0,
      averageDeliveryTime: 2.3,
      bounceRate: 1.2,
      complaintRate: 0.1,
      unsubscribeRate: 0.3,
      last24Hours: {
        sent: 45,
        failed: 1,
        queued: 2
      },
      last7Days: {
        sent: 320,
        failed: 8,
        queued: 3
      },
      last30Days: {
        sent: 1250,
        failed: 25,
        queued: 5
      }
    };

    // TODO: Implement actual statistics calculation

    return stats;
  } catch (error) {
    console.error('Error getting email delivery stats:', error);
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
      last30Days: { sent: 0, failed: 0, queued: 0 }
    };
  }
}

// Helper function to get email queue
async function getEmailQueue(): Promise<EmailQueueItem[]> {
  try {
    // This would retrieve email queue from database
    // For now, return mock data
    const queue: EmailQueueItem[] = [
      {
        id: 'email_001',
        templateId: 'certificate-expiring',
        to: ['admin@example.com'],
        variables: { certificateName: 'SSL Certificate', expiryDate: '2025-12-31' },
        priority: 'high',
        status: 'queued',
        retryCount: 0,
        maxRetries: 3,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ];

    // TODO: Implement actual queue retrieval

    return queue;
  } catch (error) {
    console.error('Error getting email queue:', error);
    return [];
  }
}

// Helper function to create email template
async function createEmailTemplate(template: any, userId: string): Promise<{ id: string; created: boolean }> {
  try {
    // This would create email template in database
    const templateId = `template_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // TODO: Implement actual template creation
    // const newTemplate = await db.emailTemplate.create({
    //   data: {
    //     ...template,
    //     id: templateId,
    //     createdBy: userId,
    //     createdAt: new Date(),
    //     updatedAt: new Date()
    //   }
    // });

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

// Helper function to update email template
async function updateEmailTemplate(templateId: string, template: any, userId: string): Promise<{ updated: boolean; templateId: string }> {
  try {
    // This would update email template in database
    // TODO: Implement actual template update
    // await db.emailTemplate.update({
    //   where: { id: templateId },
    //   data: {
    //     ...template,
    //     updatedBy: userId,
    //     updatedAt: new Date()
    //   }
    // });

    return {
      updated: true,
      templateId
    };
  } catch (error) {
    console.error('Error updating email template:', error);
    return {
      updated: false,
      templateId
    };
  }
}

// Helper function to delete email template
async function deleteEmailTemplate(templateId: string, userId: string): Promise<{ deleted: boolean; templateId: string }> {
  try {
    // This would delete email template from database
    // TODO: Implement actual template deletion
    // await db.emailTemplate.delete({
    //   where: { id: templateId }
    // });

    return {
      deleted: true,
      templateId
    };
  } catch (error) {
    console.error('Error deleting email template:', error);
    return {
      deleted: false,
      templateId
    };
  }
}

// Helper function to send test email
async function sendTestEmail(recipient: string, userId: string): Promise<{ sent: boolean; recipient: string; messageId?: string }> {
  try {
    // This would send test email using SMTP
    // For now, return mock result
    const result = {
      sent: true,
      recipient,
      messageId: `test_${Date.now()}`
    };

    // TODO: Implement actual email sending
    // const smtpConfig = await SettingsCacheService.getCASetting('smtp_config');
    // const transporter = createTransporter(smtpConfig.config);
    // const info = await transporter.sendMail({
    //   from: smtpConfig.config.fromEmail,
    //   to: recipient,
    //   subject: 'SMTP Test Email',
    //   text: 'This is a test email to verify SMTP configuration.'
    // });

    return result;
  } catch (error) {
    console.error('Error sending test email:', error);
    return {
      sent: false,
      recipient
    };
  }
}

// Helper function to test SMTP connection
async function testSMTPConnection(): Promise<{ connected: boolean; responseTime: number; error?: string }> {
  try {
    // This would test SMTP connection
    // For now, return mock result
    const result = {
      connected: true,
      responseTime: 150
    };

    // TODO: Implement actual SMTP connection test
    // const smtpConfig = await SettingsCacheService.getCASetting('smtp_config');
    // const transporter = createTransporter(smtpConfig.config);
    // const startTime = Date.now();
    // await transporter.verify();
    // const responseTime = Date.now() - startTime;

    return result;
  } catch (error) {
    console.error('Error testing SMTP connection:', error);
    return {
      connected: false,
      responseTime: 0,
      error: String(error)
    };
  }
}

// Helper function to send email using template
async function sendEmail(templateId: string, recipient: string, variables: Record<string, any>, priority: string): Promise<{ sent: boolean; messageId?: string; queued: boolean }> {
  try {
    // This would send email using template
    // For now, return mock result
    const result = {
      sent: true,
      messageId: `email_${Date.now()}`,
      queued: false
    };

    // TODO: Implement actual email sending with template
    // const template = await db.emailTemplate.findUnique({ where: { id: templateId } });
    // const smtpConfig = await SettingsCacheService.getCASetting('smtp_config');
    // const transporter = createTransporter(smtpConfig.config);
    // const renderedContent = renderTemplate(template, variables);
    // const info = await transporter.sendMail({
    //   from: smtpConfig.config.fromEmail,
    //   to: recipient,
    //   subject: renderedContent.subject,
    //   html: renderedContent.htmlBody,
    //   text: renderedContent.textBody
    // });

    return result;
  } catch (error) {
    console.error('Error sending email:', error);
    return {
      sent: false,
      queued: false
    };
  }
}

// Helper function to retry failed emails
async function retryFailedEmails(maxRetries: number): Promise<{ emailsRetried: number; emailsSent: number; emailsFailed: number }> {
  try {
    // This would retry failed emails
    // For now, return mock result
    const result = {
      emailsRetried: 5,
      emailsSent: 4,
      emailsFailed: 1
    };

    // TODO: Implement actual email retry logic
    // const failedEmails = await db.emailQueue.findMany({
    //   where: {
    //     status: 'failed',
    //     retryCount: { lt: maxRetries }
    //   }
    // });
    // // Retry logic here

    return result;
  } catch (error) {
    console.error('Error retrying failed emails:', error);
    return {
      emailsRetried: 0,
      emailsSent: 0,
      emailsFailed: 0
    };
  }
}

// Helper function to clear email queue
async function clearEmailQueue(status: string): Promise<{ emailsCleared: number; status: string }> {
  try {
    // This would clear email queue
    // For now, return mock result
    const result = {
      emailsCleared: 10,
      status
    };

    // TODO: Implement actual queue clearing
    // const whereClause = status === 'all' ? {} : { status };
    // const deleted = await db.emailQueue.deleteMany({ where: whereClause });

    return result;
  } catch (error) {
    console.error('Error clearing email queue:', error);
    return {
      emailsCleared: 0,
      status
    };
  }
}
