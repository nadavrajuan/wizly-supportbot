import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';

const COOKIE_NAME = 'ws_session';
const secret = () => new TextEncoder().encode(process.env.JWT_SECRET || 'fallback-dev-secret-change-me');

export async function createSession(): Promise<string> {
  return new SignJWT({ authenticated: true })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(secret());
}

export async function verifySession(token: string): Promise<boolean> {
  try {
    await jwtVerify(token, secret());
    return true;
  } catch {
    return false;
  }
}

export function getSessionToken(): string | undefined {
  return cookies().get(COOKIE_NAME)?.value;
}

export const COOKIE_OPTIONS = {
  name: COOKIE_NAME,
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 60 * 60 * 24 * 7,
};
