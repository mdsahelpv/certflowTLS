import { getToken, apiFetch } from '../utils/api';

describe('API Smoke - End-to-End via Bearer token', () => {
  let token: string;

  beforeAll(async () => {
    token = await getToken(process.env.ADMIN_USERNAME || 'admin', process.env.ADMIN_PASSWORD || 'admin123');
  });

  it('should create self-signed CA, issue and revoke a cert, and generate CRL', async () => {
    // Ensure a CA exists
    let res = await apiFetch('/api/ca/self-signed', token, {
      method: 'POST',
      body: JSON.stringify({
        subjectDN: 'C=US,ST=CA,L=SF,O=API Test,OU=IT,CN=API Root CA',
        keyAlgorithm: 'RSA',
        keySize: 2048,
        validityDays: 365,
        force: true,
      }),
    });
    expect(res.status).toBeGreaterThanOrEqual(200);
    expect(res.status).toBeLessThan(400);

    // Issue a server certificate
    res = await apiFetch('/api/certificates/issue', token, {
      method: 'POST',
      body: JSON.stringify({
        subjectDN: 'CN=api-smoke.example.com',
        certificateType: 'SERVER',
        keyAlgorithm: 'RSA',
        keySize: 2048,
        validityDays: 365,
        sans: ['api-smoke.example.com'],
      }),
    });
    expect(res.status).toBe(200);
    const issued = await (res as any).json();
    expect(issued.serialNumber).toBeDefined();

    // Revoke the certificate
    res = await apiFetch('/api/certificates/revoke', token, {
      method: 'POST',
      body: JSON.stringify({ serialNumber: issued.serialNumber, reason: 'KEY_COMPROMISE' }),
    });
    expect(res.status).toBe(200);

    // Generate CRL
    res = await apiFetch('/api/crl/generate', token, { method: 'POST', body: JSON.stringify({ type: 'full' }) });
    expect(res.status).toBe(200);
    const crl = await (res as any).json();
    expect(crl.crl).toContain('BEGIN X509 CRL');
  });
});

