# Database Schema

SQLite database stored at `data/app.db`. WAL journal mode and foreign key enforcement are enabled on every connection.

## Entity Relationship

```
workflow_version
  └── activity_definition (versionId FK)
        ├── activity_transition (fromActivityId / toActivityId FK)
        └── activity_task (activityDefId FK)

project (workflowVersionId FK)
  └── project_activity (projectId FK, activityId)
        ├── project_activity_task (projectActivityId FK, activityTaskId FK)
        └── assignment (projectActivityId FK, userId FK)

artifact (projectId FK)
activity_event (projectId FK, projectActivityId FK, userId FK)
docusign_envelope (projectId FK)

team
  └── user (teamId FK)
```

---

## Tables

### `workflow_version`

Versioned workflow definition container.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INTEGER | PK AUTOINCREMENT | |
| `name` | TEXT | NOT NULL UNIQUE | Human-readable version name |
| `description` | TEXT | | Optional description |
| `isActive` | INTEGER | DEFAULT 0 | 1 = currently active version |
| `createdAt` | TEXT | DEFAULT CURRENT_TIMESTAMP | |

---

### `activity_definition`

A single node in a workflow graph.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INTEGER | PK AUTOINCREMENT | |
| `activityKey` | TEXT | NOT NULL | Unique key within a version (e.g. `"gather_requirements"`) |
| `versionId` | INTEGER | FK → workflow_version | Owning version |
| `label` | TEXT | NOT NULL | Display label (supports `\n` for multi-line) |
| `nodeType` | TEXT | NOT NULL | `start` \| `end` \| `task` \| `decision` \| `loop` \| `parallel` |
| `col` | INTEGER | DEFAULT 0 | Grid column for layout |
| `row` | INTEGER | DEFAULT 0 | Grid row for layout |
| `teamId` | INTEGER | FK → team | Responsible team |
| `actionType` | TEXT | DEFAULT `'manual'` | `manual` \| `automated` \| `approval` \| `gate` |
| `slaHours` | INTEGER | | Optional SLA in hours |
| `handler` | TEXT | | Handler name in registry (e.g. `"weather"`) |
| `inputSchema` | TEXT | | JSON array of `InputField` objects |

**Unique constraint:** `(activityKey, versionId)`

---

### `activity_transition`

A directed edge between two activity definitions.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INTEGER | PK AUTOINCREMENT | |
| `fromActivityId` | INTEGER | FK → activity_definition | Source node |
| `toActivityId` | INTEGER | FK → activity_definition | Target node |
| `condition` | TEXT | | Condition expression (e.g. `"yes"`, `"no"`, `"approved"`) |
| `edgeType` | TEXT | DEFAULT `'normal'` | `normal` \| `loop` |

---

### `activity_task`

A checklist task template attached to an activity definition.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INTEGER | PK AUTOINCREMENT | |
| `activityDefId` | INTEGER | FK → activity_definition | Owning activity |
| `title` | TEXT | NOT NULL | Task title |
| `description` | TEXT | | Optional detailed description |
| `orderIndex` | INTEGER | DEFAULT 0 | Sort order within activity |

---

### `project`

An execution instance of a workflow for a specific account.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INTEGER | PK AUTOINCREMENT | |
| `accountNumber` | TEXT | NOT NULL UNIQUE | External account identifier |
| `accountName` | TEXT | NOT NULL | Display name |
| `activity` | TEXT | | Current active activity key (denormalized) |
| `workflowVersionId` | INTEGER | FK → workflow_version | Which version this project runs |
| `createdAt` | TEXT | DEFAULT CURRENT_TIMESTAMP | |
| `updatedAt` | TEXT | DEFAULT CURRENT_TIMESTAMP | |

---

### `project_activity`

Runtime state of a single activity within a project.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INTEGER | PK AUTOINCREMENT | |
| `projectId` | INTEGER | FK → project | Owning project |
| `activityId` | TEXT | NOT NULL | Activity key |
| `status` | TEXT | DEFAULT `'pending'` | `pending` \| `active` \| `completed` \| `skipped` |
| `decisionOutcome` | TEXT | | Outcome value for decision/gate nodes |
| `iterationCount` | INTEGER | DEFAULT 0 | Loop iteration counter |
| `startedAt` | TEXT | | When status became `active` |
| `completedAt` | TEXT | | When status became `completed` |
| `input` | TEXT | | JSON input data (from handler trigger) |
| `output` | TEXT | | JSON output data (from handler result) |

