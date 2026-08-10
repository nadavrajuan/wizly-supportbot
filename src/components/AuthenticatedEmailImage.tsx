'use client';

import { useEffect, useState } from 'react';
import { attachmentApiPath } from '@/lib/email-attachment-url';

interface AuthenticatedEmailImageProps {
  messageId: string;
  attachmentId: string;
  alt: string;
  className?: string;
}

export function AuthenticatedEmailImage({
  messageId,
  attachmentId,
  alt,
  className,
}: AuthenticatedEmailImageProps) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let blobUrl: string | null = null;

    setObjectUrl(null);
    setFailed(false);

    fetch(attachmentApiPath(messageId, attachmentId), { credentials: 'include' })
      .then((response) => {
        if (!response.ok) throw new Error(`Failed to load image (${response.status})`);
        return response.blob();
      })
      .then((blob) => {
        if (cancelled) return;
        blobUrl = URL.createObjectURL(blob);
        setObjectUrl(blobUrl);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [messageId, attachmentId]);

  if (failed) {
    return (
      <div className={`flex items-center justify-center bg-gray-100 text-xs text-gray-400 ${className ?? ''}`}>
        Image unavailable
      </div>
    );
  }

  if (!objectUrl) {
    return (
      <div className={`flex items-center justify-center bg-gray-50 ${className ?? ''}`}>
        <div className="w-5 h-5 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={objectUrl} alt={alt} className={className} />
  );
}
