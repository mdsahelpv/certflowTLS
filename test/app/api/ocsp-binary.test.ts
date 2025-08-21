import { NextRequest } from 'next/server'
import { POST as OCSP_BINARY } from '@/app/api/ocsp/binary/route'
import { db } from '@/lib/db'
import forge from 'node-forge'

function makeDummyCA() {
  const keys = forge.pki.rsa.generateKeyPair(2048)
  const cert = forge.pki.createCertificate()
  cert.publicKey = keys.publicKey
  cert.serialNumber = '01'
  cert.validity.notBefore = new Date(Date.now() - 1000)
  cert.validity.notAfter = new Date(Date.now() + 24 * 60 * 60 * 1000)
  const attrs = [{ name: 'commonName', value: 'Test CA' }]
  cert.setSubject(attrs)
  cert.setIssuer(attrs)
  cert.setExtensions([{ name: 'basicConstraints', cA: true }])
  cert.sign(keys.privateKey, forge.md.sha256.create())
  return { certPem: forge.pki.certificateToPem(cert), keyPem: forge.pki.privateKeyToPem(keys.privateKey) }
}

function makeOcspRequestDer(serialHex: string): Uint8Array {
  // Minimal fake ASN.1 with an INTEGER node bearing the serial
  const int = forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.INTEGER, false, forge.util.hexToBytes(serialHex))
  const seq = forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SEQUENCE, true, [int])
  const der = forge.asn1.toDer(seq).getBytes()
  const bytes = forge.util.createBuffer(der, 'raw').toHex().match(/.{1,2}/g)!.map((b) => parseInt(b, 16))
  return new Uint8Array(bytes)
}

describe('OCSP binary endpoint', () => {
  beforeEach(() => {
    jest.resetModules()
    ;(db.cAConfig.findFirst as jest.Mock).mockReset()
    ;(db.certificate.findUnique as jest.Mock).mockReset()
  })

  it('returns signed OCSP response for good cert', async () => {
    const { certPem, keyPem } = makeDummyCA()
    ;(db.cAConfig.findFirst as jest.Mock).mockResolvedValue({ status: 'ACTIVE', certificate: certPem, privateKey: JSON.stringify({ encrypted: keyPem, iv: '', tag: '' }) })
    ;(db.certificate.findUnique as jest.Mock).mockResolvedValue({ serialNumber: 'ABCD', status: 'ACTIVE', validTo: new Date(Date.now() + 100000) })

    const body = makeOcspRequestDer('ABCD')
    const req = new NextRequest('http://localhost:3000/api/ocsp/binary', { method: 'POST', body: body as any, headers: { 'content-type': 'application/ocsp-request' } as any })
    // Patch Encryption.decrypt to return raw pem when iv/tag are empty
    jest.doMock('@/lib/crypto', () => ({ Encryption: { decrypt: (e: string) => e } }))

    const res = await OCSP_BINARY(req)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/ocsp-response')
  })

  it('returns 503 tryLater if CA not active', async () => {
    ;(db.cAConfig.findFirst as jest.Mock).mockResolvedValue(null)
    const body = makeOcspRequestDer('ABCD')
    const req = new NextRequest('http://localhost:3000/api/ocsp/binary', { method: 'POST', body: body as any, headers: { 'content-type': 'application/ocsp-request' } as any })
    const res = await OCSP_BINARY(req)
    expect(res.status).toBe(503)
  })
})