import { Router, Request, Response } from 'express';
import db from '../db/database.js';
import { workflowEngine } from '../engine/WorkflowEngine.js';

const router = Router();

function getActiveVersionId(): number {
  const v = db.prepare('SELECT id FROM workflow_version WHERE isActive = 1 LIMIT 1').get() as { id: number } | undefined;
  if (!v) throw new Error('No active workflow version');
  return v.id;
}

function isValidActivity(activityKey: string, versionId: number): boolean {
  return !!db.prepare('SELECT 1 FROM activity_definition WHERE activityKey = ? AND versionId = ?').get(activityKey, versionId);
}

router.get('/', (_req: Request, res: Response) => {
  const projects = db.prepare('SELECT * FROM project ORDER BY id').all();
  res.json(projects);
});

router.get('/:id', (req: Request, res: Response) => {
  const project = db.prepare('SELECT * FROM project WHERE id = ?').get(req.params.id);
  if (!project) { res.status(404).json({ error: 'Project not found' }); return; }
  res.json(project);
});

router.post('/', (req: Request, res: Response) => {
  const { accountNumber, accountName, activity = 'start' } = req.body;

  if (!accountNumber || !accountName || !activity) {
    res.status(400).json({ error: 'accountNumber, accountName, and activity are required' });
    return;
  }

  const versionId = getActiveVersionId();
  if (!isValidActivity(activity, versionId)) {
    res.status(400).json({ error: `Invalid activity: '${activity}'` });
    return;
  }

  try {
    const result = db
      .prepare('INSERT INTO project (accountNumber, accountName, activity, workflowVersionId) VALUES (?, ?, ?, ?)')
      .run(accountNumber, accountName, activity, versionId);
    const projectId = result.lastInsertRowid as number;
    workflowEngine.initProject(projectId);
    const created = db.prepare('SELECT * FROM project WHERE id = ?').get(projectId);
    res.status(201).json(created);
  } catch (err: any) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      res.status(409).json({ error: 'accountNumber already exists' });
      return;
    }
    throw err;
  }
});

router.patch('/:id', (req: Request, res: Response) => {
  const { accountName, activity } = req.body;

  const existing = db.prepare('SELECT * FROM project WHERE id = ?').get(req.params.id) as { workflowVersionId: number } | undefined;
  if (!existing) { res.status(404).json({ error: 'Project not found' }); return; }

  if (activity !== undefined && !isValidActivity(activity, existing.workflowVersionId)) {
    res.status(400).json({ error: `Invalid activity: '${activity}'` });
    return;
  }

  const fields: string[] = [];
  const values: any[] = [];
  if (accountName !== undefined) { fields.push('accountName = ?'); values.push(accountName); }
  if (activity !== undefined)    { fields.push('activity = ?');     values.push(activity); }

  if (fields.length === 0) { res.status(400).json({ error: 'No updatable fields provided' }); return; }

  fields.push("updatedAt = datetime('now')");
  values.push(req.params.id);

  db.prepare(`UPDATE project SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  const updated = db.prepare('SELECT * FROM project WHERE id = ?').get(req.params.id);
  res.json(updated);
});

router.delete('/:id', (req: Request, res: Response) => {
  const project = db.prepare('SELECT * FROM project WHERE id = ?').get(req.params.id);
  if (!project) { res.status(404).json({ error: 'Project not found' }); return; }

  db.transaction(() => {
    db.prepare(`DELETE FROM assignment WHERE projectActivityId IN (SELECT id FROM project_activity WHERE projectId = ?)`).run(req.params.id);
    db.prepare(`DELETE FROM project_activity_task WHERE projectActivityId IN (SELECT id FROM project_activity WHERE projectId = ?)`).run(req.params.id);
    db.prepare('DELETE FROM activity_event WHERE projectId = ?').run(req.params.id);
    db.prepare('DELETE FROM project_activity WHERE projectId = ?').run(req.params.id);
    db.prepare('DELETE FROM artifact WHERE projectId = ?').run(req.params.id);
    db.prepare('DELETE FROM project WHERE id = ?').run(req.params.id);
  })();

  res.status(204).end();
});

export default router;
