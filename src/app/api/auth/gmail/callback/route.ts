import { NextRequest, NextResponse } from 'next/server';
import { getOAuthClient, saveTokens } from '@/lib/gmail';
import { google } from 'googleapis';

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  if (!code) {
    return NextResponse.redirect(new URL('/dashboard?gmail_error=no_code', req.url));
  }

  try {
    const client = getOAuthClient();
    const { tokens } = await client.getToken(code);

    let accountEmail = '';
    if (tokens.access_token) {
      client.setCredentials(tokens);
      const oauth2 = google.oauth2({ version: 'v2', auth: client });
      const info = await oauth2.userinfo.get();
      accountEmail = info.data.email ?? '';
    }

    saveTokens({ ...tokens, accountEmail });
    return NextResponse.redirect(new URL('/dashboard?gmail_connected=1', req.url));
  } catch (err) {
    console.error('Gmail OAuth error:', err);
    return NextResponse.redirect(new URL('/dashboard?gmail_error=auth_failed', req.url));
  }
}
