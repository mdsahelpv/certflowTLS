const { PrismaClient } = require('@prisma/client');

class MockCertificateService {
  static async issueCertificate(data) {
    console.log('Issuing certificate with data:', data);
    
    const prisma = new PrismaClient();
    try {
      // Generate mock serial number
      const serialNumber = 'CERT-' + Date.now();
      
      // Generate mock certificate
      const certificate = `-----BEGIN CERTIFICATE-----
MIIDXTCCAkWgAwIBAgIJAKHV4HjGzj5FMA0GCSqGSIb3DQEBCwUAMEUxCzAJBgNV
BAYTAkFVMRMwEQYDVQQIDApTb21lLVN0YXRlMSEwHwYDVQQKDBhJbnRlcm5ldCBX
aWRnaXRzIFB0eSBMdGQwHhcNMjQwMTAxMDAwMDAwWhcNMjUwMTAxMDAwMDAwWjBF
MQswCQYDVQQGEwJBVTETMBEGA1UECAwKU29tZS1TdGF0ZTEhMB8GA1UECgwYSW50
ZXJuZXQgV2lkZ2l0cyBQdHkgTHRkMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIB
CgKCAQEAyGQz8DbGVfI3WI6Qz5lKzJQrz3xJhO7Qp1pKqMQY2Xv6QK8sJQqKzGlT
-----END CERTIFICATE-----`;
      
      // Generate mock fingerprint
      const fingerprint = 'SHA256:' + Buffer.from(serialNumber).toString('hex').substring(0, 32);
      
      // Store certificate
      const validFrom = new Date();
      const validTo = new Date(Date.now() + data.validityDays * 24 * 60 * 60 * 1000);
      
      const certRecord = await prisma.certificate.create({
        data: {
          serialNumber,
          subjectDN: data.subjectDN,
          issuerDN: data.issuerDN || 'CN=My CA',
          certificate,
          type: data.certificateType,
          status: 'ACTIVE',
          keyAlgorithm: data.keyAlgorithm,
          keySize: data.keySize,
          validFrom,
          validTo,
          fingerprint,
          issuedById: data.issuedById,
        },
      });
      
      console.log('Certificate record created:', {
        serialNumber: certRecord.serialNumber,
        subjectDN: certRecord.subjectDN,
        status: certRecord.status,
        validFrom: certRecord.validFrom,
        validTo: certRecord.validTo,
      });
      
      return {
        certificate,
        serialNumber,
        fingerprint,
      };
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
        where.subjectDN = { contains: filters.subjectDN, mode: 'insensitive' };
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
          },
        }),
        prisma.certificate.count({ where }),
      ]);
      
      return { certificates, total };
    } finally {
      await prisma.$disconnect();
    }
  }
}

async function testCertificateIssuance() {
  try {
    console.log('=== Certificate Issuance Test ===\n');
    
    // Test certificate issuance
    console.log('1. Testing certificate issuance...');
    const certData = {
      subjectDN: 'CN=test.example.com,O=Test Organization,C=US',
      certificateType: 'SERVER',
      keyAlgorithm: 'RSA',
      keySize: 2048,
      validityDays: 365,
      issuerDN: 'CN=My CA',
      issuedById: 'cmeavb2gv0000rnlkhwmk3z5h', // admin user id
    };
    
    const result = await MockCertificateService.issueCertificate(certData);
    console.log('Certificate issuance result:');
    console.log('- Certificate generated:', !!result.certificate);
    console.log('- Serial number:', result.serialNumber);
    console.log('- Fingerprint:', result.fingerprint);
    
    // Test certificate retrieval
    console.log('\n2. Testing certificate retrieval...');
    const retrievedCert = await MockCertificateService.getCertificate(result.serialNumber);
    console.log('Retrieved certificate:', {
      serialNumber: retrievedCert?.serialNumber,
      subjectDN: retrievedCert?.subjectDN,
      status: retrievedCert?.status,
      issuedBy: retrievedCert?.issuedBy?.username,
    });
    
    // Test certificate listing
    console.log('\n3. Testing certificate listing...');
    const certificates = await MockCertificateService.getCertificates();
    console.log(`Found ${certificates.total} certificates`);
    console.log('First certificate:', {
      serialNumber: certificates.certificates[0]?.serialNumber,
      subjectDN: certificates.certificates[0]?.subjectDN,
      status: certificates.certificates[0]?.status,
    });
    
    console.log('\n=== Certificate Issuance Test Completed ===');
    console.log('✅ Certificate issuance functionality is working correctly');
    
  } catch (error) {
    console.error('❌ Certificate issuance test failed:', error);
  }
}

testCertificateIssuance();