// Global test setup for Next.js environment
import { TextEncoder, TextDecoder } from 'util';

// Polyfill for TextEncoder/TextDecoder using Node.js built-ins
global.TextEncoder = TextEncoder as any;
global.TextDecoder = TextDecoder as any;

// Mock fetch for tests
global.fetch = jest.fn(() =>
  Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve({}),
    text: () => Promise.resolve(''),
  })
) as any;

// Mock web APIs that aren't available in Node.js
global.Headers = class Headers {
  constructor() {}
  get() { return null; }
  set() {}
  has() { return false; }
} as any;

global.Request = class Request {
  constructor() {}
} as any;

global.Response = class Response {
  constructor() {}
} as any;

// Polyfill for setImmediate (needed for Prisma)
global.setImmediate = global.setImmediate || ((fn: Function, ...args: any[]) => setTimeout(fn, 0, ...args));

// Polyfill for clearImmediate
global.clearImmediate = global.clearImmediate || ((id: any) => clearTimeout(id));

// Mock environment variables
(process.env as any).NODE_ENV = 'test';
process.env.NEXTAUTH_SECRET = 'test-secret';
process.env.ENCRYPTION_KEY = 'test-key-32-characters-long';
process.env.DATABASE_URL = 'file:./prisma/db/custom.db';

// Mock matchMedia for UI components depending on next-themes or media queries
if (!(global as any).window) (global as any).window = {} as any;
(global as any).window.matchMedia = (global as any).window.matchMedia || ((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener: () => {},
  removeListener: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => false,
}));
