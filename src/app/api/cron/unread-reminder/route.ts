import { NextRequest, NextResponse } from 'next/server';
import { verifyCronSecret } from '@/lib/cron-secret';
import { getStoredTokens } from '@/lib/gmail';
import { sendUnreadReminderIfNeeded } from '@/lib/unread-reminder';

export async function POST(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const tokens = getStoredTokens();
  if (!tokens?.refresh_token) {
    return NextResponse.json({
      sent: false,
      unreadCount: 0,
      reason: 'gmail_not_connected',
    });
  }

  try {
    const result = await sendUnreadReminderIfNeeded();
    return NextResponse.json(result);
  } catch (error) {
    console.error('Unread reminder cron failed:', error);
    return NextResponse.json({ error: 'Failed to send unread reminder' }, { status: 500 });
  }
}
