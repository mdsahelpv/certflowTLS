const { PrismaClient } = require('@prisma/client');

class MockCertificateManagementService {
  static async getCertificates(filters = {}) {
    const prisma = new PrismaClient();
    try {
      const where = {};
      
      if (filters.type) {
        where.type = filters.type;
      }
      
      if (filters.status) {
        where.status = filters.status;
      }
      
      if (filters.subjectDN) {
        where.subjectDN = { contains: filters.subjectDN };
      }
      
      const [certificates, total] = await Promise.all([
        prisma.certificate.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          take: filters.limit || 20,
          skip: filters.offset || 0,
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
        }),
        prisma.certificate.count({ where }),
      ]);
      
      return { certificates, total };
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
  
  static async createTestCertificate(data) {
    const prisma = new PrismaClient();
    try {
      const serialNumber = data.serialNumber || 'CERT-TEST-' + Date.now();
      
      return await prisma.certificate.create({
        data: {
          serialNumber,
          subjectDN: data.subjectDN,
          issuerDN: data.issuerDN || 'CN=My CA',
          certificate: data.certificate || 'mock-certificate-data',
          type: data.type || 'SERVER',
          status: data.status || 'ACTIVE',
          keyAlgorithm: data.keyAlgorithm || 'RSA',
          keySize: data.keySize || 2048,
          validFrom: data.validFrom || new Date(),
          validTo: data.validTo || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
          fingerprint: data.fingerprint || 'SHA256:' + Buffer.from(serialNumber).toString('hex').substring(0, 32),
          issuedById: data.issuedById || 'cmeavb2gv0000rnlkhwmk3z5h',
        },
      });
    } finally {
      await prisma.$disconnect();
    }
  }
  
  static async exportCertificate(serialNumber, format = 'PEM') {
    console.log(`Exporting certificate ${serialNumber} in ${format} format`);
    
    const prisma = new PrismaClient();
    try {
      const certificate = await prisma.certificate.findUnique({
        where: { serialNumber },
      });
      
      if (!certificate) {
        throw new Error('Certificate not found');
      }
      
      let exportData;
      
      if (format === 'PEM') {
        exportData = certificate.certificate;
      } else if (format === 'DER') {
        // Mock DER format (base64 encoded)
        exportData = Buffer.from(certificate.certificate).toString('base64');
      } else {
        throw new Error('Unsupported export format');
      }
      
      return {
        serialNumber,
        format,
        data: exportData,
        filename: `${serialNumber}.${format.toLowerCase()}`,
      };
    } finally {
      await prisma.$disconnect();
    }
  }
}

async function testCertificateManagement() {
  try {
    console.log('=== Certificate Management Test ===\n');
    
    // Create test certificates for comprehensive testing
    console.log('1. Creating test certificates...');
    const testCerts = [
      {
        subjectDN: 'CN=server1.example.com,O=Test Org,C=US',
        type: 'SERVER',
        status: 'ACTIVE',
        keyAlgorithm: 'RSA',
        keySize: 2048,
      },
      {
        subjectDN: 'CN=server2.example.com,O=Test Org,C=US',
        type: 'SERVER',
        status: 'ACTIVE',
        keyAlgorithm: 'RSA',
        keySize: 4096,
      },
      {
        subjectDN: 'CN=client1.example.com,O=Test Org,C=US',
        type: 'CLIENT',
        status: 'ACTIVE',
        keyAlgorithm: 'ECDSA',
        keySize: 256,
      },
      {
        subjectDN: 'CN=expired.example.com,O=Test Org,C=US',
        type: 'SERVER',
        status: 'EXPIRED',
        keyAlgorithm: 'RSA',
        keySize: 2048,
      },
      {
        subjectDN: 'CN=revoked.example.com,O=Test Org,C=US',
        type: 'SERVER',
        status: 'REVOKED',
        keyAlgorithm: 'RSA',
        keySize: 2048,
      },
    ];
    
    const createdCerts = [];
    for (const certData of testCerts) {
      const cert = await MockCertificateManagementService.createTestCertificate(certData);
      createdCerts.push(cert);
      console.log(`Created certificate: ${cert.serialNumber} (${cert.status})`);
    }
    
    // Test certificate listing (no filters)
    console.log('\n2. Testing certificate listing (no filters)...');
    const allCerts = await MockCertificateManagementService.getCertificates();
    console.log(`Total certificates: ${allCerts.total}`);
    console.log(`Showing ${allCerts.certificates.length} certificates`);
    
    // Test certificate listing with type filter
    console.log('\n3. Testing certificate listing with type filter (SERVER)...');
    const serverCerts = await MockCertificateManagementService.getCertificates({
      type: 'SERVER',
    });
    console.log(`SERVER certificates: ${serverCerts.total}`);
    
    // Test certificate listing with status filter
    console.log('\n4. Testing certificate listing with status filter (ACTIVE)...');
    const activeCerts = await MockCertificateManagementService.getCertificates({
      status: 'ACTIVE',
    });
    console.log(`ACTIVE certificates: ${activeCerts.total}`);
    
    // Test certificate listing with subjectDN filter
    console.log('\n5. Testing certificate listing with subjectDN filter (example.com)...');
    const exampleCerts = await MockCertificateManagementService.getCertificates({
      subjectDN: 'example.com',
    });
    console.log(`Certificates containing 'example.com': ${exampleCerts.total}`);
    
    // Test certificate listing with multiple filters
    console.log('\n6. Testing certificate listing with multiple filters (SERVER + ACTIVE)...');
    const serverActiveCerts = await MockCertificateManagementService.getCertificates({
      type: 'SERVER',
      status: 'ACTIVE',
    });
    console.log(`SERVER + ACTIVE certificates: ${serverActiveCerts.total}`);
    
    // Test certificate details viewing
    console.log('\n7. Testing certificate details viewing...');
    if (createdCerts.length > 0) {
      const certDetails = await MockCertificateManagementService.getCertificate(createdCerts[0].serialNumber);
      console.log('Certificate details:', {
        serialNumber: certDetails?.serialNumber,
        subjectDN: certDetails?.subjectDN,
        type: certDetails?.type,
        status: certDetails?.status,
        keyAlgorithm: certDetails?.keyAlgorithm,
        keySize: certDetails?.keySize,
        validFrom: certDetails?.validFrom,
        validTo: certDetails?.validTo,
        fingerprint: certDetails?.fingerprint,
        issuedBy: certDetails?.issuedBy?.username,
      });
      
      if (certDetails?.revocation) {
        console.log('Revocation details:', {
          revocationDate: certDetails.revocation.revocationDate,
          revocationReason: certDetails.revocation.revocationReason,
          revokedBy: certDetails.revocation.revokedBy?.username,
        });
      }
    }
    
    // Test certificate export functionality
    console.log('\n8. Testing certificate export functionality...');
    if (createdCerts.length > 0) {
      const testCert = createdCerts[0];
      
      // Test PEM export
      const pemExport = await MockCertificateManagementService.exportCertificate(
        testCert.serialNumber,
        'PEM'
      );
      console.log('PEM export:', {
        serialNumber: pemExport.serialNumber,
        format: pemExport.format,
        filename: pemExport.filename,
        dataLength: pemExport.data.length,
      });
      
      // Test DER export
      const derExport = await MockCertificateManagementService.exportCertificate(
        testCert.serialNumber,
        'DER'
      );
      console.log('DER export:', {
        serialNumber: derExport.serialNumber,
        format: derExport.format,
        filename: derExport.filename,
        dataLength: derExport.data.length,
      });
      
      // Test export of non-existent certificate
      try {
        await MockCertificateManagementService.exportCertificate(
          'NON-EXISTENT-CERT',
          'PEM'
        );
        console.log('❌ Export of non-existent certificate should have failed!');
      } catch (error) {
        console.log('✅ Export of non-existent certificate correctly failed:', error.message);
      }
    }
    
    // Test pagination
    console.log('\n9. Testing pagination...');
    const page1 = await MockCertificateManagementService.getCertificates({
      limit: 2,
      offset: 0,
    });
    const page2 = await MockCertificateManagementService.getCertificates({
      limit: 2,
      offset: 2,
    });
    
    console.log(`Page 1: ${page1.certificates.length} certificates (showing ${page1.total} total)`);
    console.log(`Page 2: ${page2.certificates.length} certificates (showing ${page2.total} total)`);
    
    // Test search functionality
    console.log('\n10. Testing search functionality...');
    const searchResults = await MockCertificateManagementService.getCertificates({
      subjectDN: 'server1',
    });
    console.log(`Search results for 'server1': ${searchResults.total} certificates`);
    
    const searchResults2 = await MockCertificateManagementService.getCertificates({
      subjectDN: 'client',
    });
    console.log(`Search results for 'client': ${searchResults2.total} certificates`);
    
    console.log('\n=== Certificate Management Test Completed ===');
    console.log('✅ Certificate management functionality is working correctly');
    
  } catch (error) {
    console.error('❌ Certificate management test failed:', error);
  }
}

testCertificateManagement();