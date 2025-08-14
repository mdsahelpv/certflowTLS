import { NextResponse } from 'next/server';
import { CAService } from '@/lib/ca';

export async function GET() {
  try {
    const list = await CAService.getCAStatus();
    return NextResponse.json(list);
  } catch (error) {
    console.error('Failed to get CA status:', error);
    return NextResponse.json(
      { error: 'Failed to get CA status' },
      { status: 500 }
    );
  }
}