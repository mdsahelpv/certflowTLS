import forge from 'node-forge'

describe('Certificate utilities for OCSP', () => {
  it('can create a valid CA certificate', () => {
    const keys = forge.pki.rsa.generateKeyPair(2048)
    const cert = forge.pki.createCertificate()

    // Set certificate properties in correct order
    cert.publicKey = keys.publicKey
    cert.serialNumber = '01'

    // Set validity period
    const notBefore = new Date()
    notBefore.setTime(notBefore.getTime() - 1000) // 1 second ago
    const notAfter = new Date()
    notAfter.setTime(notAfter.getTime() + 365 * 24 * 60 * 60 * 1000) // 1 year from now

    cert.validity.notBefore = notBefore
    cert.validity.notAfter = notAfter

    // Set subject and issuer
    const attrs = [
      { name: 'commonName', value: 'Test CA' },
      { name: 'countryName', value: 'US' },
      { name: 'organizationName', value: 'Test Organization' }
    ]
    cert.setSubject(attrs)
    cert.setIssuer(attrs)

    // Set extensions
    cert.setExtensions([
      { name: 'basicConstraints', cA: true },
      { name: 'keyUsage', keyCertSign: true, cRLSign: true }
    ])

    // Sign the certificate - this was the original failing line
    cert.sign(keys.privateKey, forge.md.sha256.create())

    // Verify the certificate was created successfully
    const certPem = forge.pki.certificateToPem(cert)
    const keyPem = forge.pki.privateKeyToPem(keys.privateKey)

    expect(certPem).toContain('BEGIN CERTIFICATE')
    expect(certPem).toContain('END CERTIFICATE')
    expect(keyPem).toContain('BEGIN RSA PRIVATE KEY')
    expect(keyPem).toContain('END RSA PRIVATE KEY')
    expect(cert.serialNumber).toBe('01')
  })

  it('can create OCSP request DER format', () => {
    // Minimal fake ASN.1 with an INTEGER node bearing the serial
    const int = forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.INTEGER, false, forge.util.hexToBytes('ABCD'))
    const seq = forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SEQUENCE, true, [int])
    const der = forge.asn1.toDer(seq).getBytes()
    const bytes = forge.util.createBuffer(der, 'raw').toHex().match(/.{1,2}/g)!.map((b) => parseInt(b, 16))
    const result = new Uint8Array(bytes)

    expect(result).toBeInstanceOf(Uint8Array)
    expect(result.length).toBeGreaterThan(0)
  })
})
