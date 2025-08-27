import { test, expect } from '@playwright/test';
import * as pkijs from 'pkijs';
import { webcrypto } from 'crypto';
import { X509Utils } from '../src/lib/crypto';

// Helper function to self-sign a CSR
async function selfSignCSR(csrPem: string, privateKeyPem: string): Promise<string> {
  pkijs.setEngine('webcrypto', new pkijs.CryptoEngine({
    name: 'webcrypto',
    crypto: webcrypto,
    subtle: webcrypto.subtle,
  }));

  return X509Utils.selfSignCSR(
    csrPem,
    privateKeyPem,
    365,
    {
      crlDistributionPointUrl: 'http://localhost:3000/api/crl/latest.crl',
      ocspUrl: 'http://localhost:3000/api/ocsp',
    }
  );
}


test.describe('Full Certificate Lifecycle E2E Test', () => {
  let privateKeyPem: string;
  let issuedCertificatePEM: string;

  test.beforeEach(async ({ page }) => {
    await page.goto('/auth/signin');
    await page.getByLabel('Username').fill('admin');
    await page.getByLabel('Password').fill('password');
    await page.getByRole('button', { name: 'Sign In' }).click();
    await expect(page).toHaveURL('/dashboard');
  });

  test('should setup a CA, then issue, validate, and revoke a certificate', async ({ page }) => {
    // Step 1: Setup a new Certificate Authority
    await page.goto('/ca/setup');
    await page.getByLabel('CA Name').fill('My Test CA');
    await page.getByLabel('Common Name').fill('My Test CA');
    await page.getByRole('button', { name: 'Generate CSR' }).click();

    // Capture the CSR and private key
    const csrPem = await page.locator('pre:has-text("-----BEGIN CERTIFICATE REQUEST-----")').innerText();
    privateKeyPem = await page.locator('pre:has-text("-----BEGIN PRIVATE KEY-----")').innerText();

    // Self-sign the CSR to create a root certificate
    const rootCertPem = await selfSignCSR(csrPem, privateKeyPem);

    // Upload the root certificate
    await page.getByLabel('CA Certificate PEM').fill(rootCertPem);
    await page.getByRole('button', { name: 'Upload Certificate' }).click();
    await expect(page.getByText('Certificate Authority activated successfully')).toBeVisible();

    // Step 2: Issue a new certificate
    await page.goto('/certificates/issue');
    await page.getByLabel('Common Name').fill('test-cert.example.com');
    await page.getByLabel('Validity (days)').fill('30');
    await page.getByRole('button', { name: 'Issue Certificate' }).click();

    // Wait for the success message and extract the certificate PEM
    await expect(page.getByText('Certificate issued successfully')).toBeVisible();
    const pemElement = page.locator('pre').first();
    issuedCertificatePEM = await pemElement.innerText();
    expect(issuedCertificatePEM).toContain('-----BEGIN CERTIFICATE-----');

    // Step 3: Validate the new certificate
    await page.goto('/certificates/validate');
    await page.getByLabel('Certificate PEM').fill(issuedCertificatePEM);
    await page.getByRole('button', { name: 'Validate Certificate' }).click();
    await expect(page.getByText('Certificate is valid')).toBeVisible();

    // Step 4: Revoke the certificate
    await page.goto('/certificates');
    const row = page.getByRole('row', { name: /test-cert.example.com/ });
    await row.getByRole('button', { name: 'Actions' }).click();
    await page.getByRole('menuitem', { name: 'Revoke' }).click();
    await page.getByRole('button', { name: 'Revoke Certificate' }).click();
    await expect(page.getByText('Certificate revoked successfully')).toBeVisible();

    // Step 5: Verify the certificate is revoked
    await page.goto('/certificates/validate');
    await page.getByLabel('Certificate PEM').fill(issuedCertificatePEM);
    await page.getByRole('button', { name: 'Validate Certificate' }).click();
    await expect(page.getByText('Certificate has been revoked')).toBeVisible();
  });
});
