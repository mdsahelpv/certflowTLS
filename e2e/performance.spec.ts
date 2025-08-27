import { test, expect } from '@playwright/test';

test.describe('Performance Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Login before each test
    await page.goto('/auth/signin');
    await page.getByLabel('Username').fill('admin');
    await page.getByLabel('Password').fill('password');
    await page.getByRole('button', { name: 'Sign In' }).click();
    await expect(page).toHaveURL('/dashboard');
  });

  test('should load dashboard within performance budget', async ({ page }) => {
    const startTime = Date.now();
    
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    
    const loadTime = Date.now() - startTime;
    
    // Performance budget: dashboard should load in under 3 seconds
    expect(loadTime).toBeLessThan(3000);
    
    // Log performance metrics
    console.log(`Dashboard load time: ${loadTime}ms`);
    
    // Check Core Web Vitals
    const metrics = await page.evaluate(() => {
      return new Promise((resolve) => {
        if ('PerformanceObserver' in window) {
          const observer = new PerformanceObserver((list) => {
            const entries = list.getEntries();
            const lcp = entries.find(entry => entry.entryType === 'largest-contentful-paint');
            const fid = entries.find(entry => entry.entryType === 'first-input');
            const cls = entries.find(entry => entry.entryType === 'layout-shift');
            
            resolve({
              lcp: lcp ? lcp.startTime : null,
              fid: fid ? fid.processingStart - fid.startTime : null,
              cls: cls ? cls.value : null,
            });
          });
          
          observer.observe({ entryTypes: ['largest-contentful-paint', 'first-input', 'layout-shift'] });
          
          // Timeout after 5 seconds
          setTimeout(() => resolve({ lcp: null, fid: null, cls: null }), 5000);
        } else {
          resolve({ lcp: null, fid: null, cls: null });
        }
      });
    });
    
    console.log('Performance metrics:', metrics);
  });

  test('should load certificates page within performance budget', async ({ page }) => {
    const startTime = Date.now();
    
    await page.goto('/certificates');
    await page.waitForLoadState('networkidle');
    
    const loadTime = Date.now() - startTime;
    
    // Performance budget: certificates page should load in under 2.5 seconds
    expect(loadTime).toBeLessThan(2500);
    
    console.log(`Certificates page load time: ${loadTime}ms`);
  });

  test('should load CA status page within performance budget', async ({ page }) => {
    const startTime = Date.now();
    
    await page.goto('/ca/status');
    await page.waitForLoadState('networkidle');
    
    const loadTime = Date.now() - startTime;
    
    // Performance budget: CA status page should load in under 2 seconds
    expect(loadTime).toBeLessThan(2000);
    
    console.log(`CA status page load time: ${loadTime}ms`);
  });

  test('should handle certificate issuance form efficiently', async ({ page }) => {
    await page.goto('/certificates/issue');
    await page.waitForLoadState('networkidle');
    
    // Measure form rendering time
    const formRenderStart = Date.now();
    
    // Wait for form to be fully interactive
    await page.waitForSelector('form', { state: 'visible' });
    await page.waitForSelector('input', { state: 'visible' });
    
    const formRenderTime = Date.now() - formRenderStart;
    
    // Form should render in under 1 second
    expect(formRenderTime).toBeLessThan(1000);
    
    console.log(`Form render time: ${formRenderTime}ms`);
    
    // Test form interaction performance
    const interactionStart = Date.now();
    
    await page.getByLabel('Common Name (CN)').fill('test.example.com');
    await page.getByLabel('Certificate Type').selectOption('SERVER');
    await page.getByLabel('Key Algorithm').selectOption('RSA');
    await page.getByLabel('Key Size').selectOption('2048');
    await page.getByLabel('Validity Period (days)').fill('365');
    
    const interactionTime = Date.now() - interactionStart;
    
    // Form interactions should be responsive (under 500ms total)
    expect(interactionTime).toBeLessThan(500);
    
    console.log(`Form interaction time: ${interactionTime}ms`);
  });

  test('should handle navigation efficiently', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    
    // Measure navigation performance between pages
    const navigationTimes = [];
    
    const pages = ['/certificates', '/ca/status', '/dashboard'];
    
    for (const route of pages) {
      const navStart = Date.now();
      await page.goto(route);
      await page.waitForLoadState('networkidle');
      const navTime = Date.now() - navStart;
      navigationTimes.push(navTime);
      
      console.log(`Navigation to ${route}: ${navTime}ms`);
    }
    
    // Average navigation time should be under 2 seconds
    const avgNavigationTime = navigationTimes.reduce((a, b) => a + b, 0) / navigationTimes.length;
    expect(avgNavigationTime).toBeLessThan(2000);
    
    console.log(`Average navigation time: ${avgNavigationTime}ms`);
  });

  test('should handle concurrent operations efficiently', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    
    // Test concurrent operations
    const concurrentStart = Date.now();
    
    // Perform multiple operations concurrently
    const operations = [
      page.goto('/certificates'),
      page.goto('/ca/status'),
      page.goto('/dashboard'),
    ];
    
    await Promise.all(operations);
    
    const concurrentTime = Date.now() - concurrentStart;
    
    // Concurrent operations should complete efficiently
    expect(concurrentTime).toBeLessThan(5000);
    
    console.log(`Concurrent operations time: ${concurrentTime}ms`);
  });

  test('should maintain performance under load', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    
    // Simulate multiple rapid navigations
    const rapidNavStart = Date.now();
    
    for (let i = 0; i < 5; i++) {
      await page.goto('/dashboard');
      await page.waitForLoadState('networkidle');
      await page.goto('/certificates');
      await page.waitForLoadState('networkidle');
    }
    
    const rapidNavTime = Date.now() - rapidNavStart;
    
    // Rapid navigation should maintain performance
    expect(rapidNavTime).toBeLessThan(15000); // 5 round trips in under 15 seconds
    
    console.log(`Rapid navigation time: ${rapidNavTime}ms`);
  });

  test('should optimize resource loading', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    
    // Check resource loading performance
    const resources = await page.evaluate(() => {
      const entries = performance.getEntriesByType('resource');
      return entries.map(entry => ({
        name: entry.name,
        duration: entry.duration,
        size: entry.transferSize || 0,
      }));
    });
    
    // Log resource loading information
    console.log('Resource loading performance:', resources);
    
    // Check for large resources that might impact performance
    const largeResources = resources.filter(r => r.size > 100000); // > 100KB
    if (largeResources.length > 0) {
      console.log('Large resources detected:', largeResources);
    }
    
    // Total resource loading time should be reasonable
    const totalResourceTime = resources.reduce((sum, r) => sum + r.duration, 0);
    expect(totalResourceTime).toBeLessThan(5000); // Under 5 seconds total
    
    console.log(`Total resource loading time: ${totalResourceTime}ms`);
  });

  test('should handle memory efficiently', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    
    // Get initial memory usage
    const initialMemory = await page.evaluate(() => {
      if ('memory' in performance) {
        return (performance as any).memory.usedJSHeapSize;
      }
      return null;
    });
    
    console.log('Initial memory usage:', initialMemory);
    
    // Perform memory-intensive operations
    for (let i = 0; i < 10; i++) {
      await page.goto('/dashboard');
      await page.waitForLoadState('networkidle');
      await page.goto('/certificates');
      await page.waitForLoadState('networkidle');
    }
    
    // Get final memory usage
    const finalMemory = await page.evaluate(() => {
      if ('memory' in performance) {
        return (performance as any).memory.usedJSHeapSize;
      }
      return null;
    });
    
    console.log('Final memory usage:', finalMemory);
    
    if (initialMemory && finalMemory) {
      const memoryIncrease = finalMemory - initialMemory;
      const memoryIncreaseMB = memoryIncrease / (1024 * 1024);
      
      console.log(`Memory increase: ${memoryIncreaseMB.toFixed(2)}MB`);
      
      // Memory increase should be reasonable (under 50MB)
      expect(memoryIncreaseMB).toBeLessThan(50);
    }
  });

  test('should handle network conditions gracefully', async ({ page }) => {
    // Simulate slow network conditions
    await page.route('**/*', route => {
      // Add artificial delay to simulate slow network
      setTimeout(() => route.continue(), 100);
    });
    
    const startTime = Date.now();
    
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    
    const loadTime = Date.now() - startTime;
    
    // Even with slow network, should load within reasonable time
    expect(loadTime).toBeLessThan(10000); // Under 10 seconds with artificial delay
    
    console.log(`Dashboard load time with slow network: ${loadTime}ms`);
    
    // Remove network throttling
    await page.unroute('**/*');
  });

  test('should maintain performance across different viewport sizes', async ({ page }) => {
    const viewports = [
      { width: 375, height: 667, name: 'Mobile' },
      { width: 768, height: 1024, name: 'Tablet' },
      { width: 1280, height: 720, name: 'Desktop' },
      { width: 1920, height: 1080, name: 'Large Desktop' },
    ];
    
    const performanceResults = [];
    
    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      
      const startTime = Date.now();
      await page.goto('/dashboard');
      await page.waitForLoadState('networkidle');
      const loadTime = Date.now() - startTime;
      
      performanceResults.push({
        viewport: viewport.name,
        loadTime,
      });
      
      console.log(`${viewport.name} viewport load time: ${loadTime}ms`);
      
      // Each viewport should load within performance budget
      expect(loadTime).toBeLessThan(3000);
    }
    
    // Performance should be consistent across viewports
    const loadTimes = performanceResults.map(r => r.loadTime);
    const maxLoadTime = Math.max(...loadTimes);
    const minLoadTime = Math.min(...loadTimes);
    const variance = maxLoadTime - minLoadTime;
    
    // Variance should be reasonable (under 2 seconds)
    expect(variance).toBeLessThan(2000);
    
    console.log(`Performance variance across viewports: ${variance}ms`);
  });

  test('should handle authentication performance efficiently', async ({ page }) => {
    // Test login performance
    await page.goto('/auth/signin');
    
    const loginStart = Date.now();
    
    await page.getByLabel('Username').fill('admin');
    await page.getByLabel('Password').fill('password');
    await page.getByRole('button', { name: 'Sign In' }).click();
    
    // Wait for redirect to dashboard
    await expect(page).toHaveURL('/dashboard');
    await page.waitForLoadState('networkidle');
    
    const loginTime = Date.now() - loginStart;
    
    // Authentication should complete in under 3 seconds
    expect(loginTime).toBeLessThan(3000);
    
    console.log(`Authentication time: ${loginTime}ms`);
    
    // Test logout performance
    const logoutStart = Date.now();
    
    await page.getByRole('button', { name: 'admin' }).click();
    await page.getByRole('menuitem', { name: 'Logout' }).click();
    
    // Wait for redirect to home page
    await expect(page).toHaveURL('/');
    await page.waitForLoadState('networkidle');
    
    const logoutTime = Date.now() - logoutStart;
    
    // Logout should complete in under 2 seconds
    expect(logoutTime).toBeLessThan(2000);
    
    console.log(`Logout time: ${logoutTime}ms`);
  });
});