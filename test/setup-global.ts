// Global test setup for Next.js environment
import { TextEncoder, TextDecoder } from 'util';

// Polyfill for TextEncoder/TextDecoder
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder as any;

// Polyfill for setImmediate (needed for Prisma)
global.setImmediate = global.setImmediate || ((fn: Function, ...args: any[]) => setTimeout(fn, 0, ...args));

// Polyfill for clearImmediate
global.clearImmediate = global.clearImmediate || ((id: any) => clearTimeout(id));

// Mock Next.js Request/Response
global.Request = class MockRequest {
  private _url: string;
  private _method: string;
  private _headers: Headers;
  private _body: any;

  constructor(input: any, init?: any) {
    this._url = typeof input === 'string' ? input : input?.url || 'http://localhost:3000';
    this._method = init?.method || 'GET';
    this._headers = new Headers(init?.headers || {});
    this._body = init?.body || null;
  }

  get url() { return this._url; }
  get method() { return this._method; }
  get headers() { return this._headers; }
  get body() { return this._body; }
} as any;

// Do not override global Response; NextResponse returns a web Response which Jest can handle

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