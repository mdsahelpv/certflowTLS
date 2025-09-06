# 🔧 Admin Settings Configuration Guide

**Complete guide for configuring and managing system-wide settings**

📖 **Quick Reference**: See [README.md](../README.md) for system overview and setup

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

## 📖 Admin Settings User Guide

### 🚀 Quick Start for Administrators

#### Step 1: Access Admin Settings
1. **Login** as an administrator user
2. **Click your profile** in the top-right corner
3. **Select "Admin Settings"** from the dropdown menu
4. **Navigate through tabs** to configure different system aspects

#### Step 2: Initial Security Setup (Critical First Steps)
```bash
# Recommended initial security configuration
PASSWORD_MIN_LENGTH=12
PASSWORD_REQUIRE_SPECIAL_CHARS=true
SESSION_TIMEOUT_MINUTES=30
MFA_ENABLED=true
AUDIT_LOGGING_ENABLED=true
```

#### Step 3: Configure Certificate Authority
1. **Navigate to "CA Settings" tab**
2. **Enable auto-renewal** for production environments
3. **Set renewal thresholds** (30 days recommended)
4. **Configure CRL/OCSP** for certificate validation
5. **Test CA connectivity** before going live

#### Step 4: Performance Monitoring Setup
1. **Enable health checks** with 5-minute intervals
2. **Set performance thresholds**:
   - CPU: 80% warning, 90% critical
   - Memory: 85% warning, 95% critical
   - Response Time: 3000ms warning, 5000ms critical
3. **Configure alerts** for threshold violations

### 🔧 Configuration Examples

#### Production Environment Setup
```bash
# Security Configuration
PASSWORD_MIN_LENGTH=12
PASSWORD_REQUIRE_UPPERCASE=true
PASSWORD_REQUIRE_LOWERCASE=true
PASSWORD_REQUIRE_NUMBERS=true
PASSWORD_REQUIRE_SPECIAL_CHARS=true
PASSWORD_PREVENT_REUSE=5
SESSION_TIMEOUT_MINUTES=30
MFA_ENABLED=true

# CA Configuration
CA_AUTO_RENEWAL_ENABLED=true
CA_RENEWAL_THRESHOLD_DAYS=30
CA_DEFAULT_VALIDITY_DAYS=365
CRL_ENABLED=true
CRL_UPDATE_INTERVAL_HOURS=24
OCSP_ENABLED=true

# Performance Configuration
HEALTH_CHECKS_ENABLED=true
METRICS_ENABLED=true
MAX_CPU_USAGE_PERCENT=80
MAX_MEMORY_USAGE_PERCENT=85
RATE_LIMIT_REQUESTS_PER_MINUTE=1000
```

#### Development Environment Setup
```bash
# Relaxed security for development
PASSWORD_MIN_LENGTH=8
SESSION_TIMEOUT_MINUTES=60
MFA_ENABLED=false

# CA Configuration
CA_AUTO_RENEWAL_ENABLED=false
CRL_ENABLED=false
OCSP_ENABLED=false

# Performance Configuration
HEALTH_CHECKS_ENABLED=true
METRICS_ENABLED=false
```

### 💡 Best Practices

#### 🔒 Security Best Practices

1. **Password Policies**
   - **Minimum Length**: 12+ characters for production
   - **Complexity**: Require all character types
   - **Expiry**: 90 days maximum for sensitive systems
   - **Reuse Prevention**: Block last 5 passwords

2. **Session Management**
   - **Timeout**: 30 minutes for active sessions
   - **Concurrent Limits**: 3-5 sessions per user
   - **MFA**: Always enable for administrators
   - **Audit Logging**: Enable all security events

3. **Access Control**
   - **Principle of Least Privilege**: Grant minimal required permissions
   - **Regular Audits**: Review user permissions quarterly
   - **Role-Based Access**: Use predefined roles consistently

#### 🏗️ System Configuration Best Practices

1. **Database Management**
   - **Regular Backups**: Daily automated backups
   - **Backup Verification**: Test restore procedures monthly
   - **Storage Planning**: Monitor disk usage trends
   - **Connection Pooling**: Configure appropriate pool sizes

2. **Performance Optimization**
   - **Resource Limits**: Set conservative thresholds
   - **Monitoring**: Enable comprehensive health checks
   - **Alert Configuration**: Set up multiple notification channels
   - **Capacity Planning**: Monitor usage patterns

3. **Maintenance Procedures**
   - **Scheduled Maintenance**: Plan maintenance windows
   - **Communication**: Notify users of scheduled downtime
   - **Rollback Plans**: Always have rollback procedures ready
   - **Testing**: Test maintenance procedures in staging

#### 📜 Certificate Authority Best Practices

