// Mock the db module BEFORE importing AuthService
jest.mock('@/lib/db', () => ({
  __esModule: true,
  db: {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  },
}));

import { AuthService } from '@/lib/auth';
import { db } from '@/lib/db';
import bcrypt from 'bcryptjs';

jest.mock('bcryptjs');

const mockedDb = db as jest.Mocked<typeof db>;
const mockedBcrypt = bcrypt as jest.Mocked<typeof bcrypt>;

describe('AuthService', () => {
  beforeEach(() => {
    // Reset mocks before each test
    (mockedDb.user.create as jest.Mock).mockReset();
    (mockedDb.user.findUnique as jest.Mock).mockReset();
    (mockedDb.user.update as jest.Mock).mockReset();
    (mockedBcrypt.hash as jest.Mock).mockReset();
    (mockedBcrypt.compare as jest.Mock).mockReset();
  });

  describe('hashPassword', () => {
    it('should hash password with correct rounds', async () => {
      const password = 'testpassword';
      const hashedPassword = 'hashedpassword123';
      
      (mockedBcrypt.hash as jest.Mock).mockResolvedValue(hashedPassword);
      
      const result = await AuthService.hashPassword(password);
      
      expect(mockedBcrypt.hash).toHaveBeenCalledWith(password, 12);
      expect(result).toBe(hashedPassword);
    });

    it('should use environment variable for bcrypt rounds', async () => {
      const originalRounds = process.env.BCRYPT_ROUNDS;
      process.env.BCRYPT_ROUNDS = '14';
      
      const password = 'testpassword';
      (mockedBcrypt.hash as jest.Mock).mockResolvedValue('hashed');
      
      await AuthService.hashPassword(password);
      
      expect(mockedBcrypt.hash).toHaveBeenCalledWith(password, 14);
      
      process.env.BCRYPT_ROUNDS = originalRounds;
    });
  });

  describe('verifyPassword', () => {
    it('should verify password correctly', async () => {
      const password = 'testpassword';
      const hashedPassword = 'hashedpassword123';
      
      (mockedBcrypt.compare as jest.Mock).mockResolvedValue(true);
      
      const result = await AuthService.verifyPassword(password, hashedPassword);
      
      expect(mockedBcrypt.compare).toHaveBeenCalledWith(password, hashedPassword);
      expect(result).toBe(true);
    });

    it('should return false for invalid password', async () => {
      const password = 'wrongpassword';
      const hashedPassword = 'hashedpassword123';
      
      (mockedBcrypt.compare as jest.Mock).mockResolvedValue(false);
      
      const result = await AuthService.verifyPassword(password, hashedPassword);
      
      expect(result).toBe(false);
    });
  });

  describe('createUser', () => {
    it('should create user with hashed password', async () => {
      const userData = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'testpassword',
        name: 'Test User',
        role: 'ADMIN' as const,
      };
      
      const hashedPassword = 'hashedpassword123';
      (mockedBcrypt.hash as jest.Mock).mockResolvedValue(hashedPassword);
      
      const mockPrismaUser = {
        id: 'user-id',
        username: 'testuser',
        email: 'test@example.com',
        password: hashedPassword,
        name: 'Test User',
        role: 'ADMIN' as const,
        status: 'ACTIVE' as const,
        lastLogin: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      
      const expectedUserWithPermissions = {
        id: 'user-id',
        username: 'testuser',
        email: 'test@example.com',
        name: 'Test User',
        role: 'ADMIN' as const,
        status: 'ACTIVE' as const,
        permissions: AuthService.getPermissionsForRole('ADMIN'),
      };

      mockedDb.user.create.mockResolvedValue(mockPrismaUser);
      mockedDb.user.findUnique.mockResolvedValue(mockPrismaUser);
      
      const result = await AuthService.createUser(userData);
      
      expect(mockedBcrypt.hash).toHaveBeenCalledWith(userData.password, 12);
      expect(mockedDb.user.create).toHaveBeenCalledWith({
        data: {
          username: userData.username,
          password: hashedPassword,
          email: userData.email,
          name: userData.name,
          role: 'ADMIN',
        },
      });
      expect(result).toEqual(expectedUserWithPermissions);
    });

    it('should create user with default role when not specified', async () => {
      const userData = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'testpassword',
      };
      
      const hashedPassword = 'hashed';
      (mockedBcrypt.hash as jest.Mock).mockResolvedValue(hashedPassword);
      
      const mockPrismaUser = {
        id: 'user-id',
        username: 'testuser',
        email: 'test@example.com',
        password: hashedPassword,
        name: null,
        role: 'VIEWER' as const,
        status: 'ACTIVE' as const,
        lastLogin: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      
      const expectedUserWithPermissions = {
        id: 'user-id',
        username: 'testuser',
        email: 'test@example.com',
        name: undefined,
        role: 'VIEWER' as const,
        status: 'ACTIVE' as const,
        permissions: AuthService.getPermissionsForRole('VIEWER'),
      };

      mockedDb.user.create.mockResolvedValue(mockPrismaUser);
      mockedDb.user.findUnique.mockResolvedValue(mockPrismaUser);
      
      const result = await AuthService.createUser(userData);
      
      expect(mockedDb.user.create).toHaveBeenCalledWith({
        data: {
          username: userData.username,
          password: hashedPassword,
          email: userData.email,
          name: undefined,
          role: 'VIEWER',
        },
      });
      expect(result).toEqual(expectedUserWithPermissions);
    });
  });

  describe('authenticateUser', () => {
    it('should authenticate valid user', async () => {
      const username = 'testuser';
      const password = 'testpassword';
      
      const mockUser = {
        id: 'user-id',
        username,
        email: 'test@example.com',
        password: 'hashedpassword',
        role: 'ADMIN' as const,
        status: 'ACTIVE' as const,
        lastLogin: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        name: 'Test User',
        permissions: [],
      };
      
      const mockReturnedUser = {
        id: 'user-id',
        username: 'testuser',
        email: 'test@example.com',
        name: 'Test User',
        role: 'ADMIN' as const,
        status: 'ACTIVE' as const,
        permissions: AuthService.getPermissionsForRole('ADMIN'),
      };

      mockedDb.user.findUnique.mockResolvedValue(mockUser);
      (mockedBcrypt.compare as jest.Mock).mockResolvedValue(true);
      mockedDb.user.update.mockResolvedValue({ ...mockUser, lastLogin: new Date() });
      
      const result = await AuthService.authenticateUser(username, password);
      
      expect(mockedDb.user.findUnique).toHaveBeenCalledWith({
        where: { username },
      });
      expect(mockedBcrypt.compare).toHaveBeenCalledWith(password, mockUser.password);
      expect(mockedDb.user.update).toHaveBeenCalledWith({
        where: { id: mockUser.id },
        data: { lastLogin: expect.any(Date) },
      });
      expect(result).toEqual(mockReturnedUser);
    });

    it('should return null for non-existent user', async () => {
      const username = 'nonexistent';
      const password = 'testpassword';
      
      mockedDb.user.findUnique.mockResolvedValue(null);
      
      const result = await AuthService.authenticateUser(username, password);
      
      expect(result).toBeNull();
      expect(mockedBcrypt.compare).not.toHaveBeenCalled();
    });

    it('should return null for inactive user', async () => {
      const username = 'testuser';
      const password = 'testpassword';
      
      const mockUser = {
        id: 'user-id',
        username,
        status: 'INACTIVE' as const,
        // ... other properties
      };
      
      mockedDb.user.findUnique.mockResolvedValue(mockUser as any);
      
      const result = await AuthService.authenticateUser(username, password);
      
      expect(result).toBeNull();
      expect(mockedBcrypt.compare).not.toHaveBeenCalled();
    });

    it('should return null for invalid password', async () => {
      const username = 'testuser';
      const password = 'wrongpassword';
      
      const mockUser = {
        id: 'user-id',
        username,
        password: 'hashedpassword',
        status: 'ACTIVE' as const,
        // ... other properties
      };
      
      mockedDb.user.findUnique.mockResolvedValue(mockUser as any);
      (mockedBcrypt.compare as jest.Mock).mockResolvedValue(false);
      
      const result = await AuthService.authenticateUser(username, password);
      
      expect(result).toBeNull();
      expect(mockedDb.user.update).not.toHaveBeenCalled();
    });
  });

  describe('getPermissionsForRole', () => {
    it('should return correct permissions for ADMIN role', () => {
      const permissions = AuthService.getPermissionsForRole('ADMIN');
      expect(permissions).toEqual(expect.arrayContaining(['ca:manage', 'user:manage']));
    });

    it('should return correct permissions for OPERATOR role', () => {
      const permissions = AuthService.getPermissionsForRole('OPERATOR');
      expect(permissions).toEqual(expect.arrayContaining(['certificate:issue']));
      expect(permissions).not.toContain('user:manage');
    });

    it('should return correct permissions for VIEWER role', () => {
      const permissions = AuthService.getPermissionsForRole('VIEWER');
      expect(permissions).toEqual(expect.arrayContaining(['certificate:view']));
      expect(permissions).not.toContain('certificate:issue');
    });
  });
});
