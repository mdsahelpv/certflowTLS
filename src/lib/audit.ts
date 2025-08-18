import { db } from '@/lib/db';
import { AuditAction, AuditLog } from '@prisma/client';
import { headers } from 'next/headers';

export interface AuditLogData {
  action: AuditAction;
  userId?: string;
  username?: string;
  description: string;
  metadata?: Record<string, any>;
}

export class AuditService {
  static async log(data: AuditLogData): Promise<AuditLog> {
    let ipAddress = 'unknown';
    let userAgent = 'unknown';
    try {
      const headersList = await (headers() as any);
      if (headersList && typeof headersList.get === 'function') {
        ipAddress = headersList.get('x-forwarded-for') || headersList.get('x-real-ip') || 'unknown';
        userAgent = headersList.get('user-agent') || 'unknown';
      }
    } catch {
      // Not in a request context; leave defaults
    }

    return await db.auditLog.create({
      data: {
        action: data.action,
        userId: data.userId,
        username: data.username,
        ipAddress,
        userAgent,
        description: data.description,
        metadata: data.metadata ? JSON.stringify(data.metadata) : null,
      },
    });
  }

  static async getAuditLogs(filters?: {
    action?: AuditAction;
    userId?: string;
    username?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  }): Promise<{ logs: AuditLog[]; total: number }> {
    const where: any = {};

    if (filters?.action) {
      where.action = filters.action;
    }

    if (filters?.userId) {
      where.userId = filters.userId;
    }

    if (filters?.username) {
      where.username = { contains: filters.username, mode: 'insensitive' };
    }

    if (filters?.startDate || filters?.endDate) {
      where.createdAt = {};
      if (filters.startDate) {
        where.createdAt.gte = filters.startDate;
      }
      if (filters.endDate) {
        where.createdAt.lte = filters.endDate;
      }
    }

    const [logs, total] = await Promise.all([
      db.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: filters?.limit || 50,
        skip: filters?.offset || 0,
        include: {
          user: {
            select: { id: true, username: true, name: true, email: true }
          }
        }
      }),
      db.auditLog.count({ where })
    ]);

    return { logs, total };
  }

  static async exportAuditLogs(filters?: {
    action?: AuditAction;
    userId?: string;
    username?: string;
    startDate?: Date;
    endDate?: Date;
  }, format: 'csv' | 'json' = 'csv'): Promise<string> {
    const where: any = {};

    if (filters?.action) {
      where.action = filters.action;
    }

    if (filters?.userId) {
      where.userId = filters.userId;
    }

    if (filters?.username) {
      where.username = { contains: filters.username, mode: 'insensitive' };
    }

    if (filters?.startDate || filters?.endDate) {
      where.createdAt = {};
      if (filters.startDate) {
        where.createdAt.gte = filters.startDate;
      }
      if (filters.endDate) {
        where.createdAt.lte = filters.endDate;
      }
    }

    const logs = await db.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: { id: true, username: true, name: true, email: true }
        }
      }
    });

    if (format === 'json') {
      return JSON.stringify(logs, null, 2);
    }

    // CSV format
    const headers = [
      'Timestamp',
      'Action',
      'User ID',
      'Username',
      'User Name',
      'User Email',
      'IP Address',
      'User Agent',
      'Description',
      'Metadata'
    ];

    const rows = logs.map(log => [
      log.createdAt.toISOString(),
      log.action,
      log.userId || '',
      log.username || '',
      log.user?.name || '',
      log.user?.email || '',
      log.ipAddress || '',
      log.userAgent || '',
      log.description,
      log.metadata || ''
    ]);

    return [headers.join(','), ...rows.map(row => row.map(cell => `"${cell}"`).join(','))].join('\n');
  }
}