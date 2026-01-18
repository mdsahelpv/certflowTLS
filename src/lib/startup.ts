import { SystemInitializer } from '@/lib/init';
import { logger } from '@/lib/logger';

declare global {
  var __app_init_promise__: Promise<void> | undefined;
}

if (!global.__app_init_promise__) {
  global.__app_init_promise__ = (async () => {
    try {
      await SystemInitializer.initialize();
    } catch (error) {
      logger.server.error('Startup initialization failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  })();
}

export { }; // side-effect module

