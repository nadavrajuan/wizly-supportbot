import { getConfiguredAppUrl } from './app-url';
import { listUnreadEmails, sendEmail, type EmailSummary } from './gmail';

const DEFAULT_RECIPIENT = 'daniel@superfy.co';

export interface UnreadReminderResult {
  sent: boolean;
  unreadCount: number;
  recipient?: string;
  reason?: 'no_unread_emails' | 'gmail_not_connected';
}

function getReminderRecipient(): string {
  return process.env.UNREAD_REMINDER_RECIPIENT?.trim() || DEFAULT_RECIPIENT;
}

function buildReminderBody(unreadEmails: EmailSummary[], dashboardUrl: string): string {
  const lines = [
    `You have **${unreadEmails.length} unread email${unreadEmails.length === 1 ? '' : 's'}** in the Wyzly support inbox:`,
    '',
  ];

  unreadEmails.forEach((email, index) => {
    lines.push(
      `${index + 1}. **${email.subject}**`,
      `   From: ${email.from}`,
      `   Date: ${email.date}`,
      `   Preview: ${email.snippet}`,
      ''
    );
  });

  lines.push(`Open the support dashboard: ${dashboardUrl}`);

  return lines.join('\n');
}

export async function sendUnreadReminderIfNeeded(): Promise<UnreadReminderResult> {
  const unreadEmails = await listUnreadEmails(50);

  if (unreadEmails.length === 0) {
    return { sent: false, unreadCount: 0, reason: 'no_unread_emails' };
  }

  const recipient = getReminderRecipient();
  const dashboardUrl = `${getConfiguredAppUrl() ?? 'http://localhost:3000'}/dashboard`;
  const subject = `Wyzly Support — ${unreadEmails.length} unread email${unreadEmails.length === 1 ? '' : 's'}`;
  const body = buildReminderBody(unreadEmails, dashboardUrl);

  await sendEmail({ to: recipient, subject, body });

  return { sent: true, unreadCount: unreadEmails.length, recipient };
}
