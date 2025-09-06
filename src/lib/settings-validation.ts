/**
 * Settings Validation Utilities
 *
 * Comprehensive server-side validation for admin settings
 * Ensures data integrity, security, and compliance
 */

import { z } from 'zod';

// Password Policy Validation
export const passwordPolicySchema = z.object({
  minLength: z.number().min(6).max(32),
  requireUppercase: z.boolean(),
  requireLowercase: z.boolean(),
  requireNumbers: z.boolean(),
  requireSpecialChars: z.boolean(),
  preventReuse: z.number().min(0).max(20),
  expiryDays: z.number().min(30).max(365),
});

export type PasswordPolicy = z.infer<typeof passwordPolicySchema>;

export function validatePasswordPolicy(policy: any): { isValid: boolean; errors: string[] } {
  try {
    passwordPolicySchema.parse(policy);
    return { isValid: true, errors: [] };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        isValid: false,
        errors: error.issues.map(err => `${err.path.join('.')}: ${err.message}`)
      };
    }
    return { isValid: false, errors: ['Invalid all settings format'] };
  }
}

// Session Configuration Validation
export const sessionConfigSchema = z.object({
  timeoutMinutes: z.number().min(5).max(480),
  maxConcurrentSessions: z.number().min(1).max(10),
  extendOnActivity: z.boolean(),
  rememberMeDays: z.number().min(1).max(365),
});

export type SessionConfig = z.infer<typeof sessionConfigSchema>;

export function validateSessionConfig(config: any): { isValid: boolean; errors: string[] } {
  try {
    sessionConfigSchema.parse(config);
    return { isValid: true, errors: [] };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        isValid: false,
        errors: error.issues.map(err => `${err.path.join('.')}: ${err.message}`)
      };
    }
    return { isValid: false, errors: ['Invalid session configuration format'] };
  }
}



// Audit Configuration Validation
export const auditConfigSchema = z.object({
  enabled: z.boolean(),
  logLevel: z.enum(['error', 'warn', 'info', 'debug']),
  retentionDays: z.number().min(30).max(3650),
  alertOnSuspicious: z.boolean(),
  maxLogSize: z.number().min(10).max(1000), // MB
  compressOldLogs: z.boolean(),
  externalLogging: z.boolean(),
  logSensitiveOperations: z.boolean(),
});

export type AuditConfig = z.infer<typeof auditConfigSchema>;

export function validateAuditConfig(config: any): { isValid: boolean; errors: string[] } {
  try {
    auditConfigSchema.parse(config);
    return { isValid: true, errors: [] };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        isValid: false,
        errors: error.issues.map(err => `${err.path.join('.')}: ${err.message}`)
      };
    }
    return { isValid: false, errors: ['Invalid audit configuration format'] };
  }
}

// CA Renewal Policy Validation
export const caRenewalPolicySchema = z.object({
  enabled: z.boolean(),
  autoRenewal: z.boolean(),
  renewalThresholdDays: z.number().min(1).max(365),
  maxRenewalAttempts: z.number().min(1).max(10),
  notificationDaysBefore: z.number().min(1).max(90),
  requireApproval: z.boolean(),
  backupBeforeRenewal: z.boolean(),
  testRenewalFirst: z.boolean(),
});

export type CARenewalPolicy = z.infer<typeof caRenewalPolicySchema>;

export function validateCARenewalPolicy(policy: any): { isValid: boolean; errors: string[] } {
  try {
    caRenewalPolicySchema.parse(policy);
    return { isValid: true, errors: [] };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        isValid: false,
        errors: error.issues.map(err => `${err.path.join('.')}: ${err.message}`)
      };
    }
    return { isValid: false, errors: ['Invalid CA renewal policy format'] };
  }
}

// Certificate Template Validation
export const certificateTemplateSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500),
  enabled: z.boolean(),
  defaultValidityDays: z.number().min(30).max(3650),
  defaultKeySize: z.enum(['1024', '2048', '3072', '4096']),
  defaultAlgorithm: z.enum(['RSA', 'ECDSA']),
  allowCustomExtensions: z.boolean(),
  keyUsage: z.array(z.enum([
    'digitalSignature',
    'nonRepudiation',
    'keyEncipherment',
    'dataEncipherment',
    'keyAgreement',
    'keyCertSign',
    'crlSign',
    'encipherOnly',
    'decipherOnly'
  ])).min(1),
  extendedKeyUsage: z.array(z.enum([
    'serverAuth',
    'clientAuth',
    'codeSigning',
    'emailProtection',
    'timeStamping',
    'msCodeInd',
    'msCodeCom',
    'msCTLSign',
    'msSGC',
    'msEFS',
    'nsSGC'
  ])).optional(),
  subjectAlternativeNames: z.boolean(),
  basicConstraints: z.object({
    ca: z.boolean(),
    pathLenConstraint: z.number().min(0).max(10).optional()
  }).optional(),
  customExtensions: z.array(z.object({
    oid: z.string().regex(/^(\d+\.)*\d+$/),
    critical: z.boolean(),
    value: z.string()
  })).optional()
});

