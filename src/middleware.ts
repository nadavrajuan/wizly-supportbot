import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';
import { getJwtSecret } from './lib/jwt-secret';

const PROTECTED = ['/dashboard', '/api/emails', '/api/email', '/api/generate', '/api/send', '/api/knowledge', '/api/settings', '/api/auth/gmail'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isProtected = PROTECTED.some((p) => pathname.startsWith(p));
  // Allow Gmail OAuth callback without auth (it sets up the connection)
  const isGmailCallback = pathname.startsWith('/api/auth/gmail/callback');

  if (!isProtected || isGmailCallback) return NextResponse.next();

  const token = request.cookies.get('ws_session')?.value;
  if (!token) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.redirect(new URL('/', request.url));
  }

  try {
    await jwtVerify(token, getJwtSecret());
    return NextResponse.next();
  } catch {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.redirect(new URL('/', request.url));
  }
}

export const config = {
  matcher: ['/dashboard/:path*', '/api/:path*'],
};
