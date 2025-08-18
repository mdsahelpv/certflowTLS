import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { SecurityMiddleware } from '@/lib/security';
export const runtime = 'nodejs';

export function securityMiddleware(request: NextRequest) {
  // Enforce HTTPS in production
  // const httpsRedirect = SecurityMiddleware.enforceHTTPS(request);
  // if (httpsRedirect) {
  //   return httpsRedirect;
  // }

  // Validate origin for API routes
  if (request.nextUrl.pathname.startsWith('/api/')) {
    if (!SecurityMiddleware.validateOrigin(request)) {
      return new NextResponse(
        JSON.stringify({ error: 'Invalid origin' }),
        { 
          status: 403,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // Rate limiting for sensitive operations
    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
    const pathname = request.nextUrl.pathname;

    // Apply rate limiting to login attempts
    if (pathname.includes('/auth')) {
      if (!SecurityMiddleware.checkRateLimit(ip, 'login')) {
        return new NextResponse(
          JSON.stringify({ error: 'Too many login attempts. Please try again later.' }),
          { 
            status: 429,
            headers: { 'Content-Type': 'application/json' }
          }
        );
      }
    }

    // Apply rate limiting to API routes
    if (pathname.startsWith('/api/')) {
      if (!SecurityMiddleware.checkRateLimit(ip, 'api')) {
        return new NextResponse(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }),
          { 
            status: 429,
            headers: { 'Content-Type': 'application/json' }
          }
        );
      }
    }

    // Detect suspicious activity
    if (SecurityMiddleware.detectSuspiciousActivity(request)) {
      // Log suspicious activity
      SecurityMiddleware.logSecurityEvent({
        type: 'SUSPICIOUS_ACTIVITY',
        ipAddress: ip,
        userAgent: request.headers.get('user-agent') || undefined,
        description: 'Suspicious activity detected',
        metadata: {
          url: request.url,
          method: request.method,
        },
      });

      // Optionally block the request
      return new NextResponse(
        JSON.stringify({ error: 'Access denied' }),
        { 
          status: 403,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
  }

  // Apply security headers to all responses
  const response = NextResponse.next();
  return SecurityMiddleware.applySecurityHeaders(response);
}
