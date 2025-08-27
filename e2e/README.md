# E2E Testing Strategy for Certificate Authority Management System

## Overview

This directory contains comprehensive End-to-End (E2E) tests for the Certificate Authority Management System. These tests simulate real user interactions and validate the complete application workflow from a user's perspective.

## Testing Philosophy

Our E2E testing strategy follows these principles:

1. **Real User Scenarios**: Tests simulate actual user workflows and interactions
2. **Comprehensive Coverage**: Cover all major application features and user journeys
3. **Cross-Browser Testing**: Ensure compatibility across different browsers
4. **Performance & Security**: Validate performance characteristics and security measures
5. **Maintainable Tests**: Well-structured, readable tests that are easy to maintain

## Test Suites

### 1. Authentication Flow (`auth-flow.spec.ts`)
Tests the complete authentication workflow including:
- Login/logout functionality
- Form validation
- Error handling
- Session management
- Role-based access control
- Security features (rate limiting, session expiration)

**Key Test Scenarios:**
- Successful authentication with valid credentials
- Failed authentication with invalid credentials
- Empty form submission handling
- Session persistence across navigation
- Authentication enforcement on protected routes

### 2. Dashboard & Navigation (`dashboard-navigation.spec.ts`)
Tests the main application interface including:
- Dashboard display and functionality
- Navigation between sections
- User interface elements
- Responsive design
- Page titles and breadcrumbs
- Error handling

**Key Test Scenarios:**
- Dashboard information display
- Navigation menu functionality
- User profile and logout options
- Mobile responsive behavior
- Page refresh handling
- Error page display

### 3. Certificate Management (`certificate-management.spec.ts`)
Tests the core certificate lifecycle including:
- Certificate issuance
- Certificate validation
- Certificate revocation
- Certificate listing and search
- Form validation
- Error handling

**Key Test Scenarios:**
- Certificate issuance workflow
- Form field validation
- Certificate details display
- Certificate revocation process
- Search and filtering functionality
- Export capabilities
- Bulk operations

### 4. CA Management (`ca-management.spec.ts`)
Tests Certificate Authority management including:
- CA setup and configuration
- CA status monitoring
- CRL management
- OCSP responder
- Backup and restore
- Health monitoring

**Key Test Scenarios:**
- CA status display
- CA setup forms
- Key pair generation
- CSR creation
- Certificate upload
- Configuration management
- CRL download
- Health monitoring

### 5. Performance & Security (`performance-security.spec.ts`)
Tests application security and performance including:
- Security headers
- Rate limiting
- XSS protection
- SQL injection prevention
- CSRF protection
- Session security
- Performance characteristics

**Key Test Scenarios:**
- Security header validation
- Rate limiting enforcement
- XSS attack prevention
- SQL injection handling
- CSRF token validation
- Session hijacking prevention
- Directory traversal protection
- Memory leak detection

### 6. Certificate Lifecycle (`certificate-lifecycle.spec.ts`)
Tests the complete certificate lifecycle including:
- CA setup
- Certificate issuance
- Certificate validation
- Certificate revocation
- CRL verification

**Key Test Scenarios:**
- End-to-end certificate workflow
- CA initialization
- Certificate generation
- Certificate validation
- Revocation process
- CRL verification

## Test Environment Setup

### Prerequisites
- Node.js 18+ and npm
- Playwright installed (`npx playwright install`)
- Application dependencies installed (`npm install`)

### Environment Variables
```bash
NODE_ENV=test
DATABASE_URL="file:./test.db"
NEXTAUTH_SECRET="test-secret-key"
ENCRYPTION_KEY="test-32-character-encryption-key"
```

### Test Database
The E2E tests use a separate SQLite test database that is automatically created and populated with test data during the global setup phase.

### Test Users
The global setup creates several test users with different roles:
- **admin**: Full administrative access
- **operator**: Certificate management access
- **viewer**: Read-only access
- **inactive**: Inactive user account

All test users have the password: `password`

## Running Tests

### Using the Test Runner Script (Recommended)

```bash
# Make script executable (first time only)
chmod +x scripts/run-e2e-tests.sh

# Run all tests
./scripts/run-e2e-tests.sh all

# Run specific test suite
./scripts/run-e2e-tests.sh auth
./scripts/run-e2e-tests.sh dashboard
./scripts/run-e2e-tests.sh certificates
./scripts/run-e2e-tests.sh ca
./scripts/run-e2e-tests.sh security

# Run with specific browser
./scripts/run-e2e-tests.sh browser chromium
./scripts/run-e2e-tests.sh browser firefox
./scripts/run-e2e-tests.sh browser webkit

# Run in headed mode (for debugging)
./scripts/run-e2e-tests.sh headed

# Run with video recording
./scripts/run-e2e-tests.sh video

# Run with trace recording
./scripts/run-e2e-tests.sh trace

# Setup test environment only
./scripts/run-e2e-tests.sh setup

# Clean up test artifacts
./scripts/run-e2e-tests.sh cleanup

# Show test summary
./scripts/run-e2e-tests.sh summary

# Show help
./scripts/run-e2e-tests.sh help
```

### Using Playwright Directly

```bash
# Run all tests
npx playwright test

# Run specific test file
npx playwright test auth-flow.spec.ts

# Run tests in headed mode
npx playwright test --headed

# Run tests with video recording
npx playwright test --video=on

# Run tests with trace recording
npx playwright test --trace=on

# Run tests with specific browser
npx playwright test --project=chromium

# Run tests in debug mode
npx playwright test --debug
```

