// Option B — Polling (pull for legacy/scheduled systems)
// Exteranl systems can poll for pending activities using this endpoint, then call the callback URLs to approve/reject them.

import { Router, Request, Response } from 'express';
import db from '../db/database.js';

const router = Router();

const POLLING_API_KEY = process.env['POLLING_API_KEY'];

function authenticate(req: Request, res: Response): boolean {
  if (!POLLING_API_KEY) return true; // no key configured — open access (dev mode)

  const provided =
    (req.headers['x-api-key'] as string | undefined) ??
    (req.query['apiKey'] as string | undefined);

  if (provided !== POLLING_API_KEY) {
    res.status(401).json({ error: 'Invalid or missing API key' });
    return false;
  }
  return true;
}

// GET /api/activities/pending
// Optional query params:
//   ?activityKey=review-document   — filter by activity type
//   ?projectId=42                  — filter by project
//
// Auth: X-Api-Key header or ?apiKey= query param (compared to POLLING_API_KEY env var)
router.get('/', (req: Request, res: Response) => {
  if (!authenticate(req, res)) return;

  const baseUrl =
    process.env['BASE_URL'] ?? `http://localhost:${process.env['PORT'] ?? 3001}`;

  const { activityKey, projectId } = req.query as Record<string, string | undefined>;

  const conditions: string[] = [`pa.status = 'active'`, `pa.callbackToken IS NOT NULL`];
  const params: unknown[] = [];

  if (activityKey) {
    conditions.push(`pa.activityId = ?`);
    params.push(activityKey);
  }
  if (projectId) {
    conditions.push(`pa.projectId = ?`);
    params.push(Number(projectId));
  }

  const rows = db
    .prepare(
      `SELECT
         pa.projectId,
         pa.activityId,
         pa.callbackToken,
         pa.startedAt,
         ad.label      AS activityLabel,
         p.accountNumber,
         p.accountName
       FROM project_activity pa
       JOIN project p ON p.id = pa.projectId
       JOIN activity_definition ad
         ON ad.activityKey = pa.activityId AND ad.versionId = p.workflowVersionId
       WHERE ${conditions.join(' AND ')}
       ORDER BY pa.startedAt ASC`
    )
    .all(...params) as {
      projectId: number;
      activityId: string;
      callbackToken: string;
      startedAt: string;
      activityLabel: string;
      accountNumber: string;
      accountName: string;
    }[];

  const result = rows.map(({ callbackToken, ...rest }) => ({
    ...rest,
    callbackUrl: `${baseUrl}/api/callback/${callbackToken}`,
    approveUrl:  `${baseUrl}/api/callback/${callbackToken}/approve`,
    rejectUrl:   `${baseUrl}/api/callback/${callbackToken}/reject`,
  }));

  res.json(result);
});

export default router;
