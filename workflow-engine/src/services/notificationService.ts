import db from '../db/database.js';
import { sendMagicLinkEmail } from './email.service.js';

const baseUrl = () =>
  process.env['BASE_URL'] ?? `http://localhost:${process.env['PORT'] ?? 3001}`;

/** Fire-and-forget HTTP POST to all webhook subscribers for the given activityKey. */
export function notifyWebhooks(
  projectId: number,
  activityKey: string,
  activityLabel: string,
  callbackToken: string
): void {
  const subscriptions = db
    .prepare(`SELECT url, secret FROM webhook_subscription WHERE activityKey = ?`)
    .all(activityKey) as { url: string; secret: string | null }[];

  if (subscriptions.length === 0) return;

  const callbackUrl = `${baseUrl()}/api/callback/${callbackToken}`;
  const payload = JSON.stringify({
    event: 'activity.activated',
    projectId,
    activityId: activityKey,
    activityLabel,
    callbackUrl,
    timestamp: new Date().toISOString(),
  });

  for (const sub of subscriptions) {
    fetch(sub.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(sub.secret ? { 'X-Webhook-Secret': sub.secret } : {}),
      },
      body: payload,
    })
      .then((r) => console.log(`[webhook] delivered to ${sub.url} — status ${r.status}`))
      .catch((err: Error) => console.error(`[webhook] delivery failed for ${sub.url}:`, err.message));
  }
}

/** Fire-and-forget email to all email subscribers for the given activityKey. */
export function notifyEmailSubscribers(
  projectId: number,
  activityKey: string,
  activityLabel: string,
  callbackToken: string
): void {
  const subscribers = db
    .prepare(`SELECT email, name FROM email_subscription WHERE activityKey = ?`)
    .all(activityKey) as { email: string; name: string | null }[];

  if (subscribers.length === 0) return;

  const base = baseUrl();
  const approveUrl = `${base}/api/callback/${callbackToken}/approve`;
  const rejectUrl  = `${base}/api/callback/${callbackToken}/reject`;

  for (const sub of subscribers) {
    sendMagicLinkEmail({
      to: sub.email,
      toName: sub.name,
      activityLabel,
      projectId,
      approveUrl,
      rejectUrl,
    }).catch((err: Error) =>
      console.error(`[email] delivery failed for ${sub.email}:`, err.message)
    );
  }
}
