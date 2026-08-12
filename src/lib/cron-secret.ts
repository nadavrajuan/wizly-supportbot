import type { NextRequest } from 'next/server';

export function verifyCronSecret(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const authorizationHeader = request.headers.get('authorization');
  if (authorizationHeader === `Bearer ${secret}`) return true;

  return request.headers.get('x-cron-secret') === secret;
}
