import db from '../db/database.js';
import { registry } from './ActivityHandlerRegistry.js';
import { publishWorkflowEvent } from '../kafka/producer.js';

interface ProjectActivity {
  id: number;
  projectId: number;
  activityId: string;
  status: 'pending' | 'active' | 'completed' | 'skipped';
  decisionOutcome: string | null;
  iterationCount: number;
  startedAt: string | null;
  completedAt: string | null;
  input: string | null;
  output: string | null;
  createdAt: string;
}

export interface Assignment {
  id: number;
  projectActivityId: number;
  userId: number;
  assignedAt: string;
  completedAt: string | null;
  notes: string | null;
}

export class WorkflowEngine {

  private logEvent(
    projectId: number,
    projectActivityId: number | null,
    eventType: string,
    activityId: string,
    opts?: { userId?: number; payload?: Record<string, unknown> }
  ): void {
    db.prepare(
      `INSERT INTO activity_event (projectId, projectActivityId, eventType, activityId, userId, payload)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(
      projectId,
      projectActivityId ?? null,
      eventType,
      activityId,
      opts?.userId ?? null,
      opts?.payload ? JSON.stringify(opts.payload) : null
    );
  }

  initProject(projectId: number): ProjectActivity {
    const existing = db
      .prepare(
        `SELECT * FROM project_activity WHERE projectId = ? AND activityId = 'start' AND status = 'active'`
      )
      .get(projectId) as ProjectActivity | undefined;
    if (existing) return existing;

    this.activateActivity(projectId, 'start');
    this.completeActivity(projectId, 'start', { outcome: 'success' });

    const active = db
      .prepare(`SELECT * FROM project_activity WHERE projectId = ? AND status = 'active' ORDER BY startedAt DESC LIMIT 1`)
      .get(projectId) as ProjectActivity;
    return active;
  }

  completeActivity(
    projectId: number,
    activityKey: string,
    opts?: { outcome?: string; userId?: number; notes?: string; output?: Record<string, unknown> }
  ): ProjectActivity[] {
    const activity = db
      .prepare(
        `SELECT * FROM project_activity WHERE projectId = ? AND activityId = ? AND status = 'active' LIMIT 1`
      )
      .get(projectId, activityKey) as ProjectActivity | undefined;

    if (!activity) {
      throw new Error(`No active activity '${activityKey}' for project ${projectId}`);
    }

    db.prepare(
      `UPDATE project_activity
       SET status = 'completed', decisionOutcome = ?, completedAt = datetime('now'),
           output = ?
       WHERE id = ?`
    ).run(opts?.outcome ?? null, opts?.output ? JSON.stringify(opts.output) : null, activity.id);

    if (opts?.userId) {
      db.prepare(
        `UPDATE assignment
         SET completedAt = datetime('now'), notes = ?
         WHERE projectActivityId = ? AND userId = ? AND completedAt IS NULL`
      ).run(opts.notes ?? null, activity.id, opts.userId);
    }

    this.logEvent(projectId, activity.id, 'activity.completed', activityKey, {
      userId: opts?.userId,
      payload: opts?.outcome ? { outcome: opts.outcome } : undefined,
    });

    const transitions = this.resolveNextActivities(projectId, activityKey, opts?.outcome);
    const newActivities: ProjectActivity[] = [];

    for (const t of transitions) {
      if (t.toActivityKey === 'parallel_join') {
        if (!this.checkParallelJoin(projectId)) continue;
      }
      newActivities.push(this.activateActivity(projectId, t.toActivityKey));
    }

    this.syncProjectActivity(projectId);

    // Single canonical publish — no route should call publishWorkflowEvent separately
    publishWorkflowEvent({
      type: 'activity.completed',
      projectId,
      activityId: activityKey,
      activatedActivities: newActivities.map((a) => a.activityId),
      timestamp: new Date().toISOString(),
    }).catch((err) => console.error('[engine] failed to publish workflow event:', err));

    return newActivities;
  }

  getActiveActivities(projectId: number): ProjectActivity[] {
    return db
      .prepare(`SELECT * FROM project_activity WHERE projectId = ? AND status = 'active'`)
      .all(projectId) as ProjectActivity[];
  }

  getClaimableActivities(projectId: number, userId: number): ProjectActivity[] {
    const user = db
      .prepare('SELECT * FROM user WHERE id = ?')
      .get(userId) as { teamId: number } | undefined;
    if (!user) return [];

    return db
      .prepare(
        `SELECT ps.* FROM project_activity ps
         JOIN project p ON p.id = ps.projectId
         JOIN activity_definition ad ON ad.activityKey = ps.activityId AND ad.versionId = p.workflowVersionId
         WHERE ps.projectId = ? AND ps.status = 'active' AND ad.teamId = ?`
      )
      .all(projectId, user.teamId) as ProjectActivity[];
  }

  assignUser(projectActivityId: number, userId: number): Assignment {
    const activity = db
      .prepare('SELECT * FROM project_activity WHERE id = ?')
      .get(projectActivityId) as ProjectActivity | undefined;
    if (!activity) throw new Error('Project activity not found');

    const versionId = this.getProjectVersion(activity.projectId);
    const activityDef = db
      .prepare('SELECT * FROM activity_definition WHERE activityKey = ? AND versionId = ?')
      .get(activity.activityId, versionId) as { teamId: number | null } | undefined;
    if (!activityDef) throw new Error('Activity definition not found');

    const user = db
      .prepare('SELECT * FROM user WHERE id = ?')
      .get(userId) as { teamId: number } | undefined;
    if (!user) throw new Error('User not found');

    if (activityDef.teamId !== null && activityDef.teamId !== user.teamId) {
      throw new Error("User's team does not own this activity");
    }

    const result = db
      .prepare(`INSERT INTO assignment (projectActivityId, userId) VALUES (?, ?)`)
      .run(projectActivityId, userId);

    const assignment = db
      .prepare('SELECT * FROM assignment WHERE id = ?')
      .get(result.lastInsertRowid) as Assignment;

    this.logEvent(activity.projectId, activity.id, 'user.assigned', activity.activityId, {
      userId,
      payload: { assignmentId: assignment.id },
    });

    return assignment;
  }

  private resolveNextActivities(
    projectId: number,
    activityKey: string,
    outcome?: string
  ): { toActivityKey: string; edgeType: string }[] {
    const versionId = this.getProjectVersion(projectId);
    const activityDef = this.getActivityDef(activityKey, versionId);

    if (outcome) {
      const conditional = db.prepare(`
        SELECT ad.activityKey AS toActivityKey, t.edgeType
        FROM activity_transition t
        JOIN activity_definition ad ON ad.id = t.toActivityId
        WHERE t.fromActivityId = ? AND t.condition = ?`)
        .all(activityDef.id, outcome) as { toActivityKey: string; edgeType: string }[];
      if (conditional.length > 0) return conditional;
    }

    return db.prepare(`
      SELECT ad.activityKey AS toActivityKey, t.edgeType
      FROM activity_transition t
      JOIN activity_definition ad ON ad.id = t.toActivityId
      WHERE t.fromActivityId = ? AND t.condition IS NULL`)
      .all(activityDef.id) as { toActivityKey: string; edgeType: string }[];
  }

  activateActivityPublic(projectId: number, activityKey: string): ProjectActivity {
    return this.activateActivity(projectId, activityKey);
  }

  private activateActivity(projectId: number, activityKey: string): ProjectActivity {
    const active = db
      .prepare(
        `SELECT * FROM project_activity WHERE projectId = ? AND activityId = ? AND status = 'active'`
      )
      .get(projectId, activityKey) as ProjectActivity | undefined;
    if (active) return active;

    const lastCompleted = db
      .prepare(
        `SELECT MAX(iterationCount) as maxIter FROM project_activity
         WHERE projectId = ? AND activityId = ? AND status = 'completed'`
      )
      .get(projectId, activityKey) as { maxIter: number | null };

    const iterationCount = lastCompleted.maxIter !== null ? lastCompleted.maxIter + 1 : 0;

    const result = db
      .prepare(
        `INSERT INTO project_activity (projectId, activityId, status, iterationCount, startedAt)
         VALUES (?, ?, 'active', ?, datetime('now'))`
      )
      .run(projectId, activityKey, iterationCount);

    const projectActivityId = result.lastInsertRowid;

    const versionId = this.getProjectVersion(projectId);
    const activityDef = this.getActivityDefSafe(activityKey, versionId);
    if (activityDef) {
      db.prepare(
        `INSERT INTO project_activity_task (projectActivityId, activityTaskId)
         SELECT ?, id FROM activity_task WHERE activityDefId = ?`
      ).run(projectActivityId, activityDef.id);
    }

    const newActivity = db
      .prepare('SELECT * FROM project_activity WHERE id = ?')
      .get(projectActivityId) as ProjectActivity;

    this.logEvent(projectId, newActivity.id, 'activity.activated', activityKey);

    if (activityDef?.actionType === 'automated') {
      this.runHandler(projectId, activityKey, newActivity.id, versionId, activityDef.handler, null);
    }

    return newActivity;
  }

  triggerActivity(
    projectId: number,
    activityKey: string,
    configOverride?: Record<string, unknown>,
  ): void {
    const versionId = this.getProjectVersion(projectId);
    const activityDef = this.getActivityDefSafe(activityKey, versionId);

    if (!activityDef) throw new Error(`Activity '${activityKey}' not found`);

    const activity = db
      .prepare(`SELECT * FROM project_activity WHERE projectId = ? AND activityId = ? AND status = 'active'`)
      .get(projectId, activityKey) as ProjectActivity | undefined;
    if (!activity) throw new Error(`No active activity '${activityKey}' for project ${projectId}`);

    const configJson = configOverride && Object.keys(configOverride).length > 0
      ? JSON.stringify(configOverride)
      : null;

    if (configJson) {
      db.prepare(`UPDATE project_activity SET input = ? WHERE id = ?`).run(configJson, activity.id);
    }
    if (activityDef.handler) {
      this.runHandler(projectId, activityKey, activity.id, versionId, activityDef.handler, configJson);
    } else {
      this.completeActivity(projectId, activityKey, { outcome: 'success' });
    }
  }

  private runHandler(
    projectId: number,
    activityKey: string,
    projectActivityId: number,
    versionId: number,
    handlerName: string | null | undefined,
    inputJson: string | null | undefined,
  ): void {
    if (!handlerName) {
      console.warn(`[engine] no handler for activity '${activityKey}' — skipping`);
      return;
    }
    const input_data = inputJson ? JSON.parse(inputJson) as Record<string, unknown> : null;

    const handler = registry.get(handlerName);
    if (!handler) {
      console.warn(`[engine] no handler registered for '${handlerName}'`);
      return;
    }

    handler({ projectId, activityKey, projectActivityId, versionId, inputData: input_data })
      .then((result) => {
        this.completeActivity(projectId, activityKey, {
          outcome: result.outcome,
          output:  result.payload,
        });
      })
      .catch((err: Error) => {
        console.error(`[engine] handler '${handlerName}' failed for '${activityKey}':`, err.message);
        this.logEvent(projectId, projectActivityId, 'activity.completed', activityKey, {
          payload: { error: err.message, handler: handlerName },
        });
      });
  }

  private checkParallelJoin(projectId: number): boolean {
    const versionId = this.getProjectVersion(projectId);
    const parallelJoinDef = db
      .prepare(
        `SELECT id FROM activity_definition WHERE activityKey = 'parallel_join' AND versionId = ?`
      )
      .get(versionId) as { id: number } | undefined;

    if (!parallelJoinDef) return false;

    const incomingActivities = db
      .prepare(
        `SELECT ad.activityKey FROM activity_transition t
         JOIN activity_definition ad ON ad.id = t.fromActivityId
         WHERE t.toActivityId = ?`
      )
      .all(parallelJoinDef.id) as { activityKey: string }[];

    for (const { activityKey } of incomingActivities) {
      const completed = db
        .prepare(
          `SELECT COUNT(*) as count FROM project_activity
           WHERE projectId = ? AND activityId = ? AND status = 'completed'`
        )
        .get(projectId, activityKey) as { count: number };
      if (completed.count === 0) return false;
    }
    return true;
  }

  private syncProjectActivity(projectId: number): void {
    const activeActivity = db
      .prepare(
        `SELECT activityId FROM project_activity
         WHERE projectId = ? AND status = 'active'
         ORDER BY startedAt DESC LIMIT 1`
      )
      .get(projectId) as { activityId: string } | undefined;

    if (activeActivity) {
      db.prepare(`UPDATE project SET activity = ?, updatedAt = datetime('now') WHERE id = ?`).run(
        activeActivity.activityId,
        projectId
      );
    }
  }

  private getProjectVersion(projectId: number): number {
    const p = db
      .prepare('SELECT workflowVersionId FROM project WHERE id = ?')
      .get(projectId) as { workflowVersionId: number } | undefined;
    if (!p) throw new Error(`Project ${projectId} not found`);
    return p.workflowVersionId;
  }

  private getActivityDef(activityKey: string, versionId: number): { id: number } {
    const def = db
      .prepare('SELECT id FROM activity_definition WHERE activityKey = ? AND versionId = ?')
      .get(activityKey, versionId) as { id: number } | undefined;
    if (!def) throw new Error(`Activity '${activityKey}' not found in version ${versionId}`);
    return def;
  }

  private getActivityDefSafe(activityKey: string, versionId: number): { id: number; actionType: string; handler: string | null; inputSchema: string | null } | undefined {
    return db
      .prepare('SELECT id, actionType, handler, inputSchema FROM activity_definition WHERE activityKey = ? AND versionId = ?')
      .get(activityKey, versionId) as { id: number; actionType: string; handler: string | null; inputSchema: string | null } | undefined;
  }
}

export const workflowEngine = new WorkflowEngine();
