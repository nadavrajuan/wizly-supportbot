'use client';

import { useEffect, useRef, useState } from 'react';

const ALLOWED_TAGS = [
  'p', 'br', 'div', 'span', 'a', 'img', 'strong', 'em', 'b', 'i', 'u',
  'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tr', 'td', 'th',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'hr',
];

const ALLOWED_ATTR = ['href', 'src', 'alt', 'title', 'target', 'rel', 'colspan', 'rowspan'];

const ALLOWED_URI_REGEXP = /^(?:(?:https?|mailto|tel|data):|\/api\/email\/|[^a-z]|[a-z+.-]+(?:[^a-z+.-:]|$))/i;

function isEmailAttachmentSource(sourcePath: string): boolean {
  return sourcePath.includes('/api/email/') && (
    sourcePath.includes('/attachment?') || sourcePath.includes('/attachments/')
  );
}

interface SanitizedEmailHtmlProps {
  html: string;
  className?: string;
  fallback?: string;
}

async function hydrateAuthenticatedImages(container: HTMLElement): Promise<() => void> {
  const objectUrls: string[] = [];
  const images = container.querySelectorAll<HTMLImageElement>('img[src*="/api/email/"]');

  await Promise.all(
    Array.from(images).map(async (imageElement) => {
      const sourcePath = imageElement.getAttribute('src');
      if (!sourcePath || !isEmailAttachmentSource(sourcePath)) return;

      try {
        const response = await fetch(sourcePath, { credentials: 'include' });
        if (!response.ok) return;

        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);
        objectUrls.push(objectUrl);
        imageElement.src = objectUrl;
      } catch {
        // Keep broken image placeholder if fetch fails.
      }
    })
  );

  return () => {
    for (const objectUrl of objectUrls) {
      URL.revokeObjectURL(objectUrl);
    }
  };
}

export function SanitizedEmailHtml({ html, className, fallback }: SanitizedEmailHtmlProps) {
  const [sanitizedHtml, setSanitizedHtml] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!html) {
      setSanitizedHtml('');
      return;
    }

    import('dompurify').then(({ default: DOMPurify }) => {
      setSanitizedHtml(
        DOMPurify.sanitize(html, {
          ALLOWED_TAGS,
          ALLOWED_ATTR,
          ALLOWED_URI_REGEXP,
        })
      );
    });
  }, [html]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !sanitizedHtml) return;

    let cancelled = false;
    let revokeObjectUrls: (() => void) | undefined;

    hydrateAuthenticatedImages(container).then((revoke) => {
      if (cancelled) {
        revoke();
        return;
      }
      revokeObjectUrls = revoke;
    });

    return () => {
      cancelled = true;
      revokeObjectUrls?.();
    };
  }, [sanitizedHtml]);

  if (!sanitizedHtml) {
    if (!fallback) return null;
    return (
      <div className={`${className ?? ''} whitespace-pre-wrap`}>
        {fallback}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={className}
      dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
    />
  );
}
