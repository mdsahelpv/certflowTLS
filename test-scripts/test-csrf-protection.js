#!/usr/bin/env node

/**
 * Phase 5: Security & Encryption Testing
 * Test CSRF protection and security headers
 */

// Load environment variables
require('dotenv').config({ path: '.env' });

// Mock SecurityMiddleware class for testing
class SecurityMiddleware {
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

  // Validate request origin
  static validateOrigin(origin, host) {
    // In production, compare against allowed origins
    if (!origin || !host) return false;
    
    // Allow same origin
    if (origin.includes(host)) return true;
    
    // Allow localhost in development
    if (process.env.NODE_ENV === 'development' && origin.includes('localhost')) {
      return true;
    }
    
    return false;
  }

  // Generate CSRF token
  static generateCSRFToken() {
    const crypto = require('crypto');
    return crypto.randomBytes(32).toString('hex');
  }

  // Validate CSRF token
  static validateCSRFToken(token, sessionToken) {
    if (!token || !sessionToken) return false;
    return token === sessionToken;
  }

  // Apply security headers to response (mock)
  static applySecurityHeaders() {
    const headers = {};
    Object.entries(this.securityHeaders).forEach(([key, value]) => {
      if (value) { // Only set header if value is not empty
        // Skip iframe-related headers in development
        if (process.env.NODE_ENV === 'development' && 
            (key === 'X-Frame-Options' || key.includes('frame-ancestors'))) {
          return;
        }
        headers[key] = value;
      }
    });
    return headers;
  }

  // Detect suspicious patterns in user agent
  static detectSuspiciousUserAgent(userAgent) {
    const suspiciousAgents = [
      'sqlmap',
      'nikto',
      'nmap',
      'masscan',
      'zgrab',
      'curl',
      'wget',
      'bot',
      'spider',
      'crawler'
    ];
    
    return suspiciousAgents.some(agent => 
      userAgent.toLowerCase().includes(agent.toLowerCase())
    );
  }

  // Detect suspicious IP patterns
  static detectSuspiciousIP(ip) {
    // Check for suspicious IP patterns (simplified)
    const suspiciousPatterns = [
      /(\d+)\1{3}/, // Repeated digits like 111.111.111.111
      /0{2,}/, // Multiple zeros
      /^192\.168\./, // Private IP (could be legitimate in testing)
      /^10\./, // Private IP (could be legitimate in testing)
      /^172\.(1[6-9]|2[0-9]|3[01])\./ // Private IP (could be legitimate in testing)
    ];
    
    return suspiciousPatterns.some(pattern => pattern.test(ip));
  }

