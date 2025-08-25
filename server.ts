// server.ts - Next.js Standalone + Socket.IO
import { setupSocket } from './src/lib/socket';
import { createServer } from 'http';
import { Server } from 'socket.io';
import next from 'next';
import { SystemInitializer } from './src/lib/init';
import { CAService } from './src/lib/ca';
import { logger } from './src/lib/logger';

const dev = process.env.NODE_ENV !== 'production';
const currentPort = parseInt(process.env.PORT || '3000');
const hostname = '0.0.0.0';

// Graceful shutdown handling
const gracefulShutdown = (server: any, io: any) => {
  logger.server.info('Received shutdown signal, starting graceful shutdown...');
  
  server.close(() => {
    logger.server.info('HTTP server closed');
    io.close(() => {
      logger.server.info('Socket.IO server closed');
      process.exit(0);
    });
  });

  // Force shutdown after 30 seconds
  setTimeout(() => {
    logger.server.error('Forced shutdown after timeout');
    process.exit(1);
  }, 30000);
};

// Custom server with Socket.IO integration
async function createCustomServer() {
  let server: any;
  let io: any;

  try {
    logger.server.info(`Starting server in ${dev ? 'development' : 'production'} mode`, {
      port: currentPort,
      hostname,
      nodeEnv: process.env.NODE_ENV,
      databaseUrl: process.env.DATABASE_URL ? 'configured' : 'not configured'
    });
    
    // Create Next.js app
    const nextApp = next({ 
      dev,
      dir: process.cwd(),
      // In production, use the current directory where .next is located
      conf: dev ? undefined : { distDir: './.next' }
    });

    logger.server.info('Preparing Next.js app...');
    await nextApp.prepare();
    const handle = nextApp.getRequestHandler();

    logger.server.info('Initializing system services...');
    // Start background schedulers
    await SystemInitializer.initialize();
    CAService.startCRLScheduler();

    // Create HTTP server that will handle both Next.js and Socket.IO
    server = createServer((req, res) => {
      // Skip socket.io requests from Next.js handler
      if (req.url?.startsWith('/api/socketio')) {
        return;
      }
      handle(req, res);
    });

    // Setup Socket.IO
    io = new Server(server, {
      path: '/api/socketio',
      cors: {
        origin: dev ? "*" : process.env.NEXTAUTH_URL || "http://localhost:3000",
        methods: ["GET", "POST"]
      },
      transports: ['websocket', 'polling']
    });

    setupSocket(io);

    // Setup graceful shutdown
    process.on('SIGTERM', () => gracefulShutdown(server, io));
    process.on('SIGINT', () => gracefulShutdown(server, io));

    // Start the server
    server.listen(currentPort, hostname, () => {
      logger.server.info('Server ready', {
        httpUrl: `http://${hostname}:${currentPort}`,
        wsUrl: `ws://${hostname}:${currentPort}/api/socketio`,
        environment: process.env.NODE_ENV,
        databaseConfigured: !!process.env.DATABASE_URL,
        socketConnections: 0
      });
    });

    // Error handling for server
    server.on('error', (error: any) => {
      logger.server.error('Server error', {
        error: error.message,
        code: error.code
      });
    });

  } catch (err) {
    logger.server.error('Server startup error', {
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined
    });
    process.exit(1);
  }
}

// Start the server
createCustomServer();