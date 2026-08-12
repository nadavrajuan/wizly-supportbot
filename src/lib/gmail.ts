import { google, gmail_v1 } from 'googleapis';
import {
  buildMultipartAlternativeBody,
  markdownToHtmlEmail,
  markdownToPlainText,
} from './email-format';
import { resolveReplyTargets, type ReplyTargets } from './email-reply-targets';
import { decodeGmailBase64 } from './gmail-base64';
import { attachmentApiPath } from './email-attachment-url';
import { getDb } from './db';

export { attachmentApiPath } from './email-attachment-url';

export function getOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

export function getAuthUrl(): string {
  const client = getOAuthClient();
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.modify',
      'https://www.googleapis.com/auth/gmail.send',
    ],
  });
}

export function getStoredTokens() {
  const db = getDb();
  return db.prepare('SELECT * FROM gmail_tokens WHERE id = 1').get() as
    | { access_token: string; refresh_token: string; expiry_date: number; account_email: string }
    | undefined;
}

export function saveTokens(tokens: {
  access_token?: string | null;
  refresh_token?: string | null;
  expiry_date?: number | null;
  accountEmail?: string;
}) {
  const db = getDb();
  db.prepare(`
    INSERT INTO gmail_tokens (id, access_token, refresh_token, expiry_date, account_email)
    VALUES (1, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      access_token  = excluded.access_token,
      refresh_token = COALESCE(excluded.refresh_token, refresh_token),
      expiry_date   = excluded.expiry_date,
      account_email = COALESCE(excluded.account_email, account_email)
  `).run(
    tokens.access_token ?? null,
    tokens.refresh_token ?? null,
    tokens.expiry_date ?? null,
    tokens.accountEmail ?? null
  );
}

export async function getAuthenticatedClient() {
  const stored = getStoredTokens();
  if (!stored?.refresh_token) return null;

  const client = getOAuthClient();
  client.setCredentials({
    access_token: stored.access_token,
    refresh_token: stored.refresh_token,
    expiry_date: stored.expiry_date,
  });

  // Persist refreshed tokens automatically
  client.on('tokens', (newTokens) => {
    saveTokens({ ...newTokens, accountEmail: stored.account_email });
  });

  return client;
}

export interface EmailSummary {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  date: string;
  snippet: string;
  isUnread: boolean;
}

export interface EmailAttachment {
  attachmentId: string;
  mimeType: string;
  filename: string;
  contentId?: string;
  size: number;
  inlineData?: string;
}

export interface EmailDetail extends EmailSummary, ReplyTargets {
  body: string;
  bodyHtml: string;
  to: string;
  messageId: string;
  attachments: EmailAttachment[];
}

function extractHeader(headers: gmail_v1.Schema$MessagePartHeader[] | undefined, name: string): string {
  return headers?.find((header) => header.name?.toLowerCase() === name.toLowerCase())?.value ?? '';
}

function normalizeContentId(contentId: string): string {
  return contentId.replace(/^<|>$/g, '');
}

function extractFilenameFromDisposition(contentDisposition: string): string {
  const filenameMatch = contentDisposition.match(/filename="([^"]+)"/i)
    ?? contentDisposition.match(/filename=([^;\s]+)/i);
  return filenameMatch?.[1]?.trim() ?? '';
}

function findPartWithAttachmentId(
  part: gmail_v1.Schema$MessagePart | undefined,
  attachmentId: string
): gmail_v1.Schema$MessagePart | null {
  if (!part) return null;

  if (part.body?.attachmentId === attachmentId) return part;
  if (part.partId === attachmentId && part.body?.data) return part;

  for (const childPart of part.parts ?? []) {
    const match = findPartWithAttachmentId(childPart, attachmentId);
    if (match) return match;
  }

  return null;
}

function collectAttachments(
  part: gmail_v1.Schema$MessagePart | undefined,
  attachments: EmailAttachment[]
): void {
  if (!part) return;

  const gmailAttachmentId = part.body?.attachmentId;
  const inlineData = part.body?.data;
  const mimeType = part.mimeType ?? 'application/octet-stream';
  const isImagePart = mimeType.startsWith('image/');
  const contentId = normalizeContentId(extractHeader(part.headers, 'Content-ID'));
  const contentDisposition = extractHeader(part.headers, 'Content-Disposition');
  const filename = part.filename
    || extractFilenameFromDisposition(contentDisposition)
    || (isImagePart ? `image.${mimeType.split('/')[1] ?? 'bin'}` : 'attachment');

  if (gmailAttachmentId) {
    attachments.push({
      attachmentId: gmailAttachmentId,
      mimeType,
      filename,
      contentId: contentId || undefined,
      size: part.body?.size ?? 0,
    });
  } else if (inlineData && isImagePart) {
    const inlineAttachmentId = part.partId ?? `inline-${contentId || attachments.length}`;
    attachments.push({
      attachmentId: inlineAttachmentId,
      mimeType,
      filename,
      contentId: contentId || undefined,
      size: part.body?.size ?? inlineData.length,
      inlineData,
    });
  }

  for (const childPart of part.parts ?? []) {
    collectAttachments(childPart, attachments);
  }
}

function contentIdsMatch(reference: string, contentId: string): boolean {
  const normalizedReference = normalizeContentId(reference);
  const normalizedContentId = normalizeContentId(contentId);
  if (!normalizedReference || !normalizedContentId) return false;
  if (normalizedReference === normalizedContentId) return true;

  const referenceLocalPart = normalizedReference.split('@')[0];
  const contentIdLocalPart = normalizedContentId.split('@')[0];
  return referenceLocalPart === contentIdLocalPart;
}

function rewriteCidReferences(
  html: string,
  messageId: string,
  attachments: EmailAttachment[]
): string {
  if (!html) return html;

  return html.replace(/cid:([^"'\s>]+)/gi, (match, contentIdReference: string) => {
    const attachment = attachments.find(
      (entry) => entry.contentId && contentIdsMatch(contentIdReference, entry.contentId)
    );
    if (!attachment) return match;
    return attachmentApiPath(messageId, attachment.attachmentId);
  });
}

function decodeBody(part: gmail_v1.Schema$MessagePart): { text: string; html: string } {
  if (!part) return { text: '', html: '' };

  if (part.mimeType === 'text/plain' && part.body?.data) {
    return { text: Buffer.from(part.body.data, 'base64url').toString('utf-8'), html: '' };
  }
  if (part.mimeType === 'text/html' && part.body?.data) {
    const html = Buffer.from(part.body.data, 'base64url').toString('utf-8');
    return { text: stripHtml(html), html };
  }

  if (part.parts) {
    let text = '';
    let html = '';
    for (const p of part.parts) {
      const decoded = decodeBody(p);
      if (!text && decoded.text) text = decoded.text;
      if (!html && decoded.html) html = decoded.html;
    }
    return { text, html };
  }

  return { text: '', html: '' };
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

async function fetchEmailSummaries(
  gmail: gmail_v1.Gmail,
  messageIds: string[]
): Promise<EmailSummary[]> {
  if (messageIds.length === 0) return [];

  const details = await Promise.all(
    messageIds.map((messageId) =>
      gmail.users.messages.get({
        userId: 'me',
        id: messageId,
        format: 'metadata',
        metadataHeaders: ['Subject', 'From', 'Date'],
      })
    )
  );

  return details.map((detail) => {
    const message = detail.data;
    const headers = message.payload?.headers ?? [];
    return {
      id: message.id!,
      threadId: message.threadId!,
      subject: extractHeader(headers, 'Subject') || '(no subject)',
      from: extractHeader(headers, 'From'),
      date: extractHeader(headers, 'Date'),
      snippet: message.snippet ?? '',
      isUnread: (message.labelIds ?? []).includes('UNREAD'),
    };
  });
}

export async function listEmails(maxResults = 50): Promise<EmailSummary[]> {
  const auth = await getAuthenticatedClient();
  if (!auth) return [];

  const gmail = google.gmail({ version: 'v1', auth });
  const list = await gmail.users.messages.list({
    userId: 'me',
    maxResults,
    q: 'in:inbox',
  });

  const messageIds = (list.data.messages ?? []).map((message) => message.id!);
  return fetchEmailSummaries(gmail, messageIds);
}

export async function listUnreadEmails(maxResults = 50): Promise<EmailSummary[]> {
  const auth = await getAuthenticatedClient();
  if (!auth) return [];

  const gmail = google.gmail({ version: 'v1', auth });
  const list = await gmail.users.messages.list({
    userId: 'me',
    maxResults,
    q: 'in:inbox is:unread',
  });

  const messageIds = (list.data.messages ?? []).map((message) => message.id!);
  return fetchEmailSummaries(gmail, messageIds);
}

export async function getEmail(id: string): Promise<EmailDetail | null> {
  const auth = await getAuthenticatedClient();
  if (!auth) return null;

  const gmail = google.gmail({ version: 'v1', auth });
  const msg = await gmail.users.messages.get({ userId: 'me', id, format: 'full' });

  const payload = msg.data.payload as gmail_v1.Schema$MessagePart;
  const headers = payload?.headers ?? [];
  const { text, html } = decodeBody(payload);
  const attachments: EmailAttachment[] = [];
  collectAttachments(payload, attachments);
  const bodyHtml = rewriteCidReferences(html, id, attachments);
  const storedTokens = getStoredTokens();
  const replyTargets = resolveReplyTargets({
    subject: extractHeader(headers, 'Subject') || '(no subject)',
    from: extractHeader(headers, 'From'),
    to: extractHeader(headers, 'To'),
    body: text,
    bodyHtml,
    supportMailboxEmails: storedTokens?.account_email ? [storedTokens.account_email] : [],
  });

  return {
    id: msg.data.id!,
    threadId: msg.data.threadId!,
    subject: extractHeader(headers, 'Subject') || '(no subject)',
    from: extractHeader(headers, 'From'),
    to: extractHeader(headers, 'To'),
    date: extractHeader(headers, 'Date'),
    messageId: extractHeader(headers, 'Message-ID'),
    snippet: msg.data.snippet ?? '',
    body: text,
    bodyHtml,
    attachments,
    isUnread: (msg.data.labelIds ?? []).includes('UNREAD'),
    ...replyTargets,
  };
}

export async function getAttachmentBytes(
  messageId: string,
  attachmentId: string
): Promise<{ data: Buffer; mimeType: string } | null> {
  const auth = await getAuthenticatedClient();
  if (!auth) return null;

  const gmail = google.gmail({ version: 'v1', auth });

  let message;
  try {
    message = await gmail.users.messages.get({ userId: 'me', id: messageId, format: 'full' });
  } catch (error) {
    console.error('Failed to load message for attachment:', error);
    return null;
  }

  const payload = message.data.payload as gmail_v1.Schema$MessagePart;
  const matchingPart = findPartWithAttachmentId(payload, attachmentId);

  if (matchingPart?.body?.data && !matchingPart.body.attachmentId) {
    return {
      data: decodeGmailBase64(matchingPart.body.data),
      mimeType: matchingPart.mimeType ?? 'application/octet-stream',
    };
  }

  const gmailAttachmentId = matchingPart?.body?.attachmentId ?? attachmentId;

  try {
    const response = await gmail.users.messages.attachments.get({
      userId: 'me',
      messageId,
      id: gmailAttachmentId,
    });

    if (!response.data.data) return null;

    return {
      data: decodeGmailBase64(response.data.data),
      mimeType: matchingPart?.mimeType ?? 'application/octet-stream',
    };
  } catch (error) {
    console.error('Failed to fetch Gmail attachment bytes:', error);
    return null;
  }
}

export async function markAsRead(id: string): Promise<void> {
  const auth = await getAuthenticatedClient();
  if (!auth) throw new Error('Gmail not connected');

  const gmail = google.gmail({ version: 'v1', auth });
  await gmail.users.messages.modify({
    userId: 'me',
    id,
    requestBody: { removeLabelIds: ['UNREAD'] },
  });
}

export async function sendEmail(params: {
  to: string;
  subject: string;
  body: string;
}): Promise<void> {
  const auth = await getAuthenticatedClient();
  if (!auth) throw new Error('Gmail not connected');

  const gmail = google.gmail({ version: 'v1', auth });

  const plainBody = markdownToPlainText(params.body);
  const htmlBody = markdownToHtmlEmail(params.body);
  const { boundary, body: multipartBody } = buildMultipartAlternativeBody(plainBody, htmlBody);

  const headers = [
    `To: ${params.to}`,
    `Subject: ${params.subject}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    multipartBody,
  ];

  const rawMessage = headers.join('\r\n');
  const encoded = Buffer.from(rawMessage).toString('base64url');

  await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw: encoded },
  });
}

export async function sendReply(params: {
  to: string;
  cc?: string;
  subject: string;
  body: string;
  threadId: string;
  inReplyTo?: string;
}): Promise<void> {
  const auth = await getAuthenticatedClient();
  if (!auth) throw new Error('Gmail not connected');

  const gmail = google.gmail({ version: 'v1', auth });

  const plainBody = markdownToPlainText(params.body);
  const htmlBody = markdownToHtmlEmail(params.body);
  const { boundary, body: multipartBody } = buildMultipartAlternativeBody(plainBody, htmlBody);

  const headers = [`To: ${params.to}`];
  if (params.cc) {
    headers.push(`Cc: ${params.cc}`);
  }
  headers.push(
    `Subject: ${params.subject.startsWith('Re:') ? params.subject : `Re: ${params.subject}`}`,
    `In-Reply-To: ${params.inReplyTo ?? ''}`,
    `References: ${params.inReplyTo ?? ''}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    multipartBody
  );

  const rawMessage = headers.join('\r\n');

  const encoded = Buffer.from(rawMessage).toString('base64url');

  await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw: encoded, threadId: params.threadId },
  });
}
