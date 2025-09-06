#!/usr/bin/env node

/**
 * Production Configuration Validation Script
 *
 * Validates all required environment variables and configuration
 * for production deployment of Certificate Authority Management System
 */

const fs = require('fs');
const path = require('path');

// Configuration requirements
const REQUIRED_ENV_VARS = [
  'DATABASE_URL',
  'NEXTAUTH_SECRET',
  'NEXTAUTH_URL',
  'NODE_ENV'
];

const RECOMMENDED_ENV_VARS = [
  'PASSWORD_MIN_LENGTH',
  'SESSION_TIMEOUT_MINUTES',
  'MFA_ENABLED',
  'HEALTH_CHECKS_ENABLED',
  'METRICS_ENABLED',
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_USER',
  'SMTP_PASS'
];

const SECURITY_CHECKS = [
  {
    name: 'NextAuth Secret Length',
    check: (config) => config.NEXTAUTH_SECRET && config.NEXTAUTH_SECRET.length >= 32,
    message: 'NEXTAUTH_SECRET should be at least 32 characters long'
  },
  {
    name: 'Database URL Format',
    check: (config) => {
      const dbUrl = config.DATABASE_URL;
      if (!dbUrl) return false;

      // Check for SQLite file path or database connection string
      return dbUrl.startsWith('file:') ||
             dbUrl.startsWith('postgresql:') ||
             dbUrl.startsWith('mysql:') ||
             dbUrl.startsWith('sqlite:');
    },
    message: 'DATABASE_URL should be a valid database connection string'
  },
  {
    name: 'HTTPS Enforcement',
    check: (config) => {
      const nextAuthUrl = config.NEXTAUTH_URL;
      return nextAuthUrl && nextAuthUrl.startsWith('https://');
    },
    message: 'NEXTAUTH_URL should use HTTPS in production'
  },
  {
    name: 'Password Policy',
    check: (config) => {
      const minLength = parseInt(config.PASSWORD_MIN_LENGTH || '8');
      return minLength >= 8;
    },
    message: 'Password minimum length should be at least 8 characters'
  }
];

class ConfigValidator {
  constructor() {
    this.errors = [];
    this.warnings = [];
    this.config = {};
  }

  loadConfig() {
    console.log('🔍 Loading configuration...\n');

    // Load from .env files
    const envFiles = ['.env.production', '.env.local', '.env'];

    for (const envFile of envFiles) {
      const envPath = path.join(process.cwd(), envFile);
      if (fs.existsSync(envPath)) {
        console.log(`📄 Loading ${envFile}...`);
        const envContent = fs.readFileSync(envPath, 'utf8');
        const envVars = this.parseEnvFile(envContent);
        Object.assign(this.config, envVars);
        break; // Use first available env file
      }
    }

    // Override with actual environment variables
    Object.assign(this.config, process.env);
  }

  parseEnvFile(content) {
    const vars = {};
    const lines = content.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, ...valueParts] = trimmed.split('=');
        if (key && valueParts.length > 0) {
          vars[key.trim()] = valueParts.join('=').trim();
        }
      }
    }

    return vars;
  }

  validateRequiredVars() {
    console.log('✅ Checking required environment variables...\n');

    for (const varName of REQUIRED_ENV_VARS) {
      if (!this.config[varName]) {
        this.errors.push(`❌ Missing required environment variable: ${varName}`);
      } else {
        console.log(`✅ ${varName}: ${this.maskSensitive(varName, this.config[varName])}`);
      }
    }
  }

  validateRecommendedVars() {
    console.log('\n📋 Checking recommended environment variables...\n');

    for (const varName of RECOMMENDED_ENV_VARS) {
      if (!this.config[varName]) {
        this.warnings.push(`⚠️  Missing recommended environment variable: ${varName}`);
      } else {
        console.log(`✅ ${varName}: ${this.maskSensitive(varName, this.config[varName])}`);
      }
    }
  }

  runSecurityChecks() {
    console.log('\n🔒 Running security checks...\n');

    for (const check of SECURITY_CHECKS) {
      const passed = check.check(this.config);
      if (passed) {
        console.log(`✅ ${check.name}: PASSED`);
      } else {
        this.errors.push(`❌ ${check.name}: ${check.message}`);
      }
    }
  }

  maskSensitive(key, value) {
    const sensitiveKeys = ['SECRET', 'PASSWORD', 'TOKEN', 'KEY', 'PASS'];
    const isSensitive = sensitiveKeys.some(sensitive => key.toUpperCase().includes(sensitive));

    if (isSensitive && value.length > 8) {
      return value.substring(0, 4) + '****' + value.substring(value.length - 4);
    }

    return value;
  }

  checkDatabaseConnectivity() {
    console.log('\n🗄️  Checking database connectivity...\n');

    const dbUrl = this.config.DATABASE_URL;
    if (!dbUrl) {
      this.errors.push('❌ Cannot check database connectivity: DATABASE_URL not set');
      return;
    }

    // For SQLite, check if file exists
    if (dbUrl.startsWith('file:')) {
      const dbPath = dbUrl.replace('file:', '');
      const fullPath = path.isAbsolute(dbPath) ? dbPath : path.join(process.cwd(), dbPath);

      if (fs.existsSync(fullPath)) {
        console.log('✅ SQLite database file exists');
      } else {
        console.log('⚠️  SQLite database file does not exist (will be created on first run)');
      }
    } else {
      console.log('✅ Database URL format appears valid');
      console.log('ℹ️  Full connectivity test requires database server to be running');
    }
  }

  checkFilePermissions() {
    console.log('\n📁 Checking file permissions...\n');

    const criticalPaths = [
      'prisma/db',
      'logs',
      'backups',
      'public'
    ];

    for (const dirPath of criticalPaths) {
      const fullPath = path.join(process.cwd(), dirPath);
      try {
        if (fs.existsSync(fullPath)) {
          // Check if directory is writable
          fs.accessSync(fullPath, fs.constants.W_OK);
          console.log(`✅ ${dirPath}: Writable`);
        } else {
          console.log(`⚠️  ${dirPath}: Directory does not exist`);
        }
      } catch (error) {
        this.errors.push(`❌ ${dirPath}: Permission denied - ${error.message}`);
      }
    }
  }

  generateReport() {
    console.log('\n' + '='.repeat(60));
    console.log('📊 CONFIGURATION VALIDATION REPORT');
    console.log('='.repeat(60));

    if (this.errors.length === 0) {
      console.log('\n🎉 SUCCESS: All critical checks passed!');
    } else {
      console.log(`\n❌ FAILURE: ${this.errors.length} critical issues found`);
      console.log('\nCritical Issues:');
      this.errors.forEach(error => console.log(`   ${error}`));
    }

    if (this.warnings.length > 0) {
      console.log(`\n⚠️  WARNINGS: ${this.warnings.length} recommendations`);
      console.log('\nRecommendations:');
      this.warnings.forEach(warning => console.log(`   ${warning}`));
    }

    console.log('\n' + '='.repeat(60));

    return this.errors.length === 0;
  }

  run() {
    console.log('🚀 Certificate Authority Management System');
    console.log('🔧 Production Configuration Validator\n');

    this.loadConfig();
    this.validateRequiredVars();
    this.validateRecommendedVars();
    this.runSecurityChecks();
    this.checkDatabaseConnectivity();
    this.checkFilePermissions();

    const success = this.generateReport();

    if (!success) {
      console.log('\n💡 Fix the critical issues above before deploying to production.');
      process.exit(1);
    } else {
      console.log('\n✅ Configuration validation successful!');
      console.log('🚀 Ready for production deployment.');
    }
  }
}

// Run validation if called directly
if (require.main === module) {
  const validator = new ConfigValidator();
  validator.run();
}

module.exports = ConfigValidator;
