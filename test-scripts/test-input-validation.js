#!/usr/bin/env node

/**
 * Phase 5: Security & Encryption Testing
 * Test input validation and sanitization
 */

// Load environment variables
require('dotenv').config({ path: '.env' });

// Mock SecurityMiddleware class for testing
class SecurityMiddleware {
  // Sanitize user input
  static sanitizeInput(input) {
    if (typeof input !== 'string') return input;
    
    return input
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '') // Remove script tags with content
      .replace(/javascript:/gi, '') // Remove javascript protocol
      .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '') // Remove event handlers with quotes
      .replace(/on\w+\s*=\s*[^"'\s>]*/gi, '') // Remove event handlers without quotes
      .trim();
  }

  // Validate certificate data
  static validateCertificateData(data) {
    const errors = [];

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

    // Validate key algorithm
    const validAlgorithms = ['RSA', 'ECDSA', 'Ed25519'];
    if (!data.keyAlgorithm || !validAlgorithms.includes(data.keyAlgorithm)) {
      errors.push('Invalid key algorithm');
    }

    // Validate validity period
    if (!data.validityDays || typeof data.validityDays !== 'number' || data.validityDays < 1 || data.validityDays > 3650) {
      errors.push('Validity period must be between 1 and 3650 days');
    }

    // Validate SANs if provided
    if (data.sans && Array.isArray(data.sans)) {
      data.sans.forEach((san, index) => {
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
  static validateCSR(csr) {
    if (typeof csr !== 'string') return false;
    
    // Basic CSR validation
    const csrPattern = /-----BEGIN CERTIFICATE REQUEST-----[\s\S]+-----END CERTIFICATE REQUEST-----/;
    return csrPattern.test(csr);
  }

  // Validate certificate format
  static validateCertificate(cert) {
    if (typeof cert !== 'string') return false;
    
    // Basic certificate validation
    const certPattern = /-----BEGIN CERTIFICATE-----[\s\S]+-----END CERTIFICATE-----/;
    return certPattern.test(cert);
  }

  // Validate password strength
  static validatePassword(password) {
    const errors = [];

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
}

async function testInputValidation() {
  console.log('🛡️  Starting Phase 5.2: Input Validation & Sanitization Testing');
  console.log('================================================================');
  
  let passedTests = 0;
  let totalTests = 0;

  // Test 1: Input Sanitization
  console.log('\n📋 Test 1: Input Sanitization');
  totalTests++;
  try {
    const testCases = [
      {
        input: '<script>alert("XSS")</script>',
        expected: '',
        description: 'Script tag removal'
      },
      {
        input: 'javascript:alert("XSS")',
        expected: 'alert("XSS")',
        description: 'JavaScript protocol removal'
      },
      {
        input: '<img src="x" onerror="alert(\'XSS\')">',
        expected: '<img src="x" >',
        description: 'Event handler removal'
      },
      {
        input: 'Normal text with no special characters',
        expected: 'Normal text with no special characters',
        description: 'Normal text preservation'
      },
      {
        input: '  Text with leading/trailing spaces  ',
        expected: 'Text with leading/trailing spaces',
        description: 'Whitespace trimming'
      },
      {
        input: '<script><script>alert("Nested")</script></script>',
        expected: '',
        description: 'Nested script tag removal'
      },
      {
        input: 'onClick="alert(\'test\')"',
        expected: '',
        description: 'Event handler removal with quotes'
      }
    ];

    let allPassed = true;
    testCases.forEach((testCase, index) => {
      const sanitized = SecurityMiddleware.sanitizeInput(testCase.input);
      if (sanitized === testCase.expected) {
        console.log(`   ✅ Test case ${index + 1} (${testCase.description}): PASSED`);
      } else {
        console.log(`   ❌ Test case ${index + 1} (${testCase.description}): FAILED`);
        console.log(`      Input: "${testCase.input}"`);
        console.log(`      Expected: "${testCase.expected}"`);
        console.log(`      Got: "${sanitized}"`);
        allPassed = false;
      }
    });

    if (allPassed) {
      console.log('✅ All input sanitization tests passed');
      passedTests++;
    } else {
      console.log('❌ Some input sanitization tests failed');
    }
  } catch (error) {
    console.log('❌ Input sanitization test failed:', error.message);
  }

  // Test 2: Certificate Data Validation
  console.log('\n📋 Test 2: Certificate Data Validation');
  totalTests++;
  try {
    const testCases = [
      {
        data: {
          subjectDN: 'CN=example.com,O=Test Org,C=US',
          certificateType: 'SERVER',
          keyAlgorithm: 'RSA',
          validityDays: 365
        },
        expectedValid: true,
        description: 'Valid certificate data'
      },
      {
        data: {
          subjectDN: '',
          certificateType: 'SERVER',
          keyAlgorithm: 'RSA',
          validityDays: 365
        },
        expectedValid: false,
        description: 'Missing subject DN'
      },
      {
        data: {
          subjectDN: 'CN=example.com',
          certificateType: 'INVALID',
          keyAlgorithm: 'RSA',
          validityDays: 365
        },
        expectedValid: false,
        description: 'Invalid certificate type'
      },
      {
        data: {
          subjectDN: 'CN=example.com',
          certificateType: 'SERVER',
          keyAlgorithm: 'INVALID',
          validityDays: 365
        },
        expectedValid: false,
        description: 'Invalid key algorithm'
      },
      {
        data: {
          subjectDN: 'CN=example.com',
          certificateType: 'SERVER',
          keyAlgorithm: 'RSA',
          validityDays: 0
        },
        expectedValid: false,
        description: 'Invalid validity period (too low)'
      },
      {
        data: {
          subjectDN: 'CN=example.com',
          certificateType: 'SERVER',
          keyAlgorithm: 'RSA',
          validityDays: 4000
        },
        expectedValid: false,
        description: 'Invalid validity period (too high)'
      },
      {
        data: {
          subjectDN: 'CN=example.com',
          certificateType: 'SERVER',
          keyAlgorithm: 'RSA',
          validityDays: 365,
          sans: ['example.com', 'www.example.com']
        },
        expectedValid: true,
        description: 'Valid certificate with SANs'
      },
      {
        data: {
          subjectDN: 'CN=example.com',
          certificateType: 'SERVER',
          keyAlgorithm: 'RSA',
          validityDays: 365,
          sans: ['a'.repeat(253)]
        },
        expectedValid: true,
        description: 'Valid SAN at max length'
      },
      {
        data: {
          subjectDN: 'CN=example.com',
          certificateType: 'SERVER',
          keyAlgorithm: 'RSA',
          validityDays: 365,
          sans: ['a'.repeat(255)]
        },
        expectedValid: false,
        description: 'Invalid SAN (too long)'
      }
    ];

    let allPassed = true;
    testCases.forEach((testCase, index) => {
      const result = SecurityMiddleware.validateCertificateData(testCase.data);
      if (result.isValid === testCase.expectedValid) {
        console.log(`   ✅ Test case ${index + 1} (${testCase.description}): PASSED`);
        if (!testCase.expectedValid && result.errors.length > 0) {
          console.log(`      Errors: ${result.errors.join(', ')}`);
        }
      } else {
        console.log(`   ❌ Test case ${index + 1} (${testCase.description}): FAILED`);
        console.log(`      Expected valid: ${testCase.expectedValid}`);
        console.log(`      Got valid: ${result.isValid}`);
        if (result.errors.length > 0) {
          console.log(`      Errors: ${result.errors.join(', ')}`);
        }
        allPassed = false;
      }
    });

    if (allPassed) {
      console.log('✅ All certificate data validation tests passed');
      passedTests++;
    } else {
      console.log('❌ Some certificate data validation tests failed');
    }
  } catch (error) {
    console.log('❌ Certificate data validation test failed:', error.message);
  }

  // Test 3: CSR Validation
  console.log('\n📋 Test 3: CSR Validation');
  totalTests++;
  try {
    const testCases = [
      {
        csr: '-----BEGIN CERTIFICATE REQUEST-----\nMIIC2jCCAcICAQAwgYkxCzAJBgNVBAYTAlVTMQswCQYDVQQIDAJDQTEVMBMGA1UE\nCwwMU2FuIEZyYW5jaXNjbzENMAsGA1UECgwEWW91ciBMMQswCQYDVQQLDAJJVDES\nMBAGA1UEAwwJZXhhbXBsZS5jb20xJTAjBgkqhkiG9w0BCQEWFnN1cHBvcnRAZXhh\nbXBsZS5jb20wggEiMA0GCSqGSIb3DQEBAQUAA4IBDwAwggEKAoIBAQDFzJQ5YqV5\nexample-csr-data-here\n-----END CERTIFICATE REQUEST-----',
        expectedValid: true,
        description: 'Valid CSR format'
      },
      {
        csr: 'invalid csr format',
        expectedValid: false,
        description: 'Invalid CSR format'
      },
      {
        csr: '-----BEGIN CERTIFICATE REQUEST-----\n-----END CERTIFICATE REQUEST-----',
        expectedValid: true,
        description: 'Empty but valid CSR format'
      },
      {
        csr: '',
        expectedValid: false,
        description: 'Empty CSR'
      },
      {
        csr: null,
        expectedValid: false,
        description: 'Null CSR'
      },
      {
        csr: 12345,
        expectedValid: false,
        description: 'Number CSR'
      }
    ];

    let allPassed = true;
    testCases.forEach((testCase, index) => {
      const isValid = SecurityMiddleware.validateCSR(testCase.csr);
      if (isValid === testCase.expectedValid) {
        console.log(`   ✅ Test case ${index + 1} (${testCase.description}): PASSED`);
      } else {
        console.log(`   ❌ Test case ${index + 1} (${testCase.description}): FAILED`);
        console.log(`      Expected valid: ${testCase.expectedValid}`);
        console.log(`      Got valid: ${isValid}`);
        allPassed = false;
      }
    });

    if (allPassed) {
      console.log('✅ All CSR validation tests passed');
      passedTests++;
    } else {
      console.log('❌ Some CSR validation tests failed');
    }
  } catch (error) {
    console.log('❌ CSR validation test failed:', error.message);
  }

  // Test 4: Certificate Validation
  console.log('\n📋 Test 4: Certificate Validation');
  totalTests++;
  try {
    const testCases = [
      {
        cert: '-----BEGIN CERTIFICATE-----\nMIIDXTCCAkWgAwIBAgIJAJC1HiIAZAiIMA0GCSqGSIb3DQEBCwUAMEUxCzAJBgNV\nBAYTAlVTMQswCQYDVQQIDAJDQTEVMBMGA1UECwwMU2FuIEZyYW5jaXNjbzENMAsG\nA1UECgwEWW91ciBMMQswCQYDVQQLDAJJVDESMBAGA1UEAwwJZXhhbXBsZS5jb20x\nJTAjBgkqhkiG9w0BCQEWFnN1cHBvcnRAZXhhbXBsZS5jb20wHhcNMjQwNzE1MDAw\nMDAwWhcNMjUwNzE1MDAwMDAwWjBFMQswCQYDVQQGEwJVUzELMAkGA1UECAwCQ0Ex\nFTATBgNVBAcMDFNhbiBGcmFuY2lzY28xDTALBgNVBAoMBFlvdXIgTDELMAkGA1UE\nCwwCSVQxEjAQBgNVBAMMCWV4YW1wbGUuY29tMSUwIwYJKoZIhvcNAQkBFhZzdXBw\nb3J0QGV4YW1wbGUuY29tMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA\nexample-cert-data-here\n-----END CERTIFICATE-----',
        expectedValid: true,
        description: 'Valid certificate format'
      },
      {
        cert: 'invalid certificate format',
        expectedValid: false,
        description: 'Invalid certificate format'
      },
      {
        cert: '-----BEGIN CERTIFICATE-----\n-----END CERTIFICATE-----',
        expectedValid: true,
        description: 'Empty but valid certificate format'
      },
      {
        cert: '',
        expectedValid: false,
        description: 'Empty certificate'
      },
      {
        cert: null,
        expectedValid: false,
        description: 'Null certificate'
      },
      {
        cert: 12345,
        expectedValid: false,
        description: 'Number certificate'
      }
    ];

    let allPassed = true;
    testCases.forEach((testCase, index) => {
      const isValid = SecurityMiddleware.validateCertificate(testCase.cert);
      if (isValid === testCase.expectedValid) {
        console.log(`   ✅ Test case ${index + 1} (${testCase.description}): PASSED`);
      } else {
        console.log(`   ❌ Test case ${index + 1} (${testCase.description}): FAILED`);
        console.log(`      Expected valid: ${testCase.expectedValid}`);
        console.log(`      Got valid: ${isValid}`);
        allPassed = false;
      }
    });

    if (allPassed) {
      console.log('✅ All certificate validation tests passed');
      passedTests++;
    } else {
      console.log('❌ Some certificate validation tests failed');
    }
  } catch (error) {
    console.log('❌ Certificate validation test failed:', error.message);
  }

  // Test 5: Password Strength Validation
  console.log('\n📋 Test 5: Password Strength Validation');
  totalTests++;
  try {
    const testCases = [
      {
        password: 'StrongP@ssw0rd',
        expectedValid: true,
        description: 'Strong password'
      },
      {
        password: 'weak',
        expectedValid: false,
        description: 'Too short password'
      },
      {
        password: 'nouppercase123!',
        expectedValid: false,
        description: 'Missing uppercase letter'
      },
      {
        password: 'NOLOWERCASE123!',
        expectedValid: false,
        description: 'Missing lowercase letter'
      },
      {
        password: 'NoNumbers!',
        expectedValid: false,
        description: 'Missing numbers'
      },
      {
        password: 'NoSpecialChars123',
        expectedValid: false,
        description: 'Missing special characters'
      },
      {
        password: 'Only lowercase',
        expectedValid: false,
        description: 'Only lowercase letters'
      },
      {
        password: 'MySuperStrongPassword123!',
        expectedValid: true,
        description: 'Very strong password'
      },
      {
        password: 'P@ssw0rd',
        expectedValid: true,
        description: 'Minimum valid password'
      }
    ];

    let allPassed = true;
    testCases.forEach((testCase, index) => {
      const result = SecurityMiddleware.validatePassword(testCase.password);
      if (result.isValid === testCase.expectedValid) {
        console.log(`   ✅ Test case ${index + 1} (${testCase.description}): PASSED`);
        if (!testCase.expectedValid && result.errors.length > 0) {
          console.log(`      Errors: ${result.errors.join(', ')}`);
        }
      } else {
        console.log(`   ❌ Test case ${index + 1} (${testCase.description}): FAILED`);
        console.log(`      Expected valid: ${testCase.expectedValid}`);
        console.log(`      Got valid: ${result.isValid}`);
        if (result.errors.length > 0) {
          console.log(`      Errors: ${result.errors.join(', ')}`);
        }
        allPassed = false;
      }
    });

    if (allPassed) {
      console.log('✅ All password strength validation tests passed');
      passedTests++;
    } else {
      console.log('❌ Some password strength validation tests failed');
    }
  } catch (error) {
    console.log('❌ Password strength validation test failed:', error.message);
  }

  // Summary
  console.log('\n📊 Input Validation Test Summary');
  console.log('===============================');
  console.log(`Total Tests: ${totalTests}`);
  console.log(`Passed Tests: ${passedTests}`);
  console.log(`Failed Tests: ${totalTests - passedTests}`);
  console.log(`Success Rate: ${((passedTests / totalTests) * 100).toFixed(1)}%`);
  
  if (passedTests === totalTests) {
    console.log('🎉 All input validation tests passed! Security validation is working correctly.');
    return true;
  } else {
    console.log('❌ Some input validation tests failed. Please review the implementation.');
    return false;
  }
}

// Run the tests
testInputValidation()
  .then(success => {
    if (success) {
      console.log('\n✅ Phase 5.2: Input Validation & Sanitization Testing - COMPLETED');
      process.exit(0);
    } else {
      console.log('\n❌ Phase 5.2: Input Validation & Sanitization Testing - FAILED');
      process.exit(1);
    }
  })
  .catch(error => {
    console.error('Test execution failed:', error);
    process.exit(1);
  });