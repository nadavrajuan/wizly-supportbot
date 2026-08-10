'use client';

import { useEffect, useState } from 'react';

const ALLOWED_TAGS = [
  'p', 'br', 'div', 'span', 'a', 'img', 'strong', 'em', 'b', 'i', 'u',
  'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tr', 'td', 'th',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'hr',
];

const ALLOWED_ATTR = ['href', 'src', 'alt', 'title', 'target', 'rel', 'colspan', 'rowspan'];

interface SanitizedEmailHtmlProps {
  html: string;
  className?: string;
  fallback?: string;
}

export function SanitizedEmailHtml({ html, className, fallback }: SanitizedEmailHtmlProps) {
  const [sanitizedHtml, setSanitizedHtml] = useState('');

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
        })
      );
    });
  }, [html]);

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
      className={className}
      dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
    />
  );
}
