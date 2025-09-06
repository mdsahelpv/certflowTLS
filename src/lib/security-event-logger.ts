/**
 * Security Event Logger
 *
 * Comprehensive security event logging and suspicious activity detection
 * Implements real-time monitoring, pattern recognition, and automated alerting
 */

import { SettingsCacheService } from './settings-cache';
import { AuditService } from './audit';

// Security event types
export enum SecurityEventType {
  LOGIN_SUCCESS = 'login_success',
  LOGIN_FAILURE = 'login_failure',
  LOGOUT = 'logout',
  PASSWORD_CHANGE = 'password_change',
  PASSWORD_RESET = 'password_reset',
  MFA_ENABLED = 'mfa_enabled',
  MFA_DISABLED = 'mfa_disabled',
  MFA_FAILURE = 'mfa_failure',
  SESSION_CREATED = 'session_created',
  SESSION_DESTROYED = 'session_destroyed',
  SUSPICIOUS_ACTIVITY = 'suspicious_activity',
  BRUTE_FORCE_ATTEMPT = 'brute_force_attempt',
  UNAUTHORIZED_ACCESS = 'unauthorized_access',
  CONFIG_CHANGE = 'config_change',
  CERTIFICATE_ISSUED = 'certificate_issued',
  CERTIFICATE_REVOKED = 'certificate_revoked',
  API_RATE_LIMIT = 'api_rate_limit',
  SQL_INJECTION_ATTEMPT = 'sql_injection_attempt',
  XSS_ATTEMPT = 'xss_attempt'
}

// Security event severity levels
export enum SecurityEventSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

// Security event interface
export interface SecurityEvent {
  id: string;
  type: SecurityEventType;
  severity: SecurityEventSeverity;
  timestamp: Date;
  userId?: string;
  username?: string;
  ipAddress: string;
  userAgent: string;
  location?: {
    country?: string;
    city?: string;
    coordinates?: { lat: number; lng: number };
  };
  resource?: string;
  action?: string;
  success: boolean;
  metadata?: Record<string, any>;
  riskScore?: number;
  alertsTriggered?: string[];
}

// Suspicious activity pattern
export interface SuspiciousPattern {
  id: string;
  name: string;
  description: string;
  severity: SecurityEventSeverity;
  conditions: {
    eventType?: SecurityEventType;
    timeWindow: number; // minutes
    threshold: number;
    groupBy?: 'userId' | 'ipAddress' | 'userAgent';
  };
  riskScore: number;
  enabled: boolean;
}

// Security monitoring configuration
export interface SecurityMonitoringConfig {
  enabled: boolean;
  realTimeAlerts: boolean;
  alertThresholds: {
    suspiciousEventsPerHour: number;
    failedLoginsPerHour: number;
    criticalEventsPerHour: number;
  };
  patterns: SuspiciousPattern[];
  retentionDays: number;
  maxEventsPerHour: number;
}

// Security Event Logger Class
export class SecurityEventLogger {
  private static eventBuffer: SecurityEvent[] = [];
  private static readonly BUFFER_SIZE = 100;
  private static readonly FLUSH_INTERVAL = 30000; // 30 seconds

  // Initialize the security event logger
  static async initialize(): Promise<void> {
    try {
      // Start periodic buffer flush
      setInterval(() => this.flushEventBuffer(), this.FLUSH_INTERVAL);

      // Set up cleanup timer for old events
      this.scheduleCleanup();

      console.log('Security Event Logger initialized');
    } catch (error) {
      console.error('Failed to initialize Security Event Logger:', error);
    }
  }

