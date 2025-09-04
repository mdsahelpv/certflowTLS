// Global test setup for Next.js environment
import { TextEncoder, TextDecoder } from 'text-encoding';
import fetch, { Headers, Request, Response } from 'node-fetch';

// Polyfill for TextEncoder/TextDecoder
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder as any;

// Polyfill for fetch
global.fetch = fetch as any;
global.Headers = Headers as any;
global.Request = Request as any;
global.Response = Response as any;

// Polyfill for setImmediate (needed for Prisma)
global.setImmediate = global.setImmediate || ((fn: Function, ...args: any[]) => setTimeout(fn, 0, ...args));

// Polyfill for clearImmediate
global.clearImmediate = global.clearImmediate || ((id: any) => clearTimeout(id));

// Mock environment variables
process.env.NODE_ENV = 'test';
process.env.NEXTAUTH_SECRET = 'test-secret';
process.env.ENCRYPTION_KEY = 'test-key-32-characters-long';
process.env.DATABASE_URL = 'file:./test.db';

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