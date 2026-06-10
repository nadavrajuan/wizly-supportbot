import { NextRequest, NextResponse } from 'next/server';
import { markAsRead } from '@/lib/gmail';

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await markAsRead(params.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Error marking as read:', err);
    return NextResponse.json({ error: 'Failed to mark as read' }, { status: 500 });
  }
}
