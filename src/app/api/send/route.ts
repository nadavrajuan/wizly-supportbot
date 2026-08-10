import { NextRequest, NextResponse } from 'next/server';
import { getEmail, sendReply } from '@/lib/gmail';
import { isValidEmailAddress, normalizeOptionalRecipient } from '@/lib/email-address';

export async function POST(req: NextRequest) {
  const { emailId, to, cc, subject, body, threadId, inReplyTo } = await req.json();
  if (!emailId || !body || !threadId) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const replyTo = normalizeOptionalRecipient(to);
  if (!replyTo || !isValidEmailAddress(replyTo)) {
    return NextResponse.json({ error: 'A valid To address is required' }, { status: 400 });
  }

  const replyCc = normalizeOptionalRecipient(cc);
  if (replyCc && !isValidEmailAddress(replyCc)) {
    return NextResponse.json({ error: 'Cc address is invalid' }, { status: 400 });
  }

  try {
    const email = await getEmail(emailId);
    if (!email) {
      return NextResponse.json({ error: 'Email not found' }, { status: 404 });
    }

    await sendReply({
      to: replyTo,
      cc: replyCc,
      subject,
      body,
      threadId,
      inReplyTo,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Send error:', err);
    const message = err instanceof Error ? err.message : 'Failed to send reply';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
