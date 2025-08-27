export async function getToken(username: string, password: string): Promise<string> {
  const req = new Request('http://localhost:3000/api/auth/token', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const { POST } = await import('@/app/api/auth/token/route');
  const res = await POST(req as any);
  const data = await (res as any).json();
  if (!data?.access_token) throw new Error('Failed to obtain token');
  return data.access_token as string;
}

export async function apiFetch(path: string, token: string, init?: RequestInit): Promise<Response> {
  const url = path.startsWith('http') ? path : `http://localhost:3000${path}`;
  const req = new Request(url, {
    ...init,
    headers: {
      ...(init?.headers || {}),
      authorization: `Bearer ${token}`,
      ...(init?.body && !(init?.headers as any)?.['content-type'] ? { 'content-type': 'application/json' } : {}),
    } as any,
  });
  const route = await routeHandler(path, req.method || 'GET');
  const res = await route(req as any);
  return res as unknown as Response;
}

async function routeHandler(path: string, method: string) {
  // Map path prefixes to route modules
  if (path.startsWith('/api/ca/status')) return (await import('@/app/api/ca/status/route')).GET;
  if (path.startsWith('/api/ca/self-signed')) return (await import('@/app/api/ca/self-signed/route')).POST;
  if (path.startsWith('/api/ca/upload-certificate')) return (await import('@/app/api/ca/upload-certificate/route')).POST;
  if (path.startsWith('/api/ca/initialize')) return (await import('@/app/api/ca/initialize/route')).POST;
  if (path.startsWith('/api/ca/') && method === 'GET') return (await import('@/app/api/ca/[id]/route')).GET;
  if (path.startsWith('/api/ca/') && method === 'DELETE') return (await import('@/app/api/ca/[id]/route')).DELETE;
  if (path.startsWith('/api/certificates/issue')) return (await import('@/app/api/certificates/issue/route')).POST;
  if (path.startsWith('/api/certificates/revoke')) return (await import('@/app/api/certificates/revoke/route')).POST;
  if (path.startsWith('/api/certificates/') && path.includes('/renew')) return (await import('@/app/api/certificates/[serialNumber]/renew/route')).POST;
  if (path.startsWith('/api/certificates')) return (await import('@/app/api/certificates/route')).GET;
  if (path.startsWith('/api/crl/generate')) return (await import('@/app/api/crl/generate/route')).POST;
  if (path.startsWith('/api/crl/download/latest')) return (await import('@/app/api/crl/download/latest/route')).GET;
  if (path.startsWith('/api/crl/status')) return (await import('@/app/api/crl/status/route')).GET;
  if (path.startsWith('/api/crl/export')) return (await import('@/app/api/crl/export/route')).GET;
  if (path.startsWith('/api/crl/validate')) return (await import('@/app/api/crl/validate/route')).POST;
  if (path.startsWith('/api/ocsp/binary')) return (await import('@/app/api/ocsp/binary/route')).POST;
  if (path.startsWith('/api/ocsp')) return (await import('@/app/api/ocsp/route')).POST;
  throw new Error(`Route handler not mapped for ${method} ${path}`);
}

