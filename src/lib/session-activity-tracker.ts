/**
 * Session Activity Tracker
 *
 * Comprehensive session activity monitoring and analytics
 * Tracks user behavior patterns, security events, and session metrics
 */

import { SettingsCacheService } from './settings-cache';
import { AuditService } from './audit';

// Session activity event types
export enum SessionActivityType {
  LOGIN = 'login',
  LOGOUT = 'logout',
  ACTIVITY = 'activity',
  TIMEOUT = 'timeout',
  TERMINATED = 'terminated',
  EXTENDED = 'extended',
  SUSPICIOUS = 'suspicious'
}

// Session activity event
export interface SessionActivityEvent {
  id: string;
  sessionId: string;
  userId: string;
  username: string;
  type: SessionActivityType;
  timestamp: Date;
  ipAddress: string;
  userAgent: string;
  location?: {
    country?: string;
    city?: string;
    timezone?: string;
  };
  deviceInfo?: {
    browser?: string;
    os?: string;
    device?: string;
  };
  metadata?: Record<string, any>;
}

// Session analytics data
export interface SessionAnalytics {
  userId: string;
  totalSessions: number;
  averageSessionDuration: number;
  lastActivity: Date;
  mostActiveHour: number;
  mostActiveDay: number;
  loginFrequency: {
    daily: number;
    weekly: number;
    monthly: number;
  };
  suspiciousActivities: SessionActivityEvent[];
  geographicDistribution: {
    country: string;
    sessions: number;
  }[];
}

