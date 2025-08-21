import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';

export class SecurityMiddleware {
  // Security headers
  static securityHeaders = {
    'Content-Security-Policy': process.env.NODE_ENV === 'development' 
      ? "default-src *; script-src * 'unsafe-inline' 'unsafe-eval'; style-src * 'unsafe-inline'; img-src * data:; font-src * data:; connect-src * wss: https:; frame-ancestors *;"
      : "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' wss: https:; frame-ancestors 'none';",
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': process.env.NODE_ENV === 'development' ? 'ALLOWALL' : 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Strict-Transport-Security': process.env.NODE_ENV === 'development' ? '' : 'max-age=31536000; includeSubDomains; preload',
  };

  // Apply security headers to response
  static applySecurityHeaders(response: NextResponse): NextResponse {
    Object.entries(this.securityHeaders).forEach(([key, value]) => {
      if (value) { // Only set header if value is not empty
        // Skip iframe-related headers in development
        if (process.env.NODE_ENV === 'development' && 
            (key === 'X-Frame-Options' || key.includes('frame-ancestors'))) {
          return;
        }
        response.headers.set(key, value);
      }
    });
    return response;
  }

  // Validate request origin
  static validateOrigin(request: NextRequest): boolean {
    const origin = request.headers.get('origin');
    const host = request.headers.get('host');
    
    // Require Host header
    if (!host) return false;

    // If no Origin header (e.g., curl, same-origin navigations), allow
    if (!origin) return true;
    
    // Allow same origin
    if (origin.includes(host)) return true;
    
    // Allow localhost in development
    if (process.env.NODE_ENV === 'development' && origin.includes('localhost')) {
      return true;
    }
    
    return false;
  }

  // Rate limiting configuration
  static rateLimits = {
    login: { windowMs: 15 * 60 * 1000, max: 5 }, // 5 attempts per 15 minutes
    api: { windowMs: 15 * 60 * 1000, max: 100 }, // 100 requests per 15 minutes
    sensitive: { windowMs: 60 * 60 * 1000, max: 10 }, // 10 sensitive operations per hour
  };

  // Simple in-memory rate limiting (in production, use Redis)
  private static rateLimitStore = new Map<string, { count: number; resetTime: number }>();

  static checkRateLimit(key: string, type: keyof typeof this.rateLimits): boolean {
    const limit = this.rateLimits[type];
    const now = Date.now();
    const record = this.rateLimitStore.get(key);

    if (!record || now > record.resetTime) {
      // Create new record
      this.rateLimitStore.set(key, {
        count: 1,
        resetTime: now + limit.windowMs,
      });
      return true;
    }

    if (record.count >= limit.max) {
      return false; // Rate limited
    }

    record.count++;
    return true;
  }

  // Sanitize user input
  static sanitizeInput(input: string): string {
    if (typeof input !== 'string') return input;
    
    return input
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Remove script tags
      .replace(/javascript:/gi, '') // Remove javascript protocol
      .replace(/on\w+\s*=/gi, '') // Remove event handlers
      .trim();
  }

  // Validate certificate data
  static validateCertificateData(data: any): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Validate subject DN
    if (!data.subjectDN || typeof data.subjectDN !== 'string') {
      errors.push('Subject DN is required and must be a string');
    } else if (data.subjectDN.length > 256) {
      errors.push('Subject DN is too long (max 256 characters)');
    }

    // Validate certificate type
    const validTypes = ['SERVER', 'CLIENT', 'CA'];
    if (!data.certificateType || !validTypes.includes(data.certificateType)) {
      errors.push('Invalid certificate type');
    }

    // Validate key algorithm (limit to supported signer algorithms)
    const validAlgorithms = ['RSA', 'ECDSA'];
    if (!data.keyAlgorithm || !validAlgorithms.includes(data.keyAlgorithm)) {
      errors.push('Invalid key algorithm');
    }

    // Validate validity period
    if (!data.validityDays || typeof data.validityDays !== 'number' || data.validityDays < 1 || data.validityDays > 3650) {
      errors.push('Validity period must be between 1 and 3650 days');
    }

