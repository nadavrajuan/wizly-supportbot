import { NextRequest, NextResponse } from 'next/server';
import { getOAuthClient, saveTokens } from '@/lib/gmail';
import { publicRedirectPath } from '@/lib/app-url';
import { google } from 'googleapis';

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  if (!code) {
    return NextResponse.redirect(publicRedirectPath(req, '/dashboard?gmail_error=no_code'));
  }

  try {
    const client = getOAuthClient();
    const { tokens } = await client.getToken(code);

    let accountEmail = '';
    if (tokens.access_token) {
      client.setCredentials(tokens);
      const gmail = google.gmail({ version: 'v1', auth: client });
      const profile = await gmail.users.getProfile({ userId: 'me' });
      accountEmail = profile.data.emailAddress ?? '';
    }

    saveTokens({ ...tokens, accountEmail });
    return NextResponse.redirect(publicRedirectPath(req, '/dashboard?gmail_connected=1'));
  } catch (err) {
    console.error('Gmail OAuth error:', err);
    return NextResponse.redirect(publicRedirectPath(req, '/dashboard?gmail_error=auth_failed'));
  }
}
