import { getServerSession } from 'next-auth';
import { authOptions, AuthService } from '@/lib/auth';
import crypto from 'crypto';

const getSecret = (): Buffer => {
  const secret = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET || 'dev-secret-change-me';
  return Buffer.from(secret, 'utf8');
};

function base64url(input: Buffer | string): string {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input, 'utf8');
  return buf.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function signHS256(data: string, secret: Buffer): string {
  const h = crypto.createHmac('sha256', secret).update(data).digest();
  return base64url(h);
}

export async function issueApiToken(payload: {
  id: string;
  username: string;
  role: string;
  permissions: string[];
  email?: string;
  name?: string;
}): Promise<string> {
  const maxAgeSec = parseInt(process.env.SESSION_MAX_AGE || '86400', 10);
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'HS256', typ: 'JWT' } as const;
  const body = { ...payload, iat: now, exp: now + maxAgeSec } as any;
  const encodedHeader = base64url(JSON.stringify(header));
  const encodedBody = base64url(JSON.stringify(body));
  const content = `${encodedHeader}.${encodedBody}`;
  const signature = signHS256(content, getSecret());
  return `${content}.${signature}`;
}

export async function verifyApiToken(token: string): Promise<any | null> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [encodedHeader, encodedBody, sig] = parts;
    const content = `${encodedHeader}.${encodedBody}`;
    const expected = signHS256(content, getSecret());
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    const payloadJson = Buffer.from(encodedBody.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    const payload = JSON.parse(payloadJson);
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && now > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function getApiSession(request: Request): Promise<
  | { user: { id: string; username: string; role: any; permissions: string[]; email?: string; name?: string } }
  | null
> {
  // 1) Try Bearer token
  const auth = request.headers.get('authorization') || request.headers.get('Authorization');
  if (auth && auth.toLowerCase().startsWith('bearer ')) {
    const token = auth.slice(7).trim();
    const payload = await verifyApiToken(token);
    if (payload && payload.id && payload.username && payload.role && payload.permissions) {
      return {
        user: {
          id: String(payload.id),
          username: String(payload.username),
          role: payload.role as any,
          permissions: (payload.permissions as any[])?.map(String) || [],
          email: payload.email ? String(payload.email) : undefined,
          name: payload.name ? String(payload.name) : undefined,
        },
      };
    }
  }

  // 2) Fallback to NextAuth session (cookie-based)
  try {
    const session = await getServerSession(authOptions);
    return session as any;
  } catch {
    return null;
  }
}

export async function authenticateAndIssueToken(username: string, password: string): Promise<string | null> {
  const user = await AuthService.authenticateUser(username, password);
  if (!user) return null;
  return issueApiToken({
    id: user.id,
    username: user.username,
    role: user.role,
    permissions: user.permissions,
    email: user.email,
    name: user.name,
  });
}