## Test Reports

Test reports are automatically generated in HTML format and saved to the `test-reports/` directory. Each test run creates a timestamped report file.

### Viewing Reports
1. Navigate to the `test-reports/` directory
2. Open the HTML report file in your browser
3. Review test results, screenshots, and traces

### Report Features
- Test execution summary
- Pass/fail status for each test
- Screenshots of failed tests
- Video recordings (if enabled)
- Trace files (if enabled)
- Performance metrics
- Error details and stack traces

## Test Configuration

### Playwright Configuration (`playwright.config.ts`)
- **Test Directory**: `./e2e`
- **Global Setup**: `./e2e/global-setup.ts`
- **Base URL**: `http://localhost:3000`
- **Web Server**: Automatically starts `npm run dev`
- **Browser**: Chromium (configurable)
- **Parallel Execution**: Enabled
- **Retries**: 2 in CI, 0 in development

### Global Setup (`global-setup.ts`)
- Creates test database
- Populates test data
- Sets up test users
- Configures test environment

## Test Data Management

### Test Database
- Uses SQLite for fast test execution
- Automatically reset before each test run
- Populated with consistent test data
- Isolated from development/production data

### Test Users
- Pre-created users with known credentials
- Different roles for testing access control
- Consistent state across test runs

## Best Practices

### Writing Tests
1. **Use descriptive test names** that explain the scenario
2. **Follow the Arrange-Act-Assert pattern**
3. **Test one thing at a time**
4. **Use page object patterns for complex interactions**
5. **Handle async operations properly**
6. **Clean up test data when necessary**

### Test Maintenance
1. **Keep tests independent** - each test should be able to run in isolation
2. **Use beforeEach/afterEach** for common setup/cleanup
3. **Avoid hardcoded values** - use constants or configuration
4. **Handle flaky tests** - add appropriate waits and retries
5. **Update tests when UI changes**

### Debugging Tests
1. **Use headed mode** (`--headed`) to see what's happening
2. **Enable video recording** (`--video=on`) to review test execution
3. **Use trace recording** (`--trace=on`) for detailed debugging
4. **Add console.log statements** for debugging
5. **Use Playwright Inspector** (`--debug`) for step-by-step execution

## Continuous Integration

### CI Configuration
The E2E tests are configured to run in CI environments with:
- Automatic browser installation
- Parallel test execution
- Retry logic for flaky tests
- HTML report generation
- Test artifact preservation

### CI Commands
```bash
# Install Playwright browsers
npx playwright install --with-deps

# Run tests in CI mode
npx playwright test --reporter=html
```

## Troubleshooting

### Common Issues

1. **Tests failing due to timing**
   - Add appropriate waits using `page.waitForSelector()` or `page.waitForTimeout()`
   - Use `page.waitForResponse()` for API calls
   - Ensure elements are visible before interacting

2. **Database connection issues**
   - Verify `DATABASE_URL` is set correctly
   - Ensure Prisma schema is up to date
   - Check database file permissions

3. **Browser compatibility issues**
   - Test with different browsers using `--project` flag
   - Check browser-specific selectors
   - Verify CSS compatibility

4. **Test environment setup failures**
   - Run `./scripts/run-e2e-tests.sh setup` to verify setup
   - Check Node.js and npm versions
   - Verify all dependencies are installed

### Debug Mode
```bash
# Run tests in debug mode
npx playwright test --debug

# This opens Playwright Inspector for step-by-step debugging
```

## Performance Testing

### Load Testing
While not included in the current E2E tests, the framework supports:
- Concurrent user simulation
- Performance metrics collection
- Resource usage monitoring
- Response time validation

### Performance Assertions
Tests can include performance assertions:
```typescript
// Example: Assert page load time
const startTime = Date.now();
await page.goto('/dashboard');
const loadTime = Date.now() - startTime;
expect(loadTime).toBeLessThan(3000); // Should load in under 3 seconds
```

## Security Testing

### Security Validations
The E2E tests include security validations:
- XSS prevention
- SQL injection protection
- CSRF token validation
- Security header verification
- Session security testing

### Penetration Testing Support
The framework can be extended for:
- Automated penetration testing
- Security vulnerability scanning
- Compliance validation
- Security audit reporting

## Future Enhancements

### Planned Features
1. **Visual Regression Testing** - Compare screenshots across versions
2. **Accessibility Testing** - Validate WCAG compliance
3. **Internationalization Testing** - Test multiple languages
4. **Mobile Testing** - Comprehensive mobile device testing
5. **API Testing** - Direct API endpoint validation
6. **Performance Benchmarking** - Automated performance regression testing

### Integration Opportunities
1. **Monitoring Integration** - Connect with application monitoring
2. **Alerting** - Automatic notifications for test failures
3. **Metrics Collection** - Test execution metrics and trends
4. **Reporting Integration** - Connect with business intelligence tools

## Support and Maintenance

### Getting Help
- Review test logs and reports
- Check Playwright documentation
- Review test code examples
- Consult team members

### Contributing
1. Follow existing test patterns
2. Add appropriate documentation
3. Ensure tests are maintainable
4. Update this README when adding new features

---

**Last Updated**: August 2024  
**Version**: 1.0.0  
**Maintainer**: Development Team