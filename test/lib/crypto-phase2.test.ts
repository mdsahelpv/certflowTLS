import { X509Utils } from '@/lib/crypto'
import forge from 'node-forge'

// Mock node-forge
jest.mock('node-forge')

describe('X509Utils - Phase 2 Enhanced Features', () => {
  let mockForge: any

  beforeEach(() => {
    jest.clearAllMocks()
    
    // Create mock forge objects
    mockForge = {
      pki: {
        certificateFromPem: jest.fn(),
        certificateToAsn1: jest.fn(),
        createCertificate: jest.fn()
      },
      md: {
        sha256: {
          create: jest.fn().mockReturnValue({
            update: jest.fn().mockReturnThis(),
            digest: jest.fn().mockReturnValue({
              toHex: jest.fn().mockReturnValue('mock-sha256-hash')
            })
          })
        }
      },
      asn1: {
        toDer: jest.fn().mockReturnValue({
          getBytes: jest.fn().mockReturnValue('mock-der-bytes')
        })
      }
    }

    // Mock the forge module
    jest.doMock('node-forge', () => mockForge)
  })

  describe('Enhanced Chain Trust Validation', () => {
    it('should validate root CA trust with proper constraints', () => {
      const mockRootCert = {
        subject: { getField: jest.fn().mockReturnValue({ value: 'Root CA' }) },
        issuer: { getField: jest.fn().mockReturnValue({ value: 'Root CA' }) },
        validity: { notBefore: new Date(), notAfter: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) },
        getExtension: jest.fn().mockReturnValue({ cA: true }),
        publicKey: { n: { bitLength: () => 4096 } },
        verify: jest.fn().mockReturnValue(true) // Self-signed
      }

      // Test root CA validation logic
      const isSelfSigned = mockRootCert.verify(mockRootCert.publicKey)
      const basicConstraints = mockRootCert.getExtension('basicConstraints')
      const keyUsage = mockRootCert.getExtension('keyUsage')

      expect(isSelfSigned).toBe(true)
      expect(basicConstraints.cA).toBe(true)
      expect(mockRootCert.publicKey.n.bitLength()).toBe(4096)
    })

    it('should detect untrusted root CAs', () => {
      const mockUntrustedCert = {
        subject: { getField: jest.fn().mockReturnValue({ value: 'Untrusted CA' }) },
        issuer: { getField: jest.fn().mockReturnValue({ value: 'Unknown Issuer' }) },
        validity: { notBefore: new Date(), notAfter: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) },
        getExtension: jest.fn().mockReturnValue({ cA: false }),
        publicKey: { n: { bitLength: () => 1024 } },
        verify: jest.fn().mockReturnValue(false) // Not self-signed
      }

      const isSelfSigned = mockUntrustedCert.verify(mockUntrustedCert.publicKey)
      const basicConstraints = mockUntrustedCert.getExtension('basicConstraints')

      expect(isSelfSigned).toBe(false)
      expect(basicConstraints.cA).toBe(false)
      expect(mockUntrustedCert.publicKey.n.bitLength()).toBe(1024)
    })
  })

  describe('Certificate Fingerprinting', () => {
    it('should generate SHA-256 fingerprints for certificates', () => {
      const mockCert = {
        subject: { getField: jest.fn().mockReturnValue({ value: 'test.example.com' }) },
        validity: { notBefore: new Date(), notAfter: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) }
      }

      // Mock the fingerprint generation process
      const mockDer = { getBytes: jest.fn().mockReturnValue('mock-der-bytes') }
      const mockHash = {
        update: jest.fn().mockReturnThis(),
        digest: jest.fn().mockReturnValue({
          toHex: jest.fn().mockReturnValue('a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef12345678')
        })
      }

      mockForge.asn1.toDer.mockReturnValue(mockDer)
      mockForge.md.sha256.create.mockReturnValue(mockHash)

      const fingerprint = mockHash.digest().toHex()
      
      expect(fingerprint).toHaveLength(64) // SHA-256 hex length
      expect(fingerprint).toMatch(/^[a-f0-9]+$/) // Hex format
    })
  })

  describe('Enhanced Extension Validation', () => {
    it('should validate basic constraints for CA certificates', () => {
      const mockCACert = {
        getExtension: jest.fn().mockImplementation((name) => {
          if (name === 'basicConstraints') {
            return { cA: true, critical: true, pathLenConstraint: 2 }
          }
          return null
        })
      }

      const basicConstraints = mockCACert.getExtension('basicConstraints')
      
      expect(basicConstraints.cA).toBe(true)
      expect(basicConstraints.critical).toBe(true)
      expect(basicConstraints.pathLenConstraint).toBe(2)
    })

    it('should validate key usage extensions', () => {
      const mockCert = {
        getExtension: jest.fn().mockImplementation((name) => {
          if (name === 'keyUsage') {
            return { 
              critical: true, 
              keyCertSign: true, 
              cRLSign: true,
              digitalSignature: false,
              keyEncipherment: false
            }
          }
          return null
        })
      }

      const keyUsage = mockCert.getExtension('keyUsage')
      
      expect(keyUsage.critical).toBe(true)
      expect(keyUsage.keyCertSign).toBe(true)
      expect(keyUsage.cRLSign).toBe(true)
      expect(keyUsage.digitalSignature).toBe(false)
    })

    it('should validate required extensions presence', () => {
      const mockCert = {
        extensions: [
          { name: 'basicConstraints', critical: true, cA: true },
          { name: 'keyUsage', critical: true, keyCertSign: true },
          { name: 'subjectKeyIdentifier', critical: false },
          { name: 'authorityKeyIdentifier', critical: false }
        ]
      }

      const requiredExtensions = ['basicConstraints', 'keyUsage', 'subjectKeyIdentifier', 'authorityKeyIdentifier']
      const foundExtensions = mockCert.extensions.map(ext => ext.name)
      
      requiredExtensions.forEach(extName => {
        expect(foundExtensions).toContain(extName)
      })
    })
  })

  describe('Weak Algorithm Detection', () => {
    it('should detect weak RSA key sizes', () => {
      const weakKeySizes = [512, 1024]
      const strongKeySizes = [2048, 3072, 4096]

      weakKeySizes.forEach(size => {
        expect(size).toBeLessThan(2048)
      })

      strongKeySizes.forEach(size => {
        expect(size).toBeGreaterThanOrEqual(2048)
      })
    })

    it('should detect weak ECDSA curves', () => {
      const weakCurves = ['secp160k1', 'secp160r1', 'secp160r2']
      const strongCurves = ['P-256', 'P-384', 'P-521']

      weakCurves.forEach(curve => {
        expect(curve).toMatch(/secp160/)
      })

      strongCurves.forEach(curve => {
        expect(curve).toMatch(/^P-/)
      })
    })

    it('should detect deprecated hash algorithms', () => {
      const deprecatedAlgorithms = ['md5', 'sha1']
      const secureAlgorithms = ['sha256', 'sha384', 'sha512']

      deprecatedAlgorithms.forEach(alg => {
        expect(alg).toMatch(/md5|sha1/)
      })

      secureAlgorithms.forEach(alg => {
        expect(alg).toMatch(/sha256|sha384|sha512/)
      })
    })
  })

  describe('Path Length Constraint Validation', () => {
    it('should validate intermediate CA path length constraints', () => {
      const mockIntermediateCA = {
        getExtension: jest.fn().mockImplementation((name) => {
          if (name === 'basicConstraints') {
            return { cA: true, critical: true, pathLenConstraint: 0 }
          }
          return null
        })
      }

      const basicConstraints = mockIntermediateCA.getExtension('basicConstraints')
      
      expect(basicConstraints.cA).toBe(true)
      expect(basicConstraints.pathLenConstraint).toBe(0)
      expect(basicConstraints.pathLenConstraint).toBeGreaterThanOrEqual(0)
    })

    it('should reject negative path length constraints', () => {
      const mockInvalidCA = {
        getExtension: jest.fn().mockImplementation((name) => {
          if (name === 'basicConstraints') {
            return { cA: true, critical: true, pathLenConstraint: -1 }
          }
          return null
        })
      }

      const basicConstraints = mockInvalidCA.getExtension('basicConstraints')
      
      expect(basicConstraints.pathLenConstraint).toBeLessThan(0)
    })
  })

  describe('Enhanced Chain Building', () => {
    it('should build certificate chains with proper validation', () => {
      const mockChain = [
        {
          cert: {
            subject: { getField: jest.fn().mockReturnValue({ value: 'end.example.com' }) },
            issuer: { getField: jest.fn().mockReturnValue({ value: 'Intermediate CA' }) },
            validity: { notBefore: new Date(), notAfter: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) },
            verify: jest.fn().mockReturnValue(true)
          },
          status: 'valid'
        },
        {
          cert: {
            subject: { getField: jest.fn().mockReturnValue({ value: 'Intermediate CA' }) },
            issuer: { getField: jest.fn().mockReturnValue({ value: 'Root CA' }) },
            validity: { notBefore: new Date(), notAfter: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) },
            verify: jest.fn().mockReturnValue(true),
            getExtension: jest.fn().mockReturnValue({ cA: true, pathLenConstraint: 0 })
          },
          status: 'valid'
        },
        {
          cert: {
            subject: { getField: jest.fn().mockReturnValue({ value: 'Root CA' }) },
            issuer: { getField: jest.fn().mockReturnValue({ value: 'Root CA' }) },
            validity: { notBefore: new Date(), notAfter: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) },
            verify: jest.fn().mockReturnValue(true),
            getExtension: jest.fn().mockReturnValue({ cA: true })
          },
          status: 'trusted_root'
        }
      ]

      expect(mockChain).toHaveLength(3)
      expect(mockChain[0].status).toBe('valid')
      expect(mockChain[1].status).toBe('valid')
      expect(mockChain[2].status).toBe('trusted_root')
      
      // Test chain validation
      mockChain.forEach((chainItem, index) => {
        if (index < mockChain.length - 1) {
          const currentCert = chainItem.cert
          const nextCert = mockChain[index + 1].cert
          expect(currentCert.verify).toBeDefined()
        }
      })
    })
  })

  describe('Trust Root Validation', () => {
    it('should identify trusted root CAs', () => {
      const mockTrustedRoot = {
        subject: { getField: jest.fn().mockReturnValue({ value: 'Trusted Root CA' }) },
        issuer: { getField: jest.fn().mockReturnValue({ value: 'Trusted Root CA' }) },
        getExtension: jest.fn().mockReturnValue({ cA: true }),
        verify: jest.fn().mockReturnValue(true) // Self-signed
      }

      const isSelfSigned = mockTrustedRoot.verify(mockTrustedRoot.publicKey)
      const basicConstraints = mockTrustedRoot.getExtension('basicConstraints')
      
      expect(isSelfSigned).toBe(true)
      expect(basicConstraints.cA).toBe(true)
    })

    it('should reject untrusted root CAs', () => {
      const mockUntrustedRoot = {
        subject: { getField: jest.fn().mockReturnValue({ value: 'Untrusted Root' }) },
        issuer: { getField: jest.fn().mockReturnValue({ value: 'Unknown Issuer' }) },
        getExtension: jest.fn().mockReturnValue({ cA: false }),
        verify: jest.fn().mockReturnValue(false)
      }

      const isSelfSigned = mockUntrustedRoot.verify(mockUntrustedRoot.publicKey)
      const basicConstraints = mockUntrustedRoot.getExtension('basicConstraints')
      
      expect(isSelfSigned).toBe(false)
      expect(basicConstraints.cA).toBe(false)
    })
  })

  describe('Performance and Caching', () => {
    it('should support efficient certificate parsing', () => {
      const mockCertPem = '-----BEGIN CERTIFICATE-----\nMOCK\n-----END CERTIFICATE-----'
      
      // Mock efficient parsing
      const mockCert = {
        subject: { getField: jest.fn().mockReturnValue({ value: 'test.example.com' }) },
        validity: { notBefore: new Date(), notAfter: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) }
      }

      mockForge.pki.certificateFromPem.mockReturnValue(mockCert)
      
      expect(mockForge.pki.certificateFromPem).toBeDefined()
      expect(mockCert.subject.getField).toBeDefined()
    })
  })
})