1. **CA Management**
   - **Auto-Renewal**: Enable for production environments
   - **Renewal Thresholds**: 30 days before expiry
   - **Backup CAs**: Maintain offline backup CAs
   - **Key Security**: Use hardware security modules (HSM)

2. **Certificate Lifecycle**
   - **Validity Periods**: 1 year for server certificates
   - **Renewal Process**: Automate where possible
   - **Revocation**: Immediate revocation for compromised keys
   - **CRL/OCSP**: Enable both for comprehensive validation

3. **Security Standards**
   - **Key Sizes**: Minimum 2048-bit RSA, prefer 3072-bit
   - **Algorithms**: Use ECDSA for new deployments
   - **Extensions**: Limit custom extensions to required only
   - **Validation**: Regular certificate inventory audits

### 🚨 Common Configuration Scenarios

#### Scenario 1: New Production Deployment
```bash
# Step 1: Security First
PASSWORD_MIN_LENGTH=12
MFA_ENABLED=true
SESSION_TIMEOUT_MINUTES=30

# Step 2: CA Setup
CA_AUTO_RENEWAL_ENABLED=true
CRL_ENABLED=true
OCSP_ENABLED=true

# Step 3: Monitoring
HEALTH_CHECKS_ENABLED=true
METRICS_ENABLED=true
ALERT_EMAIL_ENABLED=true
```

#### Scenario 2: High-Security Environment
```bash
# Enhanced Security
PASSWORD_MIN_LENGTH=16
PASSWORD_PREVENT_REUSE=10
SESSION_TIMEOUT_MINUTES=15
MFA_REQUIRED=true

# Strict CA Policies
CA_DEFAULT_VALIDITY_DAYS=180
CA_MAX_RENEWAL_ATTEMPTS=1
CRL_UPDATE_INTERVAL_HOURS=6

# Intensive Monitoring
HEALTH_CHECKS_INTERVAL_MINUTES=2
METRICS_RETENTION_DAYS=365
```

#### Scenario 3: Development Environment
```bash
# Relaxed for Development
PASSWORD_MIN_LENGTH=8
SESSION_TIMEOUT_MINUTES=120
MFA_ENABLED=false

# Simplified CA
CA_AUTO_RENEWAL_ENABLED=false
CRL_ENABLED=false
OCSP_ENABLED=false

# Basic Monitoring
HEALTH_CHECKS_ENABLED=true
METRICS_ENABLED=false
```

### 🔍 Troubleshooting Guide

#### Authentication Issues
- **Check Permissions**: Verify `config:manage` permission
- **Session Timeout**: Extend session timeout if needed
- **MFA Setup**: Ensure MFA is properly configured
- **Role Assignment**: Confirm administrator role

#### Database Problems
- **Connection Issues**: Verify DATABASE_URL configuration
- **Backup Failures**: Check file system permissions
- **Migration Errors**: Review migration logs
- **Performance Issues**: Monitor query execution times

#### Certificate Authority Issues
- **Renewal Failures**: Check CA connectivity and permissions
- **CRL Generation**: Verify CRL distribution points
- **OCSP Problems**: Check responder URL configuration
- **Certificate Validation**: Test certificate chains

#### Performance Problems
- **High CPU Usage**: Review resource limits and thresholds
- **Memory Issues**: Check memory allocation and leaks
- **Slow Responses**: Monitor database query performance
- **Alert Configuration**: Verify alert thresholds and channels

### 📊 Monitoring & Maintenance

#### Daily Checks
- [ ] Review system health status
- [ ] Check certificate expiry dates
- [ ] Monitor resource usage trends
- [ ] Verify backup completion

#### Weekly Tasks
- [ ] Review audit logs for suspicious activity
- [ ] Test backup restoration procedures
- [ ] Update security patches
- [ ] Review user access permissions

#### Monthly Tasks
- [ ] Full security audit
- [ ] Performance optimization review
- [ ] Certificate inventory audit
- [ ] Compliance documentation update

#### Quarterly Tasks
- [ ] Complete system backup test
- [ ] Security policy review
- [ ] User permission audit
- [ ] Disaster recovery test

### 📞 Support & Resources

#### Getting Help
1. **Documentation**: This comprehensive guide
2. **API Reference**: Complete endpoint documentation
3. **Logs**: Application and audit logs
4. **Testing**: Run test suites for verification

#### Emergency Contacts
- **Security Issues**: Immediate response required
- **System Down**: Critical system failure
- **Data Loss**: Backup and recovery needed
- **Performance Issues**: System slowdown or unavailability

#### Useful Commands
```bash
# Check system status
curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/admin/health

# Create backup
curl -X POST -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/admin/system-config \
  -d '{"action":"createBackup"}'

# View audit logs
curl -H "Authorization: Bearer $TOKEN" "http://localhost:3000/api/admin/audit?limit=50"
```

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
