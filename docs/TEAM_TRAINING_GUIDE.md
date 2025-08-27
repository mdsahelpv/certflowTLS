# 📚 Team Training & Onboarding Guide
## Testing Infrastructure - Certificate Authority Management System

---

## 📋 **Overview**

This guide provides comprehensive training materials for team members working with the testing infrastructure of the Certificate Authority Management System. It covers different roles, skill levels, and provides hands-on exercises to ensure everyone can effectively contribute to maintaining high-quality testing standards.

## 🎯 **Training Objectives**

### **Learning Outcomes**
By the end of this training, team members will be able to:
- **Understand** the testing architecture and methodologies
- **Execute** different types of tests effectively
- **Maintain** and update the testing infrastructure
- **Troubleshoot** common testing issues
- **Contribute** to continuous testing improvement
- **Collaborate** effectively within the testing workflow

### **Target Audience**
- **Developers**: Write and maintain unit/integration tests
- **QA Engineers**: Execute and analyze E2E tests
- **DevOps Engineers**: Maintain CI/CD pipeline and infrastructure
- **Product Managers**: Understand testing metrics and quality gates
- **New Team Members**: Get up to speed quickly

## 🏗️ **Module 1: Testing Fundamentals**

### **1.1 Testing Pyramid Overview**

#### **Concept Explanation**
```
                    ┌─────────────────┐
                    │   E2E Tests     │  ← User Experience (131 tests)
                    │   (131 tests)   │
                    └─────────────────┘
                           │
                    ┌─────────────────┐
                    │ Integration     │  ← Component Interaction
                    │   Tests        │
                    └─────────────────┘
                           │
                    ┌─────────────────┐
                    │   Unit Tests    │  ← Individual Functions
                    │   (Core Logic)  │
                    └─────────────────┘
```

#### **Why This Structure?**
- **Unit Tests**: Fast, focused, catch logic errors early
- **Integration Tests**: Verify component interactions
- **E2E Tests**: Validate complete user workflows

#### **Exercise 1.1: Understanding Test Types**
```bash
# Run different test types and observe execution times
npm test -- --testPathPattern="unit" --verbose
npm test -- --testPathPattern="integration" --verbose
npx playwright test --project=chromium
```

**Discussion Questions:**
1. What are the differences in execution time between test types?
2. Why do we need all three levels?
3. What happens if we skip one level?

### **1.2 Testing Principles**

#### **Core Principles**
1. **Fast**: Tests should run quickly
2. **Reliable**: Tests should be deterministic
3. **Isolated**: Tests should not depend on each other
4. **Maintainable**: Tests should be easy to update
5. **Comprehensive**: Tests should cover all scenarios

#### **Exercise 1.2: Identifying Test Violations**
```typescript
// Bad test example - identify the issues
describe('User Management', () => {
  test('should create user', async () => {
    // Issue 1: No cleanup
    const user = await createUser();
    expect(user).toBeDefined();
  });

  test('should update user', async () => {
    // Issue 2: Depends on previous test
    const user = await getUser(); // Assumes user exists
    const updated = await updateUser(user.id, { name: 'New Name' });
    expect(updated.name).toBe('New Name');
  });
});

// Good test example - identify the improvements
describe('User Management', () => {
  beforeEach(async () => {
    // Improvement 1: Proper cleanup
    await cleanupTestData();
  });

  test('should create user', async () => {
    const user = await createUser();
    expect(user).toBeDefined();
  });

  test('should update user', async () => {
    // Improvement 2: Self-contained
    const user = await createUser();
    const updated = await updateUser(user.id, { name: 'New Name' });
    expect(updated.name).toBe('New Name');
  });
});
```

## 🧪 **Module 2: Unit Testing with Jest**

### **2.1 Jest Fundamentals**

#### **Basic Test Structure**
```typescript
describe('Test Suite Name', () => {
  beforeEach(() => {
    // Setup before each test
  });

  afterEach(() => {
    // Cleanup after each test
  });

  test('should do something specific', () => {
    // Arrange
    const input = 'test input';
    
    // Act
    const result = functionUnderTest(input);
    
    // Assert
    expect(result).toBe('expected output');
  });
});
```

#### **Exercise 2.1: Writing Your First Test**
```typescript
// src/lib/math.ts
export function add(a: number, b: number): number {
  return a + b;
}

export function multiply(a: number, b: number): number {
  return a * b;
}

// test/lib/math.test.ts
import { add, multiply } from '../../src/lib/math';

describe('Math Functions', () => {
  test('should add two numbers correctly', () => {
    expect(add(2, 3)).toBe(5);
    expect(add(-1, 1)).toBe(0);
    expect(add(0, 0)).toBe(0);
  });

  test('should multiply two numbers correctly', () => {
    expect(multiply(2, 3)).toBe(6);
    expect(multiply(-2, 3)).toBe(-6);
    expect(multiply(0, 5)).toBe(0);
  });
});
```

