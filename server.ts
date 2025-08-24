// server.ts - Next.js Standalone + Socket.IO
import { setupSocket } from './src/lib/socket';
import { createServer } from 'http';
import { Server } from 'socket.io';
import next from 'next';
import { SystemInitializer } from './src/lib/init';
import { CAService } from './src/lib/ca';

const dev = process.env.NODE_ENV !== 'production';
const currentPort = parseInt(process.env.PORT || '3000'); // Changed default to 3000
const hostname = '0.0.0.0';

// Custom server with Socket.IO integration
async function createCustomServer() {
  try {
    console.log(`🚀 Starting server in ${dev ? 'development' : 'production'} mode`);
    console.log(`📡 Server will listen on port ${currentPort}`);
    
    // Create Next.js app
    const nextApp = next({ 
      dev,
      dir: process.cwd(),
      // In production, use the current directory where .next is located
      conf: dev ? undefined : { distDir: './.next' }
    });

    console.log('📦 Preparing Next.js app...');
    await nextApp.prepare();
    const handle = nextApp.getRequestHandler();

    console.log('🔧 Initializing system services...');
    // Start background schedulers
    await SystemInitializer.initialize();
    CAService.startCRLScheduler();

    // Create HTTP server that will handle both Next.js and Socket.IO
    const server = createServer((req, res) => {
      // Skip socket.io requests from Next.js handler
      if (req.url?.startsWith('/api/socketio')) {
        return;
      }
      handle(req, res);
    });

    // Setup Socket.IO
    const io = new Server(server, {
      path: '/api/socketio',
      cors: {
        origin: "*",
        methods: ["GET", "POST"]
      }
    });

    setupSocket(io);

    // Start the server
    server.listen(currentPort, hostname, () => {
      console.log(`✅ Server ready on http://${hostname}:${currentPort}`);
      console.log(`🔌 Socket.IO server running at ws://${hostname}:${currentPort}/api/socketio`);
      console.log(`🌍 Environment: ${process.env.NODE_ENV}`);
      console.log(`🗄️  Database URL: ${process.env.DATABASE_URL ? 'Configured' : 'Not configured'}`);
    });

  } catch (err) {
    console.error('❌ Server startup error:', err);
    console.error('Stack trace:', err instanceof Error ? err.stack : 'No stack trace');
    process.exit(1);
  }
}

// Start the server
createCustomServer();