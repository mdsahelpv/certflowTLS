import { NextResponse } from 'next/server';
import { authenticateAndIssueToken } from '@/lib/api-auth';

export async function POST(request: Request) {
  try {
    const { username, password } = await request.json();
    if (!username || !password) {
      return NextResponse.json({ error: 'username and password are required' }, { status: 400 });
    }

    const token = await authenticateAndIssueToken(username, password);
    if (!token) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    return NextResponse.json({
      access_token: token,
      token_type: 'Bearer',
      expires_in: parseInt(process.env.SESSION_MAX_AGE || '86400', 10),
    });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to issue token' }, { status: 500 });
  }
}