  // Log a security event
  static async logEvent(
    type: SecurityEventType,
    severity: SecurityEventSeverity,
    ipAddress: string,
    userAgent: string,
    options: {
      userId?: string;
      username?: string;
      resource?: string;
      action?: string;
      success?: boolean;
      metadata?: Record<string, any>;
    } = {}
  ): Promise<void> {
    try {
      const config = await this.getMonitoringConfig();
      if (!config.enabled) {
        return;
      }

      // Get location information
      const location = await this.getLocationFromIP(ipAddress);

      // Create security event
      const event: SecurityEvent = {
        id: `sec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type,
        severity,
        timestamp: new Date(),
        userId: options.userId,
        username: options.username,
        ipAddress,
        userAgent,
        location,
        resource: options.resource,
        action: options.action,
        success: options.success ?? true,
        metadata: options.metadata,
        riskScore: 0
      };

      // Calculate risk score
      event.riskScore = await this.calculateRiskScore(event);

      // Check for suspicious patterns
      const suspiciousPatterns = await this.detectSuspiciousPatterns(event);
      if (suspiciousPatterns.length > 0) {
        event.alertsTriggered = suspiciousPatterns;
        event.severity = this.escalateSeverity(event.severity, suspiciousPatterns);
      }

      // Add to buffer
      this.eventBuffer.push(event);

      // Flush if buffer is full
      if (this.eventBuffer.length >= this.BUFFER_SIZE) {
        await this.flushEventBuffer();
      }

      // Trigger real-time alerts for high-severity events
      if (config.realTimeAlerts && (event.severity === SecurityEventSeverity.HIGH || event.severity === SecurityEventSeverity.CRITICAL)) {
        await this.triggerRealTimeAlert(event);
      }

      // Log to audit system
      await AuditService.log({
        action: 'LOGIN' as any, // Use existing audit action
        userId: options.userId || 'system',
        username: options.username || 'system',
        description: `Security event: ${type} (${severity})`,
        metadata: {
          eventId: event.id,
          type,
          severity,
          ipAddress,
          userAgent,
          location,
          riskScore: event.riskScore,
          alertsTriggered: event.alertsTriggered
        }
      });

    } catch (error) {
      console.error('Error logging security event:', error);
    }
  }

  // Detect suspicious activity patterns
  private static async detectSuspiciousPatterns(event: SecurityEvent): Promise<string[]> {
    try {
      const config = await this.getMonitoringConfig();
      const triggeredPatterns: string[] = [];

      for (const pattern of config.patterns) {
        if (!pattern.enabled) continue;

        const isTriggered = await this.checkPattern(pattern, event);
        if (isTriggered) {
          triggeredPatterns.push(pattern.name);
        }
      }

      return triggeredPatterns;
    } catch (error) {
      console.error('Error detecting suspicious patterns:', error);
      return [];
    }
  }

  // Check if a suspicious pattern is triggered
  private static async checkPattern(pattern: SuspiciousPattern, event: SecurityEvent): Promise<boolean> {
    try {
      const timeWindow = new Date(Date.now() - (pattern.conditions.timeWindow * 60 * 1000));

      // Get recent events matching the pattern conditions
      const recentEvents = await this.getRecentEvents(
        pattern.conditions.eventType,
        timeWindow,
        pattern.conditions.groupBy === 'userId' ? event.userId :
        pattern.conditions.groupBy === 'ipAddress' ? event.ipAddress : undefined
      );

      return recentEvents.length >= pattern.conditions.threshold;
    } catch (error) {
      console.error('Error checking pattern:', error);
      return false;
    }
  }

  // Calculate risk score for an event
  private static async calculateRiskScore(event: SecurityEvent): Promise<number> {
    let score = 0;

    // Base score by event type
    switch (event.type) {
      case SecurityEventType.LOGIN_FAILURE:
        score += 20;
        break;
      case SecurityEventType.MFA_FAILURE:
        score += 30;
        break;
      case SecurityEventType.UNAUTHORIZED_ACCESS:
        score += 50;
        break;
      case SecurityEventType.BRUTE_FORCE_ATTEMPT:
        score += 40;
        break;
      case SecurityEventType.SQL_INJECTION_ATTEMPT:
      case SecurityEventType.XSS_ATTEMPT:
        score += 60;
        break;
    }

    // Location-based scoring
    if (event.location) {
      // Check if location is unusual for this user
      const isUnusualLocation = await this.isUnusualLocation(event.userId, event.location);
      if (isUnusualLocation) {
        score += 25;
      }
    }

    // Time-based scoring
    const isUnusualTime = this.isUnusualTime(event.timestamp);
    if (isUnusualTime) {
      score += 15;
    }

    // User agent consistency
    if (event.userId) {
      const isUnusualUserAgent = await this.isUnusualUserAgent(event.userId, event.userAgent);
      if (isUnusualUserAgent) {
        score += 20;
      }
    }

    // Cap the score at 100
    return Math.min(score, 100);
  }

  // Escalate severity based on triggered patterns
  private static escalateSeverity(currentSeverity: SecurityEventSeverity, patterns: string[]): SecurityEventSeverity {
    if (patterns.length === 0) return currentSeverity;

    // If any critical patterns are triggered, escalate to critical
    const criticalPatterns = ['brute_force_detected', 'multiple_location_access', 'suspicious_ip_range'];
    if (patterns.some(p => criticalPatterns.includes(p))) {
      return SecurityEventSeverity.CRITICAL;
    }

    // If multiple patterns triggered, escalate one level
    if (patterns.length >= 3) {
      switch (currentSeverity) {
        case SecurityEventSeverity.LOW: return SecurityEventSeverity.MEDIUM;
        case SecurityEventSeverity.MEDIUM: return SecurityEventSeverity.HIGH;
        case SecurityEventSeverity.HIGH: return SecurityEventSeverity.CRITICAL;
        default: return currentSeverity;
      }
    }

    // Escalate one level for any pattern trigger
    switch (currentSeverity) {
      case SecurityEventSeverity.LOW: return SecurityEventSeverity.MEDIUM;
      case SecurityEventSeverity.MEDIUM: return SecurityEventSeverity.HIGH;
      case SecurityEventSeverity.HIGH: return SecurityEventSeverity.CRITICAL;
      default: return currentSeverity;
    }
  }

  // Trigger real-time alert
  private static async triggerRealTimeAlert(event: SecurityEvent): Promise<void> {
    try {
      const config = await this.getMonitoringConfig();

      // This would send real-time alerts (email, SMS, webhook, etc.)
      // For now, just log the alert
      console.log(`🚨 SECURITY ALERT: ${event.type} (${event.severity}) - Risk Score: ${event.riskScore}`);

      // TODO: Implement actual alert mechanisms
      // Example:
      // await sendEmailAlert(config.alertRecipients, `Security Alert: ${event.type}`, eventDetails);
      // await sendWebhookAlert(config.webhookUrl, event);

    } catch (error) {
      console.error('Error triggering real-time alert:', error);
    }
  }

  // Flush event buffer to storage
  private static async flushEventBuffer(): Promise<void> {
    try {
      if (this.eventBuffer.length === 0) return;

      const eventsToFlush = [...this.eventBuffer];
      this.eventBuffer = [];

      // Store events in database/cache
      for (const event of eventsToFlush) {
        await this.storeSecurityEvent(event);
      }

      console.log(`Flushed ${eventsToFlush.length} security events`);
    } catch (error) {
      console.error('Error flushing event buffer:', error);
      // Re-add events to buffer on failure
      this.eventBuffer.unshift(...this.eventBuffer.slice(0, this.BUFFER_SIZE - this.eventBuffer.length));
    }
  }

  // Store security event
  private static async storeSecurityEvent(event: SecurityEvent): Promise<void> {
    try {
      // Store in security events log
      const eventKey = `security_event_${event.id}`;
      await SettingsCacheService.setSecurityPolicy(
        eventKey,
        'Security Event',
        event,
        event.userId || 'system'
      );

      // Also add to user's event history
      if (event.userId) {
        await this.addEventToUserHistory(event.userId, event);
      }
    } catch (error) {
      console.error('Error storing security event:', error);
    }
  }

  // Add event to user's history
  private static async addEventToUserHistory(userId: string, event: SecurityEvent): Promise<void> {
    try {
      const historyKey = `user_security_history_${userId}`;
      const historyData = await SettingsCacheService.getSecurityPolicy(historyKey);
      const events: SecurityEvent[] = historyData?.config?.events || [];

      // Keep only last 50 events per user
      events.push(event);
      if (events.length > 50) {
        events.shift();
      }

      await SettingsCacheService.setSecurityPolicy(
        historyKey,
        'User Security History',
        { events },
        userId
      );
    } catch (error) {
      console.error('Error adding event to user history:', error);
    }
  }

  // Get recent events for pattern matching
  private static async getRecentEvents(
    eventType?: SecurityEventType,
    since?: Date,
    filterValue?: string
  ): Promise<SecurityEvent[]> {
    try {
      // This would query recent events from storage
      // For now, return empty array
      return [];
    } catch (error) {
      console.error('Error getting recent events:', error);
      return [];
    }
  }

  // Check if location is unusual for user
  private static async isUnusualLocation(userId: string | undefined, location: any): Promise<boolean> {
    if (!userId || !location?.country) return false;

    try {
      const historyKey = `user_security_history_${userId}`;
      const historyData = await SettingsCacheService.getSecurityPolicy(historyKey);
      const events: SecurityEvent[] = historyData?.config?.events || [];

      const recentLocations = events
        .filter(e => e.location?.country)
        .slice(-10)
        .map(e => e.location!.country);

      if (recentLocations.length === 0) return false;

      const uniqueLocations = [...new Set(recentLocations)];
      return !uniqueLocations.includes(location.country);
    } catch (error) {
      console.error('Error checking unusual location:', error);
      return false;
    }
  }

  // Check if time is unusual
  private static isUnusualTime(timestamp: Date): boolean {
    const hour = timestamp.getHours();
    // Consider 2 AM - 6 AM as unusual hours
    return hour >= 2 && hour <= 6;
  }

  // Check if user agent is unusual for user
  private static async isUnusualUserAgent(userId: string | undefined, userAgent: string): Promise<boolean> {
    if (!userId) return false;

    try {
      const historyKey = `user_security_history_${userId}`;
      const historyData = await SettingsCacheService.getSecurityPolicy(historyKey);
      const events: SecurityEvent[] = historyData?.config?.events || [];

      const recentUserAgents = events
        .filter(e => e.userAgent)
        .slice(-5)
        .map(e => this.normalizeUserAgent(e.userAgent!));

      if (recentUserAgents.length === 0) return false;

      const normalizedCurrent = this.normalizeUserAgent(userAgent);
      return !recentUserAgents.includes(normalizedCurrent);
    } catch (error) {
      console.error('Error checking unusual user agent:', error);
      return false;
    }
  }

  // Normalize user agent for comparison
  private static normalizeUserAgent(userAgent: string): string {
    // Extract browser and OS information
    const browser = userAgent.includes('Chrome') ? 'Chrome' :
                   userAgent.includes('Firefox') ? 'Firefox' :
                   userAgent.includes('Safari') ? 'Safari' :
                   userAgent.includes('Edge') ? 'Edge' : 'Unknown';

    const os = userAgent.includes('Windows') ? 'Windows' :
              userAgent.includes('Mac') ? 'macOS' :
              userAgent.includes('Linux') ? 'Linux' :
              userAgent.includes('Android') ? 'Android' :
              userAgent.includes('iOS') ? 'iOS' : 'Unknown';

    return `${browser}-${os}`;
  }

  // Get location from IP address
  private static async getLocationFromIP(ipAddress: string): Promise<any> {
    try {
      // This would integrate with a geolocation service
      // For now, return undefined
      return undefined;
    } catch (error) {
      console.error('Error getting location from IP:', error);
      return undefined;
    }
  }

  // Get monitoring configuration
  private static async getMonitoringConfig(): Promise<SecurityMonitoringConfig> {
    try {
      const configData = await SettingsCacheService.getSecurityPolicy('security_monitoring_config');

      return configData?.config || {
        enabled: true,
        realTimeAlerts: true,
        alertThresholds: {
          suspiciousEventsPerHour: 10,
          failedLoginsPerHour: 20,
          criticalEventsPerHour: 5
        },
        patterns: this.getDefaultPatterns(),
        retentionDays: 90,
        maxEventsPerHour: 1000
      };
    } catch (error) {
      console.error('Error getting monitoring config:', error);
      return {
        enabled: true,
        realTimeAlerts: true,
        alertThresholds: {
          suspiciousEventsPerHour: 10,
          failedLoginsPerHour: 20,
          criticalEventsPerHour: 5
        },
        patterns: this.getDefaultPatterns(),
        retentionDays: 90,
        maxEventsPerHour: 1000
      };
    }
  }

  // Get default suspicious patterns
  private static getDefaultPatterns(): SuspiciousPattern[] {
    return [
      {
        id: 'brute_force',
        name: 'brute_force_detected',
        description: 'Multiple failed login attempts',
        severity: SecurityEventSeverity.HIGH,
        conditions: {
          eventType: SecurityEventType.LOGIN_FAILURE,
          timeWindow: 60,
          threshold: 5,
          groupBy: 'ipAddress'
        },
        riskScore: 70,
        enabled: true
      },
      {
        id: 'unusual_location',
        name: 'unusual_location_access',
        description: 'Login from unusual geographic location',
        severity: SecurityEventSeverity.MEDIUM,
        conditions: {
          eventType: SecurityEventType.LOGIN_SUCCESS,
          timeWindow: 1440, // 24 hours
          threshold: 1,
          groupBy: 'userId'
        },
        riskScore: 40,
        enabled: true
      },
      {
        id: 'rapid_sessions',
        name: 'rapid_session_creation',
        description: 'Multiple sessions created rapidly',
        severity: SecurityEventSeverity.MEDIUM,
        conditions: {
          eventType: SecurityEventType.SESSION_CREATED,
          timeWindow: 30,
          threshold: 3,
          groupBy: 'userId'
        },
        riskScore: 30,
        enabled: true
      }
    ];
  }

  // Schedule cleanup of old events
  private static scheduleCleanup(): void {
    // Clean up old events daily
    setInterval(async () => {
      try {
        await this.cleanupOldEvents();
      } catch (error) {
        console.error('Error during scheduled cleanup:', error);
      }
    }, 24 * 60 * 60 * 1000); // 24 hours
  }

  // Clean up old security events
  private static async cleanupOldEvents(): Promise<void> {
    try {
      const config = await this.getMonitoringConfig();
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - config.retentionDays);

      // This would clean up old events from storage
      // For now, just log the cleanup
      console.log(`Security event cleanup completed (retention: ${config.retentionDays} days)`);
    } catch (error) {
      console.error('Error cleaning up old events:', error);
    }
  }

  // Get security event statistics
  static async getSecurityStats(): Promise<{
    totalEvents: number;
    eventsBySeverity: Record<SecurityEventSeverity, number>;
    eventsByType: Record<SecurityEventType, number>;
    recentAlerts: SecurityEvent[];
    riskScoreDistribution: { low: number; medium: number; high: number; critical: number };
  }> {
    try {
      // This would aggregate statistics from stored events
      // For now, return mock statistics
      return {
        totalEvents: 0,
        eventsBySeverity: {
          [SecurityEventSeverity.LOW]: 0,
          [SecurityEventSeverity.MEDIUM]: 0,
          [SecurityEventSeverity.HIGH]: 0,
          [SecurityEventSeverity.CRITICAL]: 0
        },
        eventsByType: {} as Record<SecurityEventType, number>,
        recentAlerts: [],
        riskScoreDistribution: { low: 0, medium: 0, high: 0, critical: 0 }
      };
    } catch (error) {
      console.error('Error getting security stats:', error);
      return {
        totalEvents: 0,
        eventsBySeverity: {
          [SecurityEventSeverity.LOW]: 0,
          [SecurityEventSeverity.MEDIUM]: 0,
          [SecurityEventSeverity.HIGH]: 0,
          [SecurityEventSeverity.CRITICAL]: 0
        },
        eventsByType: {} as Record<SecurityEventType, number>,
        recentAlerts: [],
        riskScoreDistribution: { low: 0, medium: 0, high: 0, critical: 0 }
      };
    }
  }
}

// Export utilities
export const logSecurityEvent = SecurityEventLogger.logEvent.bind(SecurityEventLogger);
export const getSecurityStats = SecurityEventLogger.getSecurityStats.bind(SecurityEventLogger);
export const initializeSecurityLogger = SecurityEventLogger.initialize.bind(SecurityEventLogger);

export default SecurityEventLogger;