**Exercise:**
1. Create the math.ts file
2. Write the test file
3. Run the tests: `npm test -- test/lib/math.test.ts`
4. Add more test cases for edge cases

### **2.2 Advanced Jest Features**

#### **Mocking and Spying**
```typescript
// Example: Testing with mocks
import { fetchUserData } from '../../src/lib/api';

// Mock the fetch function
global.fetch = jest.fn();

describe('API Functions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should fetch user data successfully', async () => {
    const mockUser = { id: 1, name: 'John Doe' };
    
    // Mock successful response
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => mockUser,
    });

    const result = await fetchUserData(1);
    
    expect(result).toEqual(mockUser);
    expect(global.fetch).toHaveBeenCalledWith('/api/users/1');
  });

  test('should handle API errors', async () => {
    // Mock error response
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 404,
    });

    await expect(fetchUserData(999)).rejects.toThrow('User not found');
  });
});
```

#### **Exercise 2.2: Testing with Mocks**
```typescript
// Create a simple email validation function
export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// Test the function with various inputs
describe('Email Validation', () => {
  test('should validate correct email addresses', () => {
    const validEmails = [
      'test@example.com',
      'user.name@domain.co.uk',
      'user+tag@example.org',
    ];

    validEmails.forEach(email => {
      expect(validateEmail(email)).toBe(true);
    });
  });

  test('should reject invalid email addresses', () => {
    const invalidEmails = [
      'invalid-email',
      '@example.com',
      'user@',
      'user@.com',
      'user space@example.com',
    ];

    invalidEmails.forEach(email => {
      expect(validateEmail(email)).toBe(false);
    });
  });
});
```

### **2.3 Test Coverage**

#### **Understanding Coverage**
```bash
# Run tests with coverage
npm test -- --coverage

# View coverage report
open coverage/lcov-report/index.html
```

#### **Coverage Types**
- **Statements**: Individual code statements
- **Branches**: Conditional branches (if/else)
- **Functions**: Function definitions
- **Lines**: Code lines

#### **Exercise 2.3: Improving Coverage**
```typescript
// Function with incomplete test coverage
export function processUser(user: any): string {
  if (!user) {
    return 'No user provided';
  }
  
  if (user.age < 18) {
    return 'User is too young';
  }
  
  if (user.role === 'admin') {
    return 'Admin user';
  }
  
  return 'Regular user';
}

// Current test (incomplete coverage)
describe('User Processing', () => {
  test('should process regular user', () => {
    const user = { age: 25, role: 'user' };
    expect(processUser(user)).toBe('Regular user');
  });
});

// Exercise: Add tests to achieve 100% coverage
// 1. Test null/undefined user
// 2. Test young user
// 3. Test admin user
```

## 🔄 **Module 3: Integration Testing**

### **3.1 Database Integration Testing**

#### **Prisma Test Setup**
```typescript
import { PrismaClient } from '@prisma/client';

describe('Database Integration', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = new PrismaClient({
      datasources: {
        db: {
          url: 'file:./test.db',
        },
      },
    });
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    // Clean up database before each test
    await prisma.certificateRevocation.deleteMany();
    await prisma.certificate.deleteMany();
    await prisma.caConfig.deleteMany();
    await prisma.user.deleteMany();
  });
});
```

#### **Exercise 3.1: Database Operations Testing**
```typescript
// Test user creation and retrieval
test('should create and retrieve user', async () => {
  const userData = {
    username: 'testuser',
    email: 'test@example.com',
    password: 'hashedpassword',
    role: 'OPERATOR',
    status: 'ACTIVE',
    name: 'Test User',
  };

  const user = await prisma.user.create({ data: userData });
  expect(user).toBeDefined();
  expect(user.username).toBe('testuser');

  const retrievedUser = await prisma.user.findUnique({
    where: { id: user.id },
  });
  expect(retrievedUser).toBeDefined();
  expect(retrievedUser?.username).toBe('testuser');
});

// Exercise: Add more database tests
// 1. Test user update
// 2. Test user deletion
// 3. Test unique constraints
// 4. Test relationships (user -> certificates)
```

### **3.2 API Integration Testing**

