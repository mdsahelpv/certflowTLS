import 'dotenv/config';
import { execSync } from 'child_process';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

async function globalSetup() {
  // 1. Set up the test database
  execSync('npx prisma db push --force-reset --schema=./prisma/schema.sqlite', {
    env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL! },
    stdio: 'inherit',
  });

  // 2. Create the admin user
  const prisma = new PrismaClient();
  const salt = bcrypt.genSaltSync(10);
  await prisma.user.create({
    data: {
      username: 'admin',
      passwordHash: bcrypt.hashSync('password', salt),
      role: 'ADMIN',
    },
  });

  await prisma.$disconnect();
}

export default globalSetup;
