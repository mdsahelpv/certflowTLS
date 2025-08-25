const { AsyncLocalStorage } = require('node:async_hooks');
if (global.AsyncLocalStorage === undefined) {
  global.AsyncLocalStorage = AsyncLocalStorage;
}

require('./server.ts');
