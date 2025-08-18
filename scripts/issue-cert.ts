import 'dotenv/config';
import { CAService } from '../src/lib/ca';
import { db } from '../src/lib/db';
import { CertificateType, KeyAlgorithm, CAStatus } from '@prisma/client';

async function main() {
  // Find an active CA
  const activeCA = await db.cAConfig.findFirst({ where: { status: CAStatus.ACTIVE } });
  if (!activeCA) {
    console.error('No ACTIVE CA found. Initialize CA and upload certificate first.');
    process.exit(1);
  }

  // Pick an existing user to attribute issuance
  const user = await db.user.findFirst({ select: { id: true, username: true } });
  if (!user) {
    console.error('No user found. Create a user before issuing.');
    process.exit(1);
  }

  const subjectDN = 'C=US,ST=California,L=San Francisco,O=My Organization,OU=IT Department,CN=test.example.com';
  const sans = ['test.example.com', 'www.test.example.com'];

  console.log('Issuing certificate with params:', {
    subjectDN,
    certificateType: CertificateType.SERVER,
    keyAlgorithm: KeyAlgorithm.RSA,
    validityDays: 365,
    keySize: 2048,
    sans,
    caId: activeCA.id,
    issuedBy: user.username,
  });

  const result = await CAService.issueCertificate(
    {
      subjectDN,
      certificateType: CertificateType.SERVER,
      keyAlgorithm: KeyAlgorithm.RSA,
      validityDays: 365,
      keySize: 2048,
      sans,
      caId: activeCA.id,
    },
    user.id
  );

  console.log('\nIssued certificate:');
  console.log('- Serial:', result.serialNumber);
  console.log('- Fingerprint:', result.fingerprint);
  console.log('\nCertificate PEM:\n');
  console.log(result.certificate);
  if (result.privateKey) {
    console.log('\nPrivate Key PEM (generated):\n');
    console.log(result.privateKey);
  }
}

main().catch((err) => {
  console.error('Issuance script failed:', err);
  process.exit(1);
});

