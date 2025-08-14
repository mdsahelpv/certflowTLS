const { AuthService } = require('./src/lib/auth.ts');

async function testRBAC() {
  try {
    // Test admin permissions
    const adminUser = await AuthService.getUserWithPermissions('cmeavb2gv0000rnlkhwmk3z5h');
    console.log('Admin user permissions:', adminUser);
    
    // Test viewer permissions
    const testUser = await AuthService.getUserWithPermissions('cmeavepu90000rn1z4nw4ajp9');
    console.log('Test user permissions:', testUser);
    
    // Test permission checking
    console.log('\nPermission checks:');
    console.log('Admin can manage users:', adminUser?.permissions.includes('user:manage'));
    console.log('Admin can issue certificates:', adminUser?.permissions.includes('certificate:issue'));
    console.log('Test user can manage users:', testUser?.permissions.includes('user:manage'));
    console.log('Test user can view certificates:', testUser?.permissions.includes('certificate:view'));
    
  } catch (error) {
    console.error('Error testing RBAC:', error);
  }
}

testRBAC();