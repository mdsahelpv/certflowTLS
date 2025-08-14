import { NextResponse } from 'next/server';
import { SystemInitializer } from '@/lib/init';

export async function GET() {
  try {
    const health = await SystemInitializer.healthCheck();
    
    return NextResponse.json(health, {
      status: health.status === 'healthy' ? 200 : 503,
    });
  } catch (error) {
    console.error('Health check failed:', error);
    return NextResponse.json(
      { 
        status: 'unhealthy',
        error: 'Health check failed',
        timestamp: new Date().toISOString(),
      },
      { status: 503 }
    );
  }
}