import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getStoredTokens } from '@/lib/gmail';

export async function GET() {
  const db = getDb();
  const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
  const settings: Record<string, string> = {};
  for (const r of rows) settings[r.key] = r.value;

  const gmail = getStoredTokens();

  return NextResponse.json({
    openai_model: settings['openai_model'] || 'gpt-4.1',
    has_openai_key: !!settings['openai_api_key'],
    gmail_connected: !!gmail?.refresh_token,
    gmail_email: gmail?.account_email || '',
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const db = getDb();

  const upsert = db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  );

  if (body.openai_api_key !== undefined) {
    upsert.run('openai_api_key', body.openai_api_key);
  }
  if (body.openai_model !== undefined) {
    upsert.run('openai_model', body.openai_model);
  }

  return NextResponse.json({ ok: true });
}
