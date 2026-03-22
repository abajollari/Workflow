import { Router, Request, Response } from 'express';
import db from '../db/database.js';

const router = Router();

/** Convert literal \n and spaces between words to real newline characters */
function parseLabel(label: string): string {
  return label.replace(/\\n/g, '\n').replace(/ +/g, '\n');
}

function getActiveVersionId(): number {
  const v = db
    .prepare('SELECT id FROM workflow_version WHERE isActive = 1 LIMIT 1')
    .get() as { id: number } | undefined;
  if (!v) throw new Error('No active workflow version');
  return v.id;
}

// GET /api/workflow/versions
router.get('/versions', (_req: Request, res: Response) => {
  const versions = db.prepare('SELECT * FROM workflow_version ORDER BY id').all();
  res.json(versions);
});

// POST /api/workflow/versions
router.post('/versions', (req: Request, res: Response) => {
  const { name, description } = req.body ?? {};

  if (!name?.trim()) {
    res.status(400).json({ error: 'name is required' });
    return;
  }

  try {
    const result = db
      .prepare(`INSERT INTO workflow_version (name, description) VALUES (?, ?)`)
      .run(name.trim(), description?.trim() || null);
    const created = db.prepare('SELECT * FROM workflow_version WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(created);
  } catch (err: any) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      res.status(409).json({ error: `Version '${name}' already exists` });
      return;
    }
    throw err;
  }
});

// PATCH /api/workflow/versions/:id/activate
router.patch('/versions/:id/activate', (req: Request, res: Response) => {
  const versionId = Number(req.params.id);
  const version = db
    .prepare('SELECT * FROM workflow_version WHERE id = ?')
    .get(versionId);
  if (!version) {
    res.status(404).json({ error: 'Version not found' });
    return;
  }

  db.transaction(() => {
    db.prepare('UPDATE workflow_version SET isActive = 0').run();
    db.prepare('UPDATE workflow_version SET isActive = 1 WHERE id = ?').run(versionId);
  })();

  res.json(db.prepare('SELECT * FROM workflow_version WHERE id = ?').get(versionId));
});

// PATCH /api/workflow/versions/:id/deactivate
router.patch('/versions/:id/deactivate', (req: Request, res: Response) => {
  const versionId = Number(req.params.id);
  const version = db
    .prepare('SELECT * FROM workflow_version WHERE id = ?')
    .get(versionId);
  if (!version) {
    res.status(404).json({ error: 'Version not found' });
    return;
  }

  db.prepare('UPDATE workflow_version SET isActive = 0 WHERE id = ?').run(versionId);
  res.json(db.prepare('SELECT * FROM workflow_version WHERE id = ?').get(versionId));
});

// GET /api/workflow/activities?versionId=1  (defaults to active version)
router.get('/activities', (req: Request, res: Response) => {
  const versionId = req.query.versionId ? Number(req.query.versionId) : getActiveVersionId();
  const activities = db
    .prepare('SELECT * FROM activity_definition WHERE versionId = ? ORDER BY col, row')
    .all(versionId);
  res.json(activities);
});

// GET /api/workflow/transitions?versionId=1  (defaults to active version)
router.get('/transitions', (req: Request, res: Response) => {
  const versionId = req.query.versionId ? Number(req.query.versionId) : getActiveVersionId();
  const transitions = db
    .prepare(
      `SELECT t.id, t.fromActivityId, fa.activityKey AS fromActivityKey,
              t.toActivityId,   ta.activityKey AS toActivityKey,
              t.condition,  t.edgeType
       FROM activity_transition t
       JOIN activity_definition fa ON fa.id = t.fromActivityId
       JOIN activity_definition ta ON ta.id = t.toActivityId
       WHERE fa.versionId = ?
       ORDER BY t.id`
    )
    .all(versionId);
  res.json(transitions);
});

// GET /api/workflow/tasks?versionId=1  (defaults to active version)
router.get('/tasks', (req: Request, res: Response) => {
  const versionId = req.query.versionId ? Number(req.query.versionId) : getActiveVersionId();
  const tasks = db.prepare(
    `SELECT at.id, ad.activityKey, at.title, at.description, at.orderIndex
     FROM activity_task at
     JOIN activity_definition ad ON ad.id = at.activityDefId
     WHERE ad.versionId = ?
     ORDER BY ad.id, at.orderIndex`
  ).all(versionId);
  res.json(tasks);
});

// POST /api/workflow/full  — create a complete workflow in one transaction
router.post('/full', (req: Request, res: Response) => {
  const { name, description, activities, transitions, tasks } = req.body ?? {};

  if (!name?.trim()) {
    res.status(400).json({ error: 'name is required' });
    return;
  }
  if (!Array.isArray(activities) || activities.length === 0) {
    res.status(400).json({ error: 'at least one activity is required' });
    return;
  }

  try {
    const result = db.transaction(() => {
      // 1. workflow_version
      const vr = db
        .prepare('INSERT INTO workflow_version (name, description) VALUES (?, ?)')
        .run(name.trim(), description?.trim() || null);
      const versionId = Number(vr.lastInsertRowid);

      // 2. activity_definition — build key→id map
      const activityIdMap: Record<string, number> = {};
      const insertActivity = db.prepare(
        `INSERT INTO activity_definition (activityKey, versionId, label, nodeType, col, row, teamId, actionType, slaHours, handler, inputSchema)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      for (const a of activities) {
        const ar = insertActivity.run(
          a.activityKey,
          versionId,
          parseLabel(a.label),
          a.nodeType ?? 'task',
          a.col ?? 0,
          a.row ?? 0,
          a.teamId ?? null,
          a.actionType ?? 'manual',
          a.slaHours ?? null,
          a.handler ?? null,
          a.inputSchema ?? null,
        );
        activityIdMap[a.activityKey] = Number(ar.lastInsertRowid);
      }

      // 3. activity_transition
      const insertTransition = db.prepare(
        `INSERT INTO activity_transition (fromActivityId, toActivityId, condition, edgeType)
         VALUES (?, ?, ?, ?)`
      );
      for (const t of (transitions ?? [])) {
        const fromId = activityIdMap[t.fromActivityKey];
        const toId   = activityIdMap[t.toActivityKey];
        if (!fromId || !toId) throw new Error(`Unknown activity key in transition: ${t.fromActivityKey} → ${t.toActivityKey}`);
        insertTransition.run(fromId, toId, t.condition ?? null, t.edgeType ?? 'normal');
      }

      // 4. activity_task
      const insertTask = db.prepare(
        `INSERT INTO activity_task (activityDefId, title, description, orderIndex)
         VALUES (?, ?, ?, ?)`
      );
      for (const tk of (tasks ?? [])) {
        const defId = activityIdMap[tk.activityKey];
        if (!defId) throw new Error(`Unknown activity key for task: ${tk.activityKey}`);
        insertTask.run(defId, tk.title, tk.description ?? null, tk.orderIndex ?? 0);
      }

      return { versionId };
    })();

    const created = db.prepare('SELECT * FROM workflow_version WHERE id = ?').get(result.versionId);
    res.status(201).json(created);
  } catch (err: any) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      res.status(409).json({ error: `Version '${name}' already exists` });
      return;
    }
    res.status(400).json({ error: err.message ?? 'Failed to create workflow' });
  }
});

// PUT /api/workflow/full/:id  — replace a complete workflow in one transaction
router.put('/full/:id', (req: Request, res: Response) => {
  const versionId = Number(req.params.id);
  const { name, description, activities, transitions, tasks } = req.body ?? {};

  const existing = db.prepare('SELECT * FROM workflow_version WHERE id = ?').get(versionId);
  if (!existing) {
    res.status(404).json({ error: `Workflow version ${versionId} not found` });
    return;
  }

  if (!name?.trim()) {
    res.status(400).json({ error: 'name is required' });
    return;
  }
  if (!Array.isArray(activities) || activities.length === 0) {
    res.status(400).json({ error: 'at least one activity is required' });
    return;
  }

  try {
    db.transaction(() => {
      // 1. Update workflow_version name/description
      db.prepare('UPDATE workflow_version SET name = ?, description = ? WHERE id = ?')
        .run(name.trim(), description?.trim() || null, versionId);

      // 2. Delete activity_task rows for this version's activities
      db.prepare(
        `DELETE FROM activity_task WHERE activityDefId IN
         (SELECT id FROM activity_definition WHERE versionId = ?)`
      ).run(versionId);

      // 3. Delete activity_transition rows for this version's activities
      db.prepare(
        `DELETE FROM activity_transition WHERE fromActivityId IN
         (SELECT id FROM activity_definition WHERE versionId = ?)`
      ).run(versionId);

      // 4. Delete activity_definition rows for this version
      db.prepare('DELETE FROM activity_definition WHERE versionId = ?').run(versionId);

      // 5. Re-insert activities — build key→id map
      const activityIdMap: Record<string, number> = {};
      const insertActivity = db.prepare(
        `INSERT INTO activity_definition (activityKey, versionId, label, nodeType, col, row, teamId, actionType, slaHours, handler, inputSchema)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      for (const a of activities) {
        const ar = insertActivity.run(
          a.activityKey,
          versionId,
          parseLabel(a.label),
          a.nodeType ?? 'task',
          a.col ?? 0,
          a.row ?? 0,
          a.teamId ?? null,
          a.actionType ?? 'manual',
          a.slaHours ?? null,
          a.handler ?? null,
          a.inputSchema ?? null,
        );
        activityIdMap[a.activityKey] = Number(ar.lastInsertRowid);
      }

      // 6. Re-insert transitions
      const insertTransition = db.prepare(
        `INSERT INTO activity_transition (fromActivityId, toActivityId, condition, edgeType)
         VALUES (?, ?, ?, ?)`
      );
      for (const t of (transitions ?? [])) {
        const fromId = activityIdMap[t.fromActivityKey];
        const toId   = activityIdMap[t.toActivityKey];
        if (!fromId || !toId) throw new Error(`Unknown activity key in transition: ${t.fromActivityKey} → ${t.toActivityKey}`);
        insertTransition.run(fromId, toId, t.condition ?? null, t.edgeType ?? 'normal');
      }

      // 7. Re-insert tasks
      const insertTask = db.prepare(
        `INSERT INTO activity_task (activityDefId, title, description, orderIndex)
         VALUES (?, ?, ?, ?)`
      );
      for (const tk of (tasks ?? [])) {
        const defId = activityIdMap[tk.activityKey];
        if (!defId) throw new Error(`Unknown activity key for task: ${tk.activityKey}`);
        insertTask.run(defId, tk.title, tk.description ?? null, tk.orderIndex ?? 0);
      }
    })();

    const updated = db.prepare('SELECT * FROM workflow_version WHERE id = ?').get(versionId);
    res.json(updated);
  } catch (err: any) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      res.status(409).json({ error: `Version name '${name}' already exists` });
      return;
    }
    res.status(400).json({ error: err.message ?? 'Failed to update workflow' });
  }
});

export default router;
