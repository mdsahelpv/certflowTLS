import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    // Get maintenance mode status from database
    const maintenanceRecord = await db.maintenanceMode.findFirst({
      orderBy: { updatedAt: 'desc' }
    });

    const isMaintenanceMode = maintenanceRecord?.isEnabled || false;
    const message = maintenanceRecord?.message || 'System is currently under maintenance. Please try again later.';

    return NextResponse.json({
      isMaintenanceMode,
      message,
      startTime: maintenanceRecord?.startTime,
      endTime: maintenanceRecord?.endTime,
      lastUpdated: maintenanceRecord?.updatedAt
    });

  } catch (error) {
    console.error('Error checking maintenance status:', error);

    // Fallback to environment variable if database is unavailable
    const isMaintenanceMode = process.env.MAINTENANCE_MODE === 'true';
    const message = process.env.MAINTENANCE_MESSAGE || 'System is currently under maintenance. Please try again later.';

    return NextResponse.json({
      isMaintenanceMode,
      message,
      fallback: true // Indicate this is a fallback response
    });
  }
}
