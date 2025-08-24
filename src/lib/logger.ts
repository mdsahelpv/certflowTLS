import fs from 'fs';
import path from 'path';
import { logRotation } from './log-rotation';

type LogLevel = 'silent' | 'error' | 'warn' | 'info' | 'debug';

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  service?: string;
  userId?: string;
  requestId?: string;
  metadata?: Record<string, any>;
  stack?: string;
}

function getLevelPriority(level: LogLevel): number {
  switch (level) {
    case 'silent':
      return 5;
    case 'error':
      return 4;
    case 'warn':
      return 3;
    case 'info':
      return 2;
    case 'debug':
      return 1;
    default:
      return 3;
  }
}

function parseLogLevel(envValue: string | undefined, fallback: LogLevel): LogLevel {
  const value = (envValue || '').toLowerCase();
  if (value === 'silent' || value === 'error' || value === 'warn' || value === 'info' || value === 'debug') {
    return value as LogLevel;
  }
  return fallback;
}

const configuredLevel: LogLevel = parseLogLevel(process.env.LOG_LEVEL, process.env.NODE_ENV === 'development' ? 'debug' : 'info');
const configuredPriority = getLevelPriority(configuredLevel);
const logFormat = process.env.LOG_FORMAT || 'json';
const logFile = process.env.LOG_FILE;

// Ensure logs directory exists
if (logFile && process.env.NODE_ENV === 'production') {
  const logDir = path.dirname(logFile);
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
}

// Log rotation counter (check every 100 writes)
let logWriteCount = 0;
const ROTATION_CHECK_INTERVAL = 100;

function formatLogEntry(entry: LogEntry): string {
  if (logFormat === 'json') {
    return JSON.stringify(entry);
  }
  
  // Text format
  const timestamp = entry.timestamp;
  const level = entry.level.toUpperCase().padEnd(5);
  const service = entry.service ? `[${entry.service}]` : '';
  const userId = entry.userId ? `[user:${entry.userId}]` : '';
  const requestId = entry.requestId ? `[req:${entry.requestId}]` : '';
  const metadata = entry.metadata ? ` ${JSON.stringify(entry.metadata)}` : '';
  const stack = entry.stack ? `\n${entry.stack}` : '';
  
  return `${timestamp} ${level} ${service}${userId}${requestId} ${entry.message}${metadata}${stack}`;
}

async function writeToFile(logEntry: string): Promise<void> {
  if (logFile && process.env.NODE_ENV === 'production') {
    try {
      fs.appendFileSync(logFile, logEntry + '\n');
      
      // Check for log rotation periodically
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

async function logAt(level: LogLevel, message: string, meta?: Record<string, any>): Promise<void> {
  const levelPriority = getLevelPriority(level);
  if (levelPriority < configuredPriority) return;

  const entry: LogEntry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    metadata: meta,
  };

  const formattedEntry = formatLogEntry(entry);

  // Write to file in production
  if (process.env.NODE_ENV === 'production') {
    await writeToFile(formattedEntry);
  }

  // Also output to console
  switch (level) {
    case 'error':
      console.error(formattedEntry);
      break;
    case 'warn':
      console.warn(formattedEntry);
      break;
    case 'info':
      console.info(formattedEntry);
      break;
    case 'debug':
      console.debug(formattedEntry);
      break;
    case 'silent':
    default:
      break;
  }
}

// Create logger instances for different services
function createServiceLogger(service: string) {
  return {
    error: (message: string, meta?: Record<string, any>) => 
      logAt('error', message, { ...meta, service }),
    warn: (message: string, meta?: Record<string, any>) => 
      logAt('warn', message, { ...meta, service }),
    info: (message: string, meta?: Record<string, any>) => 
      logAt('info', message, { ...meta, service }),
    debug: (message: string, meta?: Record<string, any>) => 
      logAt('debug', message, { ...meta, service }),
  };
}

export const logger = {
  level: configuredLevel,
  error: (message: string, meta?: Record<string, any>) => logAt('error', message, meta),
  warn: (message: string, meta?: Record<string, any>) => logAt('warn', message, meta),
  info: (message: string, meta?: Record<string, any>) => logAt('info', message, meta),
  debug: (message: string, meta?: Record<string, any>) => logAt('debug', message, meta),
  
  // Service-specific loggers
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
  switch (configuredLevel) {
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

// Request context logger (for API routes)
export function createRequestLogger(requestId: string, userId?: string) {
  return {
    error: (message: string, meta?: Record<string, any>) => 
      logAt('error', message, { ...meta, requestId, userId }),
    warn: (message: string, meta?: Record<string, any>) => 
      logAt('warn', message, { ...meta, requestId, userId }),
    info: (message: string, meta?: Record<string, any>) => 
      logAt('info', message, { ...meta, requestId, userId }),
    debug: (message: string, meta?: Record<string, any>) => 
      logAt('debug', message, { ...meta, requestId, userId }),
  };
}

// Initialize log rotation cleanup on startup
if (process.env.NODE_ENV === 'production') {
  // Clean up old logs on startup (older than 30 days)
  setImmediate(async () => {
    try {
      await logRotation.cleanupOldLogs(30);
    } catch (error) {
      console.error('Failed to cleanup old logs on startup:', error);
    }
  });
}

