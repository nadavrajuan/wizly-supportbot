import { NextResponse } from 'next/server';
import { listEmails, getStoredTokens } from '@/lib/gmail';
import { seedKnowledgeBase } from '@/lib/seed';

export async function GET() {
  seedKnowledgeBase();

  const tokens = getStoredTokens();
  if (!tokens?.refresh_token) {
    return NextResponse.json({ emails: [], gmailConnected: false });
  }

  try {
    const emails = await listEmails(50);
    return NextResponse.json({ emails, gmailConnected: true });
  } catch (err) {
    console.error('Error fetching emails:', err);
    return NextResponse.json({ error: 'Failed to fetch emails' }, { status: 500 });
  }
}
