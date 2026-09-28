import nodemailer from 'nodemailer';
import { env } from '../config/env';

export async function sendMatchNotification(companyEmail: string, companyName: string, tenderTitle: string, score: number) {
  // External delivery is intentionally disabled in the no-key, no-cost baseline.
  // The matched tender remains available in the authenticated dashboard.
  console.info(`[Notification disabled] ${companyName} <${companyEmail}> matched "${tenderTitle}" (${score}/100).`);
}

export interface DigestItem {
  tenderId: string;
  tenderTitle: string;
  filterName: string;
}

let transporter: ReturnType<typeof nodemailer.createTransport> | null = null;

// Same optional, graceful-fallback pattern as the Gemini API key: if SMTP
// credentials aren't configured, the digest is logged instead of sent so the
// notification engine still works end-to-end (in-app notifications are
// always created regardless of email delivery) in a no-key, no-cost setup.
function getTransporter() {
  if (!env.smtpHost || !env.smtpUser || !env.smtpPass) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.smtpHost,
      port: env.smtpPort,
      secure: env.smtpPort === 465,
      auth: { user: env.smtpUser, pass: env.smtpPass },
    });
  }
  return transporter;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] as string
  ));
}

export async function sendNotificationDigestEmail(to: string, items: DigestItem[]): Promise<void> {
  if (items.length === 0) return;

  const subject = `TenderMatch: ${items.length} new tender${items.length === 1 ? '' : 's'} matching your alerts`;
  const html = `
    <p>Your custom alert rules matched ${items.length} new tender${items.length === 1 ? '' : 's'} in the last 24 hours:</p>
    <ul>
      ${items.map((item) => `<li><strong>${escapeHtml(item.tenderTitle)}</strong> — matched rule "${escapeHtml(item.filterName)}"</li>`).join('')}
    </ul>
    <p>Sign in to TenderMatch to view details and the AI 1-pager summary for each tender.</p>
  `;

  const client = getTransporter();
  if (!client) {
    console.info(`[Notification email disabled] Would send digest to ${to}: ${items.length} match(es).`);
    return;
  }

  try {
    await client.sendMail({ from: env.smtpFrom, to, subject, html });
  } catch (error: any) {
    console.error(`[Notification email] Failed to send digest to ${to}: ${error.message}`);
  }
}