#### **Testing API Endpoints**
```typescript
import { NextRequest } from 'next/server';
import { POST as issueCertificate } from '../../src/app/api/certificates/issue/route';

// Mock NextAuth
jest.mock('next-auth', () => ({
  getServerSession: jest.fn(),
}));

describe('Certificate Issue API', () => {
  beforeEach(() => {
    // Setup mock session
    const { getServerSession } = require('next-auth');
    getServerSession.mockResolvedValue({
      user: { id: '1', role: 'OPERATOR' },
    });
  });

  test('should issue certificate successfully', async () => {
    const requestBody = {
      commonName: 'test.example.com',
      certificateType: 'SERVER',
      keyAlgorithm: 'RSA',
      keySize: '2048',
      validityDays: 365,
    };

    const request = new NextRequest('http://localhost:3000/api/certificates/issue', {
      method: 'POST',
      body: JSON.stringify(requestBody),
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await issueCertificate(request);
    expect(response.status).toBe(200);

    const responseData = await response.json();
    expect(responseData.success).toBe(true);
  });
});
```

## 🎭 **Module 4: End-to-End Testing with Playwright**

### **4.1 Playwright Fundamentals**

#### **Basic Test Structure**
```typescript
import { test, expect } from '@playwright/test';

test.describe('User Authentication', () => {
  test('should login successfully', async ({ page }) => {
    // Navigate to login page
    await page.goto('/auth/signin');
    
    // Fill login form
    await page.getByLabel('Username').fill('admin');
    await page.getByLabel('Password').fill('password');
    
    // Submit form
    await page.getByRole('button', { name: 'Sign In' }).click();
    
    // Verify successful login
    await expect(page).toHaveURL('/dashboard');
    await expect(page.getByText('Welcome')).toBeVisible();
  });
});
```

#### **Exercise 4.1: Your First E2E Test**
```typescript
// Create a simple test for the home page
test('should display home page correctly', async ({ page }) => {
  // Navigate to home page
  await page.goto('/');
  
  // Check page title
  await expect(page).toHaveTitle(/Certificate Authority/i);
  
  // Check for main heading
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  
  // Check for navigation elements
  await expect(page.getByRole('navigation')).toBeVisible();
  
  // Check for main content
  await expect(page.getByRole('main')).toBeVisible();
});
```

### **4.2 Advanced Playwright Features**

#### **Page Object Model**
```typescript
// page-objects/LoginPage.ts
export class LoginPage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto('/auth/signin');
  }

  async login(username: string, password: string) {
    await this.page.getByLabel('Username').fill(username);
    await this.page.getByLabel('Password').fill(password);
    await this.page.getByRole('button', { name: 'Sign In' }).click();
  }

  async expectLoginSuccess() {
    await expect(this.page).toHaveURL('/dashboard');
  }
}

// Using the page object
test('should login with page object', async ({ page }) => {
  const loginPage = new LoginPage(page);
  await loginPage.goto();
  await loginPage.login('admin', 'password');
  await loginPage.expectLoginSuccess();
});
```

#### **Exercise 4.2: Create Page Objects**
```typescript
// Exercise: Create a DashboardPage class
export class DashboardPage {
  constructor(private page: Page) {}

  async goto() {
    // Navigate to dashboard
  }

  async getWelcomeMessage() {
    // Get welcome message text
  }

  async navigateToSection(sectionName: string) {
    // Navigate to specific section
  }

  async expectSectionVisible(sectionName: string) {
    // Verify section is visible
  }
}

// Use the DashboardPage in tests
test('should navigate dashboard sections', async ({ page }) => {
  const dashboard = new DashboardPage(page);
  await dashboard.goto();
  
  await dashboard.navigateToSection('Certificates');
  await dashboard.expectSectionVisible('Certificates');
});
```

### **4.3 Visual Regression Testing**

#### **Screenshot Testing**
```typescript
test('should capture dashboard screenshot', async ({ page }) => {
  await page.goto('/dashboard');
  await page.waitForLoadState('networkidle');
  
  // Capture screenshot
  await expect(page).toHaveScreenshot('dashboard.png', {
    fullPage: true,
    timeout: 10000,
  });
});
```

#### **Exercise 4.3: Visual Testing**
```typescript
// Exercise: Create visual tests for different pages
test.describe('Visual Regression', () => {
  test('should capture login page', async ({ page }) => {
    // Navigate to login page and capture screenshot
  });

  test('should capture certificates page', async ({ page }) => {
    // Login, navigate to certificates, and capture screenshot
  });

  test('should capture responsive design', async ({ page }) => {
    // Test different viewport sizes
    // Mobile: 375x667
    // Tablet: 768x1024
    // Desktop: 1280x720
  });
});
```

## ♿ **Module 5: Accessibility Testing**

### **5.1 WCAG Compliance**

