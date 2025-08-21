import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import CertificateValidationPage from '@/app/certificates/validate/page'

// Mock dependencies
jest.mock('next-auth/react')
jest.mock('next/navigation')
jest.mock('@/lib/certificate-validation')

const mockUseSession = useSession as jest.MockedFunction<typeof useSession>
const mockUseRouter = useRouter as jest.MockedFunction<typeof useRouter>

describe('Certificate Validation Page - Phase 2 Features', () => {
  let mockFetch: jest.MockedFunction<typeof fetch>
  let mockCertificateValidationService: any

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

    // Mock certificate validation service
    mockCertificateValidationService = {
      validateCertificate: jest.fn(),
      clearValidationCache: jest.fn(),
      getCacheStatistics: jest.fn()
    }

    jest.doMock('@/lib/certificate-validation', () => ({
      CertificateValidationService: mockCertificateValidationService
    }))
  })

  describe('Page Rendering and Initial State', () => {
    it('should render the validation page with all Phase 2 features', () => {
      render(<CertificateValidationPage />)
      
      // Check main elements
      expect(screen.getByText('Certificate Validation')).toBeInTheDocument()
      expect(screen.getByText('Upload Certificate')).toBeInTheDocument()
      expect(screen.getByText('Advanced Validation Options')).toBeInTheDocument()
      expect(screen.getByText('Validation Results')).toBeInTheDocument()
    })

    it('should show advanced validation options in collapsible panel', () => {
      render(<CertificateValidationPage />)
      
      // Check advanced options
      expect(screen.getByText('Advanced Validation Options')).toBeInTheDocument()
      expect(screen.getByLabelText('Check Expiration')).toBeInTheDocument()
      expect(screen.getByLabelText('Check Revocation')).toBeInTheDocument()
      expect(screen.getByLabelText('Require Trusted Root')).toBeInTheDocument()
      expect(screen.getByLabelText('Validate Extensions')).toBeInTheDocument()
      expect(screen.getByLabelText('Check Key Usage')).toBeInTheDocument()
      expect(screen.getByLabelText('Check Basic Constraints')).toBeInTheDocument()
    })

    it('should have proper form controls and buttons', () => {
      render(<CertificateValidationPage />)
      
      expect(screen.getByRole('button', { name: 'Validate Certificate' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Clear' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Clear Cache' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Cache Stats' })).toBeInTheDocument()
    })
  })

  describe('File Upload and Validation Flow', () => {
    it('should handle certificate file upload and validation', async () => {
      render(<CertificateValidationPage />)
      
      // Mock successful validation response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          isValid: true,
          issues: [],
          chain: [],
          chainInfo: {
            chainLength: 1,
            isComplete: true,
            rootCA: 'Test Root CA',
            intermediateCAs: [],
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
            issuer: 'Test Root CA'
          },
          lastValidated: new Date().toISOString()
        })
      } as any)

      // Create a mock file
      const file = new File(['-----BEGIN CERTIFICATE-----\nMOCK\n-----END CERTIFICATE-----'], 'test.pem', {
        type: 'application/x-pem-file'
      })

      // Upload file
      const fileInput = screen.getByTestId('certificate-file-input')
      fireEvent.change(fileInput, { target: { files: [file] } })

      // Wait for file to be processed
      await waitFor(() => {
        expect(screen.getByText('test.pem')).toBeInTheDocument()
      })

      // Submit validation
      const validateButton = screen.getByRole('button', { name: 'Validate Certificate' })
      fireEvent.click(validateButton)

      // Wait for validation results
      await waitFor(() => {
        expect(screen.getByText('Validation Results')).toBeInTheDocument()
        expect(screen.getByText('✓ Valid')).toBeInTheDocument()
      })
    })

    it('should handle validation errors and display detailed feedback', async () => {
      render(<CertificateValidationPage />)
      
      // Mock validation error response
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({
          error: 'Invalid certificate format',
          details: 'The provided certificate is not in valid PEM format'
        })
      } as any)

      // Create a mock invalid file
      const file = new File(['invalid content'], 'invalid.txt', {
        type: 'text/plain'
      })

      // Upload file
      const fileInput = screen.getByTestId('certificate-file-input')
      fireEvent.change(fileInput, { target: { files: [file] } })

      // Submit validation
      const validateButton = screen.getByRole('button', { name: 'Validate Certificate' })
      fireEvent.click(validateButton)

      // Wait for error display
      await waitFor(() => {
        expect(screen.getByText('Invalid certificate format')).toBeInTheDocument()
        expect(screen.getByText('The provided certificate is not in valid PEM format')).toBeInTheDocument()
      })
    })

    it('should handle rate limiting errors', async () => {
      render(<CertificateValidationPage />)
      
      // Mock rate limit response
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        json: async () => ({
          error: 'Rate limit exceeded',
          details: 'Too many validation requests. Please wait before trying again.',
          retryAfter: 60
        })
      } as any)

      // Create a mock file
      const file = new File(['-----BEGIN CERTIFICATE-----\nMOCK\n-----END CERTIFICATE-----'], 'test.pem', {
        type: 'application/x-pem-file'
      })

      // Upload and validate
      const fileInput = screen.getByTestId('certificate-file-input')
      fireEvent.change(fileInput, { target: { files: [file] } })

      const validateButton = screen.getByRole('button', { name: 'Validate Certificate' })
      fireEvent.click(validateButton)

      // Wait for rate limit error
      await waitFor(() => {
        expect(screen.getByText('Rate limit exceeded')).toBeInTheDocument()
        expect(screen.getByText('Too many validation requests. Please wait before trying again.')).toBeInTheDocument()
      })
    })
  })

  describe('Advanced Validation Options', () => {
    it('should allow users to configure validation options', () => {
      render(<CertificateValidationPage />)
      
      // Check that all options are configurable
      const checkExpiration = screen.getByLabelText('Check Expiration')
      const checkRevocation = screen.getByLabelText('Check Revocation')
      const requireTrustedRoot = screen.getByLabelText('Require Trusted Root')
      const validateExtensions = screen.getByLabelText('Validate Extensions')
      const checkKeyUsage = screen.getByLabelText('Check Key Usage')
      const checkBasicConstraints = screen.getByLabelText('Check Basic Constraints')

      // Test option toggling
      fireEvent.click(checkExpiration)
      fireEvent.click(requireTrustedRoot)
      fireEvent.click(validateExtensions)

      expect(checkExpiration).toBeChecked()
      expect(requireTrustedRoot).toBeChecked()
      expect(validateExtensions).toBeChecked()
      expect(checkRevocation).not.toBeChecked()
      expect(checkKeyUsage).not.toBeChecked()
      expect(checkBasicConstraints).not.toBeChecked()
    })

    it('should send validation options with the validation request', async () => {
      render(<CertificateValidationPage />)
      
      // Configure options
      const requireTrustedRoot = screen.getByLabelText('Require Trusted Root')
      const validateExtensions = screen.getByLabelText('Validate Extensions')
      const checkKeyUsage = screen.getByLabelText('Check Key Usage')
      
      fireEvent.click(requireTrustedRoot)
      fireEvent.click(validateExtensions)
      fireEvent.click(checkKeyUsage)

      // Mock successful response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          isValid: true,
          issues: [],
          validationOptions: {
            requireTrustedRoot: true,
            validateExtensions: true,
            checkKeyUsage: true
          }
        })
      } as any)

      // Upload and validate
      const file = new File(['-----BEGIN CERTIFICATE-----\nMOCK\n-----END CERTIFICATE-----'], 'test.pem', {
        type: 'application/x-pem-file'
      })

      const fileInput = screen.getByTestId('certificate-file-input')
      fireEvent.change(fileInput, { target: { files: [file] } })

      const validateButton = screen.getByRole('button', { name: 'Validate Certificate' })
      fireEvent.click(validateButton)

      // Verify that options were sent
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          '/api/certificates/validate',
          expect.objectContaining({
            method: 'POST',
            body: expect.stringContaining('requireTrustedRoot')
          })
        )
      })
    })
  })

  describe('Validation Results Display', () => {
    it('should display comprehensive validation results', async () => {
      render(<CertificateValidationPage />)
      
      // Mock comprehensive validation response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
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
          lastValidated: new Date().toISOString()
        })
      } as any)

      // Upload and validate
      const file = new File(['-----BEGIN CERTIFICATE-----\nMOCK\n-----END CERTIFICATE-----'], 'test.pem', {
        type: 'application/x-pem-file'
      })

      const fileInput = screen.getByTestId('certificate-file-input')
      fireEvent.change(fileInput, { target: { files: [file] } })

      const validateButton = screen.getByRole('button', { name: 'Validate Certificate' })
      fireEvent.click(validateButton)

      // Wait for results and verify display
      await waitFor(() => {
        expect(screen.getByText('✓ Valid')).toBeInTheDocument()
        expect(screen.getByText('Certificate Chain')).toBeInTheDocument()
        expect(screen.getByText('Root CA')).toBeInTheDocument()
        expect(screen.getByText('Intermediate CA')).toBeInTheDocument()
        expect(screen.getByText('test.example.com')).toBeInTheDocument()
        expect(screen.getByText('Validation Summary')).toBeInTheDocument()
      })
    })

    it('should display detailed chain information with status', async () => {
      render(<CertificateValidationPage />)
      
      // Mock response with chain details
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          isValid: true,
          chain: [
            { cert: { subject: 'end.example.com' }, status: 'valid' },
            { cert: { subject: 'Intermediate CA' }, status: 'valid' },
            { cert: { subject: 'Root CA' }, status: 'trusted_root' }
          ]
        })
      } as any)

      // Upload and validate
      const file = new File(['-----BEGIN CERTIFICATE-----\nMOCK\n-----END CERTIFICATE-----'], 'test.pem', {
        type: 'application/x-pem-file'
      })

      const fileInput = screen.getByTestId('certificate-file-input')
      fireEvent.change(fileInput, { target: { files: [file] } })

      const validateButton = screen.getByRole('button', { name: 'Validate Certificate' })
      fireEvent.click(validateButton)

      // Verify chain display
      await waitFor(() => {
        expect(screen.getByText('Detailed Chain Display')).toBeInTheDocument()
        expect(screen.getByText('end.example.com')).toBeInTheDocument()
        expect(screen.getByText('Intermediate CA')).toBeInTheDocument()
        expect(screen.getByText('Root CA')).toBeInTheDocument()
      })
    })

    it('should show validation summary with all checks', async () => {
      render(<CertificateValidationPage />)
      
      // Mock response with validation summary
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          isValid: true,
          validationSummary: {
            chainValidation: { status: 'Passed', details: 'Complete chain validated' },
            expirationCheck: { status: 'Passed', details: 'Certificate valid for 365 days' },
            signatureCheck: { status: 'Passed', details: 'Signature verified' },
            trustRoot: { status: 'Found', details: 'Trusted root CA identified' }
          }
        })
      } as any)

      // Upload and validate
      const file = new File(['-----BEGIN CERTIFICATE-----\nMOCK\n-----END CERTIFICATE-----'], 'test.pem', {
        type: 'application/x-pem-file'
      })

      const fileInput = screen.getByTestId('certificate-file-input')
      fireEvent.change(fileInput, { target: { files: [file] } })

      const validateButton = screen.getByRole('button', { name: 'Validate Certificate' })
      fireEvent.click(validateButton)

      // Verify validation summary
      await waitFor(() => {
        expect(screen.getByText('Validation Summary')).toBeInTheDocument()
        expect(screen.getByText('Complete chain validated')).toBeInTheDocument()
        expect(screen.getByText('Certificate valid for 365 days')).toBeInTheDocument()
        expect(screen.getByText('Signature verified')).toBeInTheDocument()
        expect(screen.getByText('Trusted root CA identified')).toBeInTheDocument()
      })
    })
  })

  describe('Cache Management', () => {
    it('should allow users to clear validation cache', async () => {
      render(<CertificateValidationPage />)
      
      // Mock cache clear response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          message: 'Cache cleared successfully',
          cleared: 5
        })
      } as any)

      // Click clear cache button
      const clearCacheButton = screen.getByRole('button', { name: 'Clear Cache' })
      fireEvent.click(clearCacheButton)

      // Verify API call
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          '/api/certificates/validate?action=cache-clear',
          expect.objectContaining({ method: 'GET' })
        )
      })
    })

    it('should display cache statistics', async () => {
      render(<CertificateValidationPage />)
      
      // Mock cache stats response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          size: 10,
          hitRate: 0.75,
          totalRequests: 100,
          cacheHits: 75
        })
      } as any)

      // Click cache stats button
      const cacheStatsButton = screen.getByRole('button', { name: 'Cache Stats' })
      fireEvent.click(cacheStatsButton)

      // Verify API call
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          '/api/certificates/validate?action=cache-stats',
          expect.objectContaining({ method: 'GET' })
        )
      })
    })

    it('should show cache status indicator when results are cached', async () => {
      render(<CertificateValidationPage />)
      
      // Mock cached response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          isValid: true,
          issues: [],
          cached: true,
          cacheKey: 'mock-cache-key'
        })
      } as any)

      // Upload and validate
      const file = new File(['-----BEGIN CERTIFICATE-----\nMOCK\n-----END CERTIFICATE-----'], 'test.pem', {
        type: 'application/x-pem-file'
      })

      const fileInput = screen.getByTestId('certificate-file-input')
      fireEvent.change(fileInput, { target: { files: [file] } })

      const validateButton = screen.getByRole('button', { name: 'Validate Certificate' })
      fireEvent.click(validateButton)

      // Verify cache indicator
      await waitFor(() => {
        expect(screen.getByText('⚡ Result served from cache')).toBeInTheDocument()
      })
    })
  })

  describe('Form Management and User Experience', () => {
    it('should clear form when Clear button is clicked', () => {
      render(<CertificateValidationPage />)
      
      // Upload a file first
      const file = new File(['-----BEGIN CERTIFICATE-----\nMOCK\n-----END CERTIFICATE-----'], 'test.pem', {
        type: 'application/x-pem-file'
      })

      const fileInput = screen.getByTestId('certificate-file-input')
      fireEvent.change(fileInput, { target: { files: [file] } })

      // Verify file is uploaded
      expect(screen.getByText('test.pem')).toBeInTheDocument()

      // Click clear button
      const clearButton = screen.getByRole('button', { name: 'Clear' })
      fireEvent.click(clearButton)

      // Verify form is cleared
      expect(screen.queryByText('test.pem')).not.toBeInTheDocument()
    })

    it('should handle drag and drop file upload', () => {
      render(<CertificateValidationPage />)
      
      const dropZone = screen.getByTestId('certificate-drop-zone')
      
      // Create mock file
      const file = new File(['-----BEGIN CERTIFICATE-----\nMOCK\n-----END CERTIFICATE-----'], 'test.pem', {
        type: 'application/x-pem-file'
      })

      // Simulate drag and drop
      fireEvent.drop(dropZone, {
        dataTransfer: {
          files: [file]
        }
      })

      // Verify file is uploaded
      expect(screen.getByText('test.pem')).toBeInTheDocument()
    })

    it('should validate file format and size before upload', async () => {
      render(<CertificateValidationPage />)
      
      // Try to upload invalid file
      const invalidFile = new File(['invalid content'], 'invalid.txt', {
        type: 'text/plain'
      })

      const fileInput = screen.getByTestId('certificate-file-input')
      fireEvent.change(fileInput, { target: { files: [invalidFile] } })

      // Verify error message
      await waitFor(() => {
        expect(screen.getByText(/Invalid file format/)).toBeInTheDocument()
      })
    })
  })

  describe('Error Handling and User Feedback', () => {
    it('should display network errors gracefully', async () => {
      render(<CertificateValidationPage />)
      
      // Mock network error
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      // Upload and validate
      const file = new File(['-----BEGIN CERTIFICATE-----\nMOCK\n-----END CERTIFICATE-----'], 'test.pem', {
        type: 'application/x-pem-file'
      })

      const fileInput = screen.getByTestId('certificate-file-input')
      fireEvent.change(fileInput, { target: { files: [file] } })

      const validateButton = screen.getByRole('button', { name: 'Validate Certificate' })
      fireEvent.click(validateButton)

      // Verify error handling
      await waitFor(() => {
        expect(screen.getByText(/Network error/)).toBeInTheDocument()
      })
    })

    it('should show loading state during validation', async () => {
      render(<CertificateValidationPage />)
      
      // Mock delayed response
      mockFetch.mockImplementationOnce(() => 
        new Promise(resolve => 
          setTimeout(() => resolve({
            ok: true,
            json: async () => ({ isValid: true, issues: [] })
          } as any), 100)
        )
      )

      // Upload and validate
      const file = new File(['-----BEGIN CERTIFICATE-----\nMOCK\n-----END CERTIFICATE-----'], 'test.pem', {
        type: 'application/x-pem-file'
      })

      const fileInput = screen.getByTestId('certificate-file-input')
      fireEvent.change(fileInput, { target: { files: [file] } })

      const validateButton = screen.getByRole('button', { name: 'Validate Certificate' })
      fireEvent.click(validateButton)

      // Verify loading state
      expect(screen.getByText('Validating...')).toBeInTheDocument()
    })
  })
})