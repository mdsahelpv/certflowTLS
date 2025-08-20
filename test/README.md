# 🧪 Testing Framework

This directory contains the comprehensive testing suite for the Certificate Authority Management System.

## 🏗️ **Test Structure**

```
test/
├── setup.ts                 # Test environment setup and mocks
├── utils/
│   └── test-utils.tsx      # Test utilities and helpers
├── lib/                     # Library function tests
│   ├── auth.test.ts         # Authentication service tests
│   └── crypto.test.ts       # Cryptographic utilities tests
├── components/              # React component tests
│   └── layout.test.tsx      # Layout component tests
├── app/                     # API route tests
│   └── api/
│       └── health.test.ts   # Health endpoint tests
└── README.md                # This file
```

## 🚀 **Getting Started**

### **Prerequisites**
- Node.js 18+
- npm or yarn

### **Installation**
```bash
# Install testing dependencies
npm install --save-dev jest @testing-library/react @testing-library/jest-dom @types/jest ts-jest
```

### **Running Tests**
```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Run specific test file
npm test -- auth.test.ts

# Run tests matching pattern
npm test -- --testNamePattern="should authenticate valid user"
```

## 📋 **Test Categories**

### **1. Unit Tests (`test/lib/`)**
- **Authentication**: User creation, login, permissions
- **Cryptography**: Encryption, certificate operations, key generation
- **CA Management**: Certificate authority operations
- **Certificate Operations**: Issue, renew, revoke certificates

### **2. Component Tests (`test/components/`)**
- **Layout**: Main application layout and navigation
- **Forms**: Certificate issuance, user management forms
- **UI Components**: Individual UI component behavior
- **Authentication**: Login, registration components

### **3. API Tests (`test/app/api/`)**
- **Health Endpoints**: System health and status
- **Authentication**: Login, logout, session management
- **CA Operations**: CA initialization, certificate management
- **User Management**: User CRUD operations

### **4. Integration Tests**
- **Database Operations**: Prisma operations with test database
- **API Endpoints**: Full request/response cycle testing
- **Authentication Flow**: Complete auth workflow testing

## 🛠️ **Test Utilities**

### **Custom Render Function**
```tsx
import { render, screen } from '../utils/test-utils'

// Automatically wraps components with providers
render(<MyComponent />)
```

### **Mock Data Factories**
```tsx
import { createMockUser, createMockCAConfig } from '../utils/test-utils'

const user = createMockUser({ role: 'ADMIN' })
const caConfig = createMockCAConfig({ status: 'ACTIVE' })
```

### **Mock API Responses**
```tsx
import { mockFetch } from '../utils/test-utils'

mockFetch({
  '/api/ca/status': { status: 'ACTIVE' },
  '/api/certificates': { certificates: [] }
})
```

## 🔧 **Configuration**

### **Jest Configuration (`jest.config.js`)**
- **Environment**: jsdom for React testing
- **Coverage**: 70% threshold for all metrics
- **Transform**: TypeScript support with ts-jest
- **Setup**: Automatic test environment configuration

### **TypeScript Configuration (`tsconfig.test.json`)**
- **Extends**: Base tsconfig with test-specific settings
- **Types**: Jest, Testing Library, Node.js types
- **Include**: Test files and source code

### **Test Setup (`test/setup.ts`)**
- **Environment Variables**: Test-specific configuration
- **Mock Setup**: Next.js, Prisma, crypto mocks
- **Global Configuration**: Console mocking, cleanup

## 📊 **Coverage Requirements**

- **Branches**: 70%
- **Functions**: 70%
- **Lines**: 70%
- **Statements**: 70%

## 🧹 **Test Best Practices**

### **1. Test Organization**
```tsx
describe('ComponentName', () => {
  describe('when user is authenticated', () => {
    it('should display user information', () => {
      // Test implementation
    })
  })

  describe('when user is not authenticated', () => {
    it('should redirect to login', () => {
      // Test implementation
    })
  })
})
```

### **2. Mock Management**
```tsx
beforeEach(() => {
  jest.clearAllMocks()
})

afterEach(() => {
  // Cleanup if needed
})
```

### **3. Async Testing**
```tsx
it('should load data asynchronously', async () => {
  render(<DataComponent />)
  
  await waitFor(() => {
    expect(screen.getByText('Data loaded')).toBeInTheDocument()
  })
})
```

### **4. User Interaction Testing**
```tsx
it('should handle form submission', async () => {
  render(<FormComponent />)
  
  const submitButton = screen.getByRole('button', { name: /submit/i })
  await userEvent.click(submitButton)
  
  expect(mockSubmitFunction).toHaveBeenCalled()
})
```

## 🚨 **Common Issues & Solutions**

### **1. Mock Not Working**
```tsx
// Ensure mock is set up before test
jest.mock('@/lib/db')
const mockDb = require('@/lib/db').db
```

### **2. Provider Context Issues**
```tsx
// Use custom render function with providers
import { render } from '../utils/test-utils'
```

### **3. Async Operations**
```tsx
// Use waitFor for async operations
await waitFor(() => {
  expect(screen.getByText('Result')).toBeInTheDocument()
})
```

### **4. Environment Variables**
```tsx
// Set environment variables in test
process.env.NODE_ENV = 'test'
process.env.DATABASE_URL = 'file:./test.db'
```

## 📈 **Adding New Tests**

### **1. Create Test File**
```bash
# Follow naming convention: component.test.tsx or function.test.ts
touch test/components/NewComponent.test.tsx
```

### **2. Import Dependencies**
```tsx
import { render, screen } from '../utils/test-utils'
import NewComponent from '@/components/NewComponent'
```

### **3. Write Test Cases**
```tsx
describe('NewComponent', () => {
  it('should render correctly', () => {
    render(<NewComponent />)
    expect(screen.getByText('Component Text')).toBeInTheDocument()
  })
})
```

### **4. Run Tests**
```bash
npm test -- NewComponent.test.tsx
```

## 🔍 **Debugging Tests**

### **1. Verbose Output**
```bash
npm test -- --verbose
```

### **2. Debug Mode**
```bash
npm test -- --detectOpenHandles
```

### **3. Single Test File**
```bash
npm test -- --testPathPattern="auth.test.ts"
```

### **4. Coverage Report**
```bash
npm run test:coverage
# Open coverage/lcov-report/index.html
```

## 📚 **Resources**

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [React Testing Library](https://testing-library.com/docs/react-testing-library/intro/)
- [Testing Library Jest DOM](https://github.com/testing-library/jest-dom)
- [Next.js Testing](https://nextjs.org/docs/testing)

---

**Happy Testing! 🧪✨**