export type CertificateTemplate = z.infer<typeof certificateTemplateSchema>;

export function validateCertificateTemplate(template: any): { isValid: boolean; errors: string[] } {
  try {
    certificateTemplateSchema.parse(template);
    return { isValid: true, errors: [] };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        isValid: false,
        errors: error.issues.map(err => `${err.path.join('.')}: ${err.message}`)
      };
    }
    return { isValid: false, errors: ['Invalid certificate template format'] };
  }
}

// Certificate Template Collection Validation
export const certificateTemplateCollectionSchema = z.object({
  templates: z.array(certificateTemplateSchema).min(1),
  defaultTemplate: z.string().min(1),
  allowCustomTemplates: z.boolean(),
  templateValidation: z.object({
    requireKeyUsage: z.boolean(),
    enforceAlgorithmCompliance: z.boolean(),
    validateExtensions: z.boolean()
  })
});

export type CertificateTemplateCollection = z.infer<typeof certificateTemplateCollectionSchema>;

export function validateCertificateTemplateCollection(collection: any): { isValid: boolean; errors: string[] } {
  try {
    certificateTemplateCollectionSchema.parse(collection);
    return { isValid: true, errors: [] };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        isValid: false,
        errors: error.issues.map(err => `${err.path.join('.')}: ${err.message}`)
      };
    }
    return { isValid: false, errors: ['Invalid certificate template collection format'] };
  }
}

// CRL Settings Validation
export const crlSettingsSchema = z.object({
  enabled: z.boolean(),
  autoGenerate: z.boolean(),
  updateIntervalHours: z.number().min(1).max(168),
  includeExpired: z.boolean(),
  includeRevoked: z.boolean(),
  validityHours: z.number().min(24).max(8760), // 1 day to 1 year
  overlapHours: z.number().min(1).max(24), // Next update overlap
  distributionPoints: z.array(z.object({
    url: z.string().url(),
    enabled: z.boolean(),
    priority: z.number().min(1).max(10),
    lastSync: z.date().optional(),
    syncStatus: z.enum(['success', 'failed', 'pending']).optional()
  })).min(1),
  notificationSettings: z.object({
    enabled: z.boolean(),
    notifyOnGeneration: z.boolean(),
    notifyOnFailure: z.boolean(),
    notifyOnDistributionFailure: z.boolean(),
    recipients: z.array(z.string().email()).optional()
  }),
  securitySettings: z.object({
    signCRL: z.boolean(),
    crlSigningKey: z.string().optional(),
    includeIssuer: z.boolean(),
    includeExtensions: z.boolean()
  })
});

export type CRLSettings = z.infer<typeof crlSettingsSchema>;

export function validateCRLSettings(settings: any): { isValid: boolean; errors: string[] } {
  try {
    crlSettingsSchema.parse(settings);
    return { isValid: true, errors: [] };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        isValid: false,
        errors: error.issues.map(err => `${err.path.join('.')}: ${err.message}`)
      };
    }
    return { isValid: false, errors: ['Invalid CRL settings format'] };
  }
}

// CRL Generation Request Validation
export const crlGenerationRequestSchema = z.object({
  caId: z.string().min(1),
  reason: z.enum(['scheduled', 'manual', 'revocation', 'emergency']),
  priority: z.enum(['low', 'medium', 'high', 'critical']),
  includeExpired: z.boolean().optional(),
  customValidityHours: z.number().min(1).max(8760).optional(),
  forceRegeneration: z.boolean().optional()
});

export type CRLGenerationRequest = z.infer<typeof crlGenerationRequestSchema>;

export function validateCRLGenerationRequest(request: any): { isValid: boolean; errors: string[] } {
  try {
    crlGenerationRequestSchema.parse(request);
    return { isValid: true, errors: [] };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        isValid: false,
        errors: error.issues.map(err => `${err.path.join('.')}: ${err.message}`)
      };
    }
    return { isValid: false, errors: ['Invalid CRL generation request format'] };
  }
}

