const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// Define permissions based on roles (from auth.ts)
function getPermissionsForRole(role) {
  const permissions = {
    'ADMIN': [
      'ca:manage',
      'certificate:issue',
      'certificate:revoke',
      'certificate:renew',
      'certificate:view',
      'certificate:export',
      'crl:manage',
      'user:manage',
      'audit:view',
      'audit:export',
      'config:manage',
    ],
    'OPERATOR': [
      'certificate:issue',
      'certificate:revoke',
      'certificate:renew',
      'certificate:view',
      'certificate:export',
      'crl:manage',
      'audit:view',
    ],
    'VIEWER': [
      'certificate:view',
      'audit:view',
    ],
  };

  return permissions[role] || [];
}

async function testRBAC() {
  try {
    // Get all users with their roles
    const users = await prisma.user.findMany({
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        status: true,
      },
    });
    
    console.log('Role-Based Access Control Test:');
    console.log('=====================================\n');
    
    for (const user of users) {
      const permissions = getPermissionsForRole(user.role);
      console.log(`User: ${user.username} (${user.role})`);
      console.log(`Status: ${user.status}`);
      console.log(`Permissions: [${permissions.join(', ')}]`);
      console.log(`Key Permissions:`);
      console.log(`  - Can manage users: ${permissions.includes('user:manage')}`);
      console.log(`  - Can issue certificates: ${permissions.includes('certificate:issue')}`);
      console.log(`  - Can view certificates: ${permissions.includes('certificate:view')}`);
      console.log(`  - Can manage CA: ${permissions.includes('ca:manage')}`);
      console.log(`  - Can view audit: ${permissions.includes('audit:view')}`);
      console.log('---\n');
    }
    
    // Test permission hierarchy
    console.log('Permission Hierarchy Test:');
    console.log('============================\n');
    
    const adminPerms = getPermissionsForRole('ADMIN');
    const operatorPerms = getPermissionsForRole('OPERATOR');
    const viewerPerms = getPermissionsForRole('VIEWER');
    
    console.log('Admin permissions:', adminPerms.length);
    console.log('Operator permissions:', operatorPerms.length);
    console.log('Viewer permissions:', viewerPerms.length);
    
    console.log('\nPermission checks:');
    console.log('Viewer permissions are subset of Operator:', viewerPerms.every(p => operatorPerms.includes(p)));
    console.log('Operator permissions are subset of Admin:', operatorPerms.every(p => adminPerms.includes(p)));
    
  } catch (error) {
    console.error('Error testing RBAC:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testRBAC();