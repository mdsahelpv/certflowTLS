const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function testAuth() {
  try {
    // Test admin user
    const adminUser = await prisma.user.findUnique({
      where: { username: 'admin' },
    });
    
    if (adminUser) {
      const adminPasswordValid = await bcrypt.compare('admin123', adminUser.password);
      console.log('Admin user password validation:', adminPasswordValid);
    }
    
    // Test test user
    const testUser = await prisma.user.findUnique({
      where: { username: 'testuser' },
    });
    
    if (testUser) {
      const testPasswordValid = await bcrypt.compare('testpass123', testUser.password);
      console.log('Test user password validation:', testPasswordValid);
    }
    
    // List all users
    const allUsers = await prisma.user.findMany({
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        status: true,
        createdAt: true,
      },
    });
    
    console.log('All users in database:', allUsers);
    
  } catch (error) {
    console.error('Error testing auth:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testAuth();