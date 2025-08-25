import '@testing-library/jest-dom'
import { TextEncoder, TextDecoder } from 'util'

// Mock environment variables
process.env.NODE_ENV = 'test'
process.env.NEXTAUTH_SECRET = 'test-secret-key'
process.env.ENCRYPTION_KEY = 'test-32-character-encryption-key'
process.env.DATABASE_URL = 'file:./test.db'

// Mock Next.js router
const mockUseRouter = jest.fn(() => ({
  push: jest.fn(),
  replace: jest.fn(),
  prefetch: jest.fn(),
  back: jest.fn(),
  forward: jest.fn(),
  refresh: jest.fn(),
}));
const mockUseSearchParams = jest.fn(() => new URLSearchParams());
const mockUsePathname = jest.fn(() => '/');

jest.mock('next/navigation', () => ({
  useRouter: mockUseRouter,
  useSearchParams: mockUseSearchParams,
  usePathname: mockUsePathname,
}));

// Mock Next.js auth
const mockUseSession = jest.fn(() => ({
  data: {
    user: {
      id: 'test-user-id',
      username: 'testuser',
      email: 'test@example.com',
      role: 'ADMIN',
      permissions: ['ca:manage', 'certificate:issue', 'user:manage'],
    },
    expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  },
  status: 'authenticated',
}));

jest.mock('next-auth/react', () => ({
  useSession: mockUseSession,
  SessionProvider: ({ children }) => <>{children}</>,
  signIn: jest.fn(),
  signOut: jest.fn(),
}));

// Mock Prisma
jest.mock('@/lib/db', () => ({
  db: {
    user: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    cAConfig: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      findFirst: jest.fn(),
    },
    certificate: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      findFirst: jest.fn(),
    },
    certificateRevocation: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    cRL: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    auditLog: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    $transaction: jest.fn(),
    $disconnect: jest.fn(),
  },
}))

// Mock crypto functions
global.TextEncoder = TextEncoder
global.TextDecoder = TextDecoder as any

// Mock fetch
global.fetch = jest.fn()

// Mock console methods in tests
const originalConsoleError = console.error
const originalConsoleWarn = console.warn

beforeAll(() => {
  console.error = jest.fn()
  console.warn = jest.fn()
})

afterAll(() => {
  console.error = originalConsoleError
  console.warn = originalConsoleWarn
})

// Clean up after each test
afterEach(() => {
  jest.clearAllMocks()
})