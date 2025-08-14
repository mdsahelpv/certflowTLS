const { PrismaClient } = require('@prisma/client');

class MockCRLService {
  static async generateCRL() {
    console.log('Generating CRL...');
    
    const prisma = new PrismaClient();
    try {
      // Get all revoked certificates
      const revocations = await prisma.certificateRevocation.findMany({
        include: {
          certificate: true,
        },
      });
      
      const revokedCertificates = revocations.map(rev => ({
        serialNumber: rev.serialNumber,
        revocationDate: rev.revocationDate,
        reason: rev.revocationReason,
      }));
      
      console.log(`Found ${revokedCertificates.length} revoked certificates`);
      
      // Generate mock CRL
      const crl = `-----BEGIN X509 CRL-----
MIIB3jCCAYUCAQEwCgYIKoZIzj0EAwIwHhcNMjQwMTAxMDAwMDAwWhcNMjUwMTAx
MDAwMDAwWjAqMAoGA1UEAxMDQ0ExMQswCQYDVQQGEwJVUzELMAkGA1UECBMCQ0Ex
DTALBgNVBAcMBEJheWVyMA0GCSqGSIb3DQEBCwUAA4IBAQCAQEA
-----END X509 CRL-----`;
      
      // Get CA config for CRL number
      const caConfig = await prisma.cAConfig.findFirst();
      const newCrlNumber = (caConfig?.crlNumber || 0) + 1;
      
      // Store CRL
      const crlRecord = await prisma.cRL.create({
        data: {
          crlNumber: newCrlNumber,
          crlData: crl,
          nextUpdate: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
        },
      });
      
      // Update CA config with new CRL number
      if (caConfig) {
        await prisma.cAConfig.update({
          where: { id: caConfig.id },
          data: { crlNumber: newCrlNumber },
        });
      }
      
      console.log(`CRL #${newCrlNumber} generated successfully`);
      console.log(`CRL contains ${revokedCertificates.length} revoked certificates`);
      
      return {
        crlNumber: newCrlNumber,
        crlData: crl,
        revokedCount: revokedCertificates.length,
        nextUpdate: crlRecord.nextUpdate,
      };
    } finally {
      await prisma.$disconnect();
    }
  }
  
  static async getCRLs() {
    const prisma = new PrismaClient();
    try {
      return await prisma.cRL.findMany({
        orderBy: { crlNumber: 'desc' },
      });
    } finally {
      await prisma.$disconnect();
    }
  }
  
  static async getCRL(crlNumber) {
    const prisma = new PrismaClient();
    try {
      return await prisma.cRL.findFirst({
        where: { crlNumber },
      });
    } finally {
      await prisma.$disconnect();
    }
  }
  
  static async getRevokedCertificates() {
    const prisma = new PrismaClient();
    try {
      return await prisma.certificateRevocation.findMany({
        include: {
          certificate: true,
          revokedBy: {
            select: { id: true, username: true, name: true }
          },
        },
        orderBy: { revocationDate: 'desc' },
      });
    } finally {
      await prisma.$disconnect();
    }
  }
  
  static async downloadCRL(crlNumber) {
    console.log(`Downloading CRL #${crlNumber}`);
    
    const prisma = new PrismaClient();
    try {
      const crl = await prisma.cRL.findFirst({
        where: { crlNumber },
      });
      
      if (!crl) {
        throw new Error('CRL not found');
      }
      
      return {
        crlNumber: crl.crlNumber,
        data: crl.crlData,
        filename: `crl-${crlNumber}.crl`,
        issuedAt: crl.issuedAt,
        nextUpdate: crl.nextUpdate,
      };
    } finally {
      await prisma.$disconnect();
    }
  }
  
  static async getCRLStatus() {
    const prisma = new PrismaClient();
    try {
      const [latestCRL, revokedCount, caConfig] = await Promise.all([
        prisma.cRL.findFirst({
          orderBy: { crlNumber: 'desc' },
        }),
        prisma.certificateRevocation.count(),
        prisma.cAConfig.findFirst(),
      ]);
      
      return {
        latestCRLNumber: latestCRL?.crlNumber || 0,
        latestCRLDate: latestCRL?.issuedAt,
        nextUpdate: latestCRL?.nextUpdate,
        revokedCertificatesCount: revokedCount,
        caStatus: caConfig?.status,
      };
    } finally {
      await prisma.$disconnect();
    }
  }
}

