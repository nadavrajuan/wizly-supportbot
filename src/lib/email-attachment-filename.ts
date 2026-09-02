import type { gmail_v1 } from 'googleapis';

function decodeRfc2047EncodedWord(encodedWord: string): string {
  const encodedWordMatch = encodedWord.match(/^=\?([^?]+)\?([BQ])\?([^?]*)\?=$/i);
  if (!encodedWordMatch) return encodedWord;

  const encoding = encodedWordMatch[2].toUpperCase();
  const encodedText = encodedWordMatch[3];

  if (encoding === 'B') {
    return Buffer.from(encodedText, 'base64').toString('utf-8');
  }

  return encodedText
    .replace(/_/g, ' ')
    .replace(/=([0-9A-F]{2})/gi, (_, hexDigitPair: string) =>
      String.fromCharCode(parseInt(hexDigitPair, 16))
    );
}

function decodeRfc2047Header(value: string): string {
  return value.replace(/=\?[^?]+\?[BQ]\?[^?]*\?=/gi, (encodedWord) =>
    decodeRfc2047EncodedWord(encodedWord)
  );
}

function extractHeader(
  headers: gmail_v1.Schema$MessagePartHeader[] | undefined,
  name: string
): string {
  return headers?.find((header) => header.name?.toLowerCase() === name.toLowerCase())?.value ?? '';
}

function extractMimeTypeFromContentType(contentType: string): string {
  return contentType.split(';')[0]?.trim() ?? '';
}

export function extractFilenameFromContentType(contentType: string): string {
  if (!contentType) return '';

  const nameStarMatch = contentType.match(
    /name\*\s*=\s*(?:UTF-8|utf-8)'[^']*'([^;\s]+)/i
  );
  if (nameStarMatch?.[1]) {
    try {
      return decodeURIComponent(nameStarMatch[1].trim());
    } catch {
      return nameStarMatch[1].trim();
    }
  }

  const nameQuotedMatch = contentType.match(/name\s*=\s*"([^"]+)"/i);
  if (nameQuotedMatch?.[1]) {
    return decodeRfc2047Header(nameQuotedMatch[1].trim());
  }

  const nameMatch = contentType.match(/name\s*=\s*([^;\s]+)/i);
  if (nameMatch?.[1]) {
    const rawFilename = nameMatch[1].trim().replace(/^"(.*)"$/, '$1');
    return decodeRfc2047Header(rawFilename);
  }

  return '';
}

export function extractFilenameFromDisposition(contentDisposition: string): string {
  if (!contentDisposition) return '';

  const filenameStarMatch = contentDisposition.match(
    /filename\*\s*=\s*(?:UTF-8|utf-8)'[^']*'([^;\s]+)/i
  );
  if (filenameStarMatch?.[1]) {
    try {
      return decodeURIComponent(filenameStarMatch[1].trim());
    } catch {
      return filenameStarMatch[1].trim();
    }
  }

  const filenameQuotedMatch = contentDisposition.match(/filename\s*=\s*"([^"]+)"/i);
  if (filenameQuotedMatch?.[1]) {
    return decodeRfc2047Header(filenameQuotedMatch[1].trim());
  }

  const filenameMatch = contentDisposition.match(/filename\s*=\s*([^;\s]+)/i);
  if (filenameMatch?.[1]) {
    const rawFilename = filenameMatch[1].trim().replace(/^"(.*)"$/, '$1');
    return decodeRfc2047Header(rawFilename);
  }

  return '';
}

function defaultFilenameForMimeType(mimeType: string): string {
  const mimeSubtype = mimeType.split('/')[1]?.split(';')[0]?.trim() ?? '';
  if (!mimeSubtype || mimeSubtype === 'octet-stream') return 'attachment';

  const extension = mimeSubtype.includes('.')
    ? mimeSubtype.split('.').pop() ?? mimeSubtype
    : mimeSubtype;

  return `attachment.${extension}`;
}

export function resolveAttachmentMimeType(part: gmail_v1.Schema$MessagePart): string {
  const partMimeType = part.mimeType?.split(';')[0]?.trim() ?? '';
  const headerContentType = extractHeader(part.headers, 'Content-Type');
  const headerMimeType = extractMimeTypeFromContentType(headerContentType);

  if (partMimeType && partMimeType !== 'application/octet-stream') {
    return partMimeType;
  }
  if (headerMimeType && headerMimeType !== 'application/octet-stream') {
    return headerMimeType;
  }

  return partMimeType || headerMimeType || 'application/octet-stream';
}

export function inferExtensionFromBytes(data: Buffer): string | null {
  if (data.length >= 4 && data.subarray(0, 4).toString('ascii') === '%PDF') return 'pdf';
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return 'jpg';
  if (
    data.length >= 8
    && data[0] === 0x89
    && data[1] === 0x50
    && data[2] === 0x4e
    && data[3] === 0x47
  ) {
    return 'png';
  }
  if (data.length >= 4 && data.subarray(0, 4).toString('ascii') === 'GIF8') return 'gif';

  return null;
}

export function inferMimeTypeFromBytes(data: Buffer): string | null {
  const extension = inferExtensionFromBytes(data);
  if (!extension) return null;

  const mimeByExtension: Record<string, string> = {
    pdf: 'application/pdf',
    jpg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
  };

  return mimeByExtension[extension] ?? null;
}

function filenameHasExtension(filename: string): boolean {
  const lastDotIndex = filename.lastIndexOf('.');
  return lastDotIndex > 0 && lastDotIndex < filename.length - 1;
}

export function finalizeAttachmentFilename(
  filename: string,
  mimeType: string,
  data?: Buffer
): string {
  const trimmedFilename = filename.trim() || 'attachment';
  if (filenameHasExtension(trimmedFilename)) return trimmedFilename;

  const extensionFromBytes = data ? inferExtensionFromBytes(data) : null;
  if (extensionFromBytes) return `${trimmedFilename}.${extensionFromBytes}`;

  const defaultFilename = defaultFilenameForMimeType(mimeType);
  if (defaultFilename !== 'attachment') return defaultFilename;

  return trimmedFilename;
}

export function resolveAttachmentFilename(part: gmail_v1.Schema$MessagePart): string {
  const mimeType = resolveAttachmentMimeType(part);
  const isImagePart = mimeType.startsWith('image/');
  const headerContentType = extractHeader(part.headers, 'Content-Type');
  const contentDisposition = extractHeader(part.headers, 'Content-Disposition');

  const filename =
    part.filename?.trim()
    || extractFilenameFromDisposition(contentDisposition)
    || extractFilenameFromContentType(headerContentType)
    || (isImagePart ? `image.${mimeType.split('/')[1] ?? 'bin'}` : defaultFilenameForMimeType(mimeType));

  return filename;
}

export function buildContentDispositionHeader(filename: string): string {
  const sanitizedFilename = filename.replace(/[\r\n"]/g, '_').trim() || 'attachment';
  const asciiFilename = sanitizedFilename.replace(/[^\x20-\x7E]/g, '_');
  const encodedFilename = encodeURIComponent(sanitizedFilename);

  return `attachment; filename="${asciiFilename}"; filename*=UTF-8''${encodedFilename}`;
}
