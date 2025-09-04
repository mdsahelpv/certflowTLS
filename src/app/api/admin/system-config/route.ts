import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

// System configuration interface
interface SystemConfig {
  databaseUrl?: string;
  databaseType?: string;
  backupEnabled?: boolean;
  backupFrequency?: string;
  maintenanceMode?: boolean;
  maintenanceMessage?: string;
  environmentVariables?: Record<string, string>;
}

// GET - Retrieve current system configuration
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const permissions = (session.user as any).permissions || [];
    if (!permissions.includes('config:manage')) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    // Get system configuration from database or environment
    const config: SystemConfig = {
      databaseUrl: process.env.DATABASE_URL ? 'configured' : 'not configured',
      databaseType: process.env.DATABASE_URL?.includes('postgresql') ? 'postgresql' :
                   process.env.DATABASE_URL?.includes('mysql') ? 'mysql' :
                   process.env.DATABASE_URL?.includes('mongodb') ? 'mongodb' :
                   process.env.DATABASE_URL?.startsWith('file:') ? 'sqlite' : 'unknown',
      backupEnabled: process.env.BACKUP_ENABLED === 'true',
      backupFrequency: process.env.BACKUP_FREQUENCY || 'daily',
      maintenanceMode: process.env.MAINTENANCE_MODE === 'true',
      maintenanceMessage: process.env.MAINTENANCE_MESSAGE || 'System is under maintenance',
      environmentVariables: {
        NODE_ENV: process.env.NODE_ENV || 'development',
        NEXTAUTH_URL: process.env.NEXTAUTH_URL ? 'configured' : 'not configured',
        NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET ? 'configured' : 'not configured',
      }
    };

    return NextResponse.json(config);
  } catch (error) {
    console.error('Error fetching system config:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST - Update system configuration
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const permissions = (session.user as any).permissions || [];
    if (!permissions.includes('config:manage')) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const body = await request.json();
    const { action, config } = body;

    switch (action) {
      case 'updateDatabase':
        // Note: In a real implementation, you'd update environment variables
        // or configuration files. This is a simplified example.
        return NextResponse.json({
          success: true,
          message: 'Database configuration updated (simulated)'
        });

      case 'toggleMaintenance':
        // Toggle maintenance mode
        process.env.MAINTENANCE_MODE = config.maintenanceMode ? 'true' : 'false';
        if (config.maintenanceMessage) {
          process.env.MAINTENANCE_MESSAGE = config.maintenanceMessage;
        }
        return NextResponse.json({
          success: true,
          message: `Maintenance mode ${config.maintenanceMode ? 'enabled' : 'disabled'}`
        });

      case 'createBackup':
        try {
          const backupPath = path.join(process.cwd(), 'backups');
          if (!fs.existsSync(backupPath)) {
            fs.mkdirSync(backupPath, { recursive: true });
          }

          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          const databaseType = process.env.DATABASE_URL?.includes('postgresql') ? 'postgresql' :
                              process.env.DATABASE_URL?.startsWith('file:') ? 'sqlite' : 'unknown';

          let backupFile: string;
          let backupCommand: string;

          if (databaseType === 'sqlite') {
            // SQLite backup using sqlite3 command
            const dbPath = process.env.DATABASE_URL?.replace('file:', '') || './db/custom.db';
            backupFile = path.join(backupPath, `backup-sqlite-${timestamp}.sql`);
            backupCommand = `sqlite3 "${dbPath}" .dump > "${backupFile}"`;

          } else if (databaseType === 'postgresql') {
            // PostgreSQL backup using pg_dump
            backupFile = path.join(backupPath, `backup-postgres-${timestamp}.sql`);

            // Parse PostgreSQL connection string
            const url = new URL(process.env.DATABASE_URL!);
            const host = url.hostname;
            const port = url.port;
            const database = url.pathname.slice(1);
            const username = url.username;
            const password = url.password;

            backupCommand = `PGPASSWORD="${password}" pg_dump -h ${host} -p ${port} -U ${username} -d ${database} -f "${backupFile}"`;

          } else {
            return NextResponse.json({
              error: 'Unsupported database type for backup'
            }, { status: 400 });
          }

          // Execute backup command
          const execAsync = promisify(exec);
          await execAsync(backupCommand);

          // Verify backup file was created and has content
          if (fs.existsSync(backupFile)) {
            const stats = fs.statSync(backupFile);
            const fileSize = stats.size;

            return NextResponse.json({
              success: true,
              message: `Database backup created successfully (${databaseType})`,
              backupFile: path.basename(backupFile),
              fileSize: `${(fileSize / 1024).toFixed(2)} KB`,
              databaseType: databaseType
            });
          } else {
            throw new Error('Backup file was not created');
          }

        } catch (backupError: any) {
          console.error('Backup creation failed:', backupError);
          return NextResponse.json({
            error: 'Backup creation failed',
            details: backupError.message
          }, { status: 500 });
        }

      case 'updateEnvironment':
        // Update environment variables (simulated)
        return NextResponse.json({
          success: true,
          message: 'Environment variables updated (simulated)'
        });

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Error updating system config:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
