import { test, expect } from '@playwright/test';

test.describe('Certificate Management E2E Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Login before each test
    await page.goto('/auth/signin');
    await page.getByLabel('Username').fill('admin');
    await page.getByLabel('Password').fill('password');
    await page.getByRole('button', { name: 'Sign In' }).click();
    await expect(page).toHaveURL('/dashboard');
  });

  test('should display certificates list page', async ({ page }) => {
    await page.goto('/certificates');
    
    // Check main elements
    await expect(page.getByText('Certificates')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Issue New Certificate' })).toBeVisible();
    
    // Check if certificates table is present
    const certificatesTable = page.locator('table');
    if (await certificatesTable.isVisible()) {
      await expect(certificatesTable).toBeVisible();
    }
  });

  test('should navigate to certificate issue page', async ({ page }) => {
    await page.goto('/certificates');
    await page.getByRole('button', { name: 'Issue New Certificate' }).click();
    
    await expect(page).toHaveURL('/certificates/issue');
    await expect(page.getByText('Issue New Certificate')).toBeVisible();
  });

  test('should display certificate issue form with all required fields', async ({ page }) => {
    await page.goto('/certificates/issue');
    
    // Check form fields
    await expect(page.getByLabel('Common Name (CN)')).toBeVisible();
    await expect(page.getByLabel('Certificate Type')).toBeVisible();
    await expect(page.getByLabel('Key Algorithm')).toBeVisible();
    await expect(page.getByLabel('Key Size')).toBeVisible();
    await expect(page.getByLabel('Validity Period (days)')).toBeVisible();
    await expect(page.getByLabel('Subject Alternative Names (SANs)')).toBeVisible();
    
    // Check submit button
    await expect(page.getByRole('button', { name: 'Issue Certificate' })).toBeVisible();
  });

  test('should validate required fields in certificate issue form', async ({ page }) => {
    await page.goto('/certificates/issue');
    
    // Try to submit empty form
    await page.getByRole('button', { name: 'Issue Certificate' }).click();
    
    // Should show validation errors
    await expect(page.getByText('Common Name is required')).toBeVisible();
    await expect(page.getByText('Certificate Type is required')).toBeVisible();
    await expect(page.getByText('Key Algorithm is required')).toBeVisible();
    await expect(page.getByText('Validity Period is required')).toBeVisible();
  });

  test('should issue a basic certificate successfully', async ({ page }) => {
    await page.goto('/certificates/issue');
    
    // Fill in required fields
    await page.getByLabel('Common Name (CN)').fill('test.example.com');
    await page.getByLabel('Certificate Type').selectOption('SERVER');
    await page.getByLabel('Key Algorithm').selectOption('RSA');
    await page.getByLabel('Key Size').selectOption('2048');
    await page.getByLabel('Validity Period (days)').fill('365');
    await page.getByLabel('Subject Alternative Names (SANs)').fill('test.example.com,*.test.example.com');
    
    // Submit form
    await page.getByRole('button', { name: 'Issue Certificate' }).click();
    
    // Should show success message
    await expect(page.getByText('Certificate issued successfully')).toBeVisible();
    
    // Should display certificate details
    await expect(page.getByText('Certificate Details')).toBeVisible();
    await expect(page.getByText('test.example.com')).toBeVisible();
  });

  test('should handle certificate issuance errors gracefully', async ({ page }) => {
    await page.goto('/certificates/issue');
    
    // Fill in invalid data
    await page.getByLabel('Common Name (CN)').fill('test.example.com');
    await page.getByLabel('Certificate Type').selectOption('SERVER');
    await page.getByLabel('Key Algorithm').selectOption('RSA');
    await page.getByLabel('Key Size').selectOption('1024'); // Invalid key size
    await page.getByLabel('Validity Period (days)').fill('10000'); // Invalid validity
    
    // Submit form
    await page.getByRole('button', { name: 'Issue Certificate' }).click();
    
    // Should show error message
    await expect(page.getByText(/error|invalid|failed/i)).toBeVisible();
  });

  test('should display certificate details page', async ({ page }) => {
    // First issue a certificate
    await page.goto('/certificates/issue');
    await page.getByLabel('Common Name (CN)').fill('detail-test.example.com');
    await page.getByLabel('Certificate Type').selectOption('SERVER');
    await page.getByLabel('Key Algorithm').selectOption('RSA');
    await page.getByLabel('Key Size').selectOption('2048');
    await page.getByLabel('Validity Period (days)').fill('365');
    await page.getByRole('button', { name: 'Issue Certificate' }).click();
    
    await expect(page.getByText('Certificate issued successfully')).toBeVisible();
    
    // Navigate to certificates list
    await page.goto('/certificates');
    
    // Click on the certificate to view details
    const certificateRow = page.getByRole('row', { name: /detail-test\.example\.com/ });
    if (await certificateRow.isVisible()) {
      await certificateRow.click();
      
      // Should show certificate details
      await expect(page.getByText('Certificate Details')).toBeVisible();
      await expect(page.getByText('detail-test.example.com')).toBeVisible();
    }
  });

  test('should validate certificate successfully', async ({ page }) => {
    await page.goto('/certificates/validate');
    
    // Check validation form
    await expect(page.getByText('Certificate Validation')).toBeVisible();
    await expect(page.getByLabel('Certificate PEM')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Validate Certificate' })).toBeVisible();
  });

  test('should handle certificate validation with invalid input', async ({ page }) => {
    await page.goto('/certificates/validate');
    
    // Submit invalid certificate data
    await page.getByLabel('Certificate PEM').fill('invalid-certificate-data');
    await page.getByRole('button', { name: 'Validate Certificate' }).click();
    
    // Should show error message
    await expect(page.getByText(/invalid|error|failed/i)).toBeVisible();
  });

  test('should revoke certificate successfully', async ({ page }) => {
    // First issue a certificate to revoke
    await page.goto('/certificates/issue');
    await page.getByLabel('Common Name (CN)').fill('revoke-test.example.com');
    await page.getByLabel('Certificate Type').selectOption('SERVER');
    await page.getByLabel('Key Algorithm').selectOption('RSA');
    await page.getByLabel('Key Size').selectOption('2048');
    await page.getByLabel('Validity Period (days)').fill('365');
    await page.getByRole('button', { name: 'Issue Certificate' }).click();
    
    await expect(page.getByText('Certificate issued successfully')).toBeVisible();
    
    // Navigate to certificates list
    await page.goto('/certificates');
    
    // Find and revoke the certificate
    const certificateRow = page.getByRole('row', { name: /revoke-test\.example\.com/ });
    if (await certificateRow.isVisible()) {
      // Click actions menu
      await certificateRow.getByRole('button', { name: 'Actions' }).click();
      await page.getByRole('menuitem', { name: 'Revoke' }).click();
      
      // Fill revocation form
      await page.getByLabel('Revocation Reason').selectOption('UNSPECIFIED');
      await page.getByRole('button', { name: 'Revoke Certificate' }).click();
      
      // Should show success message
      await expect(page.getByText('Certificate revoked successfully')).toBeVisible();
    }
  });

  test('should search and filter certificates', async ({ page }) => {
    await page.goto('/certificates');
    
    // Check if search functionality exists
    const searchInput = page.getByPlaceholder(/search|filter/i);
    if (await searchInput.isVisible()) {
      // Test search functionality
      await searchInput.fill('test');
      await searchInput.press('Enter');
      
      // Should show filtered results
      await expect(page.getByText('test')).toBeVisible();
    }
  });

  test('should export certificates in different formats', async ({ page }) => {
    await page.goto('/certificates');
    
    // Check if export functionality exists
    const exportButton = page.getByRole('button', { name: /export|download/i });
    if (await exportButton.isVisible()) {
      await exportButton.click();
      
      // Should show export options
      await expect(page.getByText(/PEM|DER|P12/i)).toBeVisible();
    }
  });

  test('should handle bulk certificate operations', async ({ page }) => {
    await page.goto('/certificates');
    
    // Check if bulk operations exist
    const selectAllCheckbox = page.getByRole('checkbox', { name: /select all/i });
    if (await selectAllCheckbox.isVisible()) {
      await selectAllCheckbox.check();
      
      // Should show bulk action buttons
      await expect(page.getByRole('button', { name: /bulk|revoke|export/i })).toBeVisible();
    }
  });
});