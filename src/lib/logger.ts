// src/lib/logger.ts
import fs from 'fs';
import path from 'path';
import { logRotation } from './log-rotation';
import { logger as edgeLogger, createRequestLogger as createEdgeRequestLogger } from './logger-edge';

const logFile = process.env.LOG_FILE;

// Ensure logs directory exists
if (logFile && process.env.NODE_ENV === 'production') {
  const logDir = path.dirname(logFile);
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
}

let logWriteCount = 0;
const ROTATION_CHECK_INTERVAL = 100;

async function writeToFile(logEntry: string): Promise<void> {
  if (logFile && process.env.NODE_ENV === 'production') {
    try {
      fs.appendFileSync(logFile, logEntry + '\n');
      logWriteCount++;
      if (logWriteCount >= ROTATION_CHECK_INTERVAL) {
        logWriteCount = 0;
        await logRotation.checkAndRotate();
      }
    } catch (error) {
      console.error('Failed to write to log file:', error);
    }
  }
}

// Override the edge logger to add file writing
const serverLogAt = async (level: any, message: string, meta?: Record<string, any>) => {
  // First, call the edge logger to log to the console
  (edgeLogger as any)[level](message, meta);

  // Then, write to the file
  const entry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    metadata: meta,
  };
  const formattedEntry = JSON.stringify(entry); // Always write JSON to file
  await writeToFile(formattedEntry);
};

function createServiceLogger(service: string) {
  return {
    error: (message: string, meta?: Record<string, any>) => serverLogAt('error', message, { ...meta, service }),
    warn: (message: string, meta?: Record<string, any>) => serverLogAt('warn', message, { ...meta, service }),
    info: (message: string, meta?: Record<string, any>) => serverLogAt('info', message, { ...meta, service }),
    debug: (message: string, meta?: Record<string, any>) => serverLogAt('debug', message, { ...meta, service }),
  };
}

export const logger = {
  ...edgeLogger,
  // Override with file-writing capabilities
  error: (message: string, meta?: Record<string, any>) => serverLogAt('error', message, meta),
  warn: (message: string, meta?: Record<string, any>) => serverLogAt('warn', message, meta),
  info: (message: string, meta?: Record<string, any>) => serverLogAt('info', message, meta),
  debug: (message: string, meta?: Record<string, any>) => serverLogAt('debug', message, meta),
  server: createServiceLogger('server'),
  database: createServiceLogger('database'),
  auth: createServiceLogger('auth'),
  ca: createServiceLogger('ca'),
  certificate: createServiceLogger('certificate'),
  crl: createServiceLogger('crl'),
  audit: createServiceLogger('audit'),
  notification: createServiceLogger('notification'),
  socket: createServiceLogger('socket'),
  security: createServiceLogger('security'),
};

export function createRequestLogger(requestId: string, userId?: string) {
    const edgeLogger = createEdgeRequestLogger(requestId, userId);
    return {
        ...edgeLogger,
        error: (message: string, meta?: Record<string, any>) => serverLogAt('error', message, { ...meta, requestId, userId }),
        warn: (message: string, meta?: Record<string, any>) => serverLogAt('warn', message, { ...meta, requestId, userId }),
        info: (message: string, meta?: Record<string, any>) => serverLogAt('info', message, { ...meta, requestId, userId }),
        debug: (message: string, meta?: Record<string, any>) => serverLogAt('debug', message, { ...meta, requestId, userId }),
    };
}

// Initialize log rotation cleanup on startup
if (process.env.NODE_ENV === 'production') {
  setImmediate(async () => {
    try {
      await logRotation.cleanupOldLogs(30);
    } catch (error) {
      console.error('Failed to cleanup old logs on startup:', error);
    }
  });
}

export type PrismaLogLevel = 'query' | 'info' | 'warn' | 'error';

export function getPrismaLogLevels(): PrismaLogLevel[] {
    const explicit = process.env.PRISMA_LOG;
    if (explicit) {
      return explicit
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter((s): s is PrismaLogLevel => s === 'query' || s === 'info' || s === 'warn' || s === 'error');
    }
  
    // Derive from LOG_LEVEL when PRISMA_LOG not set
    switch (edgeLogger.level) {
      case 'debug':
        return ['query', 'info', 'warn', 'error'];
      case 'info':
        return ['info', 'warn', 'error'];
      case 'warn':
        return ['warn', 'error'];
      case 'error':
        return ['error'];
      case 'silent':
      default:
        return [];
    }
  }