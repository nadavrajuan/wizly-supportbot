import { NextRequest, NextResponse } from 'next/server';
import { sendReply } from '@/lib/gmail';

export async function POST(req: NextRequest) {
  const { to, subject, body, threadId, inReplyTo } = await req.json();
  if (!to || !body || !threadId) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  try {
    await sendReply({ to, subject, body, threadId, inReplyTo });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Send error:', err);
    const message = err instanceof Error ? err.message : 'Failed to send reply';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
