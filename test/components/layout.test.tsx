import { render, screen, waitFor } from '../utils/test-utils'
import Layout from '@/components/layout'
import { useAuth } from '@/hooks/useAuth'
import { usePathname } from 'next/navigation'

// Mock the useAuth hook
jest.mock('@/hooks/useAuth')
const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>

describe('Layout Component', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should render loading state when authentication is loading', () => {
    mockUseAuth.mockReturnValue({
      session: null,
      isAuthenticated: false,
      isLoading: true,
    })

    render(<Layout>Test Content</Layout>)

    expect(screen.getByText('Loading...')).toBeInTheDocument()
    expect(screen.queryByText('Test Content')).not.toBeInTheDocument()
  })

  it('should render sign-in page when not authenticated', () => {
    mockUseAuth.mockReturnValue({
      session: null,
      isAuthenticated: false,
      isLoading: false,
    })

    render(<Layout>Test Content</Layout>)

    // Should render SignInPage component
    expect(screen.getByText('Sign In')).toBeInTheDocument()
    expect(screen.queryByText('Test Content')).not.toBeInTheDocument()
  })

  it('should render authenticated layout when user is authenticated', async () => {
    const mockSession = {
      user: {
        id: 'test-user-id',
        username: 'testuser',
        email: 'test@example.com',
        role: 'ADMIN',
        permissions: ['ca:manage', 'certificate:issue', 'user:manage', 'audit:view'],
      },
      expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    }

    mockUseAuth.mockReturnValue({
      session: mockSession,
      isAuthenticated: true,
      isLoading: false,
    })

    render(<Layout>Test Content</Layout>)

    await waitFor(() => {
      expect(screen.getByText('CA Management')).toBeInTheDocument()
    })

    expect(screen.getByText('Home')).toBeInTheDocument()
    expect(screen.getByText('Activity Log')).toBeInTheDocument()
    expect(screen.getByText('Notifications')).toBeInTheDocument()
    expect(screen.getByText('Test Content')).toBeInTheDocument()
  })

  it('should show user profile information when authenticated', async () => {
    const mockSession = {
      user: {
        id: 'test-user-id',
        username: 'testuser',
        email: 'test@example.com',
        role: 'ADMIN',
        permissions: ['ca:manage', 'certificate:issue', 'user:manage', 'audit:view'],
      },
      expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    }

    mockUseAuth.mockReturnValue({
      session: mockSession,
      isAuthenticated: true,
      isLoading: false,
    })

    render(<Layout>Test Content</Layout>)

    await waitFor(() => {
      expect(screen.getByText('testuser')).toBeInTheDocument()
    })

    expect(screen.getByText('ADMIN')).toBeInTheDocument()
  })

  it('should show logout button when authenticated', async () => {
    const mockSession = {
      user: {
        id: 'test-user-id',
        username: 'testuser',
        email: 'test@example.com',
        role: 'ADMIN',
        permissions: ['ca:manage', 'certificate:issue', 'user:manage', 'audit:view'],
      },
      expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    }

    mockUseAuth.mockReturnValue({
      session: mockSession,
      isAuthenticated: true,
      isLoading: false,
    })

    render(<Layout>Test Content</Layout>)

    await waitFor(() => {
      expect(screen.getByText('Sign Out')).toBeInTheDocument()
    })
  })

  it('should conditionally show navigation items based on permissions', async () => {
    const mockSession = {
      user: {
        id: 'test-user-id',
        username: 'testuser',
        email: 'test@example.com',
        role: 'VIEWER',
        permissions: ['certificate:view', 'audit:view'],
      },
      expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    }

    mockUseAuth.mockReturnValue({
      session: mockSession,
      isAuthenticated: true,
      isLoading: false,
    })

    render(<Layout>Test Content</Layout>)

    await waitFor(() => {
      expect(screen.getByText('CA Management')).toBeInTheDocument()
    })

    // Should show Activity Log (audit:view permission)
    expect(screen.getByText('Activity Log')).toBeInTheDocument()
    
    // Should not show Notifications (requires config:manage permission)
    expect(screen.queryByText('Notifications')).not.toBeInTheDocument()
  })

  it('should handle auth routes without layout chrome', () => {
    // Mock usePathname to return auth route
    ;(usePathname as jest.Mock).mockReturnValue('/auth/signin')

    mockUseAuth.mockReturnValue({
      session: null,
      isAuthenticated: false,
      isLoading: false,
    })

    render(<Layout>Auth Content</Layout>)

    // Should render children directly without layout chrome
    expect(screen.getByText('Auth Content')).toBeInTheDocument()
    expect(screen.queryByText('CA Management')).not.toBeInTheDocument()
  })
})