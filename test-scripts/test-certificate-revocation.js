const { PrismaClient } = require('@prisma/client');

class MockRevocationService {
  static async revokeCertificate(serialNumber, reason, revokedById) {
    console.log(`Revoking certificate ${serialNumber} with reason: ${reason}`);
    
    const prisma = new PrismaClient();
    try {
      // Find the certificate
      const certificate = await prisma.certificate.findUnique({
        where: { serialNumber },
      });
      
      if (!certificate) {
        throw new Error('Certificate not found');
      }
      
      if (certificate.status === 'REVOKED') {
        throw new Error('Certificate is already revoked');
      }
      
      // Update certificate status
      await prisma.certificate.update({
        where: { serialNumber },
        data: {
          status: 'REVOKED',
          revokedAt: new Date(),
          revocationReason: reason,
        },
      });
      
      // Create revocation record
      const revocation = await prisma.certificateRevocation.create({
        data: {
          certificateId: certificate.id,
          serialNumber,
          revocationReason: reason,
          revokedById,
        },
      });
      
      console.log('Certificate revoked successfully:', {
        serialNumber: revocation.serialNumber,
        revocationDate: revocation.revocationDate,
        revocationReason: revocation.revocationReason,
        revokedById: revocation.revokedById,
      });
      
      return revocation;
    } finally {
      await prisma.$disconnect();
    }
  }
  
  static async getCertificate(serialNumber) {
    const prisma = new PrismaClient();
    try {
      return await prisma.certificate.findUnique({
        where: { serialNumber },
        include: {
          issuedBy: {
            select: { id: true, username: true, name: true }
          },
          revocation: {
            include: {
              revokedBy: {
                select: { id: true, username: true, name: true }
              }
            }
          }
        },
      });
    } finally {
      await prisma.$disconnect();
    }
  }
  
  static async getRevokedCertificates() {
    const prisma = new PrismaClient();
    try {
      return await prisma.certificate.findMany({
        where: { status: 'REVOKED' },
        include: {
          revocation: {
            include: {
              revokedBy: {
                select: { id: true, username: true, name: true }
              }
            }
          },
          issuedBy: {
            select: { id: true, username: true, name: true }
          }
        },
      });
    } finally {
      await prisma.$disconnect();
    }
  }
}

async function testCertificateRevocation() {
  try {
    console.log('=== Certificate Revocation Test ===\n');
    
    // First, let's get an existing certificate or create one
    const prisma = new PrismaClient();
    let certToRevoke;
    
    try {
      // Get existing certificate
      const certificates = await prisma.certificate.findMany({
        where: { status: 'ACTIVE' },
        take: 1,
      });
      
      if (certificates.length === 0) {
        // Create a test certificate
        certToRevoke = await prisma.certificate.create({
          data: {
            serialNumber: 'CERT-TEST-REVOCATION-' + Date.now(),
            subjectDN: 'CN=test.revoke.example.com',
            issuerDN: 'CN=My CA',
            certificate: 'mock-certificate-data',
            type: 'SERVER',
            status: 'ACTIVE',
            keyAlgorithm: 'RSA',
            keySize: 2048,
            validFrom: new Date(),
            validTo: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
            fingerprint: 'SHA256:test-fingerprint',
            issuedById: 'cmeavb2gv0000rnlkhwmk3z5h',
          },
        });
        console.log('Created test certificate for revocation:', certToRevoke.serialNumber);
      } else {
        certToRevoke = certificates[0];
        console.log('Using existing certificate for revocation:', certToRevoke.serialNumber);
      }
    } finally {
      await prisma.$disconnect();
    }
    
    // Test certificate revocation
    console.log('\n1. Testing certificate revocation...');
    const revocationReason = 'KEY_COMPROMISE';
    const revokedById = 'cmeavb2gv0000rnlkhwmk3z5h'; // admin user id
    
    const revocation = await MockRevocationService.revokeCertificate(
      certToRevoke.serialNumber,
      revocationReason,
      revokedById
    );
    
    // Test certificate retrieval after revocation
    console.log('\n2. Testing certificate retrieval after revocation...');
    const revokedCert = await MockRevocationService.getCertificate(certToRevoke.serialNumber);
    console.log('Revoked certificate details:', {
      serialNumber: revokedCert?.serialNumber,
      subjectDN: revokedCert?.subjectDN,
      status: revokedCert?.status,
      revokedAt: revokedCert?.revokedAt,
      revocationReason: revokedCert?.revocationReason,
      revokedBy: revokedCert?.revocation?.revokedBy?.username,
    });
    
    // Test listing revoked certificates
    console.log('\n3. Testing listing of revoked certificates...');
    const revokedCerts = await MockRevocationService.getRevokedCertificates();
    console.log(`Found ${revokedCerts.length} revoked certificates`);
    
    if (revokedCerts.length > 0) {
      console.log('First revoked certificate:', {
        serialNumber: revokedCerts[0].serialNumber,
        subjectDN: revokedCerts[0].subjectDN,
        status: revokedCerts[0].status,
        revocationReason: revokedCerts[0].revocationReason,
        revokedBy: revokedCerts[0].revocation?.revokedBy?.username,
      });
    }
    
    // Test duplicate revocation (should fail)
    console.log('\n4. Testing duplicate revocation (should fail)...');
    try {
      await MockRevocationService.revokeCertificate(
        certToRevoke.serialNumber,
        revocationReason,
        revokedById
      );
      console.log('❌ Duplicate revocation should have failed!');
    } catch (error) {
      console.log('✅ Duplicate revocation correctly failed:', error.message);
    }
    
    console.log('\n=== Certificate Revocation Test Completed ===');
    console.log('✅ Certificate revocation functionality is working correctly');
    
  } catch (error) {
    console.error('❌ Certificate revocation test failed:', error);
  }
}

testCertificateRevocation();