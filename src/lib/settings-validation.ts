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

// Health Check Configuration Validation
export const healthCheckConfigSchema = z.object({
  enabled: z.boolean(),
  intervalMinutes: z.number().min(1).max(60),
  timeoutSeconds: z.number().min(5).max(300),
  failureThreshold: z.number().min(1).max(10),
  successThreshold: z.number().min(1).max(5),
  retryAttempts: z.number().min(0).max(5),
  retryDelaySeconds: z.number().min(1).max(60),
  notificationSettings: z.object({
    enabled: z.boolean(),
    notifyOnFailure: z.boolean(),
    notifyOnRecovery: z.boolean(),
    alertRecipients: z.array(z.string().email()).optional(),
    escalationDelayMinutes: z.number().min(5).max(1440).optional()
  }),
  checks: z.array(z.object({
    name: z.string().min(1).max(100),
    type: z.enum(['http', 'tcp', 'database', 'filesystem', 'memory', 'cpu', 'disk', 'custom']),
    enabled: z.boolean(),
    endpoint: z.string().optional(),
    port: z.number().min(1).max(65535).optional(),
    timeoutSeconds: z.number().min(1).max(300).optional(),
    expectedStatus: z.number().min(100).max(599).optional(),
    expectedResponse: z.string().optional(),
    headers: z.record(z.string(), z.string()).optional(),
    databaseQuery: z.string().optional(),
    filesystemPath: z.string().optional(),
    thresholdWarning: z.number().optional(),
    thresholdCritical: z.number().optional()
  })).min(1)
});

export type HealthCheckConfig = z.infer<typeof healthCheckConfigSchema>;

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
  networkThreshold: z.number().min(1).max(1000), // MB/s
  databaseConnectionThreshold: z.number().min(1).max(1000),
  alertSettings: z.object({
    enabled: z.boolean(),
    cpuAlertThreshold: z.number().min(1).max(100),
    memoryAlertThreshold: z.number().min(1).max(100),
    diskAlertThreshold: z.number().min(1).max(100),
    responseTimeAlertThreshold: z.number().min(100).max(30000),
    consecutiveFailuresThreshold: z.number().min(1).max(10),
    alertRecipients: z.array(z.string().email()).optional()
  }),
  metrics: z.array(z.object({
    name: z.string().min(1).max(100),
    type: z.enum(['cpu', 'memory', 'disk', 'network', 'database', 'response_time', 'custom']),
    enabled: z.boolean(),
    collectionIntervalSeconds: z.number().min(1).max(3600),
    aggregationMethod: z.enum(['average', 'min', 'max', 'sum', 'count']),
    retentionHours: z.number().min(1).max(8760), // 1 year
    alertThreshold: z.number().optional(),
    unit: z.string().optional()
  })).min(1)
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
  enabled: z.boolean(),
  host: z.string().min(1),
  port: z.number().min(1).max(65535),
  secure: z.boolean(),
  username: z.string().email(),
  password: z.string().min(1),
  fromEmail: z.string().email(),
  fromName: z.string().min(1),
  replyToEmail: z.string().email().optional(),
  connectionTimeout: z.number().min(5000).max(60000).optional(),
  greetingTimeout: z.number().min(5000).max(60000).optional(),
  socketTimeout: z.number().min(5000).max(60000).optional(),
  pool: z.boolean().optional(),
  maxConnections: z.number().min(1).max(10).optional(),
  rateLimit: z.number().min(1).max(100).optional(),
  tls: z.object({
    rejectUnauthorized: z.boolean().optional(),
    minVersion: z.enum(['TLSv1', 'TLSv1.1', 'TLSv1.2', 'TLSv1.3']).optional(),
    ciphers: z.string().optional()
  }).optional()
});

// Email Template Configuration Validation
export const emailTemplateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(100),
  subject: z.string().min(1).max(200),
  htmlBody: z.string().min(1),
  textBody: z.string().optional(),
  variables: z.array(z.object({
    name: z.string().min(1),
    type: z.enum(['string', 'number', 'boolean', 'date']),
    required: z.boolean(),
    defaultValue: z.any().optional(),
    description: z.string().optional()
  })).optional(),
  category: z.enum(['security', 'certificate', 'system', 'notification', 'alert']),
  enabled: z.boolean()
});

