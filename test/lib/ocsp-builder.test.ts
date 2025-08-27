import { buildBasicOCSPResponseRSA } from '@/lib/ocsp'
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
  cert.setExtensions([{ name: 'basicConstraints', value: { cA: true } }])
  cert.sign(keys.privateKey, forge.md.sha256.create())
  return { certPem: forge.pki.certificateToPem(cert), keyPem: forge.pki.privateKeyToPem(keys.privateKey) }
}

describe('OCSP builder', () => {
  it('builds a DER response for good status', () => {
    const { certPem, keyPem } = makeDummyCA()
    const der = buildBasicOCSPResponseRSA({ issuerCertPem: certPem, issuerPrivateKeyPem: keyPem, serialHex: 'ABCD', status: 'good' })
    expect(der).toBeInstanceOf(Uint8Array)
    expect(der.length).toBeGreaterThan(0)
  })
})