// OCSP Settings Validation
export const ocspSettingsSchema = z.object({
  enabled: z.boolean(),
  autoGenerate: z.boolean(),
  responderUrl: z.string().url(),
  backupResponderUrls: z.array(z.string().url()).optional(),
  cacheTimeoutMinutes: z.number().min(5).max(1440),
  maxCacheSize: z.number().min(100).max(10000), // Max cached responses
  includeNextUpdate: z.boolean(),
  includeSingleExtensions: z.boolean(),
  responseTimeoutSeconds: z.number().min(5).max(300),
  monitoringSettings: z.object({
    enabled: z.boolean(),
    responseTimeThreshold: z.number().min(100).max(30000),
    failureThreshold: z.number().min(1).max(10),
    alertRecipients: z.array(z.string().email()).optional()
  }),
  securitySettings: z.object({
    signResponses: z.boolean(),
    responseSigningKey: z.string().optional(),
    includeCertId: z.boolean(),
    nonceSupport: z.boolean()
  })
});

export type OCSPSettings = z.infer<typeof ocspSettingsSchema>;

export function validateOCSPSettings(settings: any): { isValid: boolean; errors: string[] } {
  try {
    ocspSettingsSchema.parse(settings);
    return { isValid: true, errors: [] };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        isValid: false,
        errors: error.issues.map(err => `${err.path.join('.')}: ${err.message}`)
      };
    }
    return { isValid: false, errors: ['Invalid OCSP settings format'] };
  }
}

// OCSP Request Validation
export const ocspRequestSchema = z.object({
  serialNumber: z.string().min(1),
  issuerNameHash: z.string(),
  issuerKeyHash: z.string(),
  hashAlgorithm: z.enum(['sha1', 'sha256', 'sha384', 'sha512']).optional(),
  nonce: z.string().optional(),
  serviceLocator: z.string().url().optional()
});

export type OCSPRequest = z.infer<typeof ocspRequestSchema>;

export function validateOCSPRequest(request: any): { isValid: boolean; errors: string[] } {
  try {
    ocspRequestSchema.parse(request);
    return { isValid: true, errors: [] };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        isValid: false,
        errors: error.issues.map(err => `${err.path.join('.')}: ${err.message}`)
      };
    }
    return { isValid: false, errors: ['Invalid OCSP request format'] };
  }
}

// Health Check Configuration Validation
export const healthCheckConfigSchema = z.object({
  enabled: z.boolean(),
  intervalMinutes: z.number().min(1).max(60),
  timeoutSeconds: z.number().min(5).max(300),
  failureThreshold: z.number().min(1).max(10),
});

export type HealthCheckConfig = z.infer<typeof healthCheckConfigSchema>;

export function validateHealthCheckConfig(config: any): { isValid: boolean; errors: string[] } {
  try {
    healthCheckConfigSchema.parse(config);
    return { isValid: true, errors: [] };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        isValid: false,
        errors: error.issues.map(err => `${err.path.join('.')}: ${err.message}`)
      };
    }
    return { isValid: false, errors: ['Invalid health check configuration format'] };
  }
}

// Performance Metrics Configuration Validation
export const performanceMetricsConfigSchema = z.object({
  enabled: z.boolean(),
  collectionIntervalMinutes: z.number().min(1).max(60),
  retentionDays: z.number().min(1).max(365),
  cpuThreshold: z.number().min(1).max(100),
  memoryThreshold: z.number().min(1).max(100),
  diskThreshold: z.number().min(1).max(100),
  responseTimeThreshold: z.number().min(100).max(30000),
});

export type PerformanceMetricsConfig = z.infer<typeof performanceMetricsConfigSchema>;

export function validatePerformanceMetricsConfig(config: any): { isValid: boolean; errors: string[] } {
  try {
    performanceMetricsConfigSchema.parse(config);
    return { isValid: true, errors: [] };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        isValid: false,
        errors: error.issues.map(err => `${err.path.join('.')}: ${err.message}`)
      };
    }
    return { isValid: false, errors: ['Invalid performance metrics configuration format'] };
  }
}

// Resource Limits Validation
export const resourceLimitsConfigSchema = z.object({
  maxCpuUsage: z.number().min(1).max(100),
  maxMemoryUsage: z.number().min(1).max(100),
  maxDiskUsage: z.number().min(1).max(100),
  maxConcurrentConnections: z.number().min(10).max(10000),
  rateLimitRequestsPerMinute: z.number().min(10).max(10000),
});

