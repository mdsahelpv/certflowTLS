import '@testing-library/jest-dom'
import { render, screen, fireEvent, waitFor } from '../../utils/test-utils'
import { useRouter } from 'next/navigation'
import CertificateValidationPage from '@/app/certificates/validate/page'

// Mock dependencies
jest.mock('next/navigation')

const mockUseRouter = useRouter as jest.MockedFunction<typeof useRouter>

// Helper to open the collapsible
const openAdvancedOptions = async () => {
  const collapsibleTrigger = screen.getByRole('button', { name: /Advanced Validation Options/i })
  fireEvent.click(collapsibleTrigger)
  await screen.findByLabelText(/Check Expiration/i) // Wait for content to appear
}

// Mock data
const mockValidCertPem = '-----BEGIN CERTIFICATE-----\nMOCK_VALID_CERT\n-----END CERTIFICATE-----'
const mockInvalidCertPem = 'invalid pem content'
const mockSuccessResponse = {
  result: {
    isValid: true,
    issues: [],
    chain: [
      { cert: { subject: { getField: () => ({ value: 'test.example.com' }) } }, status: 'valid' },
      { cert: { subject: { getField: () => ({ value: 'Intermediate CA' }) } }, status: 'valid' },
      { cert: { subject: { getField: () => ({ value: 'Root CA' }) } }, status: 'trusted_root' }
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
    signature: { verified: true, issuer: 'Root CA' },
    lastValidated: new Date().toISOString(),
    cached: false
  }
}

describe('Certificate Validation Page', () => {
  let mockFetch: jest.Mock

  beforeEach(() => {
    jest.clearAllMocks()
    mockUseRouter.mockReturnValue({
      push: jest.fn(),
      replace: jest.fn(),
      refresh: jest.fn(),
      back: jest.fn(),
      forward: jest.fn(),
      prefetch: jest.fn()
    })
    mockFetch = jest.fn()
    global.fetch = mockFetch
  })

  describe('Rendering and Initial State', () => {
    it('should render the main components', () => {
      render(<CertificateValidationPage />)
      expect(screen.getByRole('heading', { name: /Certificate Validation/i })).toBeInTheDocument()
      expect(screen.getByLabelText(/Certificate PEM/i)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Validate Certificate/i })).toBeInTheDocument()
      // Use getByText for the title within the card, as role resolution can be tricky with icons
      expect(screen.getByText(/Validation Results/i)).toBeInTheDocument()
    })

    it('should show advanced options when opened', async () => {
      render(<CertificateValidationPage />)
      await openAdvancedOptions()
      expect(screen.getByLabelText(/Check Revocation/i)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Clear Cache/i })).toBeInTheDocument()
    })
  })

  describe('Validation Flow', () => {
    it('should handle successful validation', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => mockSuccessResponse })
      render(<CertificateValidationPage />)
      fireEvent.change(screen.getByLabelText(/Certificate PEM/i), { target: { value: mockValidCertPem } })
      fireEvent.click(screen.getByRole('button', { name: /Validate Certificate/i }))
      expect(await screen.findByText(/Certificate is valid/i)).toBeInTheDocument()
      // Use getAllByText because the name can appear in multiple places in the results
      expect(screen.getAllByText('test.example.com').length).toBeGreaterThan(0)
    })

    it('should handle API validation failure', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 400, json: async () => ({ error: 'API Error' }) })
      render(<CertificateValidationPage />)
      fireEvent.change(screen.getByLabelText(/Certificate PEM/i), { target: { value: mockValidCertPem } })
      fireEvent.click(screen.getByRole('button', { name: /Validate Certificate/i }))
      expect(await screen.findByText(/API Error/i)).toBeInTheDocument()
    })

    it('should show frontend error for invalid PEM format', async () => {
      render(<CertificateValidationPage />)
      fireEvent.change(screen.getByLabelText(/Certificate PEM/i), { target: { value: mockInvalidCertPem } })
      fireEvent.click(screen.getByRole('button', { name: /Validate Certificate/i }))
      expect(await screen.findByText(/Input does not look like a valid PEM certificate/i)).toBeInTheDocument()
      expect(mockFetch).not.toHaveBeenCalled()
    })
  })

  describe('Advanced Options', () => {
    it('should toggle validation options', async () => {
      render(<CertificateValidationPage />)
      await openAdvancedOptions()
      const checkbox = screen.getByLabelText(/Check Revocation/i)
      expect(checkbox).toBeChecked()
      fireEvent.click(checkbox)
      expect(checkbox).not.toBeChecked()
    })

    it('should send selected options with the request', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => mockSuccessResponse })
      render(<CertificateValidationPage />)
      await openAdvancedOptions()
      fireEvent.click(screen.getByLabelText(/Check Revocation/i))
      fireEvent.change(screen.getByLabelText(/Certificate PEM/i), { target: { value: mockValidCertPem } })
      fireEvent.click(screen.getByRole('button', { name: /Validate Certificate/i }))
      await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1))
      const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body as string)
      expect(requestBody.options.checkRevocation).toBe(false)
    })
  })

  describe('Cache Management', () => {
    it('should call cache-clear endpoint', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ message: 'Cache cleared' }) })
      render(<CertificateValidationPage />)
      await openAdvancedOptions()
      fireEvent.click(screen.getByRole('button', { name: /Clear Cache/i }))
      // The component calls fetch with one argument, not two.
      await waitFor(() => expect(mockFetch).toHaveBeenCalledWith('/api/certificates/validate?action=cache-clear'))
      expect(await screen.findByText(/Cache cleared successfully/i)).toBeInTheDocument()
    })

    it('should display cache indicator', async () => {
      const cachedResponse = { ...mockSuccessResponse, result: { ...mockSuccessResponse.result, cached: true } }
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => cachedResponse })
      render(<CertificateValidationPage />)
      fireEvent.change(screen.getByLabelText(/Certificate PEM/i), { target: { value: mockValidCertPem } })
      fireEvent.click(screen.getByRole('button', { name: /Validate Certificate/i }))
      expect(await screen.findByText(/Result served from cache/i)).toBeInTheDocument()
    })
  })

  describe('UX and Form Handling', () => {
    it('should clear form and results', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => mockSuccessResponse })
      render(<CertificateValidationPage />)
      const textarea = screen.getByLabelText(/Certificate PEM/i)
      fireEvent.change(textarea, { target: { value: mockValidCertPem } })
      fireEvent.click(screen.getByRole('button', { name: /Validate Certificate/i }))
      await screen.findByText(/Certificate is valid/i)
      fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
      expect(textarea).toHaveValue('')
      expect(screen.queryByText(/Certificate is valid/i)).not.toBeInTheDocument()
    })

    it('should show loading state', async () => {
      mockFetch.mockImplementationOnce(() => new Promise(resolve => setTimeout(() => resolve({ ok: true, json: async () => mockSuccessResponse }), 50)))
      render(<CertificateValidationPage />)
      fireEvent.change(screen.getByLabelText(/Certificate PEM/i), { target: { value: mockValidCertPem } })
      fireEvent.click(screen.getByRole('button', { name: /Validate Certificate/i }))
      expect(screen.getByRole('button', { name: /Validating.../i })).toBeInTheDocument()
      await waitFor(() => expect(screen.queryByRole('button', { name: /Validating.../i })).not.toBeInTheDocument())
    })
  })
})