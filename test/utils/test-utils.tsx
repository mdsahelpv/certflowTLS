import React, { ReactElement } from 'react'
import { render, RenderOptions } from '@testing-library/react'
import { ThemeProvider } from 'next-themes'
import { SessionProvider } from 'next-auth/react'

// Mock session data
const mockSession = {
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
  status: 'authenticated' as const,
}

// Custom render function with providers
const AllTheProviders = ({ children }: { children: React.ReactNode }) => {
  return (
    <SessionProvider session={mockSession}>
      <ThemeProvider attribute="class" defaultTheme="light">
        {children}
      </ThemeProvider>
    </SessionProvider>
  )
}

const customRender = (
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>
) => render(ui, { wrapper: AllTheProviders, ...options })

// Re-export everything
export * from '@testing-library/react'

// Override render method
export { customRender as render }

// Test data factories
export const createMockUser = (overrides = {}) => ({
  id: 'test-user-id',
  username: 'testuser',
  email: 'test@example.com',
  name: 'Test User',
  role: 'ADMIN',
  status: 'ACTIVE',
  lastLogin: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
})

export const createMockCAConfig = (overrides = {}) => ({
  id: 'test-ca-id',
  name: 'Test CA',
  subjectDN: 'CN=Test CA,O=Test Org,C=US',
  privateKey: 'encrypted-private-key',
  certificate: 'test-certificate-pem',
  keyAlgorithm: 'RSA',
  keySize: 2048,
  status: 'ACTIVE',
  validFrom: new Date(),
  validTo: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
  crlNumber: 1,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
})

export const createMockCertificate = (overrides = {}) => ({
  id: 'test-cert-id',
  serialNumber: 'TEST123456789',
  subjectDN: 'CN=test.example.com,O=Test Org,C=US',
  issuerDN: 'CN=Test CA,O=Test Org,C=US',
  certificate: 'test-certificate-pem',
  type: 'SERVER',
  status: 'ACTIVE',
  keyAlgorithm: 'RSA',
  keySize: 2048,
  validFrom: new Date(),
  validTo: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
  sans: '["test.example.com"]',
  fingerprint: 'test-fingerprint',
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
})

// Mock API responses
export const mockApiResponse = (data: any, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => data,
  text: async () => JSON.stringify(data),
})

// Mock fetch responses
export const mockFetch = (responses: Record<string, any>) => {
  global.fetch = jest.fn((url: string) => {
    const path = new URL(url).pathname
    const response = responses[path] || responses['*'] || { error: 'Not found' }
    return Promise.resolve(mockApiResponse(response))
  }) as jest.MockedFunction<typeof fetch>
}

// Test database helpers
export const mockPrisma = {
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
  },
  certificate: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
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
}