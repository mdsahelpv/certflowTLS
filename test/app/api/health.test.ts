/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server'
import { GET } from '@/app/api/health/route'
import { SystemInitializer } from '@/lib/init'

jest.mock('@/lib/init', () => ({
  SystemInitializer: {
    healthCheck: jest.fn().mockResolvedValue({
      status: 'healthy',
      checks: {
        database: true,
        auth: true,
        notifications: true,
      },
      timestamp: new Date().toISOString(),
      uptime: 123,
      version: '1.0.0-test',
      environment: 'test',
    }),
  },
}))

describe('Health API Endpoint', () => {
  let mockRequest: NextRequest

  beforeEach(() => {
    mockRequest = new NextRequest('http://localhost:3000/api/health')
    ;(SystemInitializer.healthCheck as jest.Mock).mockClear()
  })

  it('should return 200 status with health information', async () => {
    const response = await GET(mockRequest)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data).toHaveProperty('status')
    expect(data).toHaveProperty('timestamp')
    expect(data).toHaveProperty('uptime')
    expect(data).toHaveProperty('version')
    expect(data).toHaveProperty('environment')
  })

  it('should return healthy status', async () => {
    const response = await GET(mockRequest)
    const data = await response.json()

    expect(data.status).toBe('healthy')
  })

  it('should include timestamp in response', async () => {
    const response = await GET(mockRequest)
    const data = await response.json()

    expect(data.timestamp).toBeDefined()
    expect(new Date(data.timestamp)).toBeInstanceOf(Date)
  })

  it('should include uptime information', async () => {
    const response = await GET(mockRequest)
    const data = await response.json()

    expect(data.uptime).toBeDefined()
    expect(typeof data.uptime).toBe('number')
    expect(data.uptime).toBeGreaterThan(0)
  })

  it('should include version information', async () => {
    const response = await GET(mockRequest)
    const data = await response.json()

    expect(data.version).toBeDefined()
    expect(typeof data.version).toBe('string')
  })

  it('should include environment information', async () => {
    const response = await GET(mockRequest)
    const data = await response.json()

    expect(data.environment).toBeDefined()
    expect(['development', 'test', 'production']).toContain(data.environment)
  })

  it('should have correct content type', async () => {
    const response = await GET(mockRequest)

    expect(response.headers.get('content-type')).toBe('application/json')
  })

  it('should handle request without authentication', async () => {
    // Health endpoint should not require authentication
    const response = await GET(mockRequest)

    expect(response.status).toBe(200)
  })
})