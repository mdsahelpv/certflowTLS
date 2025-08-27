// Global test setup for Next.js environment
import { TextEncoder, TextDecoder } from 'util';

// Polyfill for TextEncoder/TextDecoder
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder as any;

// Mock Next.js Request/Response
global.Request = class MockRequest {
  url: string;
  method: string;
  headers: Headers;
  body: any;

  constructor(input: any, init?: any) {
    this.url = typeof input === 'string' ? input : input?.url || 'http://localhost:3000';
    this.method = init?.method || 'GET';
    this.headers = new Headers(init?.headers || {});
    this.body = init?.body || null;
  }
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