import fs from 'fs';
import path from 'path';

interface LogRotationConfig {
  logFile: string;
  maxSize: number; // in bytes
  maxFiles: number;
  compressOldLogs: boolean;
}

export class LogRotation {
  private config: LogRotationConfig;

  constructor(config: LogRotationConfig) {
    this.config = config;
  }

  /**
   * Check if log rotation is needed and perform rotation
   */
  async checkAndRotate(): Promise<void> {
    try {
      if (!fs.existsSync(this.config.logFile)) {
        return; // No log file exists yet
      }

      const stats = fs.statSync(this.config.logFile);
      if (stats.size < this.config.maxSize) {
        return; // Log file is not large enough to rotate
      }

      await this.rotateLogs();
    } catch (error) {
      console.error('Log rotation failed:', error);
    }
  }

  /**
   * Rotate log files
   */
  private async rotateLogs(): Promise<void> {
    const logDir = path.dirname(this.config.logFile);
    const logBase = path.basename(this.config.logFile, path.extname(this.config.logFile));
    const logExt = path.extname(this.config.logFile);

    // Remove oldest log file if we've reached max files
    const oldestLog = path.join(logDir, `${logBase}.${this.config.maxFiles}${logExt}`);
    if (fs.existsSync(oldestLog)) {
      fs.unlinkSync(oldestLog);
    }

    // Shift existing log files
    for (let i = this.config.maxFiles - 1; i >= 1; i--) {
      const currentLog = path.join(logDir, `${logBase}.${i}${logExt}`);
      const nextLog = path.join(logDir, `${logBase}.${i + 1}${logExt}`);
      
      if (fs.existsSync(currentLog)) {
        fs.renameSync(currentLog, nextLog);
      }
    }

    // Rename current log file to .1
    const currentLog = this.config.logFile;
    const firstBackup = path.join(logDir, `${logBase}.1${logExt}`);
    fs.renameSync(currentLog, firstBackup);

    // Create new empty log file
    fs.writeFileSync(currentLog, '');

    // Compress old logs if enabled
    if (this.config.compressOldLogs) {
      await this.compressOldLogs();
    }
  }

  /**
   * Compress old log files using gzip
   */
  private async compressOldLogs(): Promise<void> {
    const logDir = path.dirname(this.config.logFile);
    const logBase = path.basename(this.config.logFile, path.extname(this.config.logFile));
    const logExt = path.extname(this.config.logFile);

    for (let i = 1; i <= this.config.maxFiles; i++) {
      const logFile = path.join(logDir, `${logBase}.${i}${logExt}`);
      const gzFile = `${logFile}.gz`;

      if (fs.existsSync(logFile) && !fs.existsSync(gzFile)) {
        try {
          const { createGzip } = require('zlib');
          const { pipeline } = require('stream/promises');
          const { createReadStream, createWriteStream } = require('fs');

          await pipeline(
            createReadStream(logFile),
            createGzip(),
            createWriteStream(gzFile)
          );

          // Remove original file after compression
          fs.unlinkSync(logFile);
        } catch (error) {
          console.error(`Failed to compress log file ${logFile}:`, error);
        }
      }
    }
  }

  /**
   * Clean up old compressed logs
   */
  async cleanupOldLogs(maxAgeDays: number = 30): Promise<void> {
    const logDir = path.dirname(this.config.logFile);
    const logBase = path.basename(this.config.logFile, path.extname(this.config.logFile));
    const logExt = path.extname(this.config.logFile);
    const cutoffTime = Date.now() - (maxAgeDays * 24 * 60 * 60 * 1000);

    try {
      const files = fs.readdirSync(logDir);
      
      for (const file of files) {
        if (file.startsWith(logBase) && (file.endsWith(logExt) || file.endsWith('.gz'))) {
          const filePath = path.join(logDir, file);
          const stats = fs.statSync(filePath);
          
          if (stats.mtime.getTime() < cutoffTime) {
            fs.unlinkSync(filePath);
            console.log(`Deleted old log file: ${file}`);
          }
        }
      }
    } catch (error) {
      console.error('Failed to cleanup old logs:', error);
    }
  }
}

// Default configuration
export const defaultLogRotationConfig: LogRotationConfig = {
  logFile: process.env.LOG_FILE || 'logs/app.log',
  maxSize: 10 * 1024 * 1024, // 10MB
  maxFiles: 5,
  compressOldLogs: true,
};

// Create default log rotation instance
export const logRotation = new LogRotation(defaultLogRotationConfig);