// Notification Settings Validation
export const notificationSettingsSchema = z.object({
  enabled: z.boolean(),
  emailNotifications: z.boolean(),
  webhookNotifications: z.boolean(),
  slackNotifications: z.boolean(),
  smsNotifications: z.boolean(),
  notificationTypes: z.array(z.enum([
    'certificate_expiring',
    'certificate_expired',
    'certificate_revoked',
    'security_alert',
    'system_health',
    'performance_alert',
    'user_action',
    'admin_action'
  ])),
  escalationSettings: z.object({
    enabled: z.boolean(),
    escalationDelayMinutes: z.number().min(5).max(1440),
    escalationRecipients: z.array(z.string().email()).optional(),
    maxEscalationLevels: z.number().min(1).max(5).optional()
  }).optional(),
  quietHours: z.object({
    enabled: z.boolean(),
    startTime: z.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/),
    endTime: z.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/),
    timezone: z.string().optional()
  }).optional()
});

// Alert Threshold Configuration Validation
export const alertThresholdSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(100),
  description: z.string().max(500),
  enabled: z.boolean(),
  metricType: z.enum([
    'cpu_usage',
    'memory_usage',
    'disk_usage',
    'network_traffic',
    'response_time',
    'error_rate',
    'certificate_expiry',
    'security_events',
    'system_health',
    'custom'
  ]),
  condition: z.enum(['greater_than', 'less_than', 'equals', 'not_equals', 'contains', 'not_contains']),
  threshold: z.union([z.number(), z.string()]),
  unit: z.string().optional(),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  evaluationPeriod: z.number().min(1).max(3600), // seconds
  cooldownPeriod: z.number().min(60).max(86400), // seconds
  autoResolve: z.boolean(),
  resolveThreshold: z.union([z.number(), z.string()]).optional(),
  notificationChannels: z.array(z.enum(['email', 'webhook', 'slack', 'sms'])),
  customMessage: z.string().optional(),
  tags: z.record(z.string(), z.string()).optional(),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional()
});

// Alert Escalation Rule Validation
export const alertEscalationRuleSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(100),
  enabled: z.boolean(),
  triggerConditions: z.array(z.object({
    severity: z.enum(['low', 'medium', 'high', 'critical']),
    timeUnacknowledged: z.number().min(60).max(86400), // seconds
    repeatCount: z.number().min(1).max(100).optional()
  })),
  escalationSteps: z.array(z.object({
    step: z.number().min(1).max(10),
    delayMinutes: z.number().min(1).max(1440),
    channels: z.array(z.enum(['email', 'webhook', 'slack', 'sms'])),
    recipients: z.array(z.string()),
    message: z.string().optional(),
    escalateTo: z.string().optional() // user or group ID
  })),
  maxEscalationLevel: z.number().min(1).max(10),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional()
});

// Alert History Entry Validation
export const alertHistorySchema = z.object({
  id: z.string().min(1),
  alertId: z.string(),
  action: z.enum([
    'created',
    'acknowledged',
    'resolved',
    'escalated',
    'suppressed',
    'commented',
    'assigned'
  ]),
  userId: z.string().optional(),
  username: z.string().optional(),
  timestamp: z.date(),
  details: z.record(z.string(), z.any()).optional(),
  message: z.string().optional()
});

// Alert Suppression Rule Validation
export const alertSuppressionRuleSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(100),
  enabled: z.boolean(),
  conditions: z.array(z.object({
    field: z.string(),
    operator: z.enum(['equals', 'not_equals', 'contains', 'not_contains', 'regex']),
    value: z.string()
  })),
  duration: z.number().min(300).max(604800), // 5 minutes to 1 week
  reason: z.string().max(500),
  createdBy: z.string(),
  createdAt: z.date().optional(),
  expiresAt: z.date().optional()
});

// Webhook Configuration Validation
export const webhookConfigSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(100),
  description: z.string().max(500),
  enabled: z.boolean(),
  url: z.string().url(),
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH']),
  headers: z.record(z.string(), z.string()).optional(),
  authentication: z.object({
    type: z.enum(['none', 'basic', 'bearer', 'api_key', 'custom']),
    username: z.string().optional(),
    password: z.string().optional(),
    token: z.string().optional(),
    apiKey: z.string().optional(),
    customHeader: z.string().optional(),
    customValue: z.string().optional()
  }).optional(),
  payload: z.record(z.string(), z.any()).optional(),
  retryPolicy: z.object({
    enabled: z.boolean(),
    maxRetries: z.number().min(0).max(10),
    retryDelay: z.number().min(100).max(30000), // milliseconds
    backoffMultiplier: z.number().min(1).max(5)
  }).optional(),
  timeout: z.number().min(1000).max(60000), // milliseconds
  events: z.array(z.enum([
    'alert_created',
    'alert_acknowledged',
    'alert_resolved',
    'alert_escalated',
    'certificate_expiring',
    'certificate_expired',
    'system_health_changed',
    'performance_threshold_exceeded',
    'security_event',
    'user_action'
  ])),
  filters: z.array(z.object({
    field: z.string(),
    operator: z.enum(['equals', 'not_equals', 'contains', 'not_contains', 'regex', 'greater_than', 'less_than']),
    value: z.string()
  })).optional(),
  rateLimit: z.object({
    enabled: z.boolean(),
    requestsPerMinute: z.number().min(1).max(1000),
    burstLimit: z.number().min(1).max(100)
  }).optional(),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
  createdBy: z.string().optional(),
  updatedBy: z.string().optional()
});

// External Service Integration Validation
export const externalIntegrationSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(100),
  type: z.enum(['slack', 'teams', 'pagerduty', 'servicenow', 'jira', 'webhook', 'custom']),
  enabled: z.boolean(),
  configuration: z.record(z.string(), z.any()),
  authentication: z.object({
    type: z.enum(['oauth2', 'api_key', 'basic', 'bearer', 'webhook_secret']),
    credentials: z.record(z.string(), z.string())
  }),
  mappings: z.array(z.object({
    sourceField: z.string(),
    targetField: z.string(),
    transformation: z.string().optional()
  })).optional(),
  syncSettings: z.object({
    enabled: z.boolean(),
    intervalMinutes: z.number().min(1).max(1440),
    bidirectional: z.boolean(),
    conflictResolution: z.enum(['source_wins', 'target_wins', 'manual'])
  }).optional(),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
  createdBy: z.string().optional(),
  updatedBy: z.string().optional()
});

// API Rate Limiting Configuration Validation
export const rateLimitConfigSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(100),
  enabled: z.boolean(),
  strategy: z.enum(['fixed_window', 'sliding_window', 'token_bucket', 'leaky_bucket']),
  windowSize: z.number().min(1).max(86400), // seconds
  maxRequests: z.number().min(1).max(100000),
  burstLimit: z.number().min(1).max(10000).optional(),
  refillRate: z.number().min(1).max(10000).optional(),
  scope: z.enum(['global', 'user', 'ip', 'endpoint']),
  endpoints: z.array(z.string()).optional(),
  userGroups: z.array(z.string()).optional(),
  ipRanges: z.array(z.string()).optional(),
  responseHeaders: z.object({
    enabled: z.boolean(),
    limitHeader: z.string().optional(),
    remainingHeader: z.string().optional(),
    resetHeader: z.string().optional()
  }).optional(),
  violationResponse: z.object({
    statusCode: z.number().min(400).max(599),
    message: z.string(),
    retryAfter: z.boolean()
  }).optional(),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
  createdBy: z.string().optional(),
  updatedBy: z.string().optional()
});

// Integration Monitoring Configuration Validation
export const integrationMonitoringSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(100),
  type: z.enum(['webhook', 'api', 'external_service', 'database']),
  enabled: z.boolean(),
  endpoint: z.string().url().optional(),
  monitoringConfig: z.object({
    intervalSeconds: z.number().min(10).max(3600),
    timeoutSeconds: z.number().min(5).max(300),
    retryAttempts: z.number().min(0).max(5),
    successThreshold: z.number().min(1).max(10),
    failureThreshold: z.number().min(1).max(10)
  }),
  healthChecks: z.array(z.object({
    name: z.string().min(1).max(100),
    type: z.enum(['http', 'tcp', 'custom']),
    endpoint: z.string().optional(),
    port: z.number().min(1).max(65535).optional(),
    expectedStatus: z.number().min(100).max(599).optional(),
    expectedResponse: z.string().optional(),
    headers: z.record(z.string(), z.string()).optional()
  })).optional(),
  alerts: z.object({
    enabled: z.boolean(),
    failureAlert: z.boolean(),
    recoveryAlert: z.boolean(),
    degradedAlert: z.boolean(),
    channels: z.array(z.enum(['email', 'webhook', 'slack', 'sms']))
  }).optional(),
  metrics: z.array(z.object({
    name: z.string().min(1).max(100),
    type: z.enum(['response_time', 'success_rate', 'error_rate', 'throughput', 'custom']),
    unit: z.string().optional(),
    thresholds: z.object({
      warning: z.number().optional(),
      critical: z.number().optional()
    }).optional()
  })).optional(),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
  createdBy: z.string().optional(),
  updatedBy: z.string().optional()
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
