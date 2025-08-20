type LogLevel = 'silent' | 'error' | 'warn' | 'info' | 'debug';

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

function logAt(level: LogLevel, ...args: unknown[]) {
  const levelPriority = getLevelPriority(level);
  if (levelPriority < configuredPriority) return;
  // Map to console methods
  switch (level) {
    case 'error':
      console.error(...args);
      break;
    case 'warn':
      console.warn(...args);
      break;
    case 'info':
      console.info(...args);
      break;
    case 'debug':
      console.debug(...args);
      break;
    case 'silent':
    default:
      break;
  }
}

export const logger = {
  level: configuredLevel,
  error: (...args: unknown[]) => logAt('error', ...args),
  warn: (...args: unknown[]) => logAt('warn', ...args),
  info: (...args: unknown[]) => logAt('info', ...args),
  debug: (...args: unknown[]) => logAt('debug', ...args),
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

