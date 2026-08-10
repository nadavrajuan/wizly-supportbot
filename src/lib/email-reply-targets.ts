export interface ReplyTargets {
  replyTo: string;
  replyToDisplay: string;
  replyCc?: string;
  replyCcDisplay?: string;
  isForwarded: boolean;
}

export interface ReplyTargetEmailInput {
  subject: string;
  from: string;
  body: string;
  bodyHtml: string;
  to: string;
  supportMailboxEmails?: string[];
}

const FORWARD_SUBJECT_PATTERN = /^\s*(fw|fwd)\s*:/i;

const FORWARD_BODY_MARKERS = [
  '---------- Forwarded message ---------',
  'Begin forwarded message:',
  '-----Original Message-----',
];

const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function normalizeEmailAddress(email: string): string {
  return email.trim().toLowerCase();
}

function parseEmailAddress(value: string): { email: string; display: string } | null {
  const trimmedValue = value.trim();
  if (!trimmedValue) return null;

  const mailtoMatch = trimmedValue.match(/\[mailto:([^\]]+)\]/i);
  if (mailtoMatch?.[1]) {
    const email = mailtoMatch[1].trim();
    const name = trimmedValue.replace(/\[mailto:[^\]]+\]/i, '').trim();
    return {
      email,
      display: name ? `${name} <${email}>` : email,
    };
  }

  const angleBracketMatch = trimmedValue.match(/^(.+?)\s*<([^>]+)>$/);
  if (angleBracketMatch) {
    const name = angleBracketMatch[1].trim().replace(/^"|"$/g, '');
    const email = angleBracketMatch[2].trim();
    return {
      email,
      display: name ? `${name} <${email}>` : email,
    };
  }

  const bareEmailMatch = trimmedValue.match(EMAIL_PATTERN);
  if (bareEmailMatch) {
    const email = bareEmailMatch[0];
    return { email, display: email };
  }

  return null;
}

function getSupportMailboxEmails(supportMailboxEmails: string[] | undefined): string[] {
  const emails = ['info@wyzly.net', ...(supportMailboxEmails ?? [])];
  return [...new Set(emails.map(normalizeEmailAddress))];
}

function isSupportMailboxEmail(email: string, supportMailboxEmails: string[] | undefined): boolean {
  const normalizedEmail = normalizeEmailAddress(email);
  return getSupportMailboxEmails(supportMailboxEmails).includes(normalizedEmail);
}

export function isForwardedEmail(subject: string, body: string, bodyHtml: string): boolean {
  if (FORWARD_SUBJECT_PATTERN.test(subject)) return true;

  const plainBody = body.trim();
  if (plainBody && FORWARD_BODY_MARKERS.some((marker) => plainBody.includes(marker))) {
    return true;
  }

  const strippedHtml = stripHtml(bodyHtml);
  return FORWARD_BODY_MARKERS.some((marker) => strippedHtml.includes(marker));
}

function getForwardedSection(text: string): string {
  let latestMarkerIndex = -1;
  let latestMarkerLength = 0;

  for (const marker of FORWARD_BODY_MARKERS) {
    const markerIndex = text.indexOf(marker);
    if (markerIndex > latestMarkerIndex) {
      latestMarkerIndex = markerIndex;
      latestMarkerLength = marker.length;
    }
  }

  if (latestMarkerIndex === -1) return text;
  return text.slice(latestMarkerIndex + latestMarkerLength);
}

function extractOriginalSenderFromText(
  text: string,
  supportMailboxEmails: string[] | undefined
): { email: string; display: string } | null {
  const forwardedSection = getForwardedSection(text);
  const fromLineMatch = forwardedSection.match(/(?:^|\n)\s*From:\s*(.+?)(?:\n|$)/i);
  if (!fromLineMatch?.[1]) return null;

  const parsedAddress = parseEmailAddress(fromLineMatch[1].trim());
  if (!parsedAddress) return null;
  if (isSupportMailboxEmail(parsedAddress.email, supportMailboxEmails)) return null;

  return parsedAddress;
}

export function extractOriginalSender(
  body: string,
  bodyHtml: string,
  supportMailboxEmails?: string[]
): { email: string; display: string } | null {
  if (body.trim()) {
    const senderFromPlainBody = extractOriginalSenderFromText(body, supportMailboxEmails);
    if (senderFromPlainBody) return senderFromPlainBody;
  }

  if (bodyHtml.trim()) {
    return extractOriginalSenderFromText(stripHtml(bodyHtml), supportMailboxEmails);
  }

  return null;
}

export function resolveReplyTargets(email: ReplyTargetEmailInput): ReplyTargets {
  const forwarderAddress = parseEmailAddress(email.from);
  const fallbackEmail = forwarderAddress?.email ?? email.from.trim();
  const fallbackDisplay = forwarderAddress?.display ?? email.from.trim();

  const directReply: ReplyTargets = {
    replyTo: fallbackEmail,
    replyToDisplay: fallbackDisplay,
    isForwarded: false,
  };

  if (!isForwardedEmail(email.subject, email.body, email.bodyHtml)) {
    return directReply;
  }

  const originalSender = extractOriginalSender(
    email.body,
    email.bodyHtml,
    email.supportMailboxEmails
  );
  if (!originalSender) {
    return {
      ...directReply,
      isForwarded: true,
    };
  }

  const forwarderEmail = normalizeEmailAddress(fallbackEmail);
  const originalEmail = normalizeEmailAddress(originalSender.email);

  if (forwarderEmail === originalEmail) {
    return {
      replyTo: originalSender.email,
      replyToDisplay: originalSender.display,
      isForwarded: true,
    };
  }

  return {
    replyTo: originalSender.email,
    replyToDisplay: originalSender.display,
    replyCc: fallbackEmail,
    replyCcDisplay: fallbackDisplay,
    isForwarded: true,
  };
}
