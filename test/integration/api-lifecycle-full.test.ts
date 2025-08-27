import { getToken, apiFetch } from '../utils/api';

describe('API Lifecycle - CA, Certificates, CRL, OCSP', () => {
  let token: string;

  beforeAll(async () => {
    token = await getToken(process.env.ADMIN_USERNAME || 'admin', process.env.ADMIN_PASSWORD || 'admin123');
  });

  it('CA status should include an ACTIVE CA (auto or created)', async () => {
    const res = await apiFetch('/api/ca/status', token);
    expect(res.status).toBe(200);
    const list = await (res as any).json();
    expect(Array.isArray(list)).toBe(true);
    expect(list.length).toBeGreaterThan(0);
  });

  it('Issue, list, renew, and revoke certificate via API', async () => {
    // Issue
    let res = await apiFetch('/api/certificates/issue', token, {
      method: 'POST',
      body: JSON.stringify({
        subjectDN: 'CN=full-lifecycle.example.com',
        certificateType: 'SERVER',
        keyAlgorithm: 'RSA',
        keySize: 2048,
        validityDays: 365,
        sans: ['full-lifecycle.example.com'],
      }),
    });
    expect(res.status).toBe(200);
    const issued = await (res as any).json();
    expect(issued.serialNumber).toBeDefined();

    // List
    res = await apiFetch('/api/certificates?limit=10&page=1&subjectDN=full-lifecycle.example.com', token);
    expect(res.status).toBe(200);
    const listed = await (res as any).json();
    expect(listed.total).toBeGreaterThan(0);

    // Renew
    res = await apiFetch(`/api/certificates/${issued.serialNumber}/renew`, token, { method: 'POST' });
    expect(res.status).toBe(200);
    const renewed = await (res as any).json();
    expect(renewed.serialNumber).not.toBe(issued.serialNumber);

    // Revoke
    res = await apiFetch('/api/certificates/revoke', token, {
      method: 'POST',
      body: JSON.stringify({ serialNumber: renewed.serialNumber, reason: 'UNSPECIFIED' }),
    });
    expect(res.status).toBe(200);
  });

  it('Generate CRL and fetch latest', async () => {
    let res = await apiFetch('/api/crl/generate', token, { method: 'POST', body: JSON.stringify({ type: 'full' }) });
    expect(res.status).toBe(200);
    const crlGen = await (res as any).json();
    expect(crlGen.crl).toContain('BEGIN X509 CRL');

    res = await apiFetch('/api/crl/download/latest', token);
    expect(res.status).toBe(200);
  });
});

