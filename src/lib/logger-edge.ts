// src/lib/logger-edge.ts
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
    case 'silent': return 5;
    case 'error': return 4;
    case 'warn': return 3;
    case 'info': return 2;
    case 'debug': return 1;
    default: return 3;
  }
}

function parseLogLevel(envValue: string | undefined, fallback: LogLevel): LogLevel {
  const value = (envValue || '').toLowerCase();
  if (['silent', 'error', 'warn', 'info', 'debug'].includes(value)) {
    return value as LogLevel;
  }
  return fallback;
}

const configuredLevel: LogLevel = parseLogLevel(process.env.LOG_LEVEL, process.env.NODE_ENV === 'development' ? 'debug' : 'info');
const configuredPriority = getLevelPriority(configuredLevel);
const logFormat = process.env.LOG_FORMAT || 'json';

function formatLogEntry(entry: LogEntry): string {
  if (logFormat === 'json') {
    return JSON.stringify(entry);
  }
  
  const timestamp = entry.timestamp;
  const level = entry.level.toUpperCase().padEnd(5);
  const service = entry.service ? `[${entry.service}]` : '';
  const userId = entry.userId ? `[user:${entry.userId}]` : '';
  const requestId = entry.requestId ? `[req:${entry.requestId}]` : '';
  const metadata = entry.metadata ? ` ${JSON.stringify(entry.metadata)}` : '';
  const stack = entry.stack ? `
${entry.stack}` : '';
  
  return `${timestamp} ${level} ${service}${userId}${requestId} ${entry.message}${metadata}${stack}`;
}

async function logAt(level: LogLevel, message: string, meta?: Record<string, any>): Promise<void> {
  if (getLevelPriority(level) < configuredPriority) return;

  const entry: LogEntry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    metadata: meta,
  };

  const formattedEntry = formatLogEntry(entry);

  switch (level) {
    case 'error': console.error(formattedEntry); break;
    case 'warn': console.warn(formattedEntry); break;
    case 'info': console.info(formattedEntry); break;
    case 'debug': console.debug(formattedEntry); break;
  }
}

function createServiceLogger(service: string) {
  return {
    error: (message: string, meta?: Record<string, any>) => logAt('error', message, { ...meta, service }),
    warn: (message: string, meta?: Record<string, any>) => logAt('warn', message, { ...meta, service }),
    info: (message: string, meta?: Record<string, any>) => logAt('info', message, { ...meta, service }),
    debug: (message: string, meta?: Record<string, any>) => logAt('debug', message, { ...meta, service }),
  };
}

export const logger = {
  level: configuredLevel,
  error: (message: string, meta?: Record<string, any>) => logAt('error', message, meta),
  warn: (message: string, meta?: Record<string, any>) => logAt('warn', message, meta),
  info: (message: string, meta?: Record<string, any>) => logAt('info', message, meta),
  debug: (message: string, meta?: Record<string, any>) => logAt('debug', message, meta),
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
  return {
    error: (message: string, meta?: Record<string, any>) => logAt('error', message, { ...meta, requestId, userId }),
    warn: (message: string, meta?: Record<string, any>) => logAt('warn', message, { ...meta, requestId, userId }),
    info: (message: string, meta?: Record<string, any>) => logAt('info', message, { ...meta, requestId, userId }),
    debug: (message: string, meta?: Record<string, any>) => logAt('debug', message, { ...meta, requestId, userId }),
  };
}