// Session activity tracker class
export class SessionActivityTracker {
  // Track session activity event
  static async trackActivity(
    sessionId: string,
    userId: string,
    username: string,
    type: SessionActivityType,
    ipAddress: string,
    userAgent: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    try {
      // Check if activity tracking is enabled
      const sessionConfig = await SettingsCacheService.getSecurityPolicy('session_config');
      if (!sessionConfig?.config?.enableActivityTracking) {
        return;
      }

      // Parse user agent for device info
      const deviceInfo = this.parseUserAgent(userAgent);

      // Get location info from IP (would need geolocation service)
      const location = await this.getLocationFromIP(ipAddress);

      // Create activity event
      const event: SessionActivityEvent = {
        id: `activity_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        sessionId,
        userId,
        username,
        type,
        timestamp: new Date(),
        ipAddress,
        userAgent,
        location,
        deviceInfo,
        metadata
      };

      // Store activity event
      await this.storeActivityEvent(event);

      // Check for suspicious activity
      await this.checkForSuspiciousActivity(event);

      // Update user analytics
      await this.updateUserAnalytics(userId, event);

      // Log to audit system for important events
      if ([SessionActivityType.LOGIN, SessionActivityType.LOGOUT, SessionActivityType.TERMINATED, SessionActivityType.SUSPICIOUS].includes(type)) {
        await AuditService.log({
          action: 'LOGIN' as any,
          userId,
          username,
          description: `Session ${type}: ${sessionId}`,
          metadata: {
            sessionId,
            type,
            ipAddress,
            userAgent,
            location,
            deviceInfo,
            ...metadata
          }
        });
      }
    } catch (error) {
      console.error('Error tracking session activity:', error);
    }
  }

  // Store activity event (in database or external system)
  private static async storeActivityEvent(event: SessionActivityEvent): Promise<void> {
    try {
      // This would store in a dedicated activity log table or external analytics system
      // For now, we'll store in the security policies table as metadata
      const activityKey = `session_activity_${event.userId}`;
      const existingActivities = await SettingsCacheService.getSecurityPolicy(activityKey);
      const activities: SessionActivityEvent[] = existingActivities?.config?.activities || [];

      // Keep only last 100 activities per user
      activities.push(event);
      if (activities.length > 100) {
        activities.shift();
      }

      await SettingsCacheService.setSecurityPolicy(
        activityKey,
        'User Session Activities',
        { activities },
        event.userId
      );
    } catch (error) {
      console.error('Error storing activity event:', error);
    }
  }

  // Check for suspicious activity patterns
  private static async checkForSuspiciousActivity(event: SessionActivityEvent): Promise<void> {
    try {
      const suspiciousPatterns = await this.detectSuspiciousPatterns(event);

      if (suspiciousPatterns.length > 0) {
        // Create suspicious activity event
        const suspiciousEvent: SessionActivityEvent = {
          ...event,
          type: SessionActivityType.SUSPICIOUS,
          metadata: {
            ...event.metadata,
            suspiciousPatterns,
            riskLevel: this.calculateRiskLevel(suspiciousPatterns)
          }
        };

        await this.storeActivityEvent(suspiciousEvent);

        // Log security alert
        await AuditService.log({
          action: 'CONFIG_UPDATED' as any, // Use existing action or create security alert action
          userId: event.userId,
          username: event.username,
          description: `Suspicious session activity detected: ${suspiciousPatterns.join(', ')}`,
          metadata: {
            sessionId: event.sessionId,
            suspiciousPatterns,
            riskLevel: suspiciousEvent.metadata?.riskLevel,
            ipAddress: event.ipAddress,
            userAgent: event.userAgent
          }
        });
      }
    } catch (error) {
      console.error('Error checking for suspicious activity:', error);
    }
  }

  // Detect suspicious activity patterns
  private static async detectSuspiciousPatterns(event: SessionActivityEvent): Promise<string[]> {
    const patterns: string[] = [];

    try {
      // Get user's recent activity
      const activityKey = `session_activity_${event.userId}`;
      const existingActivities = await SettingsCacheService.getSecurityPolicy(activityKey);
      const activities: SessionActivityEvent[] = existingActivities?.config?.activities || [];

      // Check for unusual login times
      if (event.type === SessionActivityType.LOGIN) {
        const unusualTime = this.isUnusualLoginTime(activities, event.timestamp);
        if (unusualTime) {
          patterns.push('unusual_login_time');
        }
      }

      // Check for geographic anomalies
      if (event.location) {
        const unusualLocation = this.isUnusualLocation(activities, event.location);
        if (unusualLocation) {
          patterns.push('unusual_location');
        }
      }

      // Check for device anomalies
      if (event.deviceInfo) {
        const unusualDevice = this.isUnusualDevice(activities, event.deviceInfo);
        if (unusualDevice) {
          patterns.push('unusual_device');
        }
      }

      // Check for rapid consecutive logins (brute force attempt)
      if (event.type === SessionActivityType.LOGIN) {
        const rapidLogins = this.detectRapidLogins(activities, event.timestamp);
        if (rapidLogins) {
          patterns.push('rapid_consecutive_logins');
        }
      }

      // Check for session from multiple locations simultaneously
      const simultaneousSessions = this.detectSimultaneousSessions(activities, event);
      if (simultaneousSessions) {
        patterns.push('simultaneous_sessions_different_locations');
      }

    } catch (error) {
      console.error('Error detecting suspicious patterns:', error);
    }

    return patterns;
  }

  // Calculate risk level based on suspicious patterns
  private static calculateRiskLevel(patterns: string[]): 'low' | 'medium' | 'high' | 'critical' {
    if (patterns.includes('simultaneous_sessions_different_locations')) {
      return 'critical';
    }
    if (patterns.includes('unusual_location') && patterns.includes('unusual_device')) {
      return 'high';
    }
    if (patterns.includes('rapid_consecutive_logins') || patterns.length >= 3) {
      return 'medium';
    }
    if (patterns.length > 0) {
      return 'low';
    }
    return 'low';
  }

  // Check if login time is unusual
  private static isUnusualLoginTime(activities: SessionActivityEvent[], currentTime: Date): boolean {
    const recentLogins = activities
      .filter(a => a.type === SessionActivityType.LOGIN)
      .slice(-10); // Last 10 logins

    if (recentLogins.length < 3) return false;

    const currentHour = currentTime.getHours();
    const usualHours = recentLogins.map(a => a.timestamp.getHours());

    // Check if current hour is outside normal range
    const minHour = Math.min(...usualHours);
    const maxHour = Math.max(...usualHours);

    return currentHour < minHour - 3 || currentHour > maxHour + 3;
  }

  // Check if location is unusual
  private static isUnusualLocation(activities: SessionActivityEvent[], currentLocation: any): boolean {
    const recentLocations = activities
      .filter(a => a.location?.country)
      .slice(-5)
      .map(a => a.location!.country);

    if (recentLocations.length === 0) return false;

    const currentCountry = currentLocation.country;
    const uniqueCountries = Array.from(new Set(recentLocations));

    // If user has only logged in from one country before
    if (uniqueCountries.length === 1 && uniqueCountries[0] !== currentCountry) {
      return true;
    }

    return false;
  }

  // Check if device is unusual
  private static isUnusualDevice(activities: SessionActivityEvent[], currentDevice: any): boolean {
    const recentDevices = activities
      .filter(a => a.deviceInfo?.browser)
      .slice(-3)
      .map(a => `${a.deviceInfo!.browser}-${a.deviceInfo!.os}`);

    if (recentDevices.length === 0) return false;

    const currentDeviceStr = `${currentDevice.browser}-${currentDevice.os}`;
    const knownDevices = Array.from(new Set(recentDevices));

    return !knownDevices.includes(currentDeviceStr);
  }

  // Detect rapid consecutive login attempts
  private static detectRapidLogins(activities: SessionActivityEvent[], currentTime: Date): boolean {
    const recentLogins = activities
      .filter(a => a.type === SessionActivityType.LOGIN)
      .slice(-5); // Last 5 logins

    if (recentLogins.length < 3) return false;

    // Check if logins are within short time frames
    const timeDiffs = [];
    for (let i = 1; i < recentLogins.length; i++) {
      const diff = recentLogins[i].timestamp.getTime() - recentLogins[i - 1].timestamp.getTime();
      timeDiffs.push(diff);
    }

    // If average time between logins is less than 30 seconds
    const avgDiff = timeDiffs.reduce((a, b) => a + b, 0) / timeDiffs.length;
    return avgDiff < 30000; // 30 seconds
  }

  // Detect simultaneous sessions from different locations
  private static detectSimultaneousSessions(activities: SessionActivityEvent[], currentEvent: SessionActivityEvent): boolean {
    const activeSessions = activities
      .filter(a =>
        a.type === SessionActivityType.LOGIN &&
        a.timestamp > new Date(Date.now() - 30 * 60 * 1000) // Last 30 minutes
      );

    if (activeSessions.length < 2) return false;

    const locations = activeSessions
      .map(a => a.location?.country)
      .filter(Boolean);

    const uniqueLocations = Array.from(new Set(locations));
    return uniqueLocations.length > 1;
  }

  // Parse user agent string for device information
  private static parseUserAgent(userAgent: string): { browser?: string; os?: string; device?: string } {
    const deviceInfo: { browser?: string; os?: string; device?: string } = {};

    try {
      // Simple user agent parsing (in production, use a proper library)
      if (userAgent.includes('Chrome')) deviceInfo.browser = 'Chrome';
      else if (userAgent.includes('Firefox')) deviceInfo.browser = 'Firefox';
      else if (userAgent.includes('Safari')) deviceInfo.browser = 'Safari';
      else if (userAgent.includes('Edge')) deviceInfo.browser = 'Edge';
      else deviceInfo.browser = 'Unknown';

      if (userAgent.includes('Windows')) deviceInfo.os = 'Windows';
      else if (userAgent.includes('Mac')) deviceInfo.os = 'macOS';
      else if (userAgent.includes('Linux')) deviceInfo.os = 'Linux';
      else if (userAgent.includes('Android')) deviceInfo.os = 'Android';
      else if (userAgent.includes('iOS')) deviceInfo.os = 'iOS';
      else deviceInfo.os = 'Unknown';

      if (userAgent.includes('Mobile')) deviceInfo.device = 'Mobile';
      else if (userAgent.includes('Tablet')) deviceInfo.device = 'Tablet';
      else deviceInfo.device = 'Desktop';
    } catch (error) {
      console.error('Error parsing user agent:', error);
    }

    return deviceInfo;
  }

  // Get location information from IP address
  private static async getLocationFromIP(ipAddress: string): Promise<{ country?: string; city?: string; timezone?: string } | undefined> {
    try {
      // This would integrate with a geolocation service like MaxMind GeoIP
      // For now, return undefined
      return undefined;
    } catch (error) {
      console.error('Error getting location from IP:', error);
      return undefined;
    }
  }

  // Update user analytics
  private static async updateUserAnalytics(userId: string, event: SessionActivityEvent): Promise<void> {
    try {
      const analyticsKey = `user_analytics_${userId}`;
      const existingAnalytics = await SettingsCacheService.getSecurityPolicy(analyticsKey);
      const analytics: Partial<SessionAnalytics> = existingAnalytics?.config || {};

      // Update analytics based on event type
      switch (event.type) {
        case SessionActivityType.LOGIN:
          analytics.totalSessions = (analytics.totalSessions || 0) + 1;
          analytics.lastActivity = event.timestamp;
          break;
        case SessionActivityType.ACTIVITY:
          analytics.lastActivity = event.timestamp;
          break;
      }

      // Update geographic distribution
      if (event.location?.country) {
        analytics.geographicDistribution = analytics.geographicDistribution || [];
        const countryEntry = analytics.geographicDistribution.find(g => g.country === event.location!.country);
        if (countryEntry) {
          countryEntry.sessions++;
        } else {
          analytics.geographicDistribution.push({
            country: event.location.country,
            sessions: 1
          });
        }
      }

      await SettingsCacheService.setSecurityPolicy(
        analyticsKey,
        'User Session Analytics',
        analytics,
        userId
      );
    } catch (error) {
      console.error('Error updating user analytics:', error);
    }
  }

  // Get user session analytics
  static async getUserAnalytics(userId: string): Promise<SessionAnalytics | null> {
    try {
      const analyticsKey = `user_analytics_${userId}`;
      const existingAnalytics = await SettingsCacheService.getSecurityPolicy(analyticsKey);

      if (!existingAnalytics?.config) {
        return null;
      }

      return existingAnalytics.config as SessionAnalytics;
    } catch (error) {
      console.error('Error getting user analytics:', error);
      return null;
    }
  }

  // Get session activity report
  static async getActivityReport(
    userId?: string,
    startDate?: Date,
    endDate?: Date,
    types?: SessionActivityType[]
  ): Promise<SessionActivityEvent[]> {
    try {
      let activities: SessionActivityEvent[] = [];

      if (userId) {
        // Get specific user's activities
        const activityKey = `session_activity_${userId}`;
        const userActivities = await SettingsCacheService.getSecurityPolicy(activityKey);
        activities = userActivities?.config?.activities || [];
      } else {
        // This would need to aggregate activities from all users
        // For now, return empty array
        activities = [];
      }

      // Filter by date range
      if (startDate) {
        activities = activities.filter(a => a.timestamp >= startDate);
      }
      if (endDate) {
        activities = activities.filter(a => a.timestamp <= endDate);
      }

      // Filter by types
      if (types && types.length > 0) {
        activities = activities.filter(a => types.includes(a.type));
      }

      return activities.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    } catch (error) {
      console.error('Error getting activity report:', error);
      return [];
    }
  }

  // Clean up old activity data
  static async cleanupOldActivities(daysToKeep: number = 90): Promise<number> {
    try {
      // This would clean up old activity data from the database
      // For now, return 0
      return 0;
    } catch (error) {
      console.error('Error cleaning up old activities:', error);
      return 0;
    }
  }
}

// Export utilities
export const trackSessionActivity = SessionActivityTracker.trackActivity.bind(SessionActivityTracker);
export const getUserSessionAnalytics = SessionActivityTracker.getUserAnalytics.bind(SessionActivityTracker);
export const getSessionActivityReport = SessionActivityTracker.getActivityReport.bind(SessionActivityTracker);
export const cleanupOldSessionActivities = SessionActivityTracker.cleanupOldActivities.bind(SessionActivityTracker);

export default SessionActivityTracker;
