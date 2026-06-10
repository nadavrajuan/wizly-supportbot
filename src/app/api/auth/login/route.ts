import { NextRequest, NextResponse } from 'next/server';
import { createSession, COOKIE_OPTIONS } from '@/lib/session';

export async function POST(req: NextRequest) {
  const { password } = await req.json();

  if (!password || password !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
  }

  const token = await createSession();
  const res = NextResponse.json({ ok: true });
  res.cookies.set({ ...COOKIE_OPTIONS, value: token });
  return res;
}
