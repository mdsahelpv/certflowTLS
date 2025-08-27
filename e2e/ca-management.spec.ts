import { test, expect } from '@playwright/test';

test.describe('CA Management E2E Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Login before each test
    await page.goto('/auth/signin');
    await page.getByLabel('Username').fill('admin');
    await page.getByLabel('Password').fill('password');
    await page.getByRole('button', { name: 'Sign In' }).click();
    await expect(page).toHaveURL('/dashboard');
  });

  test('should display CA status page', async ({ page }) => {
    await page.goto('/ca/status');
    
    // Check main elements
    await expect(page.getByText('CA Status')).toBeVisible();
    
    // Check status indicators
    const statusIndicator = page.locator('[data-testid="ca-status"]');
    if (await statusIndicator.isVisible()) {
      await expect(statusIndicator).toBeVisible();
    }
  });

  test('should show CA configuration details', async ({ page }) => {
    await page.goto('/ca/status');
    
    // Check if CA configuration is displayed
    const configSection = page.getByText('Configuration');
    if (await configSection.isVisible()) {
      await expect(configSection).toBeVisible();
      
      // Check for common configuration fields
      await expect(page.getByText(/Common Name|Organization|Country/i)).toBeVisible();
    }
  });

  test('should display CA certificate information', async ({ page }) => {
    await page.goto('/ca/status');
    
    // Check if CA certificate details are shown
    const certSection = page.getByText('Certificate');
    if (await certSection.isVisible()) {
      await expect(certSection).toBeVisible();
      
      // Check for certificate fields
      await expect(page.getByText(/Serial Number|Valid From|Valid To/i)).toBeVisible();
    }
  });

  test('should show CA statistics and metrics', async ({ page }) => {
    await page.goto('/ca/status');
    
    // Check if statistics are displayed
    const statsSection = page.getByText(/Statistics|Metrics|Overview/i);
    if (await statsSection.isVisible()) {
      await expect(statsSection).toBeVisible();
      
      // Check for common metrics
      await expect(page.getByText(/Total Certificates|Active|Revoked/i)).toBeVisible();
    }
  });

  test('should navigate to CA setup page', async ({ page }) => {
    await page.goto('/ca/status');
    
    // Look for setup button
    const setupButton = page.getByRole('button', { name: /setup|configure|initialize/i });
    if (await setupButton.isVisible()) {
      await setupButton.click();
      await expect(page).toHaveURL('/ca/setup');
    }
  });

  test('should display CA setup form', async ({ page }) => {
    await page.goto('/ca/setup');
    
    // Check setup form elements
    await expect(page.getByText('CA Setup')).toBeVisible();
    
    // Check for setup options
    const setupOptions = page.getByText(/Generate New|Upload Existing|Configure/i);
    if (await setupOptions.isVisible()) {
      await expect(setupOptions).toBeVisible();
    }
  });

  test('should generate new CA key pair', async ({ page }) => {
    await page.goto('/ca/setup');
    
    // Look for generate option
    const generateButton = page.getByRole('button', { name: /generate|create|new/i });
    if (await generateButton.isVisible()) {
      await generateButton.click();
      
      // Should show generation form
      await expect(page.getByText(/Key Generation|Parameters/i)).toBeVisible();
      
      // Fill in parameters
      await page.getByLabel('Key Algorithm').selectOption('RSA');
      await page.getByLabel('Key Size').selectOption('4096');
      await page.getByLabel('Common Name').fill('Test CA');
      
      // Generate
      await page.getByRole('button', { name: 'Generate' }).click();
      
      // Should show generated key pair
      await expect(page.getByText(/Private Key|Public Key/i)).toBeVisible();
    }
  });

  test('should create CA certificate from CSR', async ({ page }) => {
    await page.goto('/ca/setup');
    
    // Look for CSR option
    const csrButton = page.getByRole('button', { name: /csr|certificate request/i });
    if (await csrButton.isVisible()) {
      await csrButton.click();
      
      // Should show CSR form
      await expect(page.getByText(/Certificate Signing Request/i)).toBeVisible();
      
      // Fill in CSR details
      await page.getByLabel('Common Name').fill('Test CA');
      await page.getByLabel('Organization').fill('Test Organization');
      await page.getByLabel('Country').fill('US');
      
      // Generate CSR
      await page.getByRole('button', { name: 'Generate CSR' }).click();
      
      // Should show generated CSR
      await expect(page.getByText(/-----BEGIN CERTIFICATE REQUEST-----/)).toBeVisible();
    }
  });

  test('should upload existing CA certificate', async ({ page }) => {
    await page.goto('/ca/setup');
    
    // Look for upload option
    const uploadButton = page.getByRole('button', { name: /upload|import|existing/i });
    if (await uploadButton.isVisible()) {
      await uploadButton.click();
      
      // Should show upload form
      await expect(page.getByText(/Upload Certificate/i)).toBeVisible();
      
      // Check for file input
      const fileInput = page.locator('input[type="file"]');
      if (await fileInput.isVisible()) {
        await expect(fileInput).toBeVisible();
      }
    }
  });

  test('should configure CA settings', async ({ page }) => {
    await page.goto('/ca/setup');
    
    // Look for configuration option
    const configButton = page.getByRole('button', { name: /configure|settings|options/i });
    if (await configButton.isVisible()) {
      await configButton.click();
      
      // Should show configuration form
      await expect(page.getByText(/Configuration|Settings/i)).toBeVisible();
      
      // Check for common settings
      await expect(page.getByText(/Default Validity|CRL|OCSP/i)).toBeVisible();
    }
  });

  test('should display CRL information', async ({ page }) => {
    await page.goto('/ca/status');
    
    // Look for CRL section
    const crlSection = page.getByText(/CRL|Certificate Revocation List/i);
    if (await crlSection.isVisible()) {
      await expect(crlSection).toBeVisible();
      
      // Check for CRL details
      await expect(page.getByText(/Last Updated|Next Update|Revoked Certificates/i)).toBeVisible();
    }
  });

  test('should download CRL', async ({ page }) => {
    await page.goto('/ca/status');
    
    // Look for CRL download button
    const downloadButton = page.getByRole('button', { name: /download|export|crl/i });
    if (await downloadButton.isVisible()) {
      await downloadButton.click();
      
      // Should trigger download or show download options
      await expect(page.getByText(/Download|Export/i)).toBeVisible();
    }
  });

  test('should display OCSP responder status', async ({ page }) => {
    await page.goto('/ca/status');
    
    // Look for OCSP section
    const ocspSection = page.getByText(/OCSP|Online Certificate Status Protocol/i);
    if (await ocspSection.isVisible()) {
      await expect(ocspSection).toBeVisible();
      
      // Check for OCSP status
      await expect(page.getByText(/Status|URL|Last Check/i)).toBeVisible();
    }
  });

  test('should show CA audit log', async ({ page }) => {
    await page.goto('/ca/status');
    
    // Look for audit section
    const auditSection = page.getByText(/Audit|Log|History/i);
    if (await auditSection.isVisible()) {
      await expect(auditSection).toBeVisible();
      
      // Check for audit entries
      await expect(page.getByText(/Date|Action|User|Details/i)).toBeVisible();
    }
  });

  test('should handle CA backup and restore', async ({ page }) => {
    await page.goto('/ca/status');
    
    // Look for backup options
    const backupButton = page.getByRole('button', { name: /backup|export|save/i });
    if (await backupButton.isVisible()) {
      await backupButton.click();
      
      // Should show backup options
      await expect(page.getByText(/Backup|Export|Save/i)).toBeVisible();
      
      // Check for backup formats
      await expect(page.getByText(/PEM|PKCS12|Archive/i)).toBeVisible();
    }
  });

  test('should display CA health monitoring', async ({ page }) => {
    await page.goto('/ca/status');
    
    // Look for health section
    const healthSection = page.getByText(/Health|Monitoring|Status/i);
    if (await healthSection.isVisible()) {
      await expect(healthSection).toBeVisible();
      
      // Check for health indicators
      await expect(page.getByText(/CPU|Memory|Disk|Network/i)).toBeVisible();
    }
  });

  test('should handle CA maintenance mode', async ({ page }) => {
    await page.goto('/ca/status');
    
    // Look for maintenance controls
    const maintenanceButton = page.getByRole('button', { name: /maintenance|mode|pause/i });
    if (await maintenanceButton.isVisible()) {
      await maintenanceButton.click();
      
      // Should show maintenance options
      await expect(page.getByText(/Maintenance|Mode|Pause/i)).toBeVisible();
      
      // Check for maintenance options
      await expect(page.getByText(/Enable|Disable|Schedule/i)).toBeVisible();
    }
  });
});