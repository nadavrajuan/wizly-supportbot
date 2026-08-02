function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatInlineMarkdown(line: string): string {
  let result = line.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  result = result.replace(/__(.+?)__/g, '<strong>$1</strong>');
  result = result.replace(/\*([^*\n]+?)\*/g, '<strong>$1</strong>');
  return result;
}

/** Strip markdown emphasis markers for the plain-text part of multipart email. */
export function markdownToPlainText(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/\*([^*\n]+?)\*/g, '$1');
}

/** Convert markdown-style emphasis and line breaks to a simple HTML email body. */
export function markdownToHtmlEmail(text: string): string {
  const htmlBody = text
    .split('\n')
    .map((line) => formatInlineMarkdown(escapeHtml(line)))
    .join('<br>\n');

  return [
    '<!DOCTYPE html>',
    '<html>',
    '<body>',
    '<div style="font-family: sans-serif; font-size: 14px; line-height: 1.5; color: #222;">',
    htmlBody,
    '</div>',
    '</body>',
    '</html>',
  ].join('\n');
}

export function buildMultipartAlternativeBody(plainText: string, html: string): {
  boundary: string;
  body: string;
} {
  const boundary = `wyzly_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

  const body = [
    `--${boundary}`,
    'Content-Type: text/plain; charset=utf-8',
    '',
    plainText,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset=utf-8',
    '',
    html,
    '',
    `--${boundary}--`,
  ].join('\r\n');

  return { boundary, body };
}
