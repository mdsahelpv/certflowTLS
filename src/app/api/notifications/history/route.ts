import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { NotificationService } from '@/lib/notifications';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const permissions = session.user.permissions as string[];
    if (!permissions.includes('config:manage')) {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const result = await NotificationService.getNotificationHistory({
      limit: 50,
      offset: 0
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Failed to fetch notification history:', error);
    return NextResponse.json(
      { error: 'Failed to fetch notification history' },
      { status: 500 }
    );
  }
}