/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server'
import { GET as GET_LATEST } from '@/app/api/crl/download/latest/route'
import { GET as GET_PUBLIC_BY_NUMBER } from '@/app/api/crl/download/[crlNumber]/public/route'
import { db } from '@/lib/db'

jest.mock('@/lib/db', () => ({
  db: {
    cRL: {
      findFirst: jest.fn(),
    },
  },
}))

describe('CRL public endpoints', () => {
  beforeEach(() => {
    ;(db.cRL.findFirst as jest.Mock).mockReset()
  })

  it('returns latest CRL with correct content type', async () => {
    ;(db.cRL.findFirst as jest.Mock).mockResolvedValue({ crlData: 'PEM-CRL', crlNumber: 2 })
    const req = new NextRequest('http://localhost:3000/api/crl/download/latest')
    const res = await GET_LATEST()
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type') || res.headers.get('content-type')).toContain('application/x-pkcs7-crl')
  })

  it('returns 404 when no latest CRL', async () => {
    ;(db.cRL.findFirst as jest.Mock).mockResolvedValue(null)
    const res = await GET_LATEST()
    expect(res.status).toBe(404)
  })

  it('returns CRL by number publicly', async () => {
    ;(db.cRL.findFirst as jest.Mock).mockResolvedValue({ crlData: 'PEM-CRL', crlNumber: 5 })
    const req = new NextRequest('http://localhost:3000/api/crl/download/5/public')
    const res = await GET_PUBLIC_BY_NUMBER(req as any, { params: { crlNumber: '5' } })
    expect(res.status).toBe(200)
  })
})