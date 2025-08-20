import { AuthService } from '@/lib/auth'
import { mockPrisma } from '../utils/test-utils'
import bcrypt from 'bcryptjs'

// Mock bcrypt
jest.mock('bcryptjs')
const mockedBcrypt = bcrypt as jest.Mocked<typeof bcrypt>

describe('AuthService', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('hashPassword', () => {
    it('should hash password with correct rounds', async () => {
      const password = 'testpassword'
      const hashedPassword = 'hashedpassword123'
      
      mockedBcrypt.hash.mockResolvedValue(hashedPassword as never)
      
      const result = await AuthService.hashPassword(password)
      
      expect(mockedBcrypt.hash).toHaveBeenCalledWith(password, 12)
      expect(result).toBe(hashedPassword)
    })

    it('should use environment variable for bcrypt rounds', async () => {
      const originalRounds = process.env.BCRYPT_ROUNDS
      process.env.BCRYPT_ROUNDS = '14'
      
      const password = 'testpassword'
      mockedBcrypt.hash.mockResolvedValue('hashed' as never)
      
      await AuthService.hashPassword(password)
      
      expect(mockedBcrypt.hash).toHaveBeenCalledWith(password, 14)
      
      process.env.BCRYPT_ROUNDS = originalRounds
    })
  })

  describe('verifyPassword', () => {
    it('should verify password correctly', async () => {
      const password = 'testpassword'
      const hashedPassword = 'hashedpassword123'
      
      mockedBcrypt.compare.mockResolvedValue(true as never)
      
      const result = await AuthService.verifyPassword(password, hashedPassword)
      
      expect(mockedBcrypt.compare).toHaveBeenCalledWith(password, hashedPassword)
      expect(result).toBe(true)
    })

    it('should return false for invalid password', async () => {
      const password = 'wrongpassword'
      const hashedPassword = 'hashedpassword123'
      
      mockedBcrypt.compare.mockResolvedValue(false as never)
      
      const result = await AuthService.verifyPassword(password, hashedPassword)
      
      expect(result).toBe(false)
    })
  })

  describe('createUser', () => {
    it('should create user with hashed password', async () => {
      const userData = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'testpassword',
        name: 'Test User',
        role: 'ADMIN' as const,
      }
      
      const hashedPassword = 'hashedpassword123'
      mockedBcrypt.hash.mockResolvedValue(hashedPassword as never)
      
      const mockUser = {
        id: 'user-id',
        username: userData.username,
        email: userData.email,
        name: userData.name,
        role: userData.role,
        status: 'ACTIVE' as const,
        lastLogin: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }
      
      mockPrisma.user.create.mockResolvedValue(mockUser as any)
      mockPrisma.user.findUnique.mockResolvedValue(mockUser as any)
      
      const result = await AuthService.createUser(userData)
      
      expect(mockedBcrypt.hash).toHaveBeenCalledWith(userData.password, 12)
      expect(mockPrisma.user.create).toHaveBeenCalledWith({
        data: {
          ...userData,
          password: hashedPassword,
          role: 'ADMIN',
        },
      })
      expect(result).toBeDefined()
      expect(result.username).toBe(userData.username)
    })

    it('should create user with default role when not specified', async () => {
      const userData = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'testpassword',
      }
      
      mockedBcrypt.hash.mockResolvedValue('hashed' as never)
      
      const mockUser = {
        id: 'user-id',
        username: userData.username,
        email: userData.email,
        role: 'VIEWER' as const,
        status: 'ACTIVE' as const,
      }
      
      mockPrisma.user.create.mockResolvedValue(mockUser as any)
      mockPrisma.user.findUnique.mockResolvedValue(mockUser as any)
      
      await AuthService.createUser(userData)
      
      expect(mockPrisma.user.create).toHaveBeenCalledWith({
        data: {
          ...userData,
          password: 'hashed',
          role: 'VIEWER',
        },
      })
    })
  })

  describe('authenticateUser', () => {
    it('should authenticate valid user', async () => {
      const username = 'testuser'
      const password = 'testpassword'
      
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
      }
      
      mockPrisma.user.findUnique.mockResolvedValue(mockUser as any)
      mockedBcrypt.compare.mockResolvedValue(true as never)
      mockPrisma.user.update.mockResolvedValue(mockUser as any)
      
      const result = await AuthService.authenticateUser(username, password)
      
      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { username },
      })
      expect(mockedBcrypt.compare).toHaveBeenCalledWith(password, mockUser.password)
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: mockUser.id },
        data: { lastLogin: expect.any(Date) },
      })
      expect(result).toBeDefined()
      expect(result?.username).toBe(username)
    })

    it('should return null for non-existent user', async () => {
      const username = 'nonexistent'
      const password = 'testpassword'
      
      mockPrisma.user.findUnique.mockResolvedValue(null)
      
      const result = await AuthService.authenticateUser(username, password)
      
      expect(result).toBeNull()
      expect(mockedBcrypt.compare).not.toHaveBeenCalled()
    })

    it('should return null for inactive user', async () => {
      const username = 'testuser'
      const password = 'testpassword'
      
      const mockUser = {
        id: 'user-id',
        username,
        email: 'test@example.com',
        password: 'hashedpassword',
        role: 'ADMIN' as const,
        status: 'SUSPENDED' as const,
      }
      
      mockPrisma.user.findUnique.mockResolvedValue(mockUser as any)
      
      const result = await AuthService.authenticateUser(username, password)
      
      expect(result).toBeNull()
      expect(mockedBcrypt.compare).not.toHaveBeenCalled()
    })

    it('should return null for invalid password', async () => {
      const username = 'testuser'
      const password = 'wrongpassword'
      
      const mockUser = {
        id: 'user-id',
        username,
        email: 'test@example.com',
        password: 'hashedpassword',
        role: 'ADMIN' as const,
        status: 'ACTIVE' as const,
      }
      
      mockPrisma.user.findUnique.mockResolvedValue(mockUser as any)
      mockedBcrypt.compare.mockResolvedValue(false as never)
      
      const result = await AuthService.authenticateUser(username, password)
      
      expect(result).toBeNull()
      expect(mockPrisma.user.update).not.toHaveBeenCalled()
    })
  })

  describe('getPermissionsForRole', () => {
    it('should return correct permissions for ADMIN role', () => {
      const permissions = AuthService.getPermissionsForRole('ADMIN')
      
      expect(permissions).toContain('ca:manage')
      expect(permissions).toContain('certificate:issue')
      expect(permissions).toContain('user:manage')
      expect(permissions).toContain('audit:view')
    })

    it('should return correct permissions for OPERATOR role', () => {
      const permissions = AuthService.getPermissionsForRole('OPERATOR')
      
      expect(permissions).toContain('certificate:issue')
      expect(permissions).toContain('certificate:view')
      expect(permissions).not.toContain('ca:manage')
      expect(permissions).not.toContain('user:manage')
    })

    it('should return correct permissions for VIEWER role', () => {
      const permissions = AuthService.getPermissionsForRole('VIEWER')
      
      expect(permissions).toContain('certificate:view')
      expect(permissions).toContain('audit:view')
      expect(permissions).not.toContain('certificate:issue')
      expect(permissions).not.toContain('ca:manage')
    })
  })
})