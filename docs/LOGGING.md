# 📊 Logging System Guide

**Complete logging infrastructure for monitoring and debugging**

📖 **Quick Reference**: See [README.md](../README.md) for system overview and [MAINTENANCE_PROCEDURES.md](MAINTENANCE_PROCEDURES.md) for maintenance procedures

- **Structured logging** with JSON and text formats
- **Service-specific loggers** for different components
- **File-based logging** for production environments
- **Automatic log rotation** with compression
- **Request tracking** with unique request IDs
- **Audit logging** for security and compliance
- **Configurable log levels** per environment

## Configuration

### Environment Variables

```bash
# Logging Configuration
LOG_LEVEL=info            # silent|error|warn|info|debug
PRISMA_LOG=warn,error     # query,info,warn,error (overrides LOG_LEVEL for Prisma)
LOG_FORMAT=json           # json|text
LOG_FILE=logs/app.log     # File logging path (optional)
```

### Log Levels

- **silent**: No logging
- **error**: Only error messages
- **warn**: Warnings and errors
- **info**: Information, warnings, and errors
- **debug**: All messages including debug information

### Default Configuration

- **Development**: `LOG_LEVEL=debug` (verbose logging)
- **Production**: `LOG_LEVEL=info` (balanced logging)

## Usage

### Basic Logging

```typescript
import { logger } from '@/lib/logger';

// Basic logging
logger.info('Application started');
logger.warn('Configuration missing');
logger.error('Database connection failed', { error: 'Connection timeout' });
logger.debug('Processing request', { userId: '123', action: 'login' });
```

### Service-Specific Logging

```typescript
// Service-specific loggers with automatic service tagging
logger.server.info('Server started on port 3000');
logger.database.error('Query failed', { query: 'SELECT * FROM users' });
logger.auth.warn('Failed login attempt', { username: 'admin', ip: '192.168.1.1' });
logger.certificate.info('Certificate issued', { serialNumber: '12345' });
logger.crl.debug('CRL generated', { crlNumber: 1, revokedCount: 5 });
logger.audit.info('User action logged', { action: 'LOGIN', userId: '123' });
logger.notification.error('Email sending failed', { recipient: 'user@example.com' });
logger.socket.info('Client connected', { socketId: 'abc123' });
logger.security.warn('Rate limit exceeded', { ip: '192.168.1.1' });
```

### Request Context Logging

```typescript
import { createRequestLogger } from '@/lib/logger';

// In API routes
export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  const userId = getCurrentUserId(); // Your auth logic
  const reqLogger = createRequestLogger(requestId, userId);
  
  reqLogger.info('API request received', { 
    method: 'GET', 
    path: '/api/users' 
  });
  
  // ... your logic ...
  
  reqLogger.info('API request completed', { 
    statusCode: 200, 
    duration: Date.now() - startTime 
  });
}
```

## Log Formats

### JSON Format (Default)

```json
{
  "level": "info",
  "message": "Server started on port 3000",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "service": "server",
  "metadata": {
    "port": 3000,
    "environment": "production"
  }
}
```

### Text Format

```
2024-01-15T10:30:00.000Z INFO  [server] Server started on port 3000 {"port":3000,"environment":"production"}
```

## File Logging

### Production File Logging

In production, logs are automatically written to files when `LOG_FILE` is configured:

```bash
# Enable file logging
LOG_FILE=logs/app.log
```

### Log Rotation

The system automatically rotates log files when they reach 10MB:

- **Current log**: `logs/app.log`
- **Rotated logs**: `logs/app.1.log`, `logs/app.2.log`, etc.
- **Compressed logs**: `logs/app.1.log.gz`, `logs/app.2.log.gz`, etc.
- **Max files**: 5 rotated files
- **Cleanup**: Logs older than 30 days are automatically deleted

### Log Rotation Configuration

```typescript
import { LogRotation } from '@/lib/log-rotation';

const customRotation = new LogRotation({
  logFile: 'logs/custom.log',
  maxSize: 5 * 1024 * 1024, // 5MB
  maxFiles: 3,
  compressOldLogs: true,
});
```

## Database Logging

### Prisma Query Logging

Database queries are logged based on the `PRISMA_LOG` configuration:

```bash
# Log all database operations
PRISMA_LOG=query,info,warn,error

# Log only warnings and errors
PRISMA_LOG=warn,error

# Derive from LOG_LEVEL (default)
# debug -> query,info,warn,error
# info -> info,warn,error
# warn -> warn,error
# error -> error
```

### Audit Logging

Security and compliance events are automatically logged to the database:

```typescript
import { AuditService } from '@/lib/audit';

await AuditService.log({
  action: 'LOGIN',
  userId: '123',
  username: 'admin',
  description: 'User logged in successfully',
  metadata: { ip: '192.168.1.1', userAgent: 'Mozilla/5.0...' }
});
```

## Request Tracking

### Middleware Logging

