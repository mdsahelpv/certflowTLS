const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function createAdmin() {
  try {
    const adminUsername = process.env.ADMIN_USERNAME || 'admin';
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
    const bcryptRounds = parseInt(process.env.BCRYPT_ROUNDS || '12', 10);

    const existing = await prisma.user.findUnique({
      where: { username: adminUsername },
    });
    if (existing) {
      console.log(`Admin user '${adminUsername}' already exists. Skipping creation.`);
      return;
    }

    const hashedPassword = await bcrypt.hash(adminPassword, bcryptRounds);
    
    const admin = await prisma.user.create({
      data: {
        username: adminUsername,
        email: 'admin@localhost',
        password: hashedPassword,
        name: 'Default Administrator',
        role: 'ADMIN',
        status: 'ACTIVE',
      },
    });
    
    console.log(`Admin user '${adminUsername}' created successfully.`);
  } catch (error) {
    console.error('Error creating admin user:', error);
  } finally {
    await prisma.$disconnect();
  }
}

createAdmin();