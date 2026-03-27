# Workflow Engine

`src/engine/WorkflowEngine.ts` is the core orchestration engine. It is a singleton that drives the state machine for all projects.

## Interfaces

### `HandlerContext`

Passed to every activity handler when it executes.

```typescript
interface HandlerContext {
  projectId: number;
  activityKey: string;
  projectActivityId: number;
  versionId: number;
  inputData: Record<string, unknown> | null;
}
```

### `HandlerResult`

Return value from an activity handler.

```typescript
interface HandlerResult {
  outcome?: string;              // Sets decisionOutcome on the project_activity row
  payload?: Record<string, unknown>;  // Stored as output JSON
}
```

---

## WorkflowEngine

### Constructor

```typescript
new WorkflowEngine(db: IDbAdapter)
```

Takes an `IDbAdapter` for all database access. In production, a `SqliteAdapter` wrapping `better-sqlite3` is used. The singleton instance is exported as `workflowEngine`.

---

### `initProject(projectId: number): Promise<ProjectActivity>`

Called once after a project is created. Activates the `start` node and immediately completes it to transition into the first real activity.

```
start → activate → complete → resolve transitions → activate first real activity
```

**Returns:** The first real `project_activity` record in `active` status.

---

### `completeActivity(projectId, activityKey, opts?): Promise<ProjectActivity[]>`

The primary method for advancing a workflow. Called when a user clicks "Complete" or when a handler auto-completes.

**Options:**
```typescript
{
  outcome?: string;              // For decision/gate nodes
  output?: Record<string, unknown>;
}
```

**Execution sequence:**

1. Look up the `project_activity` row — must be `status = 'active'`
2. Run the registered handler (if `handler` column is set on the activity definition)
3. Capture handler `outcome` and `payload` — override caller-provided outcome if handler returns one
4. Set `status = 'completed'`, `completedAt`, `decisionOutcome`, `output`
5. Call `resolveNextActivities()` to compute which nodes to activate next
6. For each next activity, call `activateActivity()`
7. Call `syncProjectActivity()` to update `project.activity`
8. Publish Kafka event via `publishWorkflowEvent()`
9. Return array of newly activated `ProjectActivity` records

---

### `activateActivity(projectId, activityKey): Promise<ProjectActivity>` *(private)*

Creates a new `project_activity` row with `status = 'active'` and instantiates task instances from the activity's task templates.

**Steps:**
1. Insert `project_activity` with `startedAt = now`
2. Copy all `activity_task` rows into `project_activity_task` instances (status `'new'`)
3. Log `activity.activated` audit event
4. If `actionType === 'automated'`: immediately call `runHandler()` (fire-and-forget — does not block activation)

---

### `assignUser(projectActivityId, userId): Promise<Assignment>`

Assigns a user to an active project activity.

**Validation:** The user's `teamId` must match the activity definition's `teamId`. Throws if they don't match.

**Steps:**
1. Validate team ownership
2. Insert `assignment` row
3. Log `user.assigned` audit event

---

### `triggerActivity(projectId, activityKey, configOverride?): Promise<void>`

Manually fires the handler for an activity without completing the workflow step. Useful for testing, or for activities whose completion is driven by an external webhook (e.g. DocuSign).

**Steps:**
1. Fetch `project_activity` and associated `activity_definition`
2. Merge `configOverride` with existing input
3. Update `project_activity.input` with merged input
4. Call `runHandler()` directly

---

### `getActiveActivities(projectId): Promise<ProjectActivity[]>`

Returns all `project_activity` rows with `status = 'active'` for a project.

---

### `getClaimableActivities(projectId, userId): Promise<ProjectActivity[]>`

Returns active activities that the given user's team is responsible for. Used to show a user which activities they can pick up.

---

## Private Methods

### `resolveNextActivities(projectId, completedActivityKey, outcome?)` *(private)*

BFS traversal of `activity_transition` rows from the completed node.

**Logic:**

1. Load all transitions where `fromActivityId` matches completed activity
2. Filter transitions by `condition` (if present, must match `outcome`)
3. For each matched target:
   - If target is a **parallel join** (multiple incoming edges): call `checkParallelJoin()` — skip if not all branches are done
   - If target is already `active` or `completed`: skip (idempotent)
   - Otherwise: add to activation list
4. Return list of activity keys to activate

### `checkParallelJoin(projectId, activityKey)` *(private)*

Counts how many incoming transitions the target activity has, then counts how many of those source activities are `completed` in this project. Returns `true` only when all incoming branches are done.

### `runHandler(ctx: HandlerContext)` *(private)*

Looks up the handler by name in `ActivityHandlerRegistry`, executes it, and returns the result. Errors are caught and logged — a handler failure does not crash the engine or leave the activity in an inconsistent state.

### `syncProjectActivity(projectId)` *(private)*

Updates the denormalized `project.activity` column to reflect the most recently activated activity key.

### `logEvent(projectId, eventType, opts)` *(private)*

Inserts a row into `activity_event`. Called throughout the engine for audit trail entries.

### `getProjectVersion(projectId)` *(private)*

Fetches the `workflowVersionId` for a project, used to scope all activity_definition queries.

---

## ActivityHandlerRegistry

`src/engine/ActivityHandlerRegistry.ts`

A simple Map-based registry of async handler functions.

```typescript
type ActivityHandler = (ctx: HandlerContext) => Promise<HandlerResult>;

class ActivityHandlerRegistry {
  register(name: string, handler: ActivityHandler): void
  get(name: string): ActivityHandler | undefined
  has(name: string): boolean
}

export const registry = new ActivityHandlerRegistry();
```

Handlers are registered at application startup in `src/handlers/index.ts`. The engine calls `registry.get(handlerName)` when an activity with a `handler` column is activated or triggered.

---

## IDbAdapter

`src/db/IDbAdapter.ts`

Abstract interface for database operations, enabling dependency injection.

```typescript
interface IDbAdapter {
  get<T>(sql: string, params?: unknown[]): Promise<T | undefined>;
  all<T>(sql: string, params?: unknown[]): Promise<T[]>;
  run(sql: string, params?: unknown[]): Promise<{ lastInsertRowid: number; changes: number }>;
}
```

### SqliteAdapter

`src/db/SqliteAdapter.ts` — wraps `better-sqlite3` (synchronous) in the async `IDbAdapter` interface using `Promise.resolve()` wrappers.
