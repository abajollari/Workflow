import type { IDbAdapter } from '../db/IDbAdapter.js';
import { SqliteAdapter } from '../db/SqliteAdapter.js';
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
  constructor(private readonly db: IDbAdapter) {}

  private async logEvent(
    projectId: number,
    projectActivityId: number | null,
    eventType: string,
    activityId: string,
    opts?: { userId?: number; payload?: Record<string, unknown> }
  ): Promise<void> {
    await this.db.run(
      `INSERT INTO activity_event (projectId, projectActivityId, eventType, activityId, userId, payload)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        projectId,
        projectActivityId ?? null,
        eventType,
        activityId,
        opts?.userId ?? null,
        opts?.payload ? JSON.stringify(opts.payload) : null,
      ]
    );
  }

  async initProject(projectId: number): Promise<ProjectActivity> {
    const existing = await this.db.get<ProjectActivity>(
      `SELECT * FROM project_activity WHERE projectId = ? AND activityId = 'start' AND status = 'active'`,
      [projectId]
    );
    if (existing) return existing;

    await this.activateActivity(projectId, 'start');
    await this.completeActivity(projectId, 'start', { outcome: 'success' });

    const active = await this.db.get<ProjectActivity>(
      `SELECT * FROM project_activity WHERE projectId = ? AND status = 'active' ORDER BY startedAt DESC LIMIT 1`,
      [projectId]
    );
    return active!;
  }

  async completeActivity(
    projectId: number,
    activityKey: string,
    opts?: { outcome?: string; userId?: number; notes?: string; output?: Record<string, unknown> }
  ): Promise<ProjectActivity[]> {
    const activity = await this.db.get<ProjectActivity>(
      `SELECT * FROM project_activity WHERE projectId = ? AND activityId = ? AND status = 'active' LIMIT 1`,
      [projectId, activityKey]
    );

    if (!activity) {
      throw new Error(`No active activity '${activityKey}' for project ${projectId}`);
    }

    await this.db.run(
      `UPDATE project_activity
       SET status = 'completed', decisionOutcome = ?, completedAt = datetime('now'), output = ?
       WHERE id = ?`,
      [opts?.outcome ?? null, opts?.output ? JSON.stringify(opts.output) : null, activity.id]
    );

    if (opts?.userId) {
      await this.db.run(
        `UPDATE assignment
         SET completedAt = datetime('now'), notes = ?
         WHERE projectActivityId = ? AND userId = ? AND completedAt IS NULL`,
        [opts.notes ?? null, activity.id, opts.userId]
      );
    }

    await this.logEvent(projectId, activity.id, 'activity.completed', activityKey, {
      userId: opts?.userId,
      payload: opts?.outcome ? { outcome: opts.outcome } : undefined,
    });

    const transitions = await this.resolveNextActivities(projectId, activityKey, opts?.outcome);
    const newActivities: ProjectActivity[] = [];

    for (const t of transitions) {
      if (t.toActivityKey === 'parallel_join') {
        if (!(await this.checkParallelJoin(projectId))) continue;
      }
      newActivities.push(await this.activateActivity(projectId, t.toActivityKey));
    }

    await this.syncProjectActivity(projectId);

    const versionId = await this.getProjectVersion(projectId);
    const activityDef = await this.db.get<{ label: string }>(
      'SELECT label FROM activity_definition WHERE activityKey = ? AND versionId = ?',
      [activityKey, versionId]
    );

    // Single canonical publish — no route should call publishWorkflowEvent separately
    publishWorkflowEvent({
      type: 'activity.completed',
      projectId,
      activityId: activityKey,
      activityLabel: activityDef?.label ?? activityKey,
      activatedActivities: newActivities.map((a) => a.activityId),
      timestamp: new Date().toISOString(),
    }).catch((err) => console.error('[engine] failed to publish workflow event:', err));

    return newActivities;
  }

  async getActiveActivities(projectId: number): Promise<ProjectActivity[]> {
    return this.db.all<ProjectActivity>(
      `SELECT * FROM project_activity WHERE projectId = ? AND status = 'active'`,
      [projectId]
    );
  }

  async getClaimableActivities(projectId: number, userId: number): Promise<ProjectActivity[]> {
    const user = await this.db.get<{ teamId: number }>(
      'SELECT * FROM user WHERE id = ?',
      [userId]
    );
    if (!user) return [];

    return this.db.all<ProjectActivity>(
      `SELECT ps.* FROM project_activity ps
       JOIN project p ON p.id = ps.projectId
       JOIN activity_definition ad ON ad.activityKey = ps.activityId AND ad.versionId = p.workflowVersionId
       WHERE ps.projectId = ? AND ps.status = 'active' AND ad.teamId = ?`,
      [projectId, user.teamId]
    );
  }

  async assignUser(projectActivityId: number, userId: number): Promise<Assignment> {
    const activity = await this.db.get<ProjectActivity>(
      'SELECT * FROM project_activity WHERE id = ?',
      [projectActivityId]
    );
    if (!activity) throw new Error('Project activity not found');

    const versionId = await this.getProjectVersion(activity.projectId);
    const activityDef = await this.db.get<{ teamId: number | null }>(
      'SELECT * FROM activity_definition WHERE activityKey = ? AND versionId = ?',
      [activity.activityId, versionId]
    );
    if (!activityDef) throw new Error('Activity definition not found');

    const user = await this.db.get<{ teamId: number }>(
      'SELECT * FROM user WHERE id = ?',
      [userId]
    );
    if (!user) throw new Error('User not found');

    if (activityDef.teamId !== null && activityDef.teamId !== user.teamId) {
      throw new Error("User's team does not own this activity");
    }

    const result = await this.db.run(
      `INSERT INTO assignment (projectActivityId, userId) VALUES (?, ?)`,
      [projectActivityId, userId]
    );

    const assignment = await this.db.get<Assignment>(
      'SELECT * FROM assignment WHERE id = ?',
      [result.lastInsertRowid]
    );

    await this.logEvent(activity.projectId, activity.id, 'user.assigned', activity.activityId, {
      userId,
      payload: { assignmentId: assignment!.id },
    });

    return assignment!;
  }

  private async resolveNextActivities(
    projectId: number,
    activityKey: string,
    outcome?: string
  ): Promise<{ toActivityKey: string; edgeType: string }[]> {
    const versionId = await this.getProjectVersion(projectId);
    const activityDef = await this.getActivityDef(activityKey, versionId);

    if (outcome) {
      const conditional = await this.db.all<{ toActivityKey: string; edgeType: string }>(
        `SELECT ad.activityKey AS toActivityKey, t.edgeType
         FROM activity_transition t
         JOIN activity_definition ad ON ad.id = t.toActivityId
         WHERE t.fromActivityId = ? AND t.condition = ?`,
        [activityDef.id, outcome]
      );
      if (conditional.length > 0) return conditional;
    }

    return this.db.all<{ toActivityKey: string; edgeType: string }>(
      `SELECT ad.activityKey AS toActivityKey, t.edgeType
       FROM activity_transition t
       JOIN activity_definition ad ON ad.id = t.toActivityId
       WHERE t.fromActivityId = ? AND t.condition IS NULL`,
      [activityDef.id]
    );
  }

  async activateActivityPublic(projectId: number, activityKey: string): Promise<ProjectActivity> {
    return this.activateActivity(projectId, activityKey);
  }

  private async activateActivity(projectId: number, activityKey: string): Promise<ProjectActivity> {
    const active = await this.db.get<ProjectActivity>(
      `SELECT * FROM project_activity WHERE projectId = ? AND activityId = ? AND status = 'active'`,
      [projectId, activityKey]
    );
    if (active) return active;

    const lastCompleted = await this.db.get<{ maxIter: number | null }>(
      `SELECT MAX(iterationCount) as maxIter FROM project_activity
       WHERE projectId = ? AND activityId = ? AND status = 'completed'`,
      [projectId, activityKey]
    );

    const iterationCount = lastCompleted?.maxIter != null ? lastCompleted.maxIter + 1 : 0;

    const result = await this.db.run(
      `INSERT INTO project_activity (projectId, activityId, status, iterationCount, startedAt)
       VALUES (?, ?, 'active', ?, datetime('now'))`,
      [projectId, activityKey, iterationCount]
    );

    const projectActivityId = result.lastInsertRowid;

    const versionId = await this.getProjectVersion(projectId);
    const activityDef = await this.getActivityDefSafe(activityKey, versionId);
    if (activityDef) {
      await this.db.run(
        `INSERT INTO project_activity_task (projectActivityId, activityTaskId)
         SELECT ?, id FROM activity_task WHERE activityDefId = ?`,
        [projectActivityId, activityDef.id]
      );
    }

    const newActivity = await this.db.get<ProjectActivity>(
      'SELECT * FROM project_activity WHERE id = ?',
      [projectActivityId]
    );

    await this.logEvent(projectId, newActivity!.id, 'activity.activated', activityKey);

    if (activityDef?.actionType === 'automated') {
      this.runHandler(projectId, activityKey, newActivity!.id, versionId, activityDef.handler, null);
    }

    return newActivity!;
  }

  async triggerActivity(
    projectId: number,
    activityKey: string,
    configOverride?: Record<string, unknown>,
  ): Promise<void> {
    const versionId = await this.getProjectVersion(projectId);
    const activityDef = await this.getActivityDefSafe(activityKey, versionId);

    if (!activityDef) throw new Error(`Activity '${activityKey}' not found`);

    const activity = await this.db.get<ProjectActivity>(
      `SELECT * FROM project_activity WHERE projectId = ? AND activityId = ? AND status = 'active'`,
      [projectId, activityKey]
    );
    if (!activity) throw new Error(`No active activity '${activityKey}' for project ${projectId}`);

    const configJson = configOverride && Object.keys(configOverride).length > 0
      ? JSON.stringify(configOverride)
      : null;

    if (configJson) {
      await this.db.run(
        `UPDATE project_activity SET input = ? WHERE id = ?`,
        [configJson, activity.id]
      );
    }

    if (activityDef.handler) {
      this.runHandler(projectId, activityKey, activity.id, versionId, activityDef.handler, configJson);
    } else {
      await this.completeActivity(projectId, activityKey, { outcome: 'success' });
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
    const inputData = inputJson ? JSON.parse(inputJson) as Record<string, unknown> : null;

    const handler = registry.get(handlerName);
    if (!handler) {
      console.warn(`[engine] no handler registered for '${handlerName}'`);
      return;
    }

    handler({ projectId, activityKey, projectActivityId, versionId, inputData })
      .then((result) => this.completeActivity(projectId, activityKey, {
        outcome: result.outcome,
        output: result.payload,
      }))
      .catch((err: Error) => {
        console.error(`[engine] handler '${handlerName}' failed for '${activityKey}':`, err.message);
        this.logEvent(projectId, projectActivityId, 'activity.completed', activityKey, {
          payload: { error: err.message, handler: handlerName },
        });
      });
  }

  private async checkParallelJoin(projectId: number): Promise<boolean> {
    const versionId = await this.getProjectVersion(projectId);
    const parallelJoinDef = await this.db.get<{ id: number }>(
      `SELECT id FROM activity_definition WHERE activityKey = 'parallel_join' AND versionId = ?`,
      [versionId]
    );

    if (!parallelJoinDef) return false;

    const incomingActivities = await this.db.all<{ activityKey: string }>(
      `SELECT ad.activityKey FROM activity_transition t
       JOIN activity_definition ad ON ad.id = t.fromActivityId
       WHERE t.toActivityId = ?`,
      [parallelJoinDef.id]
    );

    for (const { activityKey } of incomingActivities) {
      const completed = await this.db.get<{ count: number }>(
        `SELECT COUNT(*) as count FROM project_activity
         WHERE projectId = ? AND activityId = ? AND status = 'completed'`,
        [projectId, activityKey]
      );
      if (!completed || completed.count === 0) return false;
    }
    return true;
  }

  private async syncProjectActivity(projectId: number): Promise<void> {
    const activeActivity = await this.db.get<{ activityId: string }>(
      `SELECT activityId FROM project_activity
       WHERE projectId = ? AND status = 'active'
       ORDER BY startedAt DESC LIMIT 1`,
      [projectId]
    );

    if (activeActivity) {
      await this.db.run(
        `UPDATE project SET activity = ?, updatedAt = datetime('now') WHERE id = ?`,
        [activeActivity.activityId, projectId]
      );
    }
  }

  private async getProjectVersion(projectId: number): Promise<number> {
    const p = await this.db.get<{ workflowVersionId: number }>(
      'SELECT workflowVersionId FROM project WHERE id = ?',
      [projectId]
    );
    if (!p) throw new Error(`Project ${projectId} not found`);
    return p.workflowVersionId;
  }

  private async getActivityDef(activityKey: string, versionId: number): Promise<{ id: number }> {
    const def = await this.db.get<{ id: number }>(
      'SELECT id FROM activity_definition WHERE activityKey = ? AND versionId = ?',
      [activityKey, versionId]
    );
    if (!def) throw new Error(`Activity '${activityKey}' not found in version ${versionId}`);
    return def;
  }

  private async getActivityDefSafe(
    activityKey: string,
    versionId: number
  ): Promise<{ id: number; actionType: string; handler: string | null; inputSchema: string | null } | undefined> {
    return this.db.get<{ id: number; actionType: string; handler: string | null; inputSchema: string | null }>(
      'SELECT id, actionType, handler, inputSchema FROM activity_definition WHERE activityKey = ? AND versionId = ?',
      [activityKey, versionId]
    );
  }
}

export const workflowEngine = new WorkflowEngine(new SqliteAdapter(db));
