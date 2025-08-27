import 'dotenv/config';
import { execSync } from 'child_process';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

async function globalSetup() {
  console.log('🚀 Setting up E2E test environment...');
  
  try {
    // 1. Set up the test database
    console.log('📊 Setting up test database...');
    execSync('npx prisma db push --force-reset --schema=./prisma/schema.sqlite', {
      env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL! },
      stdio: 'inherit',
    });

    // 2. Create test users with different roles
    console.log('👥 Creating test users...');
    const prisma = new PrismaClient();
    
    // Create admin user
    const adminPassword = bcrypt.hashSync('password', 10);
    await prisma.user.upsert({
      where: { username: 'admin' },
      update: { password: adminPassword },
      create: {
        username: 'admin',
        email: 'admin@test.com',
        password: adminPassword,
        role: 'ADMIN',
        status: 'ACTIVE',
        name: 'Test Admin',
      },
    });

    // Create operator user
    const operatorPassword = bcrypt.hashSync('password', 10);
    await prisma.user.upsert({
      where: { username: 'operator' },
      update: { password: operatorPassword },
      create: {
        username: 'operator',
        email: 'operator@test.com',
        password: operatorPassword,
        role: 'OPERATOR',
        status: 'ACTIVE',
        name: 'Test Operator',
      },
    });

    // Create viewer user
    const viewerPassword = bcrypt.hashSync('password', 10);
    await prisma.user.upsert({
      where: { username: 'viewer' },
      update: { password: viewerPassword },
      create: {
        username: 'viewer',
        email: 'viewer@test.com',
        password: viewerPassword,
        role: 'VIEWER',
        status: 'ACTIVE',
        name: 'Test Viewer',
      },
    });

    // Create inactive user
    const inactivePassword = bcrypt.hashSync('password', 10);
    await prisma.user.upsert({
      where: { username: 'inactive' },
      update: { password: inactivePassword },
      create: {
        username: 'inactive',
        email: 'inactive@test.com',
        password: inactivePassword,
        role: 'VIEWER',
        status: 'INACTIVE',
        name: 'Test Inactive User',
      },
    });

    await prisma.$disconnect();
    console.log('✅ E2E test environment setup complete!');
    
  } catch (error) {
    console.error('❌ Failed to setup E2E test environment:', error);
    throw error;
  }
}

export default globalSetup;
