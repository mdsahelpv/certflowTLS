# Admin Settings Documentation

## Overview

The Admin Settings system provides a comprehensive web-based interface for configuring system-wide settings, security policies, certificate authority management, and performance monitoring. This documentation covers the complete implementation, API endpoints, and usage guidelines.

## Architecture

### Components Structure

```
src/
├── app/
│   ├── admin/
│   │   └── settings/
│   │       └── page.tsx          # Main settings UI component
│   └── api/
│       └── admin/
│           ├── system-config/
│           │   └── route.ts       # System configuration API
│           ├── security/
│           │   └── route.ts       # Security settings API
│           ├── ca/
│           │   └── route.ts       # CA settings API
│           └── performance/
│               └── route.ts       # Performance settings API
├── components/
│   └── ui/                       # Reusable UI components
└── hooks/
    └── useAuth.ts               # Authentication hook
```

### Technology Stack

- **Frontend**: Next.js 14, React 18, TypeScript
- **UI Framework**: Shadcn/ui components with Tailwind CSS
- **Backend**: Next.js API routes
- **Database**: Prisma ORM with SQLite/PostgreSQL support
- **Authentication**: NextAuth.js with role-based permissions
- **Testing**: Jest with React Testing Library

## Features

### 1. System Configuration

#### Database Settings
- **Database Type Detection**: Automatically detects SQLite, PostgreSQL, MySQL, MongoDB
- **Connection Status**: Real-time database connectivity monitoring
- **Backup Functionality**: Production-ready database backups
  - SQLite: Uses `sqlite3 .dump` command
  - PostgreSQL: Uses `pg_dump` with secure credential handling

#### Maintenance Mode
- **Toggle Functionality**: Enable/disable maintenance mode
- **Custom Messages**: Configurable maintenance notifications
- **User Experience**: Graceful handling of maintenance periods

#### Environment Variables
- **Read-Only Display**: Secure viewing of environment configuration
- **Masked Values**: Sensitive information is automatically masked
- **Real-time Updates**: Live environment variable monitoring

### 2. Security Settings

#### Password Policy
- **Complexity Requirements**: Configurable uppercase, lowercase, numbers, special characters
- **Length Validation**: Minimum and maximum password length settings
- **Reuse Prevention**: Prevent reuse of previous passwords
- **Expiry Management**: Automatic password expiration policies

#### Session Management
- **Timeout Configuration**: Customizable session timeout periods
- **Concurrent Sessions**: Limit simultaneous user sessions
- **Activity Extension**: Extend sessions based on user activity
- **Remember Me**: Configurable "remember me" duration

#### Multi-Factor Authentication
- **MFA Enable/Disable**: System-wide MFA configuration
- **Admin Requirements**: Mandatory MFA for administrators
- **Method Selection**: Support for TOTP, Email, SMS methods
- **Grace Period**: Configurable MFA setup grace period

#### Security Audit
- **Audit Logging**: Enable/disable security event logging
- **Log Levels**: Configurable logging verbosity (Error, Warn, Info, Debug)
- **Retention Policies**: Automatic log cleanup and retention
- **Suspicious Activity**: Alert system for security events

### 3. Certificate Authority Settings

#### CA Renewal Policy
- **Auto Renewal**: Enable/disable automatic CA certificate renewal
- **Threshold Configuration**: Days before expiry to trigger renewal
- **Attempt Limits**: Maximum renewal retry attempts
- **Notification Timing**: Advance warning periods

#### Certificate Templates
- **Validity Periods**: Default certificate lifespan configuration
- **Key Sizes**: RSA key size selection (1024, 2048, 3072, 4096 bits)
- **Algorithm Selection**: RSA and ECDSA algorithm support
- **Extension Control**: Allow/disallow custom certificate extensions

#### CRL Settings
- **CRL Generation**: Enable/disable Certificate Revocation List
- **Update Intervals**: Configurable CRL refresh frequency
- **Revoked Certificates**: Include/exclude revoked certificate information
- **Distribution Points**: Configurable CRL download URLs

