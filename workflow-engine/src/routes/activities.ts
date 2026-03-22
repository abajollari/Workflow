import { Router, Request, Response } from 'express';
import db from '../db/database.js';
import { workflowEngine } from '../engine/WorkflowEngine.js';

const router = Router();

// GET /api/projects/:id/activities
router.get('/:id/activities', (req: Request, res: Response) => {
  const projectId = Number(req.params.id);
  const project = db.prepare('SELECT id FROM project WHERE id = ?').get(projectId);
  if (!project) { res.status(404).json({ error: 'Project not found' }); return; }

  const activities = db
    .prepare(
      `SELECT ps.*,
              ad.label, ad.nodeType, ad.teamId, ad.actionType,
              t.name AS teamName,
              json_group_array(
                CASE WHEN a.id IS NOT NULL
                  THEN json_object(
                    'id', a.id, 'userId', a.userId, 'assignedAt', a.assignedAt,
                    'completedAt', a.completedAt, 'notes', a.notes, 'userName', u.name
                  )
                  ELSE NULL
                END
              ) AS assignments
       FROM project_activity ps
       JOIN project p ON p.id = ps.projectId
       JOIN activity_definition ad ON ad.activityKey = ps.activityId AND ad.versionId = p.workflowVersionId
       LEFT JOIN team t ON ad.teamId = t.id
       LEFT JOIN assignment a ON a.projectActivityId = ps.id
       LEFT JOIN user u ON a.userId = u.id
       WHERE ps.projectId = ?
       GROUP BY ps.id
       ORDER BY ps.createdAt`
    )
    .all(projectId);

  res.json(activities);
});

// POST /api/projects/:id/activities/:activityId/complete
router.post('/:id/activities/:activityId/complete', (req: Request, res: Response) => {
  const projectId = Number(req.params.id);
  const { activityId } = req.params as { activityId: string };
  const { outcome, userId, notes } = req.body ?? {};

  const project = db.prepare('SELECT id FROM project WHERE id = ?').get(projectId);
  if (!project) { res.status(404).json({ error: 'Project not found' }); return; }

  try {
    // workflowEngine.completeActivity already publishes the Kafka event internally
    const activated = workflowEngine.completeActivity(projectId, activityId, { outcome, userId, notes });
    res.json({ activated });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/projects/:id/activities/:activityId/set-active
router.post('/:id/activities/:activityId/set-active', (req: Request, res: Response) => {
  const projectId = Number(req.params.id);
  const { activityId } = req.params as { activityId: string };

  const project = db.prepare('SELECT * FROM project WHERE id = ?').get(projectId) as { workflowVersionId: number } | undefined;
  if (!project) { res.status(404).json({ error: 'Project not found' }); return; }

  try {
    // BFS to find all activities reachable forward from activityId
    const forwardKeys = new Set<string>();
    const queue = [activityId];
    const transitionStmt = db.prepare(`
      SELECT ad.activityKey
      FROM activity_transition t
      JOIN activity_definition ad ON ad.id = t.toActivityId
      WHERE t.fromActivityId = (SELECT id FROM activity_definition WHERE activityKey = ? AND versionId = ?)
    `);

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (forwardKeys.has(current)) continue;
      forwardKeys.add(current);
      const next = transitionStmt.all(current, project.workflowVersionId) as { activityKey: string }[];
      next.forEach(n => queue.push(n.activityKey));
    }

    const placeholders = [...forwardKeys].map(() => '?').join(', ');
    db.prepare(
      `UPDATE project_activity SET status = 'pending', completedAt = NULL, decisionOutcome = NULL
       WHERE projectId = ? AND activityId IN (${placeholders}) AND status IN ('active', 'completed')`
    ).run(projectId, ...[...forwardKeys]);

    const activated = workflowEngine.activateActivityPublic(projectId, activityId);
    db.prepare(`UPDATE project SET activity = ?, updatedAt = datetime('now') WHERE id = ?`).run(activityId, projectId);
    res.json(activated);
  } catch (err: any) {
    console.error('[set-active]', err.message);
    res.status(400).json({ error: err.message });
  }
});

// POST /api/projects/:id/activities/:activityId/reject
router.post('/:id/activities/:activityId/reject', (req: Request, res: Response) => {
  const projectId = Number(req.params.id);
  const { activityId } = req.params as { activityId: string };
  const { notes } = req.body ?? {};

  const project = db.prepare('SELECT id FROM project WHERE id = ?').get(projectId);
  if (!project) { res.status(404).json({ error: 'Project not found' }); return; }

  try {
    const existing = db
      .prepare(`SELECT id FROM project_activity WHERE projectId = ? AND activityId = ? AND status IN ('active', 'completed')`)
      .get(projectId, activityId);
    if (!existing) workflowEngine.activateActivityPublic(projectId, activityId);

    // workflowEngine.completeActivity publishes Kafka event internally
    const activated = workflowEngine.completeActivity(projectId, activityId, { outcome: 'no', notes });
    res.json({ activated });
  } catch (err: any) {
    console.error('[reject]', err.message);
    res.status(400).json({ error: err.message });
  }
});

// POST /api/projects/:id/activities/:activityId/trigger
router.post('/:id/activities/:activityId/trigger', (req: Request, res: Response) => {
  const projectId = Number(req.params.id);
  const { activityId } = req.params;

  const project = db.prepare('SELECT id FROM project WHERE id = ?').get(projectId);
  if (!project) { res.status(404).json({ error: 'Project not found' }); return; }

  try {
    const override = req.body && typeof req.body === 'object' && Object.keys(req.body).length > 0
      ? req.body as Record<string, unknown>
      : undefined;
    workflowEngine.triggerActivity(projectId, activityId, override);
    res.status(202).json({ status: 'triggered' });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/projects/:id/activities/:activityId/assign
router.post('/:id/activities/:activityId/assign', (req: Request, res: Response) => {
  const projectId = Number(req.params.id);
  const { activityId } = req.params;
  const { userId } = req.body ?? {};

  if (!userId) { res.status(400).json({ error: 'userId is required' }); return; }

  const projectActivity = db
    .prepare(`SELECT * FROM project_activity WHERE projectId = ? AND activityId = ? AND status = 'active'`)
    .get(projectId, activityId) as { id: number } | undefined;
  if (!projectActivity) { res.status(404).json({ error: 'No active activity found' }); return; }

  try {
    const assignment = workflowEngine.assignUser(projectActivity.id, Number(userId));
    res.status(201).json(assignment);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/projects/:id/activities/:activityId/tasks
router.get('/:id/activities/:activityId/tasks', (req: Request, res: Response) => {
  const projectId = Number(req.params.id);
  const { activityId } = req.params;

  const ps = db
    .prepare(`SELECT id FROM project_activity WHERE projectId = ? AND activityId = ? ORDER BY createdAt DESC LIMIT 1`)
    .get(projectId, activityId) as { id: number } | undefined;

  if (!ps) {
    const templates = db
      .prepare(
        `SELECT st.id AS activityTaskId, st.title, st.description, st.orderIndex,
                NULL AS id, 0 AS completed, NULL AS completedAt, 'new' AS status
         FROM activity_task st
         JOIN activity_definition ad ON st.activityDefId = ad.id
         WHERE ad.activityKey = ? AND ad.versionId = (SELECT workflowVersionId FROM project WHERE id = ?)
         ORDER BY st.orderIndex`
      )
      .all(activityId, projectId);
    res.json(templates);
    return;
  }

  const tasks = db
    .prepare(
      `SELECT pst.id, pst.activityTaskId, pst.completed, pst.completedAt, pst.status,
              st.title, st.description, st.orderIndex
       FROM project_activity_task pst
       JOIN activity_task st ON pst.activityTaskId = st.id
       WHERE pst.projectActivityId = ?
       ORDER BY st.orderIndex`
    )
    .all(ps.id);

  res.json(tasks);
});

const VALID_TASK_STATUSES = new Set(['new', 'in_progress', 'done']);

// PATCH /api/projects/:id/activities/:activityId/tasks/:taskId
router.patch('/:id/activities/:activityId/tasks/:taskId', (req: Request, res: Response) => {
  const taskId = Number(req.params.taskId);
  const { status, userId } = req.body ?? {};

  if (!status || !VALID_TASK_STATUSES.has(status)) {
    res.status(400).json({ error: 'status must be one of: new, in_progress, done' });
    return;
  }

  const context = db
    .prepare(
      `SELECT pst.id, ps.id AS projectActivityId, ps.projectId, ps.activityId, st.title
       FROM project_activity_task pst
       JOIN project_activity ps ON pst.projectActivityId = ps.id
       JOIN activity_task st ON pst.activityTaskId = st.id
       WHERE pst.id = ?`
    )
    .get(taskId) as { id: number; projectActivityId: number; projectId: number; activityId: string; title: string } | undefined;

  if (!context) { res.status(404).json({ error: 'Task not found' }); return; }

  const completedInt = status === 'done' ? 1 : 0;
  db.prepare(
    `UPDATE project_activity_task
     SET status = ?, completed = ?, completedAt = CASE WHEN ? = 'done' THEN datetime('now') ELSE NULL END
     WHERE id = ?`
  ).run(status, completedInt, status, taskId);

  if (status === 'in_progress' || status === 'done') {
    const eventType = status === 'done' ? 'task.completed' : 'task.started';
    db.prepare(
      `INSERT INTO activity_event (projectId, projectActivityId, eventType, activityId, userId, payload)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(context.projectId, context.projectActivityId, eventType, context.activityId, userId ?? null, JSON.stringify({ taskId, title: context.title }));
  }

  const updated = db
    .prepare(
      `SELECT pst.id, pst.activityTaskId, pst.completed, pst.completedAt, pst.status,
              st.title, st.description, st.orderIndex
       FROM project_activity_task pst
       JOIN activity_task st ON pst.activityTaskId = st.id
       WHERE pst.id = ?`
    )
    .get(taskId);

  res.json(updated);
});

export default router;
