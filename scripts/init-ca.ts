#!/usr/bin/env node

/**
 * CA Initialization Script for Development
 * 
 * This script sets up a Certificate Authority for development purposes.
 * It creates a self-signed CA certificate and stores it in the database.
 * 
 * Usage:
 *   npx tsx scripts/init-ca.js
 *   npm run init:ca
 */

import { PrismaClient } from '@prisma/client';
import { Encryption } from '../src/lib/crypto';
import bcrypt from 'bcryptjs';
import 'dotenv/config';

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
    const { CSRUtils, X509Utils } = await import('../src/lib/crypto');
    const keyPair = CSRUtils.generateKeyPair('RSA', 4096);
    
    // Create CA configuration
    console.log('📝 Creating CA configuration...');
    const caConfig = await prisma.cAConfig.create({
      data: {
        name: 'Development CA',
        status: 'INITIALIZING',
        keyAlgorithm: 'RSA',
        keySize: 4096,
        subjectDN: 'CN=Development Root CA,OU=Development CA,O=Development Organization,L=San Francisco,ST=California,C=US',
        privateKey: 'placeholder', // Will be updated with actual encrypted key
        crlDistributionPoint: process.env.CRL_DISTRIBUTION_POINT_URL || 'http://localhost:3000/api/crl/latest',
        ocspUrl: process.env.OCSP_URL || 'http://localhost:3000/api/ocsp/binary',
      },
    });

    // For now, just store the encrypted private key
    // Certificate generation will be handled by the CA setup UI
    console.log('💾 Storing encrypted private key...');
    const encryptedPrivateKey = Encryption.encrypt(keyPair.privateKey);
    
    // Update CA configuration with encrypted private key
    await prisma.cAConfig.update({
      where: { id: caConfig.id },
      data: {
        privateKey: JSON.stringify(encryptedPrivateKey),
        status: 'INITIALIZING', // Keep as INITIALIZING until certificate is generated
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
        action: 'CONFIG_UPDATED',
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
    console.log(`   - Status: INITIALIZING (Ready for certificate generation)`);
    console.log(`   - Key Algorithm: RSA-4096`);
    console.log(`   - Private Key: Encrypted and stored`);
    console.log(`   - CRL URL: ${caConfig.crlDistributionPoint}`);
    console.log(`   - OCSP URL: ${caConfig.ocspUrl}`);
    
    console.log('\n👤 Admin User:');
    console.log(`   - Username: admin`);
    console.log(`   - Password: admin123`);
    console.log(`   - Role: ADMIN`);
    
    console.log('\n🔗 Next Steps:');
    console.log(`   1. Start the application: npm run dev`);
    console.log(`   2. Login with admin/admin123`);
    console.log(`   3. Go to CA Setup: http://localhost:3000/ca/setup`);
    console.log(`   4. Generate the CA certificate using the UI`);
    console.log(`   5. Once certificate is generated, CA will be ACTIVE`);
    console.log(`   6. You can then issue certificates`);

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

export { initializeCA };