const { PrismaClient } = require('@prisma/client');

async function checkDatabase() {
  const prisma = new PrismaClient();
  
  try {
    console.log('Checking database for CAs...');
    
    const cas = await prisma.cAConfig.findMany();
    console.log(`Found ${cas.length} CAs in database`);
    
    cas.forEach((ca, index) => {
      console.log(`\nCA ${index + 1}:`);
      console.log(`  ID: ${ca.id}`);
      console.log(`  Name: ${ca.name || 'N/A'}`);
      console.log(`  Subject DN: ${ca.subjectDN}`);
      console.log(`  Status: ${ca.status}`);
      console.log(`  Has Certificate: ${!!ca.certificate}`);
      console.log(`  Has Certificate Chain: ${!!ca.certificateChain}`);
      console.log(`  Certificate Chain Length: ${ca.certificateChain ? ca.certificateChain.length : 0}`);
      
      if (ca.certificateChain) {
        const chainMatches = ca.certificateChain.match(/-----BEGIN CERTIFICATE-----/g);
        console.log(`  Certificates in Chain: ${chainMatches ? chainMatches.length : 0}`);
      }
    });
    
  } catch (error) {
    console.error('Error checking database:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkDatabase();