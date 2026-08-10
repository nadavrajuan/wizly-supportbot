const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;

export function extractEmailAddress(value: string): string {
  const trimmedValue = value.trim();
  if (!trimmedValue) return '';

  const angleBracketMatch = trimmedValue.match(/<([^>]+)>/);
  if (angleBracketMatch?.[1]) return angleBracketMatch[1].trim();

  const bareEmailMatch = trimmedValue.match(EMAIL_PATTERN);
  return bareEmailMatch?.[0] ?? trimmedValue;
}

export function isValidEmailAddress(value: string): boolean {
  const email = extractEmailAddress(value);
  return EMAIL_PATTERN.test(email);
}

export function normalizeOptionalRecipient(value: string | undefined): string | undefined {
  const trimmedValue = value?.trim() ?? '';
  if (!trimmedValue) return undefined;
  return extractEmailAddress(trimmedValue);
}