---

### `project_activity_task`

Instance of a task template for a specific project activity execution.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INTEGER | PK AUTOINCREMENT | |
| `projectActivityId` | INTEGER | FK → project_activity | Owning activity instance |
| `activityTaskId` | INTEGER | FK → activity_task | Template task |
| `completed` | INTEGER | DEFAULT 0 | Legacy boolean flag |
| `completedAt` | TEXT | | When task was completed |
| `status` | TEXT | DEFAULT `'new'` | `new` \| `in_progress` \| `done` |

---

### `assignment`

Records a user being assigned to a specific project activity instance.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INTEGER | PK AUTOINCREMENT | |
| `projectActivityId` | INTEGER | FK → project_activity | Activity being assigned |
| `userId` | INTEGER | FK → user | Assigned user |
| `assignedAt` | TEXT | DEFAULT CURRENT_TIMESTAMP | |
| `completedAt` | TEXT | | When assignment was resolved |
| `notes` | TEXT | | Optional notes |

---

### `artifact`

Documents, emails, and other attachments associated with a project.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INTEGER | PK AUTOINCREMENT | |
| `projectId` | INTEGER | FK → project | Owning project |
| `type` | TEXT | NOT NULL | `document` \| `email` \| `message` \| `communication` |
| `title` | TEXT | NOT NULL | Display title |
| `content` | TEXT | | Text content (for non-file artifacts) |
| `fileName` | TEXT | | Original upload filename |
| `filePath` | TEXT | | Server-side storage path |
| `mimeType` | TEXT | | MIME type of uploaded file |
| `fileSize` | INTEGER | | File size in bytes |
| `createdAt` | TEXT | DEFAULT CURRENT_TIMESTAMP | |

Files are stored at `uploads/proj-<projectId>/<filename>`.

---

### `activity_event`

Audit log of everything that happens during a project's lifecycle.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INTEGER | PK AUTOINCREMENT | |
| `projectId` | INTEGER | FK → project | |
| `projectActivityId` | INTEGER | | Optional reference to activity instance |
| `eventType` | TEXT | NOT NULL | e.g. `activity.activated`, `activity.completed`, `user.assigned`, `task.started`, `task.completed` |
| `activityId` | TEXT | | Activity key |
| `userId` | INTEGER | FK → user | User who triggered the event |
| `payload` | TEXT | | JSON payload with event-specific data |
| `occurredAt` | TEXT | DEFAULT CURRENT_TIMESTAMP | |

---

### `docusign_envelope`

Tracks DocuSign envelopes sent for projects.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `envelopeId` | TEXT | PK | DocuSign envelope UUID |
| `projectId` | INTEGER | FK → project | Associated project |
| `createdAt` | TEXT | DEFAULT CURRENT_TIMESTAMP | |

Used by the DocuSign webhook to look up which project to advance when a signature is completed.

---

### `team`

Organizational teams. Each activity definition can be owned by a team.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INTEGER | PK AUTOINCREMENT | |
| `name` | TEXT | NOT NULL UNIQUE | Team name |
| `description` | TEXT | | |
| `createdAt` | TEXT | DEFAULT CURRENT_TIMESTAMP | |

---

### `user`

Users who can be assigned to activities.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INTEGER | PK AUTOINCREMENT | |
| `name` | TEXT | NOT NULL | Display name |
| `email` | TEXT | NOT NULL UNIQUE | Email address |
| `teamId` | INTEGER | FK → team | Team membership |
| `createdAt` | TEXT | DEFAULT CURRENT_TIMESTAMP | |

---

## Seed Data

On first run, `initDb.ts` seeds the following:

### Teams (5)
Analysis, Design, Engineering, QA, DevOps

### Users (8)
Distributed across the 5 teams.

### Workflow Versions (3)

| Version | Activities | Description |
|---------|-----------|-------------|
| **1.0** | 15 | Full SDLC: requirements → design → design review decision → parallel dev split → testing → bug loop → staging → UAT → deploy |
| **2.0** | 7 | Proposal workflow: gather requirements → prepare proposal (weather handler) → send proposal → signed (DocuSign gate) → submit |
| **3.0** | 22 | Custom pricing: linear 20-step workflow (step1–step20) |

### Projects (5)
ACC-0001 through ACC-0005, each pointing to a workflow version.
