import { NextRequest, NextResponse } from 'next/server';
import { markAsRead } from '@/lib/gmail';

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await markAsRead(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Error marking as read:', err);
    return NextResponse.json({ error: 'Failed to mark as read' }, { status: 500 });
  }
}
