import 'dotenv/config';
import * as pkijs from 'pkijs';
import { webcrypto } from 'crypto';
import { CAService } from './src/lib/ca';
import { X509Utils } from './src/lib/crypto';
import { db } from './src/lib/db';

// Initialize pkijs
const cryptoEngine = new pkijs.CryptoEngine({
  name: 'webcrypto',
  crypto: webcrypto,
  subtle: webcrypto.subtle,
});
pkijs.setEngine('webcrypto', cryptoEngine);

async function main() {
  console.log('Starting CA initialization...');

  try {
    // 1. Check if an active CA already exists
    const existingCA = await db.cAConfig.findFirst({ where: { status: 'ACTIVE' } });
    if (existingCA) {
      console.log(`An active CA named '${existingCA.name || existingCA.subjectDN}' already exists. Skipping initialization.`);
      return;
    }
    console.log('No active CA found, proceeding with initialization.');

    // 2. Define CA configuration
    const caConfig = {
      name: 'Root CA',
      subjectDN: 'C=US, ST=California, L=San Francisco, O=My Org, OU=IT, CN=My Root CA',
      keyAlgorithm: 'RSA',
      keySize: 4096,
    };
    console.log(`CA Configuration: ${JSON.stringify(caConfig, null, 2)}`);

    // 3. Initialize CA to get CSR and private key
    const { caId, csr, privateKey } = await CAService.initializeCA(caConfig);
    console.log(`CA initialized with ID: ${caId}. CSR generated.`);

    // 4. Self-sign the CSR to create a root certificate
    const rootCertPem = X509Utils.selfSignCSR(
      csr,
      privateKey,
      365 * 10, // 10 years validity
      {
        crlDistributionPointUrl: process.env.CRL_DISTRIBUTION_POINT,
        ocspUrl: process.env.OCSP_URL,
      }
    );
    console.log('CSR has been self-signed to create the root CA certificate.');

    // 5. Upload the certificate to activate the CA
    await CAService.uploadCACertificate(rootCertPem, caId);
    console.log('Root CA certificate uploaded and activated successfully.');

    // 6. Generate the first CRL
    console.log('Generating initial CRL...');
    await CAService.generateCRL(caId);
    console.log('Initial CRL generated successfully.');

    console.log('\n=================================');
    console.log('✅ CA Setup and CRL Generation Complete!');
    console.log('=================================');

  } catch (error) {
    console.error('❌ CA initialization failed:', error);
    process.exit(1);
  } finally {
    await db.$disconnect();
  }
}

main();
