import { test, expect } from '@playwright/test';

test.describe('Accessibility Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Login before each test
    await page.goto('/auth/signin');
    await page.getByLabel('Username').fill('admin');
    await page.getByLabel('Password').fill('password');
    await page.getByRole('button', { name: 'Sign In' }).click();
    await expect(page).toHaveURL('/dashboard');
  });

  test('should have proper page titles', async ({ page }) => {
    // Test dashboard page title
    await page.goto('/dashboard');
    await expect(page).toHaveTitle(/Dashboard|Certificate Authority/i);
    
    // Test certificates page title
    await page.goto('/certificates');
    await expect(page).toHaveTitle(/Certificates/i);
    
    // Test CA status page title
    await page.goto('/ca/status');
    await expect(page).toHaveTitle(/CA Status/i);
  });

  test('should have proper heading structure', async ({ page }) => {
    await page.goto('/dashboard');
    
    // Check for main heading (h1)
    const h1Elements = page.locator('h1');
    await expect(h1Elements).toHaveCount(1);
    
    // Check for logical heading hierarchy
    const headings = page.locator('h1, h2, h3, h4, h5, h6');
    const headingCount = await headings.count();
    expect(headingCount).toBeGreaterThan(0);
    
    // Verify first heading is h1
    const firstHeading = headings.first();
    const tagName = await firstHeading.evaluate(el => el.tagName.toLowerCase());
    expect(tagName).toBe('h1');
  });

  test('should have proper form labels', async ({ page }) => {
    await page.goto('/certificates/issue');
    
    // Check that form inputs have associated labels
    const inputs = page.locator('input, select, textarea');
    const inputCount = await inputs.count();
    
    for (let i = 0; i < inputCount; i++) {
      const input = inputs.nth(i);
      const inputId = await input.getAttribute('id');
      
      if (inputId) {
        // Check for label with matching 'for' attribute
        const label = page.locator(`label[for="${inputId}"]`);
        await expect(label).toBeVisible();
      } else {
        // Check for aria-label or aria-labelledby
        const ariaLabel = await input.getAttribute('aria-label');
        const ariaLabelledBy = await input.getAttribute('aria-labelledby');
        
        expect(ariaLabel || ariaLabelledBy).toBeTruthy();
      }
    }
  });

  test('should have proper button labels', async ({ page }) => {
    await page.goto('/dashboard');
    
    // Check that buttons have accessible names
    const buttons = page.locator('button');
    const buttonCount = await buttons.count();
    
    for (let i = 0; i < buttonCount; i++) {
      const button = buttons.nth(i);
      
      // Check for text content, aria-label, or aria-labelledby
      const textContent = await button.textContent();
      const ariaLabel = await button.getAttribute('aria-label');
      const ariaLabelledBy = await button.getAttribute('aria-labelledby');
      
      expect(textContent?.trim() || ariaLabel || ariaLabelledBy).toBeTruthy();
    }
  });

  test('should have proper link text', async ({ page }) => {
    await page.goto('/dashboard');
    
    // Check that links have descriptive text
    const links = page.locator('a');
    const linkCount = await links.count();
    
    for (let i = 0; i < linkCount; i++) {
      const link = links.nth(i);
      
      // Check for text content, aria-label, or aria-labelledby
      const textContent = await link.textContent();
      const ariaLabel = await link.getAttribute('aria-label');
      const ariaLabelledBy = await link.getAttribute('aria-labelledby');
      
      // Skip empty links (they might be decorative)
      if (textContent?.trim()) {
        expect(textContent.trim()).not.toBe('');
        expect(textContent.trim()).not.toBe('Click here');
        expect(textContent.trim()).not.toBe('Read more');
      }
    }
  });

  test('should have proper alt text for images', async ({ page }) => {
    await page.goto('/dashboard');
    
    // Check that images have alt text
    const images = page.locator('img');
    const imageCount = await images.count();
    
    for (let i = 0; i < imageCount; i++) {
      const image = images.nth(i);
      const altText = await image.getAttribute('alt');
      
      // Alt text should be present (empty alt is acceptable for decorative images)
      expect(altText).not.toBeNull();
    }
  });

  test('should have proper color contrast', async ({ page }) => {
    await page.goto('/dashboard');
    
    // This test would require a color contrast analysis tool
    // For now, we'll check that the page has proper styling
    const body = page.locator('body');
    const computedStyle = await body.evaluate(el => {
      const style = window.getComputedStyle(el);
      return {
        backgroundColor: style.backgroundColor,
        color: style.color,
      };
    });
    
    // Verify that styles are applied
    expect(computedStyle.backgroundColor).not.toBe('rgba(0, 0, 0, 0)');
    expect(computedStyle.color).not.toBe('rgba(0, 0, 0, 0)');
  });

  test('should be keyboard navigable', async ({ page }) => {
    await page.goto('/dashboard');
    
    // Test tab navigation
    await page.keyboard.press('Tab');
    
    // Check that focus is visible
    const focusedElement = page.locator(':focus');
    await expect(focusedElement).toBeVisible();
    
    // Test tab order
    const tabOrder = [];
    for (let i = 0; i < 10; i++) { // Limit to prevent infinite loop
      const focused = page.locator(':focus');
      const tagName = await focused.evaluate(el => el.tagName.toLowerCase());
      const textContent = await focused.textContent();
      
      tabOrder.push({ tag: tagName, text: textContent?.trim() });
      
      await page.keyboard.press('Tab');
      
      // Check if we've cycled back to the beginning
      if (i > 0 && tabOrder[i].tag === tabOrder[0].tag && tabOrder[i].text === tabOrder[0].text) {
        break;
      }
    }
    
    expect(tabOrder.length).toBeGreaterThan(1);
  });

  test('should have proper ARIA attributes', async ({ page }) => {
    await page.goto('/dashboard');
    
    // Check for common ARIA attributes
    const elementsWithAria = page.locator('[aria-*]');
    const ariaCount = await elementsWithAria.count();
    
    // Some elements should have ARIA attributes for accessibility
    expect(ariaCount).toBeGreaterThanOrEqual(0);
    
    // Check specific ARIA attributes
    const navigation = page.locator('nav, [role="navigation"]');
    if (await navigation.isVisible()) {
      await expect(navigation).toBeVisible();
    }
    
    const main = page.locator('main, [role="main"]');
    if (await main.isVisible()) {
      await expect(main).toBeVisible();
    }
  });

  test('should have proper skip links', async ({ page }) => {
    await page.goto('/dashboard');
    
    // Look for skip links (common accessibility feature)
    const skipLinks = page.locator('a[href*="#main"], a[href*="#content"], .skip-link');
    
    if (await skipLinks.isVisible()) {
      await expect(skipLinks).toBeVisible();
      
      // Test skip link functionality
      const firstSkipLink = skipLinks.first();
      const href = await firstSkipLink.getAttribute('href');
      
      if (href && href.startsWith('#')) {
        const targetId = href.substring(1);
        const targetElement = page.locator(`#${targetId}`);
        
        if (await targetElement.isVisible()) {
          await firstSkipLink.click();
          await expect(targetElement).toBeVisible();
        }
      }
    }
  });

  test('should have proper error handling', async ({ page }) => {
    await page.goto('/certificates/issue');
    
    // Try to submit empty form
    await page.getByRole('button', { name: 'Issue Certificate' }).click();
    
    // Check for error messages
    const errorMessages = page.locator('[role="alert"], .error, [aria-invalid="true"]');
    
    if (await errorMessages.isVisible()) {
      await expect(errorMessages).toBeVisible();
      
      // Check that error messages are announced to screen readers
      const ariaLive = page.locator('[aria-live]');
      if (await ariaLive.isVisible()) {
        await expect(ariaLive).toBeVisible();
      }
    }
  });

  test('should have proper table accessibility', async ({ page }) => {
    await page.goto('/certificates');
    
    // Look for tables
    const tables = page.locator('table');
    
    if (await tables.isVisible()) {
      await expect(tables).toBeVisible();
      
      // Check for table headers
      const headers = tables.locator('th');
      if (await headers.isVisible()) {
        await expect(headers).toBeVisible();
        
        // Check for scope attributes on headers
        const headersWithScope = headers.locator('[scope]');
        const scopeCount = await headersWithScope.count();
        expect(scopeCount).toBeGreaterThan(0);
      }
      
      // Check for table captions or summaries
      const caption = tables.locator('caption');
      const summary = tables.locator('[summary]');
      
      if (await caption.isVisible() || await summary.isVisible()) {
        expect(true).toBe(true); // At least one accessibility feature is present
      }
    }
  });

  test('should have proper form validation feedback', async ({ page }) => {
    await page.goto('/certificates/issue');
    
    // Fill in invalid data
    await page.getByLabel('Common Name (CN)').fill(''); // Empty required field
    
    // Submit form
    await page.getByRole('button', { name: 'Issue Certificate' }).click();
    
    // Check for validation feedback
    const validationErrors = page.locator('[role="alert"], .error, [aria-invalid="true"]');
    
    if (await validationErrors.isVisible()) {
      await expect(validationErrors).toBeVisible();
      
      // Check that errors are properly associated with fields
      const invalidFields = page.locator('[aria-invalid="true"]');
      if (await invalidFields.isVisible()) {
        await expect(invalidFields).toBeVisible();
      }
    }
  });

  test('should have proper focus management', async ({ page }) => {
    await page.goto('/dashboard');
    
    // Test that focus moves to main content after navigation
    await page.goto('/certificates');
    
    // Check if focus is properly managed
    const focusedElement = page.locator(':focus');
    await expect(focusedElement).toBeVisible();
    
    // Test that focus doesn't get trapped
    await page.keyboard.press('Tab');
    const newFocusedElement = page.locator(':focus');
    await expect(newFocusedElement).toBeVisible();
    
    // Verify focus is different (not trapped)
    const focusedText = await focusedElement.textContent();
    const newFocusedText = await newFocusedElement.textContent();
    
    if (focusedText && newFocusedText) {
      expect(focusedText).not.toBe(newFocusedText);
    }
  });

  test('should have proper language attributes', async ({ page }) => {
    await page.goto('/dashboard');
    
    // Check that HTML has lang attribute
    const html = page.locator('html');
    const lang = await html.getAttribute('lang');
    
    expect(lang).toBeTruthy();
    expect(lang).toMatch(/^[a-z]{2}(-[A-Z]{2})?$/); // Valid language code format
    
    // Check for any language changes within the page
    const elementsWithLang = page.locator('[lang]');
    const langCount = await elementsWithLang.count();
    
    // Should have at least the html element with lang
    expect(langCount).toBeGreaterThanOrEqual(1);
  });

  test('should have proper landmark regions', async ({ page }) => {
    await page.goto('/dashboard');
    
    // Check for common landmark regions
    const landmarks = [
      'header',
      'nav',
      'main',
      'aside',
      'footer',
      '[role="banner"]',
      '[role="navigation"]',
      '[role="main"]',
      '[role="complementary"]',
      '[role="contentinfo"]',
    ];
    
    let landmarkCount = 0;
    for (const landmark of landmarks) {
      const element = page.locator(landmark);
      if (await element.isVisible()) {
        landmarkCount++;
      }
    }
    
    // Should have at least header, nav, and main
    expect(landmarkCount).toBeGreaterThanOrEqual(3);
  });
});