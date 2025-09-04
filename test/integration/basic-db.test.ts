import { PrismaClient } from '@prisma/client';

describe('Basic Database Integration Tests', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    // Set test environment
    process.env.DATABASE_URL = 'file:./test.db';
    
    prisma = new PrismaClient({
      datasources: {
        db: {
          url: 'file:./test.db',
        },
      },
    });

    // Wait for Prisma to be ready
    await prisma.$connect();
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }
  });

  beforeEach(async () => {
    // Wait a bit for Prisma to be fully ready
    await new Promise(resolve => setTimeout(resolve, 100));

    // Clean up database before each test using transaction for atomicity
    try {
      await prisma.$transaction(async (tx) => {
        // Delete in reverse order of dependencies to avoid foreign key constraints
        await tx.certificateRevocation.deleteMany();
        await tx.certificate.deleteMany();
        await tx.cAConfig.deleteMany();
        await tx.auditLog.deleteMany();
        await tx.user.deleteMany();
      });
    } catch (error) {
      console.log('Database cleanup error:', (error as Error).message);
      // If transaction fails, try individual deletes
      try {
        await prisma.certificateRevocation.deleteMany();
        await prisma.certificate.deleteMany();
        await prisma.cAConfig.deleteMany();
        await prisma.auditLog.deleteMany();
        await prisma.user.deleteMany();
      } catch (individualError) {
        console.log('Individual cleanup also failed:', (individualError as Error).message);
      }
    }
  });

  test('should connect to test database', async () => {
    // Simple connection test
    expect(prisma).toBeDefined();
    
    // Try a simple query to verify connection
    const userCount = await prisma.user.count();
    expect(userCount).toBe(0); // Should be 0 after cleanup
  });

  test('should create and retrieve a user', async () => {
    const userData = {
      username: 'testuser',
      email: 'test@example.com',
      password: 'hashedpassword',
      role: 'OPERATOR' as const,
      status: 'ACTIVE' as const,
      name: 'Test User',
    };

    const user = await prisma.user.create({ data: userData });

    expect(user).toBeDefined();
    expect(user.username).toBe('testuser');
    expect(user.email).toBe('test@example.com');
    expect(user.role).toBe('OPERATOR');

    // Verify user can be retrieved
    const retrievedUser = await prisma.user.findUnique({
      where: { id: user.id },
    });

    expect(retrievedUser).toBeDefined();
    expect(retrievedUser?.username).toBe('testuser');
  });

  test('should enforce unique username constraint', async () => {
    const userData1 = {
      username: 'duplicate',
      email: 'user1@example.com',
      password: 'hash1',
      role: 'OPERATOR' as const,
      status: 'ACTIVE' as const,
      name: 'User 1',
    };

    const userData2 = {
      username: 'duplicate', // Same username
      email: 'user2@example.com',
      password: 'hash2',
      role: 'VIEWER' as const,
      status: 'ACTIVE' as const,
      name: 'User 2',
    };

    // Create first user
    await prisma.user.create({ data: userData1 });

    // Try to create second user with same username
    await expect(
      prisma.user.create({ data: userData2 })
    ).rejects.toThrow();
  });

  test('should enforce unique email constraint', async () => {
    const userData1 = {
      username: 'user1',
      email: 'duplicate@example.com',
      password: 'hash1',
      role: 'OPERATOR' as const,
      status: 'ACTIVE' as const,
      name: 'User 1',
    };

    const userData2 = {
      username: 'user2',
      email: 'duplicate@example.com', // Same email
      password: 'hash2',
      role: 'VIEWER' as const,
      status: 'ACTIVE' as const,
      name: 'User 2',
    };

    // Create first user
    await prisma.user.create({ data: userData1 });

    // Try to create second user with same email
    await expect(
      prisma.user.create({ data: userData2 })
    ).rejects.toThrow();
  });

  test('should update user information', async () => {
    const user = await prisma.user.create({
      data: {
        username: 'updateuser',
        email: 'update@example.com',
        password: 'hash',
        role: 'VIEWER' as const,
        status: 'ACTIVE' as const,
        name: 'Update User',
      },
    });

    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        role: 'OPERATOR',
        name: 'Updated User Name',
      },
    });

    expect(updatedUser.role).toBe('OPERATOR');
    expect(updatedUser.name).toBe('Updated User Name');
    expect(updatedUser.username).toBe('updateuser'); // Should remain unchanged
  });

  test('should delete user', async () => {
    const user = await prisma.user.create({
      data: {
        username: 'deleteuser',
        email: 'delete@example.com',
        password: 'hash',
        role: 'OPERATOR' as const,
        status: 'ACTIVE' as const,
        name: 'Delete User',
      },
    });

    await prisma.user.delete({ where: { id: user.id } });

    // Verify user is deleted
    const deletedUser = await prisma.user.findUnique({
      where: { id: user.id },
    });
    expect(deletedUser).toBeNull();
  });

  test('should count users correctly', async () => {
    // Create multiple users with unique emails
    const users = [
      { username: 'countuser1', email: 'count1@example.com', password: 'hash1', role: 'OPERATOR' as const, status: 'ACTIVE' as const, name: 'Count User 1' },
      { username: 'countuser2', email: 'count2@example.com', password: 'hash2', role: 'VIEWER' as const, status: 'ACTIVE' as const, name: 'Count User 2' },
      { username: 'countuser3', email: 'count3@example.com', password: 'hash3', role: 'ADMIN' as const, status: 'ACTIVE' as const, name: 'Count User 3' },
    ];

    await Promise.all(users.map(userData => prisma.user.create({ data: userData })));

    const userCount = await prisma.user.count();
    expect(userCount).toBe(3);

    const adminCount = await prisma.user.count({
      where: { role: 'ADMIN' },
    });
    expect(adminCount).toBe(1);
  });

  test('should find users by criteria', async () => {
    // Create users with different roles
    await prisma.user.create({
      data: {
        username: 'criteriaadmin',
        email: 'criteriaadmin@example.com',
        password: 'hash',
        role: 'ADMIN' as const,
        status: 'ACTIVE' as const,
        name: 'Criteria Admin',
      },
    });

    await prisma.user.create({
      data: {
        username: 'criteriaoperator',
        email: 'criteriaoperator@example.com',
        password: 'hash',
        role: 'OPERATOR' as const,
        status: 'ACTIVE' as const,
        name: 'Criteria Operator',
      },
    });

    // Find admin users
    const adminUsers = await prisma.user.findMany({
      where: { role: 'ADMIN' },
    });

    expect(adminUsers).toHaveLength(1);
    expect(adminUsers[0].username).toBe('criteriaadmin');

    // Find operator users
    const operatorUsers = await prisma.user.findMany({
      where: { role: 'OPERATOR' },
    });

    expect(operatorUsers).toHaveLength(1);
    expect(operatorUsers[0].username).toBe('criteriaoperator');
  });
});
