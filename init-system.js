const { SystemInitializer } = require('./src/lib/init.ts');

SystemInitializer.initialize()
  .then(() => {
    console.log('System initialization completed');
    process.exit(0);
  })
  .catch((err) => {
    console.error('System initialization failed:', err);
    process.exit(1);
  });