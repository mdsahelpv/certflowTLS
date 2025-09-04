import { NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import type { NextRequest } from 'next/server';
import { securityMiddleware } from './middleware-security';
import { logger } from '@/lib/logger-edge';
import { db } from '@/lib/db';

export async function middleware(request: NextRequest) {
  const startTime = Date.now();
  const requestId = crypto.randomUUID();
  const { pathname } = request.nextUrl;

  // Log incoming request
  logger.info('Incoming request', {
    requestId,
    method: request.method,
    url: request.url,
    userAgent: request.headers.get('user-agent'),
    ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown'
  });

  // Bypass security middleware for test page
  if (pathname === '/test') {
    return NextResponse.next();
  }

  // Apply security middleware first
  const securityResponse = securityMiddleware(request);
  if (securityResponse) {
    return securityResponse;
  }

  // Check maintenance mode - redirect to maintenance page if enabled
  try {
    // Use raw query to avoid TypeScript issues with new schema
    const maintenanceRecord = await (db as any).maintenanceMode.findFirst({
      orderBy: { updatedAt: 'desc' }
    });

    const isMaintenanceMode = maintenanceRecord?.isEnabled || false;

    // Allow access to maintenance page and API routes during maintenance
    if (isMaintenanceMode && !pathname.startsWith('/maintenance') && !pathname.startsWith('/api/maintenance')) {
      logger.info('Maintenance mode active - redirecting to maintenance page', {
        requestId,
        originalPath: pathname
      });

      return NextResponse.redirect(new URL('/maintenance', request.url));
    }
  } catch (error) {
    // If database is unavailable, fallback to environment variable
    const isMaintenanceMode = process.env.MAINTENANCE_MODE === 'true';
    if (isMaintenanceMode && !pathname.startsWith('/maintenance') && !pathname.startsWith('/api/maintenance')) {
      logger.info('Maintenance mode active (fallback) - redirecting to maintenance page', {
        requestId,
        originalPath: pathname
      });

      return NextResponse.redirect(new URL('/maintenance', request.url));
    }
  }

  // Check if user is authenticated for protected routes
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  const isAuthenticated = !!token;

  // Define protected routes
  const protectedRoutes = ['/dashboard', '/certificates', '/ca', '/crl', '/audit', '/users', '/notifications'];
  const adminRoutes = ['/users', '/ca'];
  const operatorRoutes = ['/certificates/issue', '/certificates/revoke', '/crl'];

  // Check if the current path is a protected route
  const isProtectedRoute = protectedRoutes.some(route => 
    pathname.startsWith(route)
  );

  // Check if the current path requires admin privileges
  const isAdminRoute = adminRoutes.some(route => 
    pathname.startsWith(route)
  );

  // Check if the current path requires operator privileges
  const isOperatorRoute = operatorRoutes.some(route => 
    pathname.startsWith(route)
  );

  // Redirect to login if accessing protected route without authentication
  if (isProtectedRoute && !isAuthenticated) {
    logger.warn('Unauthorized access attempt', {
      requestId,
      path: request.nextUrl.pathname,
      ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown'
    });
    
    const response = NextResponse.redirect(new URL('/auth/signin', request.url));
    
    // Log response
    logger.info('Request completed', {
      requestId,
      method: request.method,
      url: request.url,
      statusCode: 302,
      duration: Date.now() - startTime,
      action: 'redirect_to_login'
    });
    
    return response;
  }

  // Check role-based permissions
  if (isAuthenticated) {
    const userRole = token.role as string;
    const userPermissions = token.permissions as string[];

    // Admin routes require ADMIN role
    if (isAdminRoute && userRole !== 'ADMIN') {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }

    // Operator routes require OPERATOR or ADMIN role
    if (isOperatorRoute && !['ADMIN', 'OPERATOR'].includes(userRole)) {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
  }

  // If user is authenticated and tries to access auth pages, redirect to dashboard
  if (isAuthenticated && pathname.startsWith('/auth')) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  // Allow the request to proceed
  const response = NextResponse.next();
  
  // Log successful request
  logger.info('Request completed', {
    requestId,
    method: request.method,
    url: request.url,
    statusCode: response.status,
    duration: Date.now() - startTime,
    authenticated: isAuthenticated,
    userId: token?.id
  });

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};
