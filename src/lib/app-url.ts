import type { NextRequest } from 'next/server';

/** Public base URL from APP_URL (no request context). */
export function getConfiguredAppUrl(): string | undefined {
  return process.env.APP_URL?.replace(/\/$/, '');
}

/** Public base URL for redirects behind Kubernetes ingress. */
export function getPublicBaseUrl(request: NextRequest): string {
  const configuredUrl = getConfiguredAppUrl();
  if (configuredUrl) return configuredUrl;

  const forwardedProtocol = request.headers.get('x-forwarded-proto');
  const forwardedHost = request.headers.get('x-forwarded-host');
  if (forwardedProtocol && forwardedHost) {
    return `${forwardedProtocol}://${forwardedHost}`;
  }

  return request.nextUrl.origin;
}

export function publicRedirectPath(request: NextRequest, path: string): URL {
  return new URL(path, getPublicBaseUrl(request));
}