The middleware automatically logs all HTTP requests:

```typescript
// Incoming request
{
  "level": "info",
  "message": "Incoming request",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "requestId": "abc-123-def-456",
  "method": "GET",
  "url": "http://localhost:3000/api/users",
  "userAgent": "Mozilla/5.0...",
  "ip": "192.168.1.1"
}

// Completed request
{
  "level": "info",
  "message": "Request completed",
  "timestamp": "2024-01-15T10:30:01.000Z",
  "requestId": "abc-123-def-456",
  "method": "GET",
  "url": "http://localhost:3000/api/users",
  "statusCode": 200,
  "duration": 1000,
  "authenticated": true,
  "userId": "123"
}
```

## Monitoring and Analysis

### Log Analysis Tools

The structured logging format makes it easy to analyze logs with tools like:

- **ELK Stack** (Elasticsearch, Logstash, Kibana)
- **Grafana + Loki**
- **Splunk**
- **AWS CloudWatch**
- **Google Cloud Logging**

### Example Queries

```bash
# Find all errors in the last hour
grep '"level":"error"' logs/app.log | grep "$(date -d '1 hour ago' -Iseconds)"

# Find slow requests (>5 seconds)
grep '"duration":[5-9][0-9][0-9][0-9]' logs/app.log

# Find failed login attempts
grep '"message":"Failed login attempt"' logs/app.log

# Find database errors
grep '"service":"database"' logs/app.log | grep '"level":"error"'
```

### Health Monitoring

```typescript
// Check log file health
import fs from 'fs';

const logFile = 'logs/app.log';
const stats = fs.statSync(logFile);
const fileSize = stats.size;
const lastModified = stats.mtime;

// Alert if log file is too large or old
if (fileSize > 100 * 1024 * 1024) { // 100MB
  console.error('Log file too large:', fileSize);
}

if (Date.now() - lastModified.getTime() > 24 * 60 * 60 * 1000) { // 24 hours
  console.error('Log file not updated recently');
}
```

## Best Practices

### 1. Use Appropriate Log Levels

```typescript
// ✅ Good
logger.info('User logged in', { userId: '123' });
logger.warn('Rate limit approaching', { ip: '192.168.1.1', requests: 95 });
logger.error('Database connection failed', { error: 'Connection timeout' });

// ❌ Avoid
logger.error('User logged in'); // Too severe
logger.debug('Database connection failed'); // Too verbose
```

### 2. Include Relevant Context

```typescript
// ✅ Good
logger.error('Certificate validation failed', {
  certificateId: '12345',
  reason: 'Expired',
  validatedBy: 'system'
});

// ❌ Avoid
logger.error('Validation failed'); // No context
```

### 3. Use Service-Specific Loggers

```typescript
// ✅ Good
logger.auth.info('User authenticated', { userId: '123' });
logger.certificate.info('Certificate issued', { serialNumber: '12345' });

// ❌ Avoid
logger.info('User authenticated'); // No service context
```

### 4. Handle Sensitive Data

```typescript
// ✅ Good
logger.info('Password reset requested', { userId: '123', email: 'user@example.com' });

// ❌ Avoid
logger.info('Password reset requested', { password: 'secret123' }); // Never log passwords
```

### 5. Use Request Context

```typescript
// ✅ Good
const reqLogger = createRequestLogger(requestId, userId);
reqLogger.info('API request processed', { duration: 150 });

// ❌ Avoid
logger.info('API request processed'); // No request tracking
```

## Troubleshooting

### Common Issues

1. **Logs not appearing**
   - Check `LOG_LEVEL` configuration
   - Verify log file permissions
   - Check disk space

2. **Log rotation not working**
   - Verify `LOG_FILE` is set
   - Check file permissions
   - Ensure sufficient disk space

3. **Performance issues**
   - Reduce log level in production
   - Use async logging for high-volume operations
   - Monitor log file size

### Debug Mode

Enable debug logging for troubleshooting:

```bash
LOG_LEVEL=debug
PRISMA_LOG=query,info,warn,error
```

### Log File Locations

- **Development**: Console only (no file logging)
- **Production**: `logs/app.log` (when `LOG_FILE` is configured)
- **Docker**: Mounted volume or container logs

## Integration with Monitoring

### Health Checks

```typescript
// Add to health check endpoint
const logHealth = {
  logFileExists: fs.existsSync('logs/app.log'),
  logFileSize: fs.existsSync('logs/app.log') ? fs.statSync('logs/app.log').size : 0,
  logLevel: process.env.LOG_LEVEL,
  lastLogWrite: new Date().toISOString()
};
```

### Metrics

```typescript
// Track logging metrics
const logMetrics = {
  totalLogs: 0,
  errorLogs: 0,
  warnLogs: 0,
  infoLogs: 0,
  debugLogs: 0
};
```

This logging system provides comprehensive visibility into your application's behavior while maintaining performance and security best practices.
