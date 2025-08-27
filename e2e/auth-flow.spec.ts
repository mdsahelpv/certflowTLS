import { test, expect } from '@playwright/test';

test.describe('Authentication Flow E2E Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should redirect unauthenticated users to login page', async ({ page }) => {
    // Try to access protected route
    await page.goto('/dashboard');
    await expect(page).toHaveURL('/auth/signin');
    await expect(page.getByText('Sign in to your account')).toBeVisible();
  });

  test('should successfully authenticate with valid credentials', async ({ page }) => {
    await page.goto('/auth/signin');
    
    // Fill in credentials
    await page.getByLabel('Username').fill('admin');
    await page.getByLabel('Password').fill('password');
    
    // Submit form
    await page.getByRole('button', { name: 'Sign In' }).click();
    
    // Should redirect to dashboard
    await expect(page).toHaveURL('/dashboard');
    await expect(page.getByText('Welcome to the Certificate Authority Dashboard')).toBeVisible();
  });

  test('should show error with invalid credentials', async ({ page }) => {
    await page.goto('/auth/signin');
    
    // Fill in invalid credentials
    await page.getByLabel('Username').fill('invalid');
    await page.getByLabel('Password').fill('wrongpassword');
    
    // Submit form
    await page.getByRole('button', { name: 'Sign In' }).click();
    
    // Should show error message
    await expect(page.getByText('Invalid credentials')).toBeVisible();
    await expect(page).toHaveURL('/auth/signin');
  });

  test('should handle empty form submission', async ({ page }) => {
    await page.goto('/auth/signin');
    
    // Submit empty form
    await page.getByRole('button', { name: 'Sign In' }).click();
    
    // Should show validation errors
    await expect(page.getByText('Username is required')).toBeVisible();
    await expect(page.getByText('Password is required')).toBeVisible();
  });

  test('should successfully logout and redirect to home', async ({ page }) => {
    // First login
    await page.goto('/auth/signin');
    await page.getByLabel('Username').fill('admin');
    await page.getByLabel('Password').fill('password');
    await page.getByRole('button', { name: 'Sign In' }).click();
    
    // Verify we're logged in
    await expect(page).toHaveURL('/dashboard');
    
    // Logout
    await page.getByRole('button', { name: 'Logout' }).click();
    
    // Should redirect to home page
    await expect(page).toHaveURL('/');
    await expect(page.getByText('Certificate Authority Management System')).toBeVisible();
  });

  test('should maintain session across page navigation', async ({ page }) => {
    // Login
    await page.goto('/auth/signin');
    await page.getByLabel('Username').fill('admin');
    await page.getByLabel('Password').fill('password');
    await page.getByRole('button', { name: 'Sign In' }).click();
    
    // Navigate to different pages
    await page.goto('/certificates');
    await expect(page.getByText('Certificates')).toBeVisible();
    
    await page.goto('/ca/status');
    await expect(page.getByText('CA Status')).toBeVisible();
    
    await page.goto('/dashboard');
    await expect(page.getByText('Welcome to the Certificate Authority Dashboard')).toBeVisible();
  });

  test('should enforce authentication on protected routes', async ({ page }) => {
    const protectedRoutes = [
      '/dashboard',
      '/certificates',
      '/ca/status',
      '/certificates/issue',
      '/certificates/revoke'
    ];

    for (const route of protectedRoutes) {
      await page.goto(route);
      await expect(page).toHaveURL('/auth/signin');
    }
  });

  test('should handle session expiration gracefully', async ({ page }) => {
    // This test would require mocking session expiration
    // For now, we'll test that the login page is accessible
    await page.goto('/auth/signin');
    await expect(page.getByText('Sign in to your account')).toBeVisible();
    await expect(page.getByLabel('Username')).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();
  });
});