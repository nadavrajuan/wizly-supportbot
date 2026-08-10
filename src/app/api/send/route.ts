import { NextRequest, NextResponse } from 'next/server';
import { getEmail, getStoredTokens, sendReply } from '@/lib/gmail';
import { resolveReplyTargets } from '@/lib/email-reply-targets';

export async function POST(req: NextRequest) {
  const { emailId, subject, body, threadId, inReplyTo } = await req.json();
  if (!emailId || !body || !threadId) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  try {
    const email = await getEmail(emailId);
    if (!email) {
      return NextResponse.json({ error: 'Email not found' }, { status: 404 });
    }

    const storedTokens = getStoredTokens();
    const replyTargets = resolveReplyTargets({
      subject: email.subject,
      from: email.from,
      to: email.to,
      body: email.body,
      bodyHtml: email.bodyHtml,
      supportMailboxEmails: storedTokens?.account_email ? [storedTokens.account_email] : [],
    });

    await sendReply({
      to: replyTargets.replyTo,
      cc: replyTargets.replyCc,
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
