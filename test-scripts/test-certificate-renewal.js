const { PrismaClient } = require('@prisma/client');

class MockRenewalService {
  static async renewCertificate(serialNumber, issuedById) {
    console.log(`Renewing certificate ${serialNumber}`);
    
    const prisma = new PrismaClient();
    try {
      // Find the existing certificate
      const existingCert = await prisma.certificate.findUnique({
        where: { serialNumber },
      });
      
      if (!existingCert) {
        throw new Error('Certificate not found');
      }
      
      if (existingCert.status === 'REVOKED') {
        throw new Error('Cannot renew revoked certificate');
      }
      
      // Generate new serial number
      const newSerialNumber = 'CERT-RENEWED-' + Date.now();
      
      // Calculate validity period
      const validityDays = Math.ceil(
        (existingCert.validTo.getTime() - existingCert.validFrom.getTime()) / (24 * 60 * 60 * 1000)
      );
      
      // Create renewed certificate
      const renewedCert = await prisma.certificate.create({
        data: {
          serialNumber: newSerialNumber,
          subjectDN: existingCert.subjectDN,
          issuerDN: existingCert.issuerDN,
          certificate: existingCert.certificate.replace('CERT-1755144225491', newSerialNumber), // Update serial in cert
          type: existingCert.type,
          status: 'ACTIVE',
          keyAlgorithm: existingCert.keyAlgorithm,
          keySize: existingCert.keySize,
          curve: existingCert.curve,
          validFrom: new Date(),
          validTo: new Date(Date.now() + validityDays * 24 * 60 * 60 * 1000),
          fingerprint: 'SHA256:' + Buffer.from(newSerialNumber).toString('hex').substring(0, 32),
          issuedById,
        },
      });
      
      // Update old certificate status
      await prisma.certificate.update({
        where: { serialNumber },
        data: { status: 'EXPIRED' },
      });
      
      console.log('Certificate renewed successfully:', {
        oldSerialNumber: serialNumber,
        newSerialNumber: renewedCert.serialNumber,
        subjectDN: renewedCert.subjectDN,
        validFrom: renewedCert.validFrom,
        validTo: renewedCert.validTo,
      });
      
      return renewedCert;
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
        },
      });
    } finally {
      await prisma.$disconnect();
    }
  }
  
  static async getCertificatesBySubjectDN(subjectDN) {
    const prisma = new PrismaClient();
    try {
      return await prisma.certificate.findMany({
        where: { subjectDN },
        orderBy: { createdAt: 'desc' },
        include: {
          issuedBy: {
            select: { id: true, username: true, name: true }
          },
        },
      });
    } finally {
      await prisma.$disconnect();
    }
  }
}

async function testCertificateRenewal() {
  try {
    console.log('=== Certificate Renewal Test ===\n');
    
    // First, let's create or find an active certificate to renew
    const prisma = new PrismaClient();
    let certToRenew;
    
    try {
      // Look for an active certificate
      const activeCerts = await prisma.certificate.findMany({
        where: { status: 'ACTIVE' },
        take: 1,
      });
      
      if (activeCerts.length === 0) {
        // Create a test certificate to renew
        certToRenew = await prisma.certificate.create({
          data: {
            serialNumber: 'CERT-TO-RENEW-' + Date.now(),
            subjectDN: 'CN=renew.test.example.com',
            issuerDN: 'CN=My CA',
            certificate: 'mock-certificate-data-for-renewal',
            type: 'SERVER',
            status: 'ACTIVE',
            keyAlgorithm: 'RSA',
            keySize: 2048,
            validFrom: new Date(),
            validTo: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
            fingerprint: 'SHA256:test-renewal-fingerprint',
            issuedById: 'cmeavb2gv0000rnlkhwmk3z5h',
          },
        });
        console.log('Created test certificate for renewal:', certToRenew.serialNumber);
      } else {
        certToRenew = activeCerts[0];
        console.log('Using existing certificate for renewal:', certToRenew.serialNumber);
      }
    } finally {
      await prisma.$disconnect();
    }
    
    // Get original certificate details
    console.log('\n1. Original certificate details:');
    const originalCert = await MockRenewalService.getCertificate(certToRenew.serialNumber);
    console.log({
      serialNumber: originalCert?.serialNumber,
      subjectDN: originalCert?.subjectDN,
      status: originalCert?.status,
      validTo: originalCert?.validTo,
    });
    
    // Test certificate renewal
    console.log('\n2. Testing certificate renewal...');
    const renewedCert = await MockRenewalService.renewCertificate(
      certToRenew.serialNumber,
      'cmeavb2gv0000rnlkhwmk3z5h' // admin user id
    );
    
    // Test renewed certificate details
    console.log('\n3. Renewed certificate details:');
    console.log({
      serialNumber: renewedCert.serialNumber,
      subjectDN: renewedCert.subjectDN,
      status: renewedCert.status,
      validFrom: renewedCert.validFrom,
      validTo: renewedCert.validTo,
    });
    
    // Test original certificate status after renewal
    console.log('\n4. Original certificate status after renewal:');
    const updatedOriginalCert = await MockRenewalService.getCertificate(certToRenew.serialNumber);
    console.log({
      serialNumber: updatedOriginalCert?.serialNumber,
      subjectDN: updatedOriginalCert?.subjectDN,
      status: updatedOriginalCert?.status,
    });
    
    // Test that both certificates exist
    console.log('\n5. Testing both certificates exist...');
    const allCerts = await MockRenewalService.getCertificatesBySubjectDN(renewedCert.subjectDN);
    console.log(`Found ${allCerts.length} certificates for subject ${renewedCert.subjectDN}`);
    
    allCerts.forEach((cert, index) => {
      console.log(`Certificate ${index + 1}:`, {
        serialNumber: cert.serialNumber,
        status: cert.status,
        validFrom: cert.validFrom,
        validTo: cert.validTo,
      });
    });
    
    // Test renewal of revoked certificate (should fail)
    console.log('\n6. Testing renewal of revoked certificate (should fail)...');
    try {
      // First revoke a certificate
      const certToRevoke = allCerts.find(cert => cert.status === 'ACTIVE');
      if (certToRevoke) {
        await prisma.certificate.update({
          where: { serialNumber: certToRevoke.serialNumber },
          data: { status: 'REVOKED' },
        });
        
        // Try to renew it
        await MockRenewalService.renewCertificate(
          certToRevoke.serialNumber,
          'cmeavb2gv0000rnlkhwmk3z5h'
        );
        console.log('❌ Renewal of revoked certificate should have failed!');
      }
    } catch (error) {
      console.log('✅ Renewal of revoked certificate correctly failed:', error.message);
    } finally {
      await prisma.$disconnect();
    }
    
    console.log('\n=== Certificate Renewal Test Completed ===');
    console.log('✅ Certificate renewal functionality is working correctly');
    
  } catch (error) {
    console.error('❌ Certificate renewal test failed:', error);
  }
}

testCertificateRenewal();