#### OCSP Settings
- **OCSP Responder**: Enable/disable Online Certificate Status Protocol
- **Responder URL**: OCSP service endpoint configuration
- **Cache Management**: Response caching timeout settings
- **Update Inclusion**: Include/exclude certificate update information

### 4. Performance & Monitoring

#### Health Checks
- **System Monitoring**: Automated health status verification
- **Check Intervals**: Configurable monitoring frequency
- **Timeout Settings**: Response timeout configuration
- **Failure Thresholds**: Consecutive failure limits before alerts

#### Performance Metrics
- **Metrics Collection**: Enable/disable performance data gathering
- **Collection Frequency**: Data sampling interval configuration
- **Data Retention**: Historical performance data storage duration
- **Alert Thresholds**: CPU, memory, disk, and response time limits

#### Resource Limits
- **CPU Management**: Maximum CPU usage percentage limits
- **Memory Control**: RAM usage threshold configuration
- **Disk Monitoring**: Storage usage limit settings
- **Connection Limits**: Maximum concurrent connection controls
- **Rate Limiting**: API request rate limiting configuration

## API Endpoints

### System Configuration API

**GET** `/api/admin/system-config`
- Returns current system configuration
- Requires `config:manage` permission

**POST** `/api/admin/system-config`
- Actions: `toggleMaintenance`, `createBackup`
- Updates system settings and performs backup operations

### Security Settings API

**GET** `/api/admin/security`
- Returns current security configuration
- Requires `config:manage` permission

**POST** `/api/admin/security`
- Actions: `updatePasswordPolicy`, `updateSessionConfig`, `updateMfaConfig`, `updateAuditConfig`
- Updates security policies and configurations

### CA Settings API

**GET** `/api/admin/ca`
- Returns current CA configuration
- Requires `config:manage` permission

**POST** `/api/admin/ca`
- Actions: `updateRenewalPolicy`, `updateCertificateTemplates`, `updateCrlSettings`, `updateOcspSettings`
- Updates certificate authority settings

### Performance Settings API

**GET** `/api/admin/performance`
- Returns current performance configuration
- Requires `config:manage` permission

**POST** `/api/admin/performance`
- Actions: `updateHealthChecks`, `updateMetrics`, `updateResourceLimits`
- Updates performance monitoring and resource limits

## Security Considerations

### Authentication & Authorization
- **Session Validation**: All API endpoints require valid user sessions
- **Permission Checks**: `config:manage` permission required for all operations
- **Role-Based Access**: Administrator role verification
- **Secure Headers**: HTTPS enforcement and security headers

### Data Protection
- **Environment Variables**: Sensitive data automatically masked
- **Input Validation**: Server-side validation for all user inputs
- **SQL Injection Prevention**: Parameterized queries and input sanitization
- **XSS Protection**: HTML encoding and content security policies

### Audit & Compliance
- **Security Logging**: Comprehensive audit trail for all configuration changes
- **Change Tracking**: Who, when, and what was changed
- **Compliance Reporting**: Audit logs for regulatory compliance
- **Data Retention**: Configurable log retention policies

## Usage Guidelines

### For Administrators

1. **Access Settings**: Navigate to Admin Settings from the user dropdown menu
2. **Permission Requirements**: Must have `config:manage` permission
3. **Tab Navigation**: Use tabs to access different configuration sections
4. **Save Changes**: Click "Save" buttons to persist configuration changes
5. **Backup Operations**: Use "Create Backup" for database backups
6. **Monitor Changes**: Review audit logs for configuration change history

### For Developers

1. **API Integration**: Use provided API endpoints for programmatic access
2. **Environment Variables**: Configure system settings via environment variables
3. **Database Setup**: Ensure proper database connectivity before configuration
4. **Backup Strategy**: Implement automated backup schedules using the API
5. **Monitoring**: Set up alerts for performance threshold violations

