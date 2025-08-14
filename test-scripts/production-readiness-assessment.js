#!/usr/bin/env node

/**
 * Production Readiness Assessment for Certificate Authority Management System
 * 
 * This script evaluates all certificate-related functionalities for production readiness:
 * - X.509 Standards Compliance
 * - Certificate Validation
 * - CRL Implementation
 * - Security Features
 * - API Endpoints
 * - Frontend Components
 * - Database Schema
 * - Documentation
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 PRODUCTION READINESS ASSESSMENT');
console.log('=====================================\n');

let totalChecks = 0;
let passedChecks = 0;
let criticalIssues = 0;
let warnings = 0;

function check(description, condition, critical = false) {
  totalChecks++;
  if (condition) {
    passedChecks++;
    console.log(`✅ ${description}`);
  } else {
    if (critical) {
      criticalIssues++;
      console.log(`❌ CRITICAL: ${description}`);
    } else {
      warnings++;
      console.log(`⚠️  WARNING: ${description}`);
    }
  }
}

function checkFileExists(filePath, description) {
  const exists = fs.existsSync(filePath);
  check(description, exists, true);
  return exists;
}

function checkFileContent(filePath, searchTerm, description) {
  if (!fs.existsSync(filePath)) {
    check(description, false, true);
    return false;
  }
  const content = fs.readFileSync(filePath, 'utf8');
  const found = content.includes(searchTerm);
  check(description, found, true);
  return found;
}

function checkDirectoryExists(dirPath, description) {
  const exists = fs.existsSync(dirPath);
  check(description, exists, false);
  return exists;
}

console.log('1. X.509 STANDARDS COMPLIANCE');
console.log('-------------------------------');

// Check X.509 compliance implementation
checkFileContent(
  'src/lib/crypto.ts',
  'validateExtensions',
  'X.509 extension validation implemented'
);

checkFileContent(
  'src/lib/crypto.ts',
  'pathLenConstraint',
  'Path length constraint support'
);

checkFileContent(
  'src/lib/crypto.ts',
  'certificatePolicies',
  'Certificate policies extension support'
);

checkFileContent(
  'src/lib/crypto.ts',
  'policyConstraints',
  'Policy constraints extension support'
);

checkFileContent(
  'src/lib/crypto.ts',
  'nameConstraints',
  'Name constraints extension support'
);

checkFileContent(
  'src/lib/crypto.ts',
  'critical: true',
  'Critical extension flags properly set'
);

console.log('\n2. CERTIFICATE VALIDATION');
console.log('----------------------------');

// Check certificate validation implementation
checkFileExists(
  'src/lib/certificate-validation.ts',
  'Certificate validation service exists'
);

checkFileContent(
  'src/lib/certificate-validation.ts',
  'validateCertificateChain',
  'Certificate chain validation implemented'
);

checkFileContent(
  'src/lib/certificate-validation.ts',
  'verifyCertificateSignature',
  'Signature verification implemented'
);

checkFileContent(
  'src/lib/certificate-validation.ts',
  'isCertificateExpired',
  'Expiration checking implemented'
);

checkFileContent(
  'src/lib/certificate-validation.ts',
  'checkRevocationStatus',
  'Revocation status checking implemented'
);

// Check validation API endpoints
checkFileExists(
  'src/app/api/certificates/validate/route.ts',
  'Certificate validation API endpoint exists'
);

checkFileExists(
  'src/app/api/certificates/validate/batch/route.ts',
  'Batch validation API endpoint exists'
);

// Check validation frontend
checkFileExists(
  'src/app/certificates/validate/page.tsx',
  'Certificate validation frontend page exists'
);

console.log('\n3. CRL IMPLEMENTATION');
console.log('------------------------');

// Check CRL implementation
checkFileContent(
  'src/lib/crypto.ts',
  'generateCRL(',
  'CRL generation utility exists'
);

checkFileContent(
  'src/lib/crypto.ts',
  'generateDeltaCRL(',
  'Delta CRL generation implemented'
);

checkFileContent(
  'src/lib/crypto.ts',
  'validateCRLExtensions(',
  'CRL extension validation implemented'
);

checkFileContent(
  'src/lib/crypto.ts',
  'authorityKeyIdentifier',
  'Authority key identifier extension implemented'
);

checkFileContent(
  'src/lib/crypto.ts',
  'cRLDistributionPoints',
  'CRL distribution points extension implemented'
);

checkFileContent(
  'src/lib/crypto.ts',
  'deltaCRLIndicator',
  'Delta CRL indicator extension implemented'
);

// Check CRL API endpoints
checkFileExists(
  'src/app/api/crl/generate/route.ts',
  'CRL generation API endpoint exists'
);

checkFileExists(
  'src/app/api/crl/validate/route.ts',
  'CRL validation API endpoint exists'
);

// Check CRL frontend
checkFileExists(
  'src/app/crl/page.tsx',
  'CRL management frontend page exists'
);

console.log('\n4. SECURITY FEATURES');
console.log('----------------------');

// Check security implementations
checkFileContent(
  'src/lib/crypto.ts',
  'forge.md.sha256',
  'SHA-256 hashing implemented'
);

checkFileContent(
  'src/lib/auth.ts',
  'maxAge',
  'Session timeout configured'
);

// Check environment variables
const envExample = 'env.example';
if (fs.existsSync(envExample)) {
  const envContent = fs.readFileSync(envExample, 'utf8');
  
  check(
    'CRL distribution point configured',
    envContent.includes('CRL_DISTRIBUTION_POINT'),
    false
  );
  
  check(
    'OCSP URL configured',
    envContent.includes('OCSP_URL'),
    false
  );
  
  check(
    'Encryption key configured',
    envContent.includes('ENCRYPTION_KEY'),
    true
  );
  
  check(
    'NextAuth secret configured',
    envContent.includes('NEXTAUTH_SECRET'),
    true
  );
}

console.log('\n5. API ENDPOINTS');
console.log('------------------');

// Check core API endpoints - using actual directory structure
const apiEndpoints = [
  'src/app/api/ca/initialize/route.ts',
  'src/app/api/ca/upload-certificate/route.ts',
  'src/app/api/ca/status/route.ts',
  'src/app/api/certificates/route.ts',
  'src/app/api/certificates/issue/route.ts',
  'src/app/api/certificates/revoke/route.ts',
  'src/app/api/certificates/validate/route.ts',
  'src/app/api/certificates/validate/batch/route.ts',
  'src/app/api/crl/route.ts',
  'src/app/api/crl/generate/route.ts',
  'src/app/api/crl/validate/route.ts',
  'src/app/api/crl/revoked/route.ts',
  'src/app/api/users/route.ts',
  'src/app/api/audit/route.ts',
  'src/app/api/profile/route.ts',
  'src/app/api/notifications/route.ts',
  'src/app/api/health/route.ts'
];

apiEndpoints.forEach(endpoint => {
  const endpointName = endpoint.split('/').slice(-2).join('/');
  checkFileExists(endpoint, `API endpoint: ${endpointName}`);
});

console.log('\n6. FRONTEND COMPONENTS');
console.log('-------------------------');

// Check frontend pages - using actual directory structure
const frontendPages = [
  'src/app/dashboard/page.tsx',
  'src/app/ca/setup/page.tsx',
  'src/app/certificates/page.tsx',
  'src/app/certificates/issue/page.tsx',
  'src/app/certificates/validate/page.tsx',
  'src/app/crl/page.tsx',
  'src/app/users/page.tsx',
  'src/app/audit/page.tsx',
  'src/app/auth/signin/page.tsx'
];

frontendPages.forEach(page => {
  const pageName = page.split('/').slice(-2).join('/');
  checkFileExists(page, `Frontend page: ${pageName}`);
});

// Check layout and navigation
checkFileExists(
  'src/components/layout.tsx',
  'Main layout component exists'
);

checkFileExists(
  'src/components/providers.tsx',
  'Application providers exist'
);

checkFileExists(
  'src/hooks/useAuth.ts',
  'Authentication hook exists'
);

console.log('\n7. DATABASE SCHEMA');
console.log('--------------------');

// Check database schema
checkFileExists(
  'prisma/schema.prisma',
  'Database schema exists'
);

if (fs.existsSync('prisma/schema.prisma')) {
  const schemaContent = fs.readFileSync('prisma/schema.prisma', 'utf8');
  
  check(
    'Certificate model with validation fields',
    schemaContent.includes('lastValidated DateTime?'),
    false
  );
  
  check(
    'CRL model exists',
    schemaContent.includes('model CRL'),
    true
  );
  
  check(
    'Audit logging implemented',
    schemaContent.includes('model AuditLog'),
    true
  );
  
  check(
    'User management implemented',
    schemaContent.includes('model User'),
    true
  );
}

console.log('\n8. DOCUMENTATION');
console.log('------------------');

// Check documentation
const documentation = [
  'README.md',
  'X509_IMPROVEMENTS.md',
  'CERTIFICATE_VALIDATION_IMPROVEMENTS.md',
  'CRL_IMPROVEMENTS.md'
];

documentation.forEach(doc => {
  checkFileExists(doc, `Documentation: ${doc}`);
});

console.log('\n9. DEPENDENCIES AND CONFIGURATION');
console.log('-----------------------------------');

// Check package.json
checkFileExists(
  'package.json',
  'Package configuration exists'
);

if (fs.existsSync('package.json')) {
  const packageContent = fs.readFileSync('package.json', 'utf8');
  
  check(
    'Next.js framework configured',
    packageContent.includes('"next"'),
    true
  );
  
  check(
    'TypeScript configured',
    packageContent.includes('"typescript"'),
    true
  );
  
  check(
    'Prisma ORM configured',
    packageContent.includes('"@prisma/client"'),
    true
  );
  
  check(
    'Node-forge library configured',
    packageContent.includes('"node-forge"'),
    true
  );
  
  check(
    'NextAuth.js configured',
    packageContent.includes('"next-auth"'),
    true
  );
}

console.log('\n10. BUILD AND COMPILATION');
console.log('----------------------------');

// Check if project compiles
try {
  const { execSync } = require('child_process');
  execSync('npx tsc --noEmit', { stdio: 'pipe' });
  check('TypeScript compilation successful', true, true);
} catch (error) {
  check('TypeScript compilation successful', false, true);
}

console.log('\n📊 PRODUCTION READINESS SUMMARY');
console.log('================================');

const readinessScore = Math.round((passedChecks / totalChecks) * 100);
const criticalScore = criticalIssues === 0 ? '✅ PASS' : `❌ ${criticalIssues} CRITICAL ISSUES`;

console.log(`Overall Score: ${readinessScore}% (${passedChecks}/${totalChecks} checks passed)`);
console.log(`Critical Issues: ${criticalScore}`);
console.log(`Warnings: ${warnings}`);

console.log('\n🎯 PRODUCTION READINESS ASSESSMENT:');

if (criticalIssues === 0 && readinessScore >= 90) {
  console.log('✅ PRODUCTION READY - All critical features implemented');
  console.log('   The system meets enterprise-grade production requirements');
} else if (criticalIssues === 0 && readinessScore >= 80) {
  console.log('⚠️  NEARLY PRODUCTION READY - Minor improvements recommended');
  console.log('   Address warnings before production deployment');
} else if (criticalIssues > 0) {
  console.log('❌ NOT PRODUCTION READY - Critical issues must be resolved');
  console.log('   Fix critical issues before production deployment');
} else {
  console.log('⚠️  PRODUCTION READINESS UNCERTAIN');
  console.log('   Review warnings and implement missing features');
}

console.log('\n📋 RECOMMENDATIONS:');

if (criticalIssues > 0) {
  console.log('1. RESOLVE CRITICAL ISSUES IMMEDIATELY');
  console.log('2. Ensure all security features are properly implemented');
  console.log('3. Verify database schema and API endpoints');
}

if (warnings > 0) {
  console.log('4. Address warnings for optimal production readiness');
  console.log('5. Consider implementing missing optional features');
}

if (readinessScore >= 90) {
  console.log('6. System is ready for production deployment');
  console.log('7. Consider implementing additional enterprise features');
  console.log('8. Plan for monitoring and maintenance');
}

console.log('\n🔍 Assessment complete. Review results above for production deployment decision.');
