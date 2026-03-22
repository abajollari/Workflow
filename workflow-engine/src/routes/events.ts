import { Router, Request, Response } from 'express';
import db from '../db/database.js';

const router = Router();

router.get('/:id/events', (req: Request, res: Response) => {
  const projectId = Number(req.params.id);

  const project = db.prepare('SELECT id FROM project WHERE id = ?').get(projectId);
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  const { activityId, eventType, limit = '200' } = req.query as Record<string, string>;

  const conditions: string[] = ['e.projectId = ?'];
  const params: unknown[] = [projectId];

  if (activityId) { conditions.push('e.activityId = ?'); params.push(activityId); }
  if (eventType)  { conditions.push('e.eventType = ?');  params.push(eventType); }

  params.push(Math.min(Number(limit) || 200, 1000));

  const events = db
    .prepare(
      `SELECT e.id, e.projectId, e.projectActivityId, e.eventType, e.activityId,
              e.userId, u.name AS userName, e.payload, e.occurredAt, ad.label AS activityLabel
       FROM activity_event e
       LEFT JOIN user u ON e.userId = u.id
       LEFT JOIN project p ON p.id = e.projectId
       LEFT JOIN activity_definition ad ON ad.activityKey = e.activityId AND ad.versionId = p.workflowVersionId
       WHERE ${conditions.join(' AND ')}
       ORDER BY e.occurredAt DESC
       LIMIT ?`
    )
    .all(...params);

  res.json(events);
});

export default router;