## Configuration Examples

### Environment Variables

```bash
# Database Configuration
DATABASE_URL="file:./db/custom.db"

# Security Settings
PASSWORD_MIN_LENGTH=8
PASSWORD_REQUIRE_UPPERCASE=true
SESSION_TIMEOUT_MINUTES=30
MFA_ENABLED=true

# CA Settings
CA_AUTO_RENEWAL_ENABLED=true
CA_DEFAULT_VALIDITY_DAYS=365
CRL_ENABLED=true

# Performance Settings
HEALTH_CHECKS_ENABLED=true
METRICS_ENABLED=true
MAX_CPU_USAGE_PERCENT=90
```

### API Usage Examples

#### Update Password Policy
```javascript
fetch('/api/admin/security', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    action: 'updatePasswordPolicy',
    config: {
      passwordPolicy: {
        minLength: 12,
        requireUppercase: true,
        requireSpecialChars: true,
        expiryDays: 90
      }
    }
  })
});
```

#### Create Database Backup
```javascript
fetch('/api/admin/system-config', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    action: 'createBackup',
    config: {}
  })
});
```

## Testing

### Test Coverage

The admin settings system includes comprehensive test coverage:

- **Component Tests**: UI component rendering and interaction
- **API Tests**: Endpoint functionality and error handling
- **Integration Tests**: Complete workflow verification
- **Security Tests**: Permission and authentication validation

### Running Tests

```bash
# Run all tests
npm test

# Run specific test file
npm test -- test/components/admin-settings.test.tsx

# Run with coverage
npm run test:coverage
```

## Troubleshooting

### Common Issues

1. **Permission Denied**
   - Ensure user has `config:manage` permission
   - Check role assignment in user management

2. **Database Connection Failed**
   - Verify DATABASE_URL configuration
   - Check database server status
   - Ensure proper network connectivity

3. **Backup Creation Failed**
   - Verify database type detection
   - Check file system permissions
   - Ensure backup directory exists

4. **Settings Not Persisting**
   - Check environment variable configuration
   - Verify API endpoint responses
   - Review server logs for errors

### Debug Mode

Enable debug logging for troubleshooting:

```bash
NODE_ENV=development
NEXTAUTH_DEBUG=true
LOG_LEVEL=debug
```

## Future Enhancements

### Planned Features

1. **Notification Settings**: Email/SMTP configuration and alert management
2. **Audit & Logging**: Advanced log management and compliance reporting
3. **Integration Settings**: Third-party service integrations and webhooks
4. **Advanced Monitoring**: Real-time dashboards and alerting systems
5. **Bulk Operations**: Mass configuration updates and imports
6. **Configuration Templates**: Predefined configuration profiles
7. **Change Approval**: Multi-step approval workflows for critical changes
8. **Configuration History**: Version control for configuration changes

### API Extensions

1. **Bulk Operations**: Batch configuration updates
2. **Configuration Export/Import**: Backup and restore configurations
3. **Validation Endpoints**: Configuration validation before saving
4. **Monitoring APIs**: Real-time system status endpoints
5. **Audit APIs**: Advanced audit trail querying and reporting

## Support

For technical support or questions about the Admin Settings system:

1. **Documentation**: Refer to this comprehensive guide
2. **API Reference**: Check individual endpoint documentation
3. **Testing**: Run test suites to verify functionality
4. **Logs**: Review application logs for error details
5. **Configuration**: Validate environment variable settings

## Version History

- **v1.0.0**: Initial release with core system, security, CA, and performance settings
- **v1.1.0**: Enhanced backup functionality and improved error handling
- **v1.2.0**: Added comprehensive testing and documentation
- **v1.3.0**: Performance optimizations and monitoring enhancements

---

**Last Updated**: September 4, 2025
**Version**: 1.3.0
**Status**: Production Ready