export type ResourceLimitsConfig = z.infer<typeof resourceLimitsConfigSchema>;

export function validateResourceLimitsConfig(config: any): { isValid: boolean; errors: string[] } {
  try {
    resourceLimitsConfigSchema.parse(config);
    return { isValid: true, errors: [] };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        isValid: false,
        errors: error.issues.map(err => `${err.path.join('.')}: ${err.message}`)
      };
    }
    return { isValid: false, errors: ['Invalid resource limits configuration format'] };
  }
}

// Email/SMTP Configuration Validation
export const smtpConfigSchema = z.object({
  host: z.string().min(1),
  port: z.number().min(1).max(65535),
  secure: z.boolean(),
  username: z.string().email(),
  password: z.string().min(1),
  fromEmail: z.string().email(),
  fromName: z.string().min(1),
});

export type SMTPConfig = z.infer<typeof smtpConfigSchema>;

export function validateSMTPConfig(config: any): { isValid: boolean; errors: string[] } {
  try {
    smtpConfigSchema.parse(config);
    return { isValid: true, errors: [] };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        isValid: false,
        errors: error.issues.map(err => `${err.path.join('.')}: ${err.message}`)
      };
    }
    return { isValid: false, errors: ['Invalid SMTP configuration format'] };
  }
}

// Webhook Configuration Validation
export const webhookConfigSchema = z.object({
  url: z.string().url(),
  timeout: z.number().min(1000).max(30000),
  retries: z.number().min(0).max(10),
  retryDelay: z.number().min(100).max(30000),
  secret: z.string().min(16),
  headers: z.record(z.string(), z.string()).optional(),
});

export type WebhookConfig = z.infer<typeof webhookConfigSchema>;

export function validateWebhookConfig(config: any): { isValid: boolean; errors: string[] } {
  try {
    webhookConfigSchema.parse(config);
    return { isValid: true, errors: [] };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        isValid: false,
        errors: error.issues.map(err => `${err.path.join('.')}: ${err.message}`)
      };
    }
    return { isValid: false, errors: ['Invalid webhook configuration format'] };
  }
}



// General Settings Validation
export function validateSystemConfig(key: string, value: any): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Validate key format
  if (!key || typeof key !== 'string' || key.length === 0) {
    errors.push('Key must be a non-empty string');
  }

  // Validate value based on key type
  if (key.includes('timeout') || key.includes('interval') || key.includes('days') || key.includes('hours')) {
    if (typeof value !== 'number' || value < 0) {
      errors.push(`${key} must be a positive number`);
    }
  }

  if (key.includes('enabled') || key.includes('active') || key.includes('required')) {
    if (typeof value !== 'boolean') {
      errors.push(`${key} must be a boolean`);
    }
  }

  if (key.includes('url') || key.includes('endpoint')) {
    try {
      new URL(value);
    } catch {
      errors.push(`${key} must be a valid URL`);
    }
  }

  if (key.includes('email')) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(value)) {
      errors.push(`${key} must be a valid email address`);
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

// Comprehensive Settings Validation
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings?: string[];
}

export function validateAllSettings(settings: Record<string, any>): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Validate each setting
  for (const [key, value] of Object.entries(settings)) {
    const result = validateSystemConfig(key, value);
    if (!result.isValid) {
      errors.push(...result.errors);
    }
  }

  // Cross-validation checks
  if (settings.passwordMinLength && settings.passwordMinLength < 8) {
    warnings.push('Password minimum length is below recommended security standards (8 characters)');
  }

  if (settings.sessionTimeout && settings.sessionTimeout > 480) {
    warnings.push('Session timeout is very long, consider reducing for better security');
  }

  if (settings.maxConcurrentSessions && settings.maxConcurrentSessions > 5) {
    warnings.push('High concurrent session limit may impact performance');
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings: warnings.length > 0 ? warnings : undefined
  };
}

// Export all validation functions
export const SettingsValidation = {
  validatePasswordPolicy,
  validateSessionConfig,
  validateAuditConfig,
  validateCARenewalPolicy,
  validateCertificateTemplate,
  validateCertificateTemplateCollection,
  validateCRLSettings,
  validateCRLGenerationRequest,
  validateOCSPSettings,
  validateOCSPRequest,
  validateHealthCheckConfig,
  validatePerformanceMetricsConfig,
  validateResourceLimitsConfig,
  validateSMTPConfig,
  validateWebhookConfig,
  validateSystemConfig,
  validateAllSettings,
};
