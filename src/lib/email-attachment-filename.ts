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

function extractHeader(
  headers: gmail_v1.Schema$MessagePartHeader[] | undefined,
  name: string
): string {
  return headers?.find((header) => header.name?.toLowerCase() === name.toLowerCase())?.value ?? '';
}

export function resolveAttachmentFilename(part: gmail_v1.Schema$MessagePart): string {
  const mimeType = part.mimeType ?? 'application/octet-stream';
  const isImagePart = mimeType.startsWith('image/');
  const contentDisposition = extractHeader(part.headers, 'Content-Disposition');

  const filename =
    part.filename?.trim()
    || extractFilenameFromDisposition(contentDisposition)
    || (isImagePart ? `image.${mimeType.split('/')[1] ?? 'bin'}` : defaultFilenameForMimeType(mimeType));

  return filename;
}

export function buildContentDispositionHeader(filename: string): string {
  const sanitizedFilename = filename.replace(/[\r\n"]/g, '_').trim() || 'attachment';
  const asciiFilename = sanitizedFilename.replace(/[^\x20-\x7E]/g, '_');
  const encodedFilename = encodeURIComponent(sanitizedFilename);

  return `attachment; filename="${asciiFilename}"; filename*=UTF-8''${encodedFilename}`;
}
