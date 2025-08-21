import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import CertificateValidationPage from '@/app/certificates/validate/page'
import { CertificateValidationService } from '@/lib/certificate-validation'
import { X509Utils } from '@/lib/crypto'

// Mock dependencies
jest.mock('next-auth/react')
jest.mock('next/navigation')
jest.mock('@/lib/certificate-validation')
jest.mock('@/lib/crypto')

const mockUseSession = useSession as jest.MockedFunction<typeof useSession>
const mockUseRouter = useRouter as jest.MockedFunction<typeof useRouter>
const mockCertificateValidationService = CertificateValidationService as jest.MockedClass<typeof CertificateValidationService>
const mockX509Utils = X509Utils as jest.Mocked<typeof X509Utils>

describe('Certificate Validation - Complete Integration Flow', () => {
  let mockFetch: jest.MockedFunction<typeof fetch>

  beforeEach(() => {
    jest.clearAllMocks()
    
    // Mock session
    mockUseSession.mockReturnValue({
      data: {
        user: {
          id: 'test-user-id',
          username: 'testuser',
          email: 'test@example.com',
          role: 'ADMIN',
          permissions: ['certificate:validate']
        },
        expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      },
      status: 'authenticated'
    } as any)

    // Mock router
    mockUseRouter.mockReturnValue({
      push: jest.fn(),
      replace: jest.fn(),
      prefetch: jest.fn(),
      back: jest.fn(),
      forward: jest.fn(),
      refresh: jest.fn()
    } as any)

    // Mock fetch
    mockFetch = jest.fn()
    global.fetch = mockFetch

    // Mock validation service methods
    mockCertificateValidationService.prototype.validateCertificate = jest.fn()
    mockCertificateValidationService.prototype.clearValidationCache = jest.fn()
    mockCertificateValidationService.prototype.getCacheStatistics = jest.fn()

    // Mock crypto utilities
    mockX509Utils.validateCertificateChain = jest.fn()
    mockX509Utils.isCertificateExpired = jest.fn()
    mockX509Utils.getCertificateChainInfo = jest.fn()
  })

  describe('Complete Validation Flow - Success Path', () => {
    it('should complete full validation flow with all Phase 2 features', async () => {
      // Step 1: Render the page
      render(<CertificateValidationPage />)
      
      // Verify initial state
      expect(screen.getByText('Certificate Validation')).toBeInTheDocument()
      expect(screen.getByText('Advanced Validation Options')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Validate Certificate' })).toBeInTheDocument()

      // Step 2: Configure advanced validation options
      const requireTrustedRoot = screen.getByLabelText('Require Trusted Root')
      const validateExtensions = screen.getByLabelText('Validate Extensions')
      const checkKeyUsage = screen.getByLabelText('Check Key Usage')
      const checkBasicConstraints = screen.getByLabelText('Check Basic Constraints')

      fireEvent.click(requireTrustedRoot)
      fireEvent.click(validateExtensions)
      fireEvent.click(checkKeyUsage)
      fireEvent.click(checkBasicConstraints)

      expect(requireTrustedRoot).toBeChecked()
      expect(validateExtensions).toBeChecked()
      expect(checkKeyUsage).toBeChecked()
      expect(checkBasicConstraints).toBeChecked()

      // Step 3: Upload certificate file
      const file = new File(['-----BEGIN CERTIFICATE-----\nMOCK\n-----END CERTIFICATE-----'], 'test.pem', {
        type: 'application/x-pem-file'
      })

      const fileInput = screen.getByTestId('certificate-file-input')
      fireEvent.change(fileInput, { target: { files: [file] } })

      await waitFor(() => {
        expect(screen.getByText('test.pem')).toBeInTheDocument()
      })

      // Step 4: Mock comprehensive validation response
      const mockValidationResult = {
        isValid: true,
        issues: [],
        chain: [
          {
            cert: { subject: 'test.example.com', issuer: 'Intermediate CA' },
            status: 'valid'
          },
          {
            cert: { subject: 'Intermediate CA', issuer: 'Root CA' },
            status: 'valid'
          },
          {
            cert: { subject: 'Root CA', issuer: 'Root CA' },
            status: 'trusted_root'
          }
        ],
        chainInfo: {
          chainLength: 3,
          isComplete: true,
          rootCA: 'Root CA',
          intermediateCAs: ['Intermediate CA'],
          endEntity: 'test.example.com'
        },
        expiration: {
          expired: false,
          daysUntilExpiry: 365,
          validFrom: new Date().toISOString(),
          validTo: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
        },
        signature: {
          verified: true,
          issuer: 'Root CA'
        },
        validationSummary: {
          chainValidation: { status: 'Passed', details: 'Complete chain validated' },
          expirationCheck: { status: 'Passed', details: 'Certificate valid for 365 days' },
          signatureCheck: { status: 'Passed', details: 'Signature verified with Root CA' },
          trustRoot: { status: 'Found', details: 'Trusted root CA identified' },
          extensions: { status: 'Passed', details: 'All required extensions validated' },
          keyUsage: { status: 'Passed', details: 'Key usage constraints satisfied' },
          basicConstraints: { status: 'Passed', details: 'Basic constraints validated' }
        },
        lastValidated: new Date().toISOString()
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockValidationResult
      } as any)

      // Step 5: Submit validation
      const validateButton = screen.getByRole('button', { name: 'Validate Certificate' })
      fireEvent.click(validateButton)

      // Step 6: Verify comprehensive results display
      await waitFor(() => {
        expect(screen.getByText('✓ Valid')).toBeInTheDocument()
        expect(screen.getByText('Certificate Chain')).toBeInTheDocument()
        expect(screen.getByText('Validation Summary')).toBeInTheDocument()
        expect(screen.getByText('Detailed Chain Display')).toBeInTheDocument()
      })

      // Verify chain information
      expect(screen.getByText('Root CA')).toBeInTheDocument()
      expect(screen.getByText('Intermediate CA')).toBeInTheDocument()
      expect(screen.getByText('test.example.com')).toBeInTheDocument()

      // Verify validation summary
      expect(screen.getByText('Complete chain validated')).toBeInTheDocument()
      expect(screen.getByText('Certificate valid for 365 days')).toBeInTheDocument()
      expect(screen.getByText('Signature verified with Root CA')).toBeInTheDocument()
      expect(screen.getByText('Trusted root CA identified')).toBeInTheDocument()
      expect(screen.getByText('All required extensions validated')).toBeInTheDocument()
      expect(screen.getByText('Key usage constraints satisfied')).toBeInTheDocument()
      expect(screen.getByText('Basic constraints validated')).toBeInTheDocument()

      // Step 7: Verify API call was made with correct options
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/certificates/validate',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('requireTrustedRoot')
        })
      )
    })
  })

  describe('Complete Validation Flow - Error Path', () => {
    it('should handle validation errors with comprehensive feedback', async () => {
      render(<CertificateValidationPage />)

      // Configure validation options
      const requireTrustedRoot = screen.getByLabelText('Require Trusted Root')
      fireEvent.click(requireTrustedRoot)

      // Upload certificate
      const file = new File(['-----BEGIN CERTIFICATE-----\nINVALID\n-----END CERTIFICATE-----'], 'invalid.pem', {
        type: 'application/x-pem-file'
      })

      const fileInput = screen.getByTestId('certificate-file-input')
      fireEvent.change(fileInput, { target: { files: [file] } })

      // Mock validation error response
      const mockValidationError = {
        isValid: false,
        issues: [
          'Certificate signature verification failed: Invalid signature',
          'Root CA not trusted: Root CA not in trusted store',
          'Weak RSA key size (1024 bits) detected',
          'Missing required extension: basicConstraints',
          'Invalid key usage: certificate signing not allowed for end entity'
        ],
        chain: [],
        chainInfo: {
          chainLength: 0,
          isComplete: false,
          rootCA: null,
          intermediateCAs: [],
          endEntity: 'Unknown'
        },
        expiration: {
          expired: true,
          daysUntilExpiry: -30,
          validFrom: new Date(Date.now() - 400 * 24 * 60 * 60 * 1000),
          validTo: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
        },
        signature: {
          verified: false,
          issuer: 'Unknown'
        },
        validationSummary: {
          chainValidation: { status: 'Failed', details: 'Chain validation failed' },
          expirationCheck: { status: 'Failed', details: 'Certificate expired 30 days ago' },
          signatureCheck: { status: 'Failed', details: 'Signature verification failed' },
          trustRoot: { status: 'Failed', details: 'No trusted root CA found' },
          extensions: { status: 'Failed', details: 'Missing required extensions' },
          keyUsage: { status: 'Failed', details: 'Invalid key usage' },
          basicConstraints: { status: 'Failed', details: 'Basic constraints validation failed' }
        }
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockValidationError
      } as any)

      // Submit validation
      const validateButton = screen.getByRole('button', { name: 'Validate Certificate' })
      fireEvent.click(validateButton)

      // Verify error display
      await waitFor(() => {
        expect(screen.getByText('✗ Invalid')).toBeInTheDocument()
        expect(screen.getByText('Validation Summary')).toBeInTheDocument()
      })

      // Verify detailed error information
      expect(screen.getByText('Certificate signature verification failed: Invalid signature')).toBeInTheDocument()
      expect(screen.getByText('Root CA not trusted: Root CA not in trusted store')).toBeInTheDocument()
      expect(screen.getByText('Weak RSA key size (1024 bits) detected')).toBeInTheDocument()
      expect(screen.getByText('Missing required extension: basicConstraints')).toBeInTheDocument()
      expect(screen.getByText('Invalid key usage: certificate signing not allowed for end entity')).toBeInTheDocument()

      // Verify validation summary failures
      expect(screen.getByText('Chain validation failed')).toBeInTheDocument()
      expect(screen.getByText('Certificate expired 30 days ago')).toBeInTheDocument()
      expect(screen.getByText('Signature verification failed')).toBeInTheDocument()
      expect(screen.getByText('No trusted root CA found')).toBeInTheDocument()
      expect(screen.getByText('Missing required extensions')).toBeInTheDocument()
      expect(screen.getByText('Invalid key usage')).toBeInTheDocument()
      expect(screen.getByText('Basic constraints validation failed')).toBeInTheDocument()
    })
  })

  describe('Cache Management Integration', () => {
    it('should handle cache operations throughout the validation flow', async () => {
      render(<CertificateValidationPage />)

      // Step 1: Check cache statistics
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          size: 15,
          hitRate: 0.80,
          totalRequests: 200,
          cacheHits: 160,
          cacheMisses: 40
        })
      } as any)

      const cacheStatsButton = screen.getByRole('button', { name: 'Cache Stats' })
      fireEvent.click(cacheStatsButton)

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          '/api/certificates/validate?action=cache-stats',
          expect.objectContaining({ method: 'GET' })
        )
      })

      // Step 2: Clear cache
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          message: 'Cache cleared successfully',
          cleared: 15
        })
      } as any)

      const clearCacheButton = screen.getByRole('button', { name: 'Clear Cache' })
      fireEvent.click(clearCacheButton)

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          '/api/certificates/validate?action=cache-clear',
          expect.objectContaining({ method: 'GET' })
        )
      })

      // Step 3: Perform validation (should be cache miss)
      const file = new File(['-----BEGIN CERTIFICATE-----\nMOCK\n-----END CERTIFICATE-----'], 'test.pem', {
        type: 'application/x-pem-file'
      })

      const fileInput = screen.getByTestId('certificate-file-input')
      fireEvent.change(fileInput, { target: { files: [file] } })

      const mockValidationResult = {
        isValid: true,
        issues: [],
        cached: false,
        lastValidated: new Date().toISOString()
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockValidationResult
      } as any)

      const validateButton = screen.getByRole('button', { name: 'Validate Certificate' })
      fireEvent.click(validateButton)

      await waitFor(() => {
        expect(screen.getByText('✓ Valid')).toBeInTheDocument()
      })

      // Step 4: Perform same validation (should be cache hit)
      const mockCachedResult = {
        isValid: true,
        issues: [],
        cached: true,
        cacheKey: 'mock-cache-key',
        lastValidated: new Date().toISOString()
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockCachedResult
      } as any)

      fireEvent.click(validateButton)

      await waitFor(() => {
        expect(screen.getByText('⚡ Result served from cache')).toBeInTheDocument()
      })
    })
  })

  describe('Advanced Options Integration', () => {
    it('should integrate all advanced validation options with the validation flow', async () => {
      render(<CertificateValidationPage />)

      // Configure all advanced options
      const checkExpiration = screen.getByLabelText('Check Expiration')
      const checkRevocation = screen.getByLabelText('Check Revocation')
      const requireTrustedRoot = screen.getByLabelText('Require Trusted Root')
      const validateExtensions = screen.getByLabelText('Validate Extensions')
      const checkKeyUsage = screen.getByLabelText('Check Key Usage')
      const checkBasicConstraints = screen.getByLabelText('Check Basic Constraints')

      fireEvent.click(checkExpiration)
      fireEvent.click(checkRevocation)
      fireEvent.click(requireTrustedRoot)
      fireEvent.click(validateExtensions)
      fireEvent.click(checkKeyUsage)
      fireEvent.click(checkBasicConstraints)

      // Verify all options are selected
      expect(checkExpiration).toBeChecked()
      expect(checkRevocation).toBeChecked()
      expect(requireTrustedRoot).toBeChecked()
      expect(validateExtensions).toBeChecked()
      expect(checkKeyUsage).toBeChecked()
      expect(checkBasicConstraints).toBeChecked()

      // Upload and validate
      const file = new File(['-----BEGIN CERTIFICATE-----\nMOCK\n-----END CERTIFICATE-----'], 'test.pem', {
        type: 'application/x-pem-file'
      })

      const fileInput = screen.getByTestId('certificate-file-input')
      fireEvent.change(fileInput, { target: { files: [file] } })

      const mockValidationResult = {
        isValid: true,
        issues: [],
        validationOptions: {
          checkExpiration: true,
          checkRevocation: true,
          requireTrustedRoot: true,
          validateExtensions: true,
          checkKeyUsage: true,
          checkBasicConstraints: true
        }
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockValidationResult
      } as any)

      const validateButton = screen.getByRole('button', { name: 'Validate Certificate' })
      fireEvent.click(validateButton)

      // Verify validation was performed with all options
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          '/api/certificates/validate',
          expect.objectContaining({
            method: 'POST',
            body: expect.stringContaining('requireTrustedRoot')
          })
        )
      })

      // Verify the request body contains all options
      const requestBody = mockFetch.mock.calls[0][1]?.body as string
      expect(requestBody).toContain('checkExpiration')
      expect(requestBody).toContain('checkRevocation')
      expect(requestBody).toContain('requireTrustedRoot')
      expect(requestBody).toContain('validateExtensions')
      expect(requestBody).toContain('checkKeyUsage')
      expect(requestBody).toContain('checkBasicConstraints')
    })
  })

  describe('User Experience Flow', () => {
    it('should provide smooth user experience with proper feedback states', async () => {
      render(<CertificateValidationPage />)

      // Initial state
      expect(screen.getByText('Upload Certificate')).toBeInTheDocument()
      expect(screen.getByText('Validation Results')).toBeInTheDocument()

      // Upload file
      const file = new File(['-----BEGIN CERTIFICATE-----\nMOCK\n-----END CERTIFICATE-----'], 'test.pem', {
        type: 'application/x-pem-file'
      })

      const fileInput = screen.getByTestId('certificate-file-input')
      fireEvent.change(fileInput, { target: { files: [file] } })

      await waitFor(() => {
        expect(screen.getByText('test.pem')).toBeInTheDocument()
      })

      // Mock loading state
      mockFetch.mockImplementationOnce(() => 
        new Promise(resolve => 
          setTimeout(() => resolve({
            ok: true,
            json: async () => ({ isValid: true, issues: [] })
          } as any), 100)
        )
      )

      // Submit validation
      const validateButton = screen.getByRole('button', { name: 'Validate Certificate' })
      fireEvent.click(validateButton)

      // Verify loading state
      expect(screen.getByText('Validating...')).toBeInTheDocument()

      // Wait for completion
      await waitFor(() => {
        expect(screen.getByText('✓ Valid')).toBeInTheDocument()
      })

      // Clear form
      const clearButton = screen.getByRole('button', { name: 'Clear' })
      fireEvent.click(clearButton)

      // Verify form is cleared
      expect(screen.queryByText('test.pem')).not.toBeInTheDocument()
      expect(screen.queryByText('✓ Valid')).not.toBeInTheDocument()
    })
  })
})