    // Validate SANs if provided
    if (data.sans && Array.isArray(data.sans)) {
      data.sans.forEach((san: string, index: number) => {
        if (typeof san !== 'string') {
          errors.push(`SAN at index ${index} must be a string`);
        } else if (san.length > 253) {
          errors.push(`SAN at index ${index} is too long (max 253 characters)`);
        }
      });
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  // Validate CSR format
  static validateCSR(csr: string): boolean {
    if (typeof csr !== 'string') return false;
    
    // Basic CSR validation
    const csrPattern = /-----BEGIN CERTIFICATE REQUEST-----[\s\S]+-----END CERTIFICATE REQUEST-----/;
    return csrPattern.test(csr);
  }

  // Validate certificate format
  static validateCertificate(cert: string): boolean {
    if (typeof cert !== 'string') return false;
    
    // Basic certificate validation
    const certPattern = /-----BEGIN CERTIFICATE-----[\s\S]+-----END CERTIFICATE-----/;
    return certPattern.test(cert);
  }

  // Encrypt sensitive data for storage
  static async encryptSensitiveData(data: string): Promise<{ encrypted: string; iv: string; tag: string }> {
    const { Encryption } = await import('./crypto');
    return Encryption.encrypt(data);
  }

  // Decrypt sensitive data
  static async decryptSensitiveData(encrypted: string, iv: string, tag: string): Promise<string> {
    const { Encryption } = await import('./crypto');
    return Encryption.decrypt(encrypted, iv, tag);
  }

  // Generate secure random token
  static generateSecureToken(length: number = 32): string {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const crypto = require('crypto');
    return crypto.randomBytes(length).toString('hex');
  }

  // Validate password strength
  static validatePassword(password: string): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (password.length < 8) {
      errors.push('Password must be at least 8 characters long');
    }

    if (!/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter');
    }

    if (!/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter');
    }

    if (!/\d/.test(password)) {
      errors.push('Password must contain at least one number');
    }

    if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
      errors.push('Password must contain at least one special character');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  // Log security events
  static async logSecurityEvent(event: {
    type: 'AUTH_SUCCESS' | 'AUTH_FAILURE' | 'RATE_LIMIT_EXCEEDED' | 'INVALID_INPUT' | 'SUSPICIOUS_ACTIVITY';
    userId?: string;
    username?: string;
    ipAddress?: string;
    userAgent?: string;
    description: string;
    metadata?: Record<string, any>;
  }) {
    try {
      const { AuditService } = await import('./audit');
      await AuditService.log({
        action: 'LOGIN',
        userId: event.userId,
        username: event.username,
        description: `[SECURITY] ${event.type}: ${event.description}`,
        metadata: {
          securityEvent: event.type,
          ipAddress: event.ipAddress,
          userAgent: event.userAgent,
          ...event.metadata,
        },
      });
    } catch (error) {
      console.error('Failed to log security event:', error);
    }
  }

  // Check for suspicious patterns in request
  static detectSuspiciousActivity(request: NextRequest): boolean {
    const userAgent = request.headers.get('user-agent') || '';
    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
    
    // Check for suspicious user agents
    const suspiciousAgents = [
      'sqlmap',
      'nikto',
      'nmap',
      'masscan',
      'zgrab',
      'curl',
      'wget',
    ];
    
    if (suspiciousAgents.some(agent => userAgent.toLowerCase().includes(agent))) {
      return true;
    }

    // Check for suspicious IP patterns (simplified)
    const suspiciousPatterns = [
      /(\d+)\1{3}/, // Repeated digits like 111.111.111.111
      /0{2,}/, // Multiple zeros
    ];
    
    if (suspiciousPatterns.some(pattern => pattern.test(ip))) {
      return true;
    }

    return false;
  }

  // Enforce HTTPS in production
  static enforceHTTPS(request: NextRequest): NextResponse | null {
    if (process.env.NODE_ENV === 'production') {
      const protocol = request.headers.get('x-forwarded-proto') || 'http';
      if (protocol === 'http') {
        const url = new URL(request.url);
        url.protocol = 'https';
        return NextResponse.redirect(url);
      }
    }
    return null;
  }
}