#### **Basic Accessibility Tests**
```typescript
test('should have proper heading structure', async ({ page }) => {
  await page.goto('/dashboard');
  
  // Check for main heading (h1)
  const h1Elements = page.locator('h1');
  await expect(h1Elements).toHaveCount(1);
  
  // Check for logical heading hierarchy
  const headings = page.locator('h1, h2, h3, h4, h5, h6');
  const headingCount = await headings.count();
  expect(headingCount).toBeGreaterThan(0);
});
```

#### **Exercise 5.1: Accessibility Validation**
```typescript
// Exercise: Create comprehensive accessibility tests
test.describe('Accessibility Compliance', () => {
  test('should have proper form labels', async ({ page }) => {
    // Check that all form inputs have labels
  });

  test('should be keyboard navigable', async ({ page }) => {
    // Test tab navigation and focus management
  });

  test('should have proper ARIA attributes', async ({ page }) => {
    // Check for appropriate ARIA usage
  });

  test('should have proper color contrast', async ({ page }) => {
    // Verify color contrast meets WCAG standards
  });
});
```

## ⚡ **Module 6: Performance Testing**

### **6.1 Performance Metrics**

#### **Core Web Vitals**
```typescript
test('should meet performance budgets', async ({ page }) => {
  const startTime = Date.now();
  
  await page.goto('/dashboard');
  await page.waitForLoadState('networkidle');
  
  const loadTime = Date.now() - startTime;
  expect(loadTime).toBeLessThan(3000); // 3 second budget
});
```

#### **Exercise 6.1: Performance Monitoring**
```typescript
// Exercise: Create comprehensive performance tests
test.describe('Performance Testing', () => {
  test('should load pages within budget', async ({ page }) => {
    // Test multiple pages for load time compliance
  });

  test('should handle concurrent operations', async ({ page }) => {
    // Test performance under load
  });

  test('should optimize resource loading', async ({ page }) => {
    // Check resource loading efficiency
  });
});
```

## 🔄 **Module 7: CI/CD Integration**

### **7.1 Understanding the Pipeline**

#### **GitHub Actions Workflow**
```yaml
# .github/workflows/test.yml overview
name: Test Suite

on:
  push: [main, develop]
  pull_request: [main, develop]
  schedule: [daily at 2 AM UTC]

jobs:
  unit-tests: # Jest tests
  e2e-tests: # Playwright tests
  visual-regression: # Screenshot tests
  accessibility: # WCAG tests
  performance: # Performance tests
  security: # Security tests
```

#### **Exercise 7.1: Pipeline Monitoring**
```bash
# Exercise: Monitor CI/CD pipeline
# 1. Push a change to trigger pipeline
# 2. Monitor job execution in GitHub Actions
# 3. Review test results and artifacts
# 4. Understand failure scenarios
```

### **7.2 Local CI/CD Testing**

#### **Running Tests Locally**
```bash
# Run the same tests locally that run in CI
npm test -- --coverage --watchAll=false
npx playwright test --reporter=html
```

## 📊 **Module 8: Test Maintenance**

### **8.1 Flaky Test Management**

#### **Identifying Flaky Tests**
```bash
# Run tests multiple times
npm test -- --repeat-each=3

# Check for open handles
npm test -- --detectOpenHandles
```

#### **Exercise 8.1: Fix Flaky Tests**
```typescript
// Exercise: Fix a flaky test
test('should handle async operation', async ({ page }) => {
  // Current flaky implementation
  await page.waitForTimeout(1000); // Unreliable
  
  // Fix: Use proper waiting
  await page.waitForSelector('[data-testid="result"]', { state: 'visible' });
  await expect(page.locator('[data-testid="result"]')).toContainText('Success');
});
```

### **8.2 Test Data Management**

#### **Proper Test Cleanup**
```typescript
// Exercise: Implement proper test cleanup
describe('User Management', () => {
  beforeEach(async () => {
    // Implement cleanup before each test
  });

  afterEach(async () => {
    // Implement cleanup after each test
  });

  afterAll(async () => {
    // Implement final cleanup
  });
});
```

## 🎯 **Module 9: Hands-On Project**

### **9.1 Complete Testing Scenario**

#### **Project: Test a New Feature**
```typescript
// Scenario: Add a new "Certificate Search" feature
// 1. Write unit tests for search logic
// 2. Write integration tests for search API
// 3. Write E2E tests for search UI
// 4. Add accessibility tests
// 5. Add performance tests
// 6. Update CI/CD pipeline if needed
```

#### **Exercise 9.1: Feature Testing**
```typescript
// Step 1: Unit Tests
export function searchCertificates(query: string, certificates: Certificate[]): Certificate[] {
  if (!query.trim()) return certificates;
  
  const searchTerm = query.toLowerCase();
  return certificates.filter(cert => 
    cert.commonName.toLowerCase().includes(searchTerm) ||
    cert.serialNumber.toLowerCase().includes(searchTerm)
  );
}

// Write comprehensive unit tests
describe('Certificate Search', () => {
  test('should return all certificates for empty query', () => {
    // Test implementation
  });

  test('should filter certificates by common name', () => {
    // Test implementation
  });

  test('should filter certificates by serial number', () => {
    // Test implementation
  });

  test('should handle case-insensitive search', () => {
    // Test implementation
  });
});
```

## 📚 **Module 10: Best Practices & Troubleshooting**

### **10.1 Testing Best Practices**

#### **Do's and Don'ts**
```typescript
// ✅ DO: Write descriptive test names
test('should create user with valid data and return user object with generated ID', () => {
  // Test implementation
});

// ❌ DON'T: Use vague test names
test('should work', () => {
  // Test implementation
});

// ✅ DO: Use proper assertions
expect(result).toBeDefined();
expect(result.id).toBeTruthy();
expect(result.name).toBe('John Doe');

// ❌ DON'T: Use weak assertions
expect(result).toBeTruthy(); // Too vague
```

#### **Exercise 10.1: Code Review**
```typescript
// Exercise: Review and improve test code
describe('User Service', () => {
  test('should work', async () => {
    const user = await userService.createUser({ name: 'John' });
    expect(user).toBeTruthy();
  });
});

// Improve this test with:
// 1. Better test name
// 2. Proper assertions
// 3. Test data setup
// 4. Proper cleanup
```

### **10.2 Common Issues & Solutions**

#### **Troubleshooting Guide**
```bash
# Issue: Tests are slow
# Solution: Optimize test setup, use parallel execution

# Issue: Tests are flaky
# Solution: Use proper waiting, fix race conditions

# Issue: Coverage is low
# Solution: Add tests for uncovered code paths

# Issue: CI/CD pipeline fails
# Solution: Check logs, verify environment setup
```

## 📋 **Assessment & Certification**

### **10.1 Knowledge Check**

#### **Multiple Choice Questions**
1. What is the purpose of the testing pyramid?
2. When should you use mocks in tests?
3. What are the Core Web Vitals?
4. How do you identify flaky tests?

#### **Practical Exercises**
1. Write a unit test for a given function
2. Create an E2E test for a user workflow
3. Fix a failing test
4. Add accessibility tests to existing code

### **10.2 Certification Levels**

#### **Beginner Level**
- Understand testing fundamentals
- Write basic unit tests
- Run existing test suites
- Basic troubleshooting

#### **Intermediate Level**
- Write comprehensive tests
- Create E2E test scenarios
- Maintain test infrastructure
- Debug complex test issues

#### **Advanced Level**
- Design testing strategies
- Optimize test performance
- Lead testing initiatives
- Mentor team members

## 🚀 **Next Steps & Continuous Learning**

### **10.1 Learning Resources**
- **Official Documentation**: Jest, Playwright, Prisma
- **Online Courses**: Testing frameworks, CI/CD
- **Community Forums**: Stack Overflow, GitHub Discussions
- **Conferences**: Testing conferences, DevOps events

### **10.2 Practice Projects**
1. **Personal Project**: Add comprehensive testing to a personal project
2. **Open Source**: Contribute tests to open source projects
3. **Team Projects**: Lead testing initiatives in team projects
4. **Blog/Video**: Share testing knowledge with the community

### **10.3 Advanced Topics**
- **AI-Powered Testing**: Machine learning in testing
- **Performance Testing**: Load testing, stress testing
- **Security Testing**: Penetration testing, vulnerability scanning
- **Mobile Testing**: Mobile-specific testing strategies

---

## 📋 **Training Completion Checklist**

### **Before Training**
- [ ] Review testing fundamentals
- [ ] Install required tools (Node.js, npm, Git)
- [ ] Clone the project repository
- [ ] Set up development environment

### **During Training**
- [ ] Complete all exercises
- [ ] Participate in discussions
- [ ] Ask questions and seek clarification
- [ ] Practice with real scenarios

### **After Training**
- [ ] Complete assessment exercises
- [ ] Review and understand all concepts
- [ ] Apply knowledge to real projects
- [ ] Continue learning and improvement

---

**Document Version**: 1.0  
**Last Updated**: $(date)  
**Next Review**: Quarterly  
**Owner**: Development Team  
**Stakeholders**: All Team Members