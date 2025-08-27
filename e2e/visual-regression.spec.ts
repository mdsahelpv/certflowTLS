import { test, expect } from '@playwright/test';

test.describe('Visual Regression Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Login before each test
    await page.goto('/auth/signin');
    await page.getByLabel('Username').fill('admin');
    await page.getByLabel('Password').fill('password');
    await page.getByRole('button', { name: 'Sign In' }).click();
    await expect(page).toHaveURL('/dashboard');
  });

  test('should capture dashboard screenshot', async ({ page }) => {
    await page.goto('/dashboard');
    
    // Wait for page to be fully loaded
    await page.waitForLoadState('networkidle');
    
    // Capture screenshot of the entire dashboard
    await expect(page).toHaveScreenshot('dashboard.png', {
      fullPage: true,
      timeout: 10000,
    });
  });

  test('should capture certificates page screenshot', async ({ page }) => {
    await page.goto('/certificates');
    
    // Wait for page to be fully loaded
    await page.waitForLoadState('networkidle');
    
    // Capture screenshot of the certificates page
    await expect(page).toHaveScreenshot('certificates-page.png', {
      fullPage: true,
      timeout: 10000,
    });
  });

  test('should capture CA status page screenshot', async ({ page }) => {
    await page.goto('/ca/status');
    
    // Wait for page to be fully loaded
    await page.waitForLoadState('networkidle');
    
    // Capture screenshot of the CA status page
    await expect(page).toHaveScreenshot('ca-status-page.png', {
      fullPage: true,
      timeout: 10000,
    });
  });

  test('should capture certificate issue form screenshot', async ({ page }) => {
    await page.goto('/certificates/issue');
    
    // Wait for page to be fully loaded
    await page.waitForLoadState('networkidle');
    
    // Capture screenshot of the certificate issue form
    await expect(page).toHaveScreenshot('certificate-issue-form.png', {
      fullPage: true,
      timeout: 10000,
    });
  });

  test('should capture login page screenshot', async ({ page }) => {
    // Logout first to get to login page
    await page.goto('/dashboard');
    await page.getByRole('button', { name: 'admin' }).click();
    await page.getByRole('menuitem', { name: 'Logout' }).click();
    
    // Wait for redirect to login page
    await expect(page).toHaveURL('/auth/signin');
    
    // Capture screenshot of the login page
    await expect(page).toHaveScreenshot('login-page.png', {
      fullPage: true,
      timeout: 10000,
    });
  });

  test('should capture responsive design on mobile', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    
    // Capture mobile dashboard screenshot
    await expect(page).toHaveScreenshot('dashboard-mobile.png', {
      fullPage: true,
      timeout: 10000,
    });
    
    // Reset to desktop viewport
    await page.setViewportSize({ width: 1280, height: 720 });
  });

  test('should capture responsive design on tablet', async ({ page }) => {
    // Set tablet viewport
    await page.setViewportSize({ width: 768, height: 1024 });
    
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    
    // Capture tablet dashboard screenshot
    await expect(page).toHaveScreenshot('dashboard-tablet.png', {
      fullPage: true,
      timeout: 10000,
    });
    
    // Reset to desktop viewport
    await page.setViewportSize({ width: 1280, height: 720 });
  });

  test('should capture error page screenshots', async ({ page }) => {
    // Try to access a non-existent route
    await page.goto('/non-existent-route');
    
    // Wait for error page to load
    await page.waitForLoadState('networkidle');
    
    // Capture screenshot of the error page
    await expect(page).toHaveScreenshot('error-page.png', {
      fullPage: true,
      timeout: 10000,
    });
  });

  test('should capture form validation states', async ({ page }) => {
    await page.goto('/certificates/issue');
    
    // Wait for page to load
    await page.waitForLoadState('networkidle');
    
    // Try to submit empty form to trigger validation errors
    await page.getByRole('button', { name: 'Issue Certificate' }).click();
    
    // Wait for validation errors to appear
    await page.waitForTimeout(1000);
    
    // Capture screenshot with validation errors
    await expect(page).toHaveScreenshot('form-validation-errors.png', {
      fullPage: true,
      timeout: 10000,
    });
  });

  test('should capture loading states', async ({ page }) => {
    await page.goto('/certificates');
    
    // Wait for page to load
    await page.waitForLoadState('networkidle');
    
    // Click on issue new certificate to trigger loading state
    await page.getByRole('button', { name: 'Issue New Certificate' }).click();
    
    // Wait for navigation
    await page.waitForURL('/certificates/issue');
    
    // Capture screenshot during loading/transition
    await expect(page).toHaveScreenshot('loading-state.png', {
      fullPage: true,
      timeout: 10000,
    });
  });

  test('should capture different user role views', async ({ page }) => {
    // Test with admin user (already logged in)
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    
    // Capture admin dashboard
    await expect(page).toHaveScreenshot('admin-dashboard.png', {
      fullPage: true,
      timeout: 10000,
    });
    
    // Note: In a real scenario, we'd test different user roles
    // by creating and logging in as different users
  });

  test('should capture dark mode if available', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    
    // Look for theme toggle button
    const themeToggle = page.locator('[data-testid="theme-toggle"], [aria-label*="theme"], [aria-label*="dark"]');
    
    if (await themeToggle.isVisible()) {
      // Click theme toggle to switch to dark mode
      await themeToggle.click();
      
      // Wait for theme change
      await page.waitForTimeout(1000);
      
      // Capture dark mode screenshot
      await expect(page).toHaveScreenshot('dashboard-dark-mode.png', {
        fullPage: true,
        timeout: 10000,
      });
      
      // Switch back to light mode
      await themeToggle.click();
      await page.waitForTimeout(1000);
    }
  });

  test('should capture accessibility focus states', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    
    // Focus on navigation elements to show focus states
    await page.keyboard.press('Tab');
    
    // Wait for focus to be visible
    await page.waitForTimeout(500);
    
    // Capture screenshot with focus indicators
    await expect(page).toHaveScreenshot('focus-states.png', {
      fullPage: true,
      timeout: 10000,
    });
  });

  test('should capture component variations', async ({ page }) => {
    await page.goto('/certificates');
    await page.waitForLoadState('networkidle');
    
    // Look for different certificate statuses to capture
    // This test assumes there are certificates with different statuses
    
    // Capture empty state if no certificates
    if (await page.locator('text=No certificates found').isVisible()) {
      await expect(page).toHaveScreenshot('certificates-empty-state.png', {
        fullPage: true,
        timeout: 10000,
      });
    } else {
      // Capture with certificates
      await expect(page).toHaveScreenshot('certificates-with-data.png', {
        fullPage: true,
        timeout: 10000,
      });
    }
  });
});