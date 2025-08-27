#!/usr/bin/env node

/**
 * CA Initialization Script for Development
 * 
 * This script sets up a Certificate Authority for development purposes.
 * It creates a self-signed CA certificate and stores it in the database.
 * 
 * Usage:
 *   node scripts/init-ca.js
 *   npm run init:ca
 */

const { PrismaClient } = require('@prisma/client');
const { CAService } = require('../src/lib/ca');
const { Encryption } = require('../src/lib/crypto');
const bcrypt = require('bcryptjs');
require('dotenv/config');

const prisma = new PrismaClient();

async function initializeCA() {
  console.log('🔐 Initializing Certificate Authority for Development...\n');

  try {
    // Check if CA already exists
    const existingCA = await prisma.cAConfig.findFirst();
    if (existingCA) {
      console.log('⚠️  CA already exists in database:');
      console.log(`   - Status: ${existingCA.status}`);
      console.log(`   - Created: ${existingCA.createdAt}`);
      console.log(`   - Name: ${existingCA.name || 'Unnamed CA'}`);
      
      const shouldOverwrite = process.argv.includes('--force');
      if (!shouldOverwrite) {
        console.log('\n💡 To overwrite existing CA, run: npm run init:ca -- --force');
        return;
      }
      
      console.log('\n🔄 Overwriting existing CA...');
      await prisma.cAConfig.deleteMany();
      await prisma.certificate.deleteMany();
      await prisma.certificateRevocation.deleteMany();
      await prisma.auditLog.deleteMany();
    }

    // Generate CA key pair
    console.log('🔑 Generating CA key pair...');
    const { generateKeyPair } = require('../src/lib/crypto');
    const keyPair = generateKeyPair('RSA', 4096);
    
    // Create CA configuration
    console.log('📝 Creating CA configuration...');
    const caConfig = await prisma.cAConfig.create({
      data: {
        name: 'Development CA',
        status: 'INITIALIZED',
        keyAlgorithm: 'RSA',
        keySize: 4096,
        validityDays: 3650, // 10 years
        pathLenConstraint: 0,
        crlDistributionPointUrl: process.env.CRL_DISTRIBUTION_POINT_URL || 'http://localhost:3000/api/crl/latest',
        ocspUrl: process.env.OCSP_URL || 'http://localhost:3000/api/ocsp/binary',
        createdById: 'system',
      },
    });

    // Generate self-signed CA certificate
    console.log('📜 Generating self-signed CA certificate...');
    const { selfSignCSR } = require('../src/lib/crypto');
    
    // Create CSR for CA
    const { generateCSR } = require('../src/lib/crypto');
    const csr = generateCSR(
      {
        C: 'US',
        ST: 'California',
        L: 'San Francisco',
        O: 'Development Organization',
        OU: 'Development CA',
        CN: 'Development Root CA',
      },
      keyPair.privateKey,
      keyPair.publicKey
    );

    // Self-sign the CSR to create CA certificate
    const caCertificate = selfSignCSR(
      csr,
      keyPair.privateKey,
      3650, // 10 years
      {
        crlDistributionPointUrl: process.env.CRL_DISTRIBUTION_POINT_URL || 'http://localhost:3000/api/crl/latest',
        ocspUrl: process.env.OCSP_URL || 'http://localhost:3000/api/ocsp/binary',
      }
    );

    // Encrypt private key
    const encryptedPrivateKey = Encryption.encrypt(keyPair.privateKey);

    // Update CA configuration with certificate and encrypted private key
    console.log('💾 Storing CA certificate and private key...');
    await prisma.cAConfig.update({
      where: { id: caConfig.id },
      data: {
        certificate: caCertificate,
        privateKey: encryptedPrivateKey,
        status: 'ACTIVE',
        activatedAt: new Date(),
      },
    });

    // Create admin user if it doesn't exist
    console.log('👤 Creating admin user...');
    const adminUser = await prisma.user.upsert({
      where: { username: 'admin' },
      update: {},
      create: {
        username: 'admin',
        email: 'admin@dev.local',
        password: bcrypt.hashSync('admin123', 10),
        role: 'ADMIN',
        status: 'ACTIVE',
        name: 'Development Administrator',
      },
    });

    // Log the initialization
    await prisma.auditLog.create({
      data: {
        action: 'CA_INITIALIZED',
        userId: adminUser.id,
        description: 'Certificate Authority initialized for development',
        ipAddress: '127.0.0.1',
        userAgent: 'CA-Init-Script',
        metadata: JSON.stringify({
          caId: caConfig.id,
          keyAlgorithm: 'RSA',
          keySize: 4096,
          validityDays: 3650,
        }),
      },
    });

    console.log('\n✅ CA Initialization Complete!');
    console.log('\n📊 CA Details:');
    console.log(`   - ID: ${caConfig.id}`);
    console.log(`   - Name: ${caConfig.name}`);
    console.log(`   - Status: ACTIVE`);
    console.log(`   - Key Algorithm: RSA-4096`);
    console.log(`   - Validity: 10 years`);
    console.log(`   - CRL URL: ${caConfig.crlDistributionPointUrl}`);
    console.log(`   - OCSP URL: ${caConfig.ocspUrl}`);
    
    console.log('\n👤 Admin User:');
    console.log(`   - Username: admin`);
    console.log(`   - Password: admin123`);
    console.log(`   - Role: ADMIN`);
    
    console.log('\n🔗 Access URLs:');
    console.log(`   - CA Status: http://localhost:3000/ca/status`);
    console.log(`   - CA Setup: http://localhost:3000/ca/setup`);
    console.log(`   - Issue Certificate: http://localhost:3000/certificates/issue`);
    console.log(`   - Login: http://localhost:3000/auth/signin`);
    
    console.log('\n🚀 You can now:');
    console.log('   1. Start the application: npm run dev');
    console.log('   2. Login with admin/admin123');
    console.log('   3. Issue certificates using the CA');
    console.log('   4. Generate CRLs and handle OCSP requests');

  } catch (error) {
    console.error('\n❌ CA Initialization Failed:', error.message);
    console.error('\nStack trace:', error.stack);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the initialization
if (require.main === module) {
  initializeCA().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { initializeCA };