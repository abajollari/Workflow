import { Router, Request, Response } from 'express';
import db from '../db/database.js';
import { workflowEngine } from '../engine/WorkflowEngine.js';

const router = Router();

function lookupToken(token: string): { projectId: number; activityId: string } | undefined {
  return db
    .prepare(`SELECT projectId, activityId FROM project_activity WHERE callbackToken = ? AND status = 'active'`)
    .get(token) as { projectId: number; activityId: string } | undefined;
}

function htmlPage(title: string, message: string, isError = false): string {
  const colour = isError ? '#ef4444' : '#22c55e';
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>${title}</title></head>
<body style="font-family:sans-serif;max-width:480px;margin:80px auto;text-align:center;color:#333">
  <div style="border:2px solid ${colour};border-radius:12px;padding:40px">
    <h2 style="color:${colour};margin-top:0">${title}</h2>
    <p>${message}</p>
  </div>
</body>
</html>`;
}

// POST /api/callback/:token
// For automated external systems — accepts JSON body { outcome, userId, notes }
router.post('/:token', async (req: Request, res: Response) => {
  const token = String(req.params['token']);
  const { outcome, userId, notes } = req.body ?? {};

  const activity = lookupToken(token);
  if (!activity) {
    res.status(404).json({ error: 'Invalid or expired callback token' });
    return;
  }

  try {
    const activated = await workflowEngine.completeActivity(activity.projectId, activity.activityId, {
      outcome,
      userId: userId != null ? Number(userId) : undefined,
      notes,
    });
    res.json({ activated });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/callback/:token/approve
// Magic link for human approvers — completes the activity with outcome 'yes'
router.get('/:token/approve', async (req: Request, res: Response) => {
  const activity = lookupToken(String(req.params['token']));
  if (!activity) {
    res.status(404).send(htmlPage('Link Expired', 'This approval link is no longer valid. The activity may have already been completed.', true));
    return;
  }
  try {
    await workflowEngine.completeActivity(activity.projectId, activity.activityId, { outcome: 'yes' });
    res.send(htmlPage('Approved', 'The activity has been approved. The workflow will continue automatically.'));
  } catch (err: any) {
    res.status(400).send(htmlPage('Error', err.message, true));
  }
});

// GET /api/callback/:token/reject
// Magic link for human approvers — completes the activity with outcome 'no'
router.get('/:token/reject', async (req: Request, res: Response) => {
  const activity = lookupToken(String(req.params['token']));
  if (!activity) {
    res.status(404).send(htmlPage('Link Expired', 'This rejection link is no longer valid. The activity may have already been completed.', true));
    return;
  }
  try {
    await workflowEngine.completeActivity(activity.projectId, activity.activityId, { outcome: 'no' });
    res.send(htmlPage('Rejected', 'The activity has been rejected. The workflow has been updated accordingly.'));
  } catch (err: any) {
    res.status(400).send(htmlPage('Error', err.message, true));
  }
});

export default router;
