import { Router, Request, Response } from 'express';
import db from '../db/database.js';
import { workflowEngine } from '../engine/WorkflowEngine.js';

const router = Router();

// POST /api/callback/:token
// Called by external systems to complete an activity without exposing internal IDs.
router.post('/:token', async (req: Request, res: Response) => {
  const { token } = req.params;
  const { outcome, userId, notes } = req.body ?? {};

  const activity = db
    .prepare(
      `SELECT projectId, activityId FROM project_activity WHERE callbackToken = ? AND status = 'active'`
    )
    .get(token) as { projectId: number; activityId: string } | undefined;

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

export default router;
