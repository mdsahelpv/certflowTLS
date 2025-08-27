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

global.Response = class MockResponse {
  status: number;
  statusText: string;
  headers: Headers;
  body: any;

  constructor(body?: any, init?: any) {
    this.status = init?.status || 200;
    this.statusText = init?.statusText || 'OK';
    this.headers = new Headers(init?.headers || {});
    this.body = body || null;
  }

  static json(data: any, init?: any): MockResponse {
    return new MockResponse(JSON.stringify(data), init);
  }
} as any;

// Mock environment variables
process.env.NODE_ENV = 'test';
process.env.NEXTAUTH_SECRET = 'test-secret';
process.env.ENCRYPTION_KEY = 'test-key-32-characters-long';
process.env.DATABASE_URL = 'file:./test.db';