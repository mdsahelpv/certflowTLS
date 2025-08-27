import { getServerSession } from 'next-auth';
import { authOptions, AuthService } from '@/lib/auth';
import { SignJWT, jwtVerify } from 'jose';

const getSecret = (): Uint8Array => {
  const secret = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET || 'dev-secret-change-me';
  return new TextEncoder().encode(secret);
};

export async function issueApiToken(payload: {
  id: string;
  username: string;
  role: string;
  permissions: string[];
  email?: string;
  name?: string;
}): Promise<string> {
  const maxAgeSec = parseInt(process.env.SESSION_MAX_AGE || '86400', 10);
  const jwt = await new SignJWT(payload as any)
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt()
    .setExpirationTime(`${maxAgeSec}s`)
    .sign(getSecret());
  return jwt;
}

export async function verifyApiToken(token: string): Promise<any | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
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

