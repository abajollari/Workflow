import { Router, Request, Response } from 'express';
import db from '../db/database.js';
import { workflowEngine } from '../engine/WorkflowEngine.js';

const router = Router();

function getActiveVersionId(): number {
  const v = db
    .prepare('SELECT id FROM workflow_version WHERE isActive = 1 LIMIT 1')
    .get() as { id: number } | undefined;
  if (!v) throw new Error('No active workflow version');
  return v.id;
}

function isValidActivity(activityKey: string, versionId: number): boolean {
  return !!db
    .prepare('SELECT 1 FROM activity_definition WHERE activityKey = ? AND versionId = ?')
    .get(activityKey, versionId);
}

// POST /api/salesforce/start
router.post('/start', (req: Request, res: Response) => {
  const { accountNumber, accountName, activity = 'start', outcome = 'success' } = req.body;

  if (!accountNumber || !accountName) {
    res.status(400).json({ error: 'accountNumber and accountName are required' });
    return;
  }

  const versionId = getActiveVersionId();
  if (!isValidActivity(activity, versionId)) {
    res.status(400).json({ error: `Invalid activity: '${activity}'` });
    return;
  }

  const project = db
    .prepare('SELECT * FROM project WHERE accountNumber = ?')
    .get(accountNumber) as { id: number } | undefined;

  if (project) {
    res.status(404).json({ error: `Project found for accountNumber: ${accountNumber}` });
    return;
  }

  try {
    const result = db
      .prepare('INSERT INTO project (accountNumber, accountName, activity, workflowVersionId) VALUES (?, ?, ?, ?)')
      .run(accountNumber, accountName, activity, versionId);
    const projectId = result.lastInsertRowid as number;
    workflowEngine.initProject(projectId);
    const created = db.prepare('SELECT * FROM project WHERE id = ?').get(projectId);

    workflowEngine.completeActivity(projectId, 'pqr_created', { outcome: 'success', output: req.body });

    res.status(201).json(created);
  } catch (err: any) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      res.status(409).json({ error: 'accountNumber already exists' });
      return;
    }
    throw err;
  }
});

// POST /api/salesforce/submit/:accountNumber
router.post('/submit/:accountNumber', (req: Request, res: Response) => {
  const { accountNumber } = req.params;
  const payload = req.body;

  if (!payload || typeof payload !== 'object' || Object.keys(payload).length === 0) {
    res.status(400).json({ error: 'A JSON body is required' });
    return;
  }

  console.log('[salesforce] received data:', JSON.stringify(payload));
  const project = db
    .prepare('SELECT * FROM project WHERE accountNumber = ?')
    .get(accountNumber) as { id: number } | undefined;

  if (!project) {
    res.status(404).json({ error: `Project not found for accountNumber: ${accountNumber}` });
    return;
  }

  workflowEngine.completeActivity(project.id, 'pqr_submitted', { outcome: 'success', output: req.body });

  res.json({ status: 'received', data: payload });
});

export default router;
