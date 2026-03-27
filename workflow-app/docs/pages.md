# Pages

Route-level components (lazy-loaded via Angular router).

---

## HomeComponent

`src/app/pages/home/home.component.ts`

**Route:** `/`

The main application view. Displays the selected project's workflow graph.

### Layout

```
┌──────────────────────────────────────────────────┐
│  Hero section                                     │
│  - "Workflow Engine" title                        │
│  - Selected project: ACC-0001 · Acme Corp         │
│  - Status badge (Active / No project selected)    │
├──────────────────────────────────────────────────┤
│  WorkflowGraphComponent                           │
│  - Renders SVG graph for selected project         │
│  - Embedded ActivityTasksComponent on node click  │
└──────────────────────────────────────────────────┘
```

### Behavior

- Reads `SelectedProjectService.selected()` signal reactively
- If no project is selected, shows a prompt to select one from the header
- Passes `projectId` and `projectActivity` to `WorkflowGraphComponent`

---

## ArtifactsComponent

`src/app/pages/artifacts/artifacts.component.ts`

**Route:** `/artifacts`

Manages project artifacts (documents, emails, messages) and Azure Blob Storage containers.

### Layout

```
┌──────────────────────────┬───────────────────────────┐
│  Project Artifacts        │  Azure Blob Storage        │
│  - Type filter tabs       │  - Container selector      │
│  - Artifact list          │  - Blob list               │
│  - Upload form            │  - Upload button           │
│  - Download/Delete        │  - Download/Delete buttons │
│                           │  - SAS URL generators      │
└──────────────────────────┴───────────────────────────┘
```

### Features

**Project Artifacts (left panel):**
- List artifacts for the selected project
- Filter by type: all / document / email / message / communication
- Upload: file upload (multipart) or text content (JSON)
- Download: streams file from `GET /api/projects/:id/artifacts/:aid/file`
- Delete: calls `DELETE /api/projects/:id/artifacts/:aid`

**Azure Blob Storage (right panel):**
- List blobs in a selected container
- Upload file to container via server (`POST /api/storage/:container/upload`)
- Download blob (`GET /api/storage/:container/download/:blobName`)
- Delete blob (`DELETE /api/storage/:container/:blobName`)
- Generate SAS URLs:
  - Upload SAS: `POST /api/storage/sas/upload`
  - Download SAS: `POST /api/storage/sas/download`
  - Container SAS: `POST /api/storage/sas/container`

### Key Methods

**`loadArtifacts()`** — Fetches `GET /api/projects/:id/artifacts?type=X`

**`uploadArtifact(file, type, title)`** — Multipart POST to `/api/projects/:id/artifacts`

**`downloadArtifact(artifact)`** — Navigates to file URL

**`deleteArtifact(id)`** — DELETE with confirmation

**`listBlobs(container)`** — Fetches `GET /api/storage/:container/list`

**`generateUploadSas(container, blobName)`** — Returns SAS URL displayed in UI

---

## WorkflowsComponent

`src/app/pages/workflows/workflows.component.ts`

**Route:** `/workflows`

Lists all workflow versions and provides activate/deactivate/edit controls.

### Layout

```
┌────────────────────────────────────────────────┐
│  Workflow Versions                    [+ Create] │
├────────────────────────────────────────────────┤
│  ● 2.0  Proposal Workflow   [Active]            │
│    [Deactivate]  [Edit]                         │
├────────────────────────────────────────────────┤
│  ○ 1.0  Full SDLC           [Inactive]          │
│    [Activate]  [Edit]                           │
└────────────────────────────────────────────────┘
```

### Key Methods

**`loadVersions()`** — Fetches `GET /api/workflow/versions`

**`activate(id)`** — Calls `PATCH /api/workflow/versions/:id/activate`, reloads list

**`deactivate(id)`** — Calls `PATCH /api/workflow/versions/:id/deactivate`, reloads list

**`editWorkflow(id)`** — Navigates to `/workflows/:id/edit`

---

## WorkflowCreateComponent

`src/app/pages/workflows/workflow-create.component.ts`

**Route:** `/workflows/create`

4-step wizard for creating a new workflow version.

### Steps

**Step 1 — Version Info**
- `name` (required, unique)
- `description` (optional)

**Step 2 — Activities**

Add/remove activity definitions. Per-activity fields:

| Field | Type | Description |
|-------|------|-------------|
| `activityKey` | text | Unique key (e.g. `gather_requirements`) |
| `label` | text | Display label, supports `\n` for line breaks |
| `nodeType` | select | `start` \| `end` \| `task` \| `decision` \| `loop` \| `parallel` |
| `col` | number | Grid column position |
| `row` | number | Grid row position |
| `teamId` | select | Responsible team |
| `actionType` | select | `manual` \| `automated` \| `approval` \| `gate` |
| `slaHours` | number | Optional SLA |
| `handler` | text | Handler name (e.g. `weather`) |
| `inputSchema` | textarea | JSON array of `InputField` objects |

**Step 3 — Transitions**

Add/remove directed edges between activities.

| Field | Type | Description |
|-------|------|-------------|
| `from` | select | Source activity key |
| `to` | select | Target activity key |
| `condition` | text | Optional condition (e.g. `yes`, `approved`) |
| `edgeType` | select | `normal` \| `loop` |

**Step 4 — Tasks**

Add/remove checklist tasks per activity.

| Field | Type | Description |
|-------|------|-------------|
| `activityKey` | select | Which activity this task belongs to |
| `title` | text | Task title |
| `description` | text | Optional detail |
| `orderIndex` | number | Sort order |

### Submission

Calls `POST /api/workflow/full` with all collected data. On success, navigates to `/workflows`.

---

## WorkflowEditComponent

`src/app/pages/workflows/workflow-edit.component.ts`

**Route:** `/workflows/:id/edit`

Same 4-step wizard as create, pre-populated with existing workflow data.

### Initialization

On load:
1. Fetches `GET /api/workflow/versions` to load version metadata
2. Fetches `GET /api/workflow/activities?versionId=:id` to populate Step 2
3. Fetches `GET /api/workflow/transitions?versionId=:id` to populate Step 3
4. Fetches `GET /api/workflow/tasks?versionId=:id` to populate Step 4

### Submission

Calls `PUT /api/workflow/full/:id` with all data. This **replaces** all activities, transitions, and tasks for the version atomically.

**Warning:** Existing projects using this version will be affected if activity keys change.
