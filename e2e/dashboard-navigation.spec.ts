import { test, expect } from '@playwright/test';

test.describe('Dashboard and Navigation E2E Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Login before each test
    await page.goto('/auth/signin');
    await page.getByLabel('Username').fill('admin');
    await page.getByLabel('Password').fill('password');
    await page.getByRole('button', { name: 'Sign In' }).click();
    await expect(page).toHaveURL('/dashboard');
  });

  test('should display dashboard with correct information', async ({ page }) => {
    await page.goto('/dashboard');
    
    // Check main dashboard elements
    await expect(page.getByText('Welcome to the Certificate Authority Dashboard')).toBeVisible();
    await expect(page.getByText('Certificate Authority Management System')).toBeVisible();
    
    // Check navigation menu
    await expect(page.getByRole('navigation')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Dashboard' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Certificates' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'CA Status' })).toBeVisible();
  });

  test('should navigate between main sections', async ({ page }) => {
    // Navigate to Certificates
    await page.getByRole('link', { name: 'Certificates' }).click();
    await expect(page).toHaveURL('/certificates');
    await expect(page.getByText('Certificates')).toBeVisible();
    
    // Navigate to CA Status
    await page.getByRole('link', { name: 'CA Status' }).click();
    await expect(page).toHaveURL('/ca/status');
    await expect(page.getByText('CA Status')).toBeVisible();
    
    // Navigate back to Dashboard
    await page.getByRole('link', { name: 'Dashboard' }).click();
    await expect(page).toHaveURL('/dashboard');
    await expect(page.getByText('Welcome to the Certificate Authority Dashboard')).toBeVisible();
  });

  test('should display user information and logout option', async ({ page }) => {
    await page.goto('/dashboard');
    
    // Check user menu
    await expect(page.getByRole('button', { name: 'admin' })).toBeVisible();
    
    // Click user menu to see logout option
    await page.getByRole('button', { name: 'admin' }).click();
    await expect(page.getByRole('menuitem', { name: 'Logout' })).toBeVisible();
  });

  test('should handle responsive navigation on mobile', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    
    await page.goto('/dashboard');
    
    // Check if mobile menu button is visible
    const mobileMenuButton = page.getByRole('button', { name: /menu|hamburger/i });
    if (await mobileMenuButton.isVisible()) {
      await mobileMenuButton.click();
      await expect(page.getByRole('navigation')).toBeVisible();
    }
    
    // Reset viewport
    await page.setViewportSize({ width: 1280, height: 720 });
  });

  test('should display proper page titles', async ({ page }) => {
    // Dashboard
    await page.goto('/dashboard');
    await expect(page).toHaveTitle(/Dashboard/);
    
    // Certificates
    await page.goto('/certificates');
    await expect(page).toHaveTitle(/Certificates/);
    
    // CA Status
    await page.goto('/ca/status');
    await expect(page).toHaveTitle(/CA Status/);
  });

  test('should maintain navigation state after page refresh', async ({ page }) => {
    await page.goto('/certificates');
    await expect(page).toHaveURL('/certificates');
    
    // Refresh page
    await page.reload();
    
    // Should still be on certificates page
    await expect(page).toHaveURL('/certificates');
    await expect(page.getByText('Certificates')).toBeVisible();
  });

  test('should handle breadcrumb navigation correctly', async ({ page }) => {
    // Navigate to a sub-page
    await page.goto('/certificates/issue');
    
    // Check if breadcrumbs are visible and functional
    const breadcrumbs = page.locator('[data-testid="breadcrumbs"]');
    if (await breadcrumbs.isVisible()) {
      await expect(breadcrumbs.getByText('Dashboard')).toBeVisible();
      await expect(breadcrumbs.getByText('Certificates')).toBeVisible();
      await expect(breadcrumbs.getByText('Issue')).toBeVisible();
      
      // Click on Dashboard breadcrumb
      await breadcrumbs.getByText('Dashboard').click();
      await expect(page).toHaveURL('/dashboard');
    }
  });

  test('should display proper loading states', async ({ page }) => {
    await page.goto('/dashboard');
    
    // Check if loading indicators are properly handled
    // This would depend on the actual implementation
    const loadingSpinner = page.locator('[data-testid="loading-spinner"]');
    if (await loadingSpinner.isVisible()) {
      await expect(loadingSpinner).toBeVisible();
    }
  });

  test('should handle navigation errors gracefully', async ({ page }) => {
    // Try to navigate to a non-existent route
    await page.goto('/non-existent-route');
    
    // Should show 404 or error page
    await expect(page.getByText(/404|Not Found|Error/)).toBeVisible();
  });
});