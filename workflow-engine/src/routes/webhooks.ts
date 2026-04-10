import { Router, Request, Response } from 'express';
import db from '../db/database.js';

const router = Router();

// ---------------------------------------------------------------------------
// Option A — Webhook subscriptions
// Push notifications to external services via webhooks when activities occur. Each subscription includes an activity key, a callback URL, and an optional secret for signing payloads. The system sends POST requests to the specified URL with details about the activity whenever it occurs.
// Webhook URL is defineed in the external application, and the workflow engine will send a POST request to that URL when the specified activity occurs. The payload of the POST request will contain details about the activity, such as the activity key, timestamp, and any relevant data. If a secret is provided during subscription, the workflow engine will sign the payload using HMAC with the secret and include the signature in the request headers for verification by the external application.
// The external system just needs to be able to receive an HTTP POST and make an HTTP POST 
// THis file implements the API endpoints for managing webhook subscriptions. See notificationService.ts for the code that triggers the webhooks when activities occur in the workflow engine.
// ---------------------------------------------------------------------------

// GET /api/webhooks
router.get('/', (_req: Request, res: Response) => {
  const rows = db.prepare(`SELECT * FROM webhook_subscription ORDER BY createdAt DESC`).all();
  res.json(rows);
});

// POST /api/webhooks  { activityKey, url, secret? }
router.post('/', (req: Request, res: Response) => {
  const { activityKey, url, secret } = req.body ?? {};
  if (!activityKey || !url) {
    res.status(400).json({ error: 'activityKey and url are required' });
    return;
  }
  const result = db
    .prepare(`INSERT INTO webhook_subscription (activityKey, url, secret) VALUES (?, ?, ?)`)
    .run(activityKey, url, secret ?? null);
  const row = db.prepare(`SELECT * FROM webhook_subscription WHERE id = ?`).get(result.lastInsertRowid);
  res.status(201).json(row);
});

// DELETE /api/webhooks/:id
router.delete('/:id', (req: Request, res: Response) => {
  const id = Number(req.params['id']);
  const row = db.prepare(`SELECT id FROM webhook_subscription WHERE id = ?`).get(id);
  if (!row) { res.status(404).json({ error: 'Webhook subscription not found' }); return; }
  db.prepare(`DELETE FROM webhook_subscription WHERE id = ?`).run(id);
  res.status(204).send();
});

// ---------------------------------------------------------------------------
// Option C — Email subscriptions
// ---------------------------------------------------------------------------

// GET /api/webhooks/emails
router.get('/emails', (_req: Request, res: Response) => {
  const rows = db.prepare(`SELECT * FROM email_subscription ORDER BY createdAt DESC`).all();
  res.json(rows);
});

// POST /api/webhooks/emails  { activityKey, email, name? }
router.post('/emails', (req: Request, res: Response) => {
  const { activityKey, email, name } = req.body ?? {};
  if (!activityKey || !email) {
    res.status(400).json({ error: 'activityKey and email are required' });
    return;
  }
  const result = db
    .prepare(`INSERT INTO email_subscription (activityKey, email, name) VALUES (?, ?, ?)`)
    .run(activityKey, email, name ?? null);
  const row = db.prepare(`SELECT * FROM email_subscription WHERE id = ?`).get(result.lastInsertRowid);
  res.status(201).json(row);
});

// DELETE /api/webhooks/emails/:id
router.delete('/emails/:id', (req: Request, res: Response) => {
  const id = Number(req.params['id']);
  const row = db.prepare(`SELECT id FROM email_subscription WHERE id = ?`).get(id);
  if (!row) { res.status(404).json({ error: 'Email subscription not found' }); return; }
  db.prepare(`DELETE FROM email_subscription WHERE id = ?`).run(id);
  res.status(204).send();
});

export default router;
