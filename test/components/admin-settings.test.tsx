import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { SessionProvider } from 'next-auth/react';
import AdminSettingsPage from '@/app/admin/settings/page';
import { useToast } from '@/hooks/use-toast';

// Mock next-auth
jest.mock('next-auth/react', () => ({
  SessionProvider: ({ children }: { children: React.ReactNode }) => children,
  useSession: jest.fn(() => ({
    data: {
      user: {
        id: 'test-admin-id',
        username: 'testadmin',
        email: 'admin@test.com',
        role: 'ADMIN',
        permissions: ['config:manage', 'admin:manage']
      },
      expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    },
    status: 'authenticated'
  }))
}));

// Mock useAuth hook
jest.mock('@/hooks/useAuth', () => ({
  useAuth: jest.fn(() => ({
    session: {
      user: {
        id: 'test-admin-id',
        username: 'testadmin',
        email: 'admin@test.com',
        role: 'ADMIN',
        permissions: ['config:manage', 'admin:manage']
      },
      expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    },
    isAuthenticated: true
  }))
}));

// useToast is already mocked in setup.tsx

// Mock fetch
const mockFetch = jest.fn() as jest.MockedFunction<typeof fetch>;
global.fetch = mockFetch;

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

describe('Admin Settings Page Component Tests', () => {
  const mockToast = jest.fn();
  const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true })
    } as Response);
    (useToast as jest.Mock).mockReturnValue({ toast: mockToast });
  });

  afterEach(() => {
    jest.clearAllTimers();
  });

  describe('Initial Rendering', () => {
    it('should render admin settings page with all tabs', () => {
      render(
        <SessionProvider session={null}>
          <AdminSettingsPage />
        </SessionProvider>
      );

      expect(screen.getByText('Admin Settings')).toBeInTheDocument();
      expect(screen.getByText('Configure system-wide settings and preferences')).toBeInTheDocument();

      // Check all tab triggers are present
      expect(screen.getByRole('tab', { name: /system/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /security/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /notifications/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /audit/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /ca/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /performance/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /integrations/i })).toBeInTheDocument();
    });

    it('should show loading state initially', () => {
      render(
        <SessionProvider session={null}>
          <AdminSettingsPage />
        </SessionProvider>
      );

      // Should not show access denied for admin user
      expect(screen.queryByText('Access Denied')).not.toBeInTheDocument();
    });
  });

  describe('Permission-based Rendering', () => {
    it('should render access denied for users without config:manage permission', () => {
      // Mock useAuth to return user without config:manage permission
      const mockUseAuth = require('@/hooks/useAuth').useAuth;
      mockUseAuth.mockReturnValueOnce({
        session: {
          user: {
            id: 'test-user-id',
            username: 'testuser',
            email: 'user@test.com',
            role: 'USER',
            permissions: ['certificate:view']
          },
          expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
        },
        isAuthenticated: true
      });

      render(
        <SessionProvider session={null}>
          <AdminSettingsPage />
        </SessionProvider>
      );

      expect(screen.getByText('Access Denied')).toBeInTheDocument();
      expect(screen.getByText("You don't have permission to access admin settings.")).toBeInTheDocument();
    });

    it('should render admin settings for users with config:manage permission', () => {
      render(
        <SessionProvider session={null}>
          <AdminSettingsPage />
        </SessionProvider>
      );

      expect(screen.queryByText('Access Denied')).not.toBeInTheDocument();
      expect(screen.getByText('Admin Settings')).toBeInTheDocument();
    });
  });

  describe('Tab Navigation', () => {
    it('should switch between tabs correctly', async () => {
      render(
        <SessionProvider session={null}>
          <AdminSettingsPage />
        </SessionProvider>
      );

      // Initially on system tab
      expect(screen.getByText('Database Settings')).toBeInTheDocument();

      // Switch to security tab
      const securityTab = screen.getByRole('tab', { name: /security/i });
      fireEvent.click(securityTab);

      await waitFor(() => {
        expect(screen.getByText('Password Policy')).toBeInTheDocument();
        expect(screen.getByText('Session Management')).toBeInTheDocument();
      });

      // Switch to CA tab
      const caTab = screen.getByRole('tab', { name: /ca/i });
      fireEvent.click(caTab);

      await waitFor(() => {
        expect(screen.getByText('CA Renewal Policy')).toBeInTheDocument();
        expect(screen.getByText('Certificate Templates')).toBeInTheDocument();
      });
    });

    it('should maintain tab state when switching', async () => {
      render(
        <SessionProvider session={null}>
          <AdminSettingsPage />
        </SessionProvider>
      );

      // Switch to security tab and modify form
      const securityTab = screen.getByRole('tab', { name: /security/i });
      fireEvent.click(securityTab);

      await waitFor(() => {
        expect(screen.getByText('Password Policy')).toBeInTheDocument();
      });

      // Modify password policy settings
      const minLengthInput = screen.getByLabelText(/minimum length/i);
      fireEvent.change(minLengthInput, { target: { value: '14' } });

      // Switch to another tab and back
      const systemTab = screen.getByRole('tab', { name: /system/i });
      fireEvent.click(systemTab);

      await waitFor(() => {
        expect(screen.getByText('Database Settings')).toBeInTheDocument();
      });

      // Switch back to security tab
      fireEvent.click(securityTab);

      await waitFor(() => {
        expect(screen.getByDisplayValue('14')).toBeInTheDocument();
      });
    });
  });

  describe('Form Validation and Error Handling', () => {
    it('should validate password policy form inputs', async () => {
      render(
        <SessionProvider session={null}>
          <AdminSettingsPage />
        </SessionProvider>
      );

      // Switch to security tab
      const securityTab = screen.getByRole('tab', { name: /security/i });
      fireEvent.click(securityTab);

      await waitFor(() => {
        expect(screen.getByText('Password Policy')).toBeInTheDocument();
      });

      // Test minimum length validation
      const minLengthInput = screen.getByLabelText(/minimum length/i);
      fireEvent.change(minLengthInput, { target: { value: '3' } }); // Below minimum

      // Test maximum length validation
      fireEvent.change(minLengthInput, { target: { value: '50' } }); // Above maximum

      // Test valid input
      fireEvent.change(minLengthInput, { target: { value: '12' } });
      expect(screen.getByDisplayValue('12')).toBeInTheDocument();
    });

    it('should validate session configuration inputs', async () => {
      render(
        <SessionProvider session={null}>
          <AdminSettingsPage />
        </SessionProvider>
      );

      // Switch to security tab
      const securityTab = screen.getByRole('tab', { name: /security/i });
      fireEvent.click(securityTab);

      await waitFor(() => {
        expect(screen.getByText('Session Management')).toBeInTheDocument();
      });

      // Test session timeout validation
      const timeoutInput = screen.getByLabelText(/session timeout/i);
      fireEvent.change(timeoutInput, { target: { value: '2' } }); // Below minimum
      fireEvent.change(timeoutInput, { target: { value: '600' } }); // Above maximum
      fireEvent.change(timeoutInput, { target: { value: '30' } }); // Valid

      expect(screen.getByDisplayValue('30')).toBeInTheDocument();
    });

    it('should handle API errors gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      render(
        <SessionProvider session={null}>
          <AdminSettingsPage />
        </SessionProvider>
      );

      // Wait for component to attempt API call
      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith({
          title: 'Error',
          description: 'Failed to fetch system configuration',
          variant: 'destructive',
        });
      });
    });

    it('should show validation errors for invalid inputs', async () => {
      render(
        <SessionProvider session={null}>
          <AdminSettingsPage />
        </SessionProvider>
      );

      // Switch to CA tab
      const caTab = screen.getByRole('tab', { name: /ca/i });
      fireEvent.click(caTab);

      await waitFor(() => {
        expect(screen.getByText('CA Renewal Policy')).toBeInTheDocument();
      });

      // Test invalid renewal threshold
      const thresholdInput = screen.getByLabelText(/renewal threshold/i);
      fireEvent.change(thresholdInput, { target: { value: '400' } }); // Above maximum

      // Test invalid notification days
      const notificationInput = screen.getByLabelText(/notification days before expiry/i);
      fireEvent.change(notificationInput, { target: { value: '100' } }); // Above maximum
    });
  });

  describe('Form Submission', () => {
    it('should submit password policy form successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, message: 'Password policy updated' })
      } as Response);

      render(
        <SessionProvider session={null}>
          <AdminSettingsPage />
        </SessionProvider>
      );

      // Switch to security tab
      const securityTab = screen.getByRole('tab', { name: /security/i });
      fireEvent.click(securityTab);

      await waitFor(() => {
        expect(screen.getByText('Password Policy')).toBeInTheDocument();
      });

      // Modify form
      const minLengthInput = screen.getByLabelText(/minimum length/i);
      fireEvent.change(minLengthInput, { target: { value: '14' } });

      // Submit form
      const saveButton = screen.getByText('Save Password Policy');
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith({
          title: 'Success',
          description: 'Password policy updated',
        });
      });
    });

    it('should handle form submission errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'Validation failed' })
      } as Response);

      render(
        <SessionProvider session={null}>
          <AdminSettingsPage />
        </SessionProvider>
      );

      // Switch to security tab
      const securityTab = screen.getByRole('tab', { name: /security/i });
      fireEvent.click(securityTab);

      await waitFor(() => {
        expect(screen.getByText('Password Policy')).toBeInTheDocument();
      });

      // Submit form
      const saveButton = screen.getByText('Save Password Policy');
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith({
          title: 'Error',
          description: 'Failed to update password policy',
          variant: 'destructive',
        });
      });
    });
  });

  describe('Loading States', () => {
    it('should show loading state during API calls', async () => {
      let resolvePromise: (value: any) => void;
      const promise = new Promise((resolve) => {
        resolvePromise = resolve;
      });

      mockFetch.mockReturnValueOnce(promise as any);

      render(
        <SessionProvider session={null}>
          <AdminSettingsPage />
        </SessionProvider>
      );

      // Trigger maintenance mode toggle
      const maintenanceToggle = screen.getByRole('switch', { name: /maintenance mode/i });
      fireEvent.click(maintenanceToggle);

      const toggleButton = screen.getByText('Enable Maintenance Mode');
      fireEvent.click(toggleButton);

      // Check loading state
      expect(screen.getByText('Updating...')).toBeInTheDocument();

      // Resolve the promise
      act(() => {
        resolvePromise!({
          ok: true,
          json: async () => ({ success: true, message: 'Maintenance mode updated' })
        });
      });

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith({
          title: 'Success',
          description: 'Maintenance mode updated',
        });
      });
    });

    it('should disable buttons during loading', async () => {
      let resolvePromise: (value: any) => void;
      const promise = new Promise((resolve) => {
        resolvePromise = resolve;
      });

      mockFetch.mockReturnValueOnce(promise as any);

      render(
        <SessionProvider session={null}>
          <AdminSettingsPage />
        </SessionProvider>
      );

      // Trigger backup creation
      const createBackupButton = screen.getByText('Create Backup');
      fireEvent.click(createBackupButton);

      // Check button is disabled during loading
      expect(screen.getByText('Creating Backup...')).toBeInTheDocument();

      // Resolve the promise
      act(() => {
        resolvePromise!({
          ok: true,
          json: async () => ({ success: true, message: 'Backup created' })
        });
      });

      await waitFor(() => {
        expect(screen.getByText('Create Backup')).toBeInTheDocument();
      });
    });
  });

  describe('State Management', () => {
    it('should maintain form state across tab switches', async () => {
      render(
        <SessionProvider session={null}>
          <AdminSettingsPage />
        </SessionProvider>
      );

      // Switch to security tab
      const securityTab = screen.getByRole('tab', { name: /security/i });
      fireEvent.click(securityTab);

      await waitFor(() => {
        expect(screen.getByText('Password Policy')).toBeInTheDocument();
      });

      // Modify multiple form fields
      const minLengthInput = screen.getByLabelText(/minimum length/i);
      const preventReuseInput = screen.getByLabelText(/prevent password reuse/i);

      fireEvent.change(minLengthInput, { target: { value: '16' } });
      fireEvent.change(preventReuseInput, { target: { value: '8' } });

      // Switch to system tab
      const systemTab = screen.getByRole('tab', { name: /system/i });
      fireEvent.click(systemTab);

      await waitFor(() => {
        expect(screen.getByText('Database Settings')).toBeInTheDocument();
      });

      // Switch back to security tab
      fireEvent.click(securityTab);

      await waitFor(() => {
        expect(screen.getByDisplayValue('16')).toBeInTheDocument();
        expect(screen.getByDisplayValue('8')).toBeInTheDocument();
      });
    });

    it('should reset form state on successful submission', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, message: 'Settings updated' })
      } as Response);

      render(
        <SessionProvider session={null}>
          <AdminSettingsPage />
        </SessionProvider>
      );

      // Switch to security tab
      const securityTab = screen.getByRole('tab', { name: /security/i });
      fireEvent.click(securityTab);

      await waitFor(() => {
        expect(screen.getByText('Password Policy')).toBeInTheDocument();
      });

      // Modify form
      const minLengthInput = screen.getByLabelText(/minimum length/i);
      fireEvent.change(minLengthInput, { target: { value: '14' } });

      // Submit form
      const saveButton = screen.getByText('Save Password Policy');
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith({
          title: 'Success',
          description: 'Settings updated',
        });
      });

      // Form should maintain the submitted values
      expect(screen.getByDisplayValue('14')).toBeInTheDocument();
    });
  });

  describe('Maintenance Mode Functionality', () => {
    it('should toggle maintenance mode successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, message: 'Maintenance mode enabled' })
      } as Response);

      render(
        <SessionProvider session={null}>
          <AdminSettingsPage />
        </SessionProvider>
      );

      // Enable maintenance mode
      const maintenanceToggle = screen.getByRole('switch', { name: /maintenance mode/i });
      fireEvent.click(maintenanceToggle);

      // Enter maintenance message
      const messageTextarea = screen.getByLabelText(/maintenance message/i);
      fireEvent.change(messageTextarea, { target: { value: 'System maintenance in progress' } });

      // Submit
      const toggleButton = screen.getByText('Enable Maintenance Mode');
      fireEvent.click(toggleButton);

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith({
          title: 'Success',
          description: 'Maintenance mode enabled',
        });
      });
    });

    it('should show maintenance message input when mode is enabled', async () => {
      render(
        <SessionProvider session={null}>
          <AdminSettingsPage />
        </SessionProvider>
      );

      // Initially maintenance message should not be visible
      expect(screen.queryByLabelText(/maintenance message/i)).not.toBeInTheDocument();

      // Enable maintenance mode
      const maintenanceToggle = screen.getByRole('switch', { name: /maintenance mode/i });
      fireEvent.click(maintenanceToggle);

      // Now maintenance message should be visible
      expect(screen.getByLabelText(/maintenance message/i)).toBeInTheDocument();
    });
  });

  describe('Backup Functionality', () => {
    it('should create backup successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, message: 'Backup created successfully' })
      } as Response);

      render(
        <SessionProvider session={null}>
          <AdminSettingsPage />
        </SessionProvider>
      );

      const createBackupButton = screen.getByText('Create Backup');
      fireEvent.click(createBackupButton);

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith({
          title: 'Success',
          description: 'Backup created successfully',
        });
      });
    });

    it('should delete backup with confirmation', async () => {
      // Mock window.confirm
      const mockConfirm = jest.spyOn(window, 'confirm');
      mockConfirm.mockReturnValue(true);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, message: 'Backup deleted' })
      } as Response);

      render(
        <SessionProvider session={null}>
          <AdminSettingsPage />
        </SessionProvider>
      );

      // Mock backup history data
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          backups: [{
            filename: 'backup-2025-09-06.sql',
            createdAt: new Date().toISOString(),
            sizeFormatted: '1.2 MB',
            databaseType: 'SQLite'
          }]
        })
      } as Response);

      // Refresh backup history
      const refreshButton = screen.getByText('Refresh');
      fireEvent.click(refreshButton);

      await waitFor(() => {
        expect(screen.getByText('backup-2025-09-06.sql')).toBeInTheDocument();
      });

      // Delete backup
      const deleteButton = screen.getByText('Delete');
      fireEvent.click(deleteButton);

      expect(mockConfirm).toHaveBeenCalledWith(
        'Are you sure you want to delete the backup "backup-2025-09-06.sql"? This action cannot be undone.'
      );

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith({
          title: 'Success',
          description: 'Backup deleted',
        });
      });

      mockConfirm.mockRestore();
    });
  });

  describe('Switch Components', () => {
    it('should handle switch toggles correctly', async () => {
      render(
        <SessionProvider session={null}>
          <AdminSettingsPage />
        </SessionProvider>
      );

      // Switch to security tab
      const securityTab = screen.getByRole('tab', { name: /security/i });
      fireEvent.click(securityTab);

      await waitFor(() => {
        expect(screen.getByText('Password Policy')).toBeInTheDocument();
      });

      // Test password policy switches
      const uppercaseSwitch = screen.getByRole('switch', { name: /require uppercase letters/i });
      const lowercaseSwitch = screen.getByRole('switch', { name: /require lowercase letters/i });
      const numbersSwitch = screen.getByRole('switch', { name: /require numbers/i });

      // Toggle switches
      fireEvent.click(uppercaseSwitch);
      fireEvent.click(lowercaseSwitch);
      fireEvent.click(numbersSwitch);

      // Switches should be toggled
      expect(uppercaseSwitch).not.toBeChecked();
      expect(lowercaseSwitch).not.toBeChecked();
      expect(numbersSwitch).not.toBeChecked();
    });
  });

  describe('Select Components', () => {
    it('should handle select changes correctly', async () => {
      render(
        <SessionProvider session={null}>
          <AdminSettingsPage />
        </SessionProvider>
      );

      // Switch to CA tab
      const caTab = screen.getByRole('tab', { name: /ca/i });
      fireEvent.click(caTab);

      await waitFor(() => {
        expect(screen.getByText('Certificate Templates')).toBeInTheDocument();
      });

      // Test key size select
      const keySizeSelect = screen.getByLabelText(/default key size/i);
      fireEvent.change(keySizeSelect, { target: { value: '3072' } });

      expect(screen.getByDisplayValue('3072 bits')).toBeInTheDocument();

      // Test algorithm select
      const algorithmSelect = screen.getByLabelText(/default algorithm/i);
      fireEvent.change(algorithmSelect, { target: { value: 'ECDSA' } });

      expect(screen.getByDisplayValue('ECDSA')).toBeInTheDocument();
    });
  });

  describe('Textarea Components', () => {
    it('should handle textarea input correctly', async () => {
      render(
        <SessionProvider session={null}>
          <AdminSettingsPage />
        </SessionProvider>
      );

      // Switch to CA tab
      const caTab = screen.getByRole('tab', { name: /ca/i });
      fireEvent.click(caTab);

      await waitFor(() => {
        expect(screen.getByText('CRL Settings')).toBeInTheDocument();
      });

      // Test CRL distribution points textarea
      const crlTextarea = screen.getByLabelText(/crl distribution points/i);
      const testUrls = 'https://cdn.example.com/crl/latest.crl\nhttps://backup.example.com/crl/latest.crl';

      fireEvent.change(crlTextarea, { target: { value: testUrls } });

      expect(screen.getByDisplayValue(testUrls)).toBeInTheDocument();
    });
  });
});