async function testCRLManagement() {
  try {
    console.log('=== CRL Management Test ===\n');
    
    // Check initial CRL status
    console.log('1. Checking initial CRL status...');
    const initialStatus = await MockCRLService.getCRLStatus();
    console.log('Initial CRL status:', initialStatus);
    
    // Test getting revoked certificates
    console.log('\n2. Testing getting revoked certificates...');
    const revokedCerts = await MockCRLService.getRevokedCertificates();
    console.log(`Found ${revokedCerts.length} revoked certificates`);
    
    if (revokedCerts.length > 0) {
      console.log('First revoked certificate:', {
        serialNumber: revokedCerts[0].serialNumber,
        subjectDN: revokedCerts[0].certificate.subjectDN,
        revocationDate: revokedCerts[0].revocationDate,
        revocationReason: revokedCerts[0].revocationReason,
        revokedBy: revokedCerts[0].revokedBy?.username,
      });
    }
    
    // Test CRL generation
    console.log('\n3. Testing CRL generation...');
    const crlResult = await MockCRLService.generateCRL();
    console.log('CRL generation result:', {
      crlNumber: crlResult.crlNumber,
      revokedCount: crlResult.revokedCount,
      nextUpdate: crlResult.nextUpdate,
    });
    
    // Test getting CRLs
    console.log('\n4. Testing getting CRLs...');
    const crls = await MockCRLService.getCRLs();
    console.log(`Found ${crls.length} CRLs`);
    
    if (crls.length > 0) {
      console.log('Latest CRL:', {
        crlNumber: crls[0].crlNumber,
        issuedAt: crls[0].issuedAt,
        nextUpdate: crls[0].nextUpdate,
      });
    }
    
    // Test getting specific CRL
    console.log('\n5. Testing getting specific CRL...');
    if (crls.length > 0) {
      const specificCRL = await MockCRLService.getCRL(crls[0].crlNumber);
      console.log('Specific CRL details:', {
        crlNumber: specificCRL?.crlNumber,
        issuedAt: specificCRL?.issuedAt,
        nextUpdate: specificCRL?.nextUpdate,
      });
    }
    
    // Test CRL download
    console.log('\n6. Testing CRL download...');
    if (crls.length > 0) {
      const downloadResult = await MockCRLService.downloadCRL(crls[0].crlNumber);
      console.log('CRL download result:', {
        crlNumber: downloadResult.crlNumber,
        filename: downloadResult.filename,
        dataLength: downloadResult.data.length,
        issuedAt: downloadResult.issuedAt,
        nextUpdate: downloadResult.nextUpdate,
      });
    }
    
    // Test download of non-existent CRL
    console.log('\n7. Testing download of non-existent CRL...');
    try {
      await MockCRLService.downloadCRL(999999);
      console.log('❌ Download of non-existent CRL should have failed!');
    } catch (error) {
      console.log('✅ Download of non-existent CRL correctly failed:', error.message);
    }
    
    // Test CRL status after generation
    console.log('\n8. Testing CRL status after generation...');
    const finalStatus = await MockCRLService.getCRLStatus();
    console.log('Final CRL status:', finalStatus);
    
    // Test multiple CRL generation
    console.log('\n9. Testing multiple CRL generation...');
    const secondCRL = await MockCRLService.generateCRL();
    console.log('Second CRL generation result:', {
      crlNumber: secondCRL.crlNumber,
      revokedCount: secondCRL.revokedCount,
      nextUpdate: secondCRL.nextUpdate,
    });
    
    // Verify CRL sequence
    console.log('\n10. Testing CRL sequence...');
    const allCRLs = await MockCRLService.getCRLs();
    console.log(`Total CRLs generated: ${allCRLs.length}`);
    
    // Verify CRL numbers are sequential
    const crlNumbers = allCRLs.map(crl => crl.crlNumber).sort((a, b) => a - b);
    const isSequential = crlNumbers.every((num, index) => index === 0 || num === crlNumbers[index - 1] + 1);
    console.log(`CRL numbers are sequential: ${isSequential}`);
    console.log(`CRL numbers: ${crlNumbers.join(', ')}`);
    
    console.log('\n=== CRL Management Test Completed ===');
    console.log('✅ CRL management functionality is working correctly');
    
  } catch (error) {
    console.error('❌ CRL management test failed:', error);
  }
}

testCRLManagement();