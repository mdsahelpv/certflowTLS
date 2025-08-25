import '@testing-library/jest-dom'
import { render, screen, fireEvent, waitFor, within } from '../utils/test-utils'
import { useRouter } from 'next/navigation'
import CertificateValidationPage from '@/app/certificates/validate/page'

// Mock dependencies
jest.mock('next/navigation')

const mockUseRouter = useRouter as jest.MockedFunction<typeof useRouter>

const mockValidCertPem = '-----BEGIN CERTIFICATE-----\nMOCK_VALID_CERT\n-----END CERTIFICATE-----'

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

const mockErrorResponse = {
  result: {
    isValid: false,
    issues: ['Certificate expired', 'Root CA not trusted'],
    chain: [],
    chainInfo: {
      chainLength: 1,
      isComplete: false,
      rootCA: null,
      intermediateCAs: [],
      endEntity: 'test.example.com'
    },
    expiration: {
      expired: true,
      daysUntilExpiry: -10,
      validFrom: new Date('2020-01-01').toISOString(),
      validTo: new Date('2021-01-01').toISOString()
    },
    signature: { verified: true, issuer: 'Some CA' },
    lastValidated: new Date().toISOString(),
    cached: false
  }
}

describe('Certificate Validation - Integration Flow', () => {
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

  it('should handle a full successful validation flow', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => mockSuccessResponse })
    render(<CertificateValidationPage />)

    // 1. Paste certificate
    const textarea = screen.getByLabelText(/Certificate PEM/i)
    fireEvent.change(textarea, { target: { value: mockValidCertPem } })

    // 2. Open advanced options and toggle one
    fireEvent.click(screen.getByRole('button', { name: /Advanced Validation Options/i }))
    const checkRevocation = await screen.findByLabelText(/Check Revocation/i)
    fireEvent.click(checkRevocation) // Toggle it off

    // 3. Validate
    fireEvent.click(screen.getByRole('button', { name: /Validate Certificate/i }))

    // 4. Check for loading state
    expect(screen.getByRole('button', { name: /Validating.../i })).toBeInTheDocument()

    // 5. Check for final results
    expect(await screen.findByText(/Certificate is valid/i)).toBeInTheDocument()
    expect(screen.getAllByText('Root CA').length).toBeGreaterThan(0)
    expect(screen.getAllByText('test.example.com').length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: /Validating.../i })).not.toBeInTheDocument()

    // 6. Verify fetch was called with correct options
    const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body as string)
    expect(requestBody.options.checkRevocation).toBe(false) // It was toggled off
    expect(requestBody.options.checkExpiration).toBe(true) // This one was not touched
  })

  it('should handle a full validation flow with errors', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => mockErrorResponse })
    render(<CertificateValidationPage />)

    // 1. Paste certificate
    const textarea = screen.getByLabelText(/Certificate PEM/i)
    fireEvent.change(textarea, { target: { value: mockValidCertPem } })

    // 2. Validate
    fireEvent.click(screen.getByRole('button', { name: /Validate Certificate/i }))

    // 3. Check for error results
    expect(await screen.findByText(/Certificate has issues/i)).toBeInTheDocument()
    expect(screen.getByText(/Certificate expired/i)).toBeInTheDocument()
    expect(screen.getByText(/Root CA not trusted/i)).toBeInTheDocument()

    // Check for the "Expired" badge specifically in the validity period section
    const validityPeriodSection = screen.getByText('Validity Period').closest('div')
    const { getByText } = within(validityPeriodSection!)
    expect(getByText('Expired')).toBeInTheDocument()
  })

  it('should handle cache interactions correctly', async () => {
    // First call is a miss
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => mockSuccessResponse })
    // Second call is a hit
    const cachedResponse = { ...mockSuccessResponse, result: { ...mockSuccessResponse.result, cached: true } }
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => cachedResponse })

    render(<CertificateValidationPage />)
    const textarea = screen.getByLabelText(/Certificate PEM/i)
    const validateButton = screen.getByRole('button', { name: /Validate Certificate/i })

    // First validation
    fireEvent.change(textarea, { target: { value: mockValidCertPem } })
    fireEvent.click(validateButton)
    expect(await screen.findByText(/Certificate is valid/i)).toBeInTheDocument()
    expect(screen.queryByText(/Result served from cache/i)).not.toBeInTheDocument()

    // Second validation
    fireEvent.click(validateButton)
    expect(await screen.findByText(/Result served from cache/i)).toBeInTheDocument()
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })
})
