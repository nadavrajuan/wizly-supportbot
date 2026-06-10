import { google, gmail_v1 } from 'googleapis';
import { getDb } from './db';

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

export interface EmailDetail extends EmailSummary {
  body: string;
  bodyHtml: string;
  to: string;
  messageId: string;
}

function extractHeader(headers: gmail_v1.Schema$MessagePartHeader[], name: string): string {
  return headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? '';
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

export async function listEmails(maxResults = 50): Promise<EmailSummary[]> {
  const auth = await getAuthenticatedClient();
  if (!auth) return [];

  const gmail = google.gmail({ version: 'v1', auth });
  const list = await gmail.users.messages.list({
    userId: 'me',
    maxResults,
    q: 'in:inbox',
  });

  const messages = list.data.messages ?? [];

  const details = await Promise.all(
    messages.map((m) =>
      gmail.users.messages.get({ userId: 'me', id: m.id!, format: 'metadata',
        metadataHeaders: ['Subject', 'From', 'Date'] })
    )
  );

  return details.map((d) => {
    const msg = d.data;
    const headers = msg.payload?.headers ?? [];
    return {
      id: msg.id!,
      threadId: msg.threadId!,
      subject: extractHeader(headers, 'Subject') || '(no subject)',
      from: extractHeader(headers, 'From'),
      date: extractHeader(headers, 'Date'),
      snippet: msg.snippet ?? '',
      isUnread: (msg.labelIds ?? []).includes('UNREAD'),
    };
  });
}

export async function getEmail(id: string): Promise<EmailDetail | null> {
  const auth = await getAuthenticatedClient();
  if (!auth) return null;

  const gmail = google.gmail({ version: 'v1', auth });
  const msg = await gmail.users.messages.get({ userId: 'me', id, format: 'full' });

  const headers = msg.data.payload?.headers ?? [];
  const { text, html } = decodeBody(msg.data.payload as gmail_v1.Schema$MessagePart);

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
    bodyHtml: html,
    isUnread: (msg.data.labelIds ?? []).includes('UNREAD'),
  };
}

export async function markAsRead(id: string): Promise<void> {
  const auth = await getAuthenticatedClient();
  if (!auth) return;

  const gmail = google.gmail({ version: 'v1', auth });
  await gmail.users.messages.modify({
    userId: 'me',
    id,
    requestBody: { removeLabelIds: ['UNREAD'] },
  });
}

export async function sendReply(params: {
  to: string;
  subject: string;
  body: string;
  threadId: string;
  inReplyTo?: string;
}): Promise<void> {
  const auth = await getAuthenticatedClient();
  if (!auth) return;

  const gmail = google.gmail({ version: 'v1', auth });

  const rawMessage = [
    `To: ${params.to}`,
    `Subject: ${params.subject.startsWith('Re:') ? params.subject : `Re: ${params.subject}`}`,
    `In-Reply-To: ${params.inReplyTo ?? ''}`,
    `References: ${params.inReplyTo ?? ''}`,
    'Content-Type: text/plain; charset=utf-8',
    '',
    params.body,
  ].join('\r\n');

  const encoded = Buffer.from(rawMessage).toString('base64url');

  await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw: encoded, threadId: params.threadId },
  });
}