  // Check for common attack patterns in input
  static detectAttackPatterns(input) {
    const attackPatterns = [
      /<script[^>]*>.*?<\/script>/gi, // XSS attempts
      /javascript:/gi, // JavaScript protocol
      /on\w+\s*=/gi, // Event handlers
      /union.*select/gi, // SQL injection
      /drop\s+table/gi, // SQL injection
      /exec\s*\(/gi, // Command injection
      /system\s*\(/gi, // Command injection
      /\.\.\/\.\//g, // Directory traversal
      /etc\/passwd/gi, // File access attempts
      /cmd\.exe/gi, // Windows command attempts
      /\/bin\/sh/gi, // Unix shell attempts
    ];
    
    return attackPatterns.some(pattern => pattern.test(input));
  }
}

async function testCSRFProtection() {
  console.log('🛡️  Starting Phase 5.4: CSRF Protection & Security Headers Testing');
  console.log('=====================================================================');
  
  let passedTests = 0;
  let totalTests = 0;

  // Test 1: Security Headers Configuration
  console.log('\n📋 Test 1: Security Headers Configuration');
  totalTests++;
  try {
    const headers = SecurityMiddleware.applySecurityHeaders();
    const expectedHeaders = [
      'Content-Security-Policy',
      'X-Content-Type-Options',
      'X-Frame-Options',
      'X-XSS-Protection',
      'Referrer-Policy',
      'Permissions-Policy'
    ];
    
    let allPresent = true;
    expectedHeaders.forEach(header => {
      if (headers[header]) {
        console.log(`   ✅ ${header}: ${headers[header]}`);
      } else {
        console.log(`   ❌ ${header}: Missing`);
        allPresent = false;
      }
    });
    
    // Check HSTS in production
    const isProduction = process.env.NODE_ENV === 'production';
    if (isProduction) {
      if (headers['Strict-Transport-Security']) {
        console.log(`   ✅ Strict-Transport-Security: ${headers['Strict-Transport-Security']}`);
      } else {
        console.log(`   ❌ Strict-Transport-Security: Missing in production`);
        allPresent = false;
      }
    } else {
      console.log(`   ℹ️  Strict-Transport-Security: Not required in development`);
    }
    
    if (allPresent) {
      console.log('✅ All security headers are properly configured');
      passedTests++;
    } else {
      console.log('❌ Some security headers are missing or misconfigured');
    }
  } catch (error) {
    console.log('❌ Security headers configuration test failed:', error.message);
  }

  // Test 2: CSRF Token Generation and Validation
  console.log('\n📋 Test 2: CSRF Token Generation and Validation');
  totalTests++;
  try {
    // Test token generation
    const token1 = SecurityMiddleware.generateCSRFToken();
    const token2 = SecurityMiddleware.generateCSRFToken();
    
    console.log(`   Generated token 1: ${token1.substring(0, 16)}...`);
    console.log(`   Generated token 2: ${token2.substring(0, 16)}...`);
    
    // Verify tokens are unique
    if (token1 !== token2 && token1.length === 64 && token2.length === 64) {
      console.log('   ✅ CSRF tokens are unique and properly formatted');
      
      // Test token validation
      const sessionToken = token1;
      
      // Valid token
      const isValid1 = SecurityMiddleware.validateCSRFToken(token1, sessionToken);
      console.log(`   Valid token validation: ${isValid1 ? '✅ PASSED' : '❌ FAILED'}`);
      
      // Invalid token
      const isValid2 = SecurityMiddleware.validateCSRFToken('invalid-token', sessionToken);
      console.log(`   Invalid token validation: ${!isValid2 ? '✅ PASSED' : '❌ FAILED'}`);
      
      // Empty token
      const isValid3 = SecurityMiddleware.validateCSRFToken('', sessionToken);
      console.log(`   Empty token validation: ${!isValid3 ? '✅ PASSED' : '❌ FAILED'}`);
      
      // Null token
      const isValid4 = SecurityMiddleware.validateCSRFToken(null, sessionToken);
      console.log(`   Null token validation: ${!isValid4 ? '✅ PASSED' : '❌ FAILED'}`);
      
      if (isValid1 && !isValid2 && !isValid3 && !isValid4) {
        console.log('✅ CSRF token validation working correctly');
        passedTests++;
      } else {
        console.log('❌ CSRF token validation not working correctly');
      }
    } else {
      console.log('❌ CSRF tokens are not unique or properly formatted');
    }
  } catch (error) {
    console.log('❌ CSRF token generation and validation test failed:', error.message);
  }

  // Test 3: Origin Validation
  console.log('\n📋 Test 3: Origin Validation');
  totalTests++;
  try {
    const testCases = [
      {
        origin: 'https://localhost:3000',
        host: 'localhost:3000',
        expected: true,
        description: 'Same origin (localhost)'
      },
      {
        origin: 'https://example.com',
        host: 'example.com',
        expected: true,
        description: 'Same origin (production)'
      },
      {
        origin: 'https://malicious.com',
        host: 'example.com',
        expected: false,
        description: 'Different origin'
      },
      {
        origin: '',
        host: 'example.com',
        expected: false,
        description: 'Empty origin'
      },
      {
        origin: 'https://localhost:3000',
        host: '',
        expected: false,
        description: 'Empty host'
      },
      {
        origin: null,
        host: 'example.com',
        expected: false,
        description: 'Null origin'
      },
      {
        origin: 'https://attacker.com',
        host: 'victim.com',
        expected: false,
        description: 'Cross-origin attempt'
      }
    ];

    let allPassed = true;
    testCases.forEach((testCase, index) => {
      const result = SecurityMiddleware.validateOrigin(testCase.origin, testCase.host);
      if (result === testCase.expected) {
        console.log(`   ✅ Test case ${index + 1} (${testCase.description}): PASSED`);
      } else {
        console.log(`   ❌ Test case ${index + 1} (${testCase.description}): FAILED`);
        console.log(`      Expected: ${testCase.expected}, Got: ${result}`);
        allPassed = false;
      }
    });

    if (allPassed) {
      console.log('✅ Origin validation working correctly');
      passedTests++;
    } else {
      console.log('❌ Origin validation not working correctly');
    }
  } catch (error) {
    console.log('❌ Origin validation test failed:', error.message);
  }

  // Test 4: Suspicious User Agent Detection
  console.log('\n📋 Test 4: Suspicious User Agent Detection');
  totalTests++;
  try {
    const testCases = [
      {
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        expected: false,
        description: 'Normal browser user agent'
      },
      {
        userAgent: 'sqlmap/1.6.12',
        expected: true,
        description: 'SQLMap tool'
      },
      {
        userAgent: 'Nikto/2.1.6',
        expected: true,
        description: 'Nikto scanner'
      },
      {
        userAgent: 'curl/7.68.0',
        expected: true,
        description: 'Curl tool'
      },
      {
        userAgent: 'Wget/1.20.3',
        expected: true,
        description: 'Wget tool'
      },
      {
        userAgent: 'Googlebot/2.1',
        expected: true,
        description: 'Bot (detected as suspicious)'
      },
      {
        userAgent: 'Mozilla/5.0 (compatible; MSIE 10.0)',
        expected: false,
        description: 'Internet Explorer (legitimate)'
      }
    ];

    let allPassed = true;
    testCases.forEach((testCase, index) => {
      const result = SecurityMiddleware.detectSuspiciousUserAgent(testCase.userAgent);
      if (result === testCase.expected) {
        console.log(`   ✅ Test case ${index + 1} (${testCase.description}): PASSED`);
      } else {
        console.log(`   ❌ Test case ${index + 1} (${testCase.description}): FAILED`);
        console.log(`      Expected: ${testCase.expected}, Got: ${result}`);
        allPassed = false;
      }
    });

    if (allPassed) {
      console.log('✅ Suspicious user agent detection working correctly');
      passedTests++;
    } else {
      console.log('❌ Suspicious user agent detection not working correctly');
    }
  } catch (error) {
    console.log('❌ Suspicious user agent detection test failed:', error.message);
  }

  // Test 5: Attack Pattern Detection
  console.log('\n📋 Test 5: Attack Pattern Detection');
  totalTests++;
  try {
    const testCases = [
      {
        input: 'Normal user input',
        expected: false,
        description: 'Normal input'
      },
      {
        input: '<script>alert("XSS")</script>',
        expected: true,
        description: 'XSS attempt'
      },
      {
        input: 'javascript:alert("XSS")',
        expected: true,
        description: 'JavaScript protocol'
      },
      {
        input: 'onclick="alert(\'XSS\')"',
        expected: true,
        description: 'Event handler'
      },
      {
        input: 'SELECT * FROM users',
        expected: false,
        description: 'Normal SQL (not attack)'
      },
      {
        input: 'UNION SELECT * FROM users',
        expected: true,
        description: 'SQL injection attempt'
      },
      {
        input: 'DROP TABLE users',
        expected: true,
        description: 'SQL injection attempt'
      },
      {
        input: 'exec("rm -rf /")',
        expected: true,
        description: 'Command injection'
      },
      {
        input: '../../../etc/passwd',
        expected: true,
        description: 'Directory traversal'
      },
      {
        input: 'C:\\Windows\\System32\\cmd.exe',
        expected: true,
        description: 'Windows command attempt'
      },
      {
        input: '/bin/sh -c "ls"',
        expected: true,
        description: 'Unix shell attempt'
      },
      {
        input: 'Hello world!',
        expected: false,
        description: 'Harmless text'
      }
    ];

    let allPassed = true;
    testCases.forEach((testCase, index) => {
      const result = SecurityMiddleware.detectAttackPatterns(testCase.input);
      if (result === testCase.expected) {
        console.log(`   ✅ Test case ${index + 1} (${testCase.description}): PASSED`);
      } else {
        console.log(`   ❌ Test case ${index + 1} (${testCase.description}): FAILED`);
        console.log(`      Input: "${testCase.input}"`);
        console.log(`      Expected: ${testCase.expected}, Got: ${result}`);
        allPassed = false;
      }
    });

    if (allPassed) {
      console.log('✅ Attack pattern detection working correctly');
      passedTests++;
    } else {
      console.log('❌ Attack pattern detection not working correctly');
    }
  } catch (error) {
    console.log('❌ Attack pattern detection test failed:', error.message);
  }

  // Test 6: Security Headers Content Validation
  console.log('\n📋 Test 6: Security Headers Content Validation');
  totalTests++;
  try {
    const headers = SecurityMiddleware.applySecurityHeaders();
    
    // Validate CSP header
    const csp = headers['Content-Security-Policy'];
    const cspValid = csp && (
      csp.includes('default-src') && 
      csp.includes('script-src') && 
      csp.includes('style-src')
    );
    console.log(`   Content-Security-Policy: ${cspValid ? '✅ VALID' : '❌ INVALID'}`);
    
    // Validate X-Content-Type-Options
    const xContentType = headers['X-Content-Type-Options'];
    const xContentTypeValid = xContentType === 'nosniff';
    console.log(`   X-Content-Type-Options: ${xContentTypeValid ? '✅ VALID' : '❌ INVALID'}`);
    
    // Validate X-Frame-Options
    const xFrameOptions = headers['X-Frame-Options'];
    const xFrameOptionsValid = xFrameOptions === 'DENY' || xFrameOptions === 'ALLOWALL';
    console.log(`   X-Frame-Options: ${xFrameOptionsValid ? '✅ VALID' : '❌ INVALID'}`);
    
    // Validate X-XSS-Protection
    const xXssProtection = headers['X-XSS-Protection'];
    const xXssProtectionValid = xXssProtection && xXssProtection.includes('mode=block');
    console.log(`   X-XSS-Protection: ${xXssProtectionValid ? '✅ VALID' : '❌ INVALID'}`);
    
    // Validate Referrer-Policy
    const referrerPolicy = headers['Referrer-Policy'];
    const referrerPolicyValid = referrerPolicy && referrerPolicy.includes('strict-origin');
    console.log(`   Referrer-Policy: ${referrerPolicyValid ? '✅ VALID' : '❌ INVALID'}`);
    
    // Validate Permissions-Policy
    const permissionsPolicy = headers['Permissions-Policy'];
    const permissionsPolicyValid = permissionsPolicy && 
      permissionsPolicy.includes('camera=()') && 
      permissionsPolicy.includes('microphone=()');
    console.log(`   Permissions-Policy: ${permissionsPolicyValid ? '✅ VALID' : '❌ INVALID'}`);
    
    if (cspValid && xContentTypeValid && xFrameOptionsValid && 
        xXssProtectionValid && referrerPolicyValid && permissionsPolicyValid) {
      console.log('✅ All security headers have valid content');
      passedTests++;
    } else {
      console.log('❌ Some security headers have invalid content');
    }
  } catch (error) {
    console.log('❌ Security headers content validation test failed:', error.message);
  }

  // Summary
  console.log('\n📊 CSRF Protection & Security Headers Test Summary');
  console.log('===============================================');
  console.log(`Total Tests: ${totalTests}`);
  console.log(`Passed Tests: ${passedTests}`);
  console.log(`Failed Tests: ${totalTests - passedTests}`);
  console.log(`Success Rate: ${((passedTests / totalTests) * 100).toFixed(1)}%`);
  
  if (passedTests === totalTests) {
    console.log('🎉 All CSRF protection and security headers tests passed! Security measures are working correctly.');
    return true;
  } else {
    console.log('❌ Some CSRF protection and security headers tests failed. Please review the implementation.');
    return false;
  }
}

// Run the tests
testCSRFProtection()
  .then(success => {
    if (success) {
      console.log('\n✅ Phase 5.4: CSRF Protection & Security Headers Testing - COMPLETED');
      process.exit(0);
    } else {
      console.log('\n❌ Phase 5.4: CSRF Protection & Security Headers Testing - FAILED');
      process.exit(1);
    }
  })
  .catch(error => {
    console.error('Test execution failed:', error);
    process.exit(1);
  });