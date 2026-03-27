# API Reference

Base URL: `http://localhost:3001`

All request and response bodies are JSON unless noted otherwise.

---

## Health

### `GET /api/health`

Returns server status.

**Response**
```json
{ "status": "ok" }
```

---

## Projects

### `GET /api/projects`

List all projects.

**Response** — array of project objects
```json
[
  {
    "id": 1,
    "accountNumber": "ACC-0001",
    "accountName": "Acme Corp",
    "activity": "gather_requirements",
    "workflowVersionId": 2,
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  }
]
```

---

### `GET /api/projects/:id`

Get a single project by ID.

**Response** — single project object (same shape as above)

---

### `POST /api/projects`

Create a new project and initialize its workflow.

**Request body**
```json
{
  "accountNumber": "ACC-0010",
  "accountName": "New Client",
  "workflowVersionId": 2
}
```

**Response** — created project object

**Side effects:**
- Calls `workflowEngine.initProject()` — activates the `start` activity and immediately transitions to the first real activity.

---

### `PATCH /api/projects/:id`

Update a project's account name or manually advance its current activity pointer.

**Request body** (all fields optional)
```json
{
  "accountName": "Updated Name",
  "activity": "testing"
}
```

**Notes:**
- If `activity` is provided, it must exist in the project's workflow version.

---

### `DELETE /api/projects/:id`

Delete a project and all associated data.

**Side effects (cascading, in a transaction):**
Deletes assignments → project_activity_tasks → project_activities → events → artifacts → docusign_envelopes → project

---

## Activities

### `GET /api/projects/:id/activities`

List all activity instances for a project with team and assignment info.

**Response**
```json
[
  {
    "id": 5,
    "projectId": 1,
    "activityId": "gather_requirements",
    "status": "completed",
    "decisionOutcome": null,
    "iterationCount": 0,
    "startedAt": "2024-01-01T10:00:00.000Z",
    "completedAt": "2024-01-01T11:00:00.000Z",
    "input": null,
    "output": null,
    "label": "Gather Requirements",
    "nodeType": "task",
    "actionType": "manual",
    "teamId": 1,
    "teamName": "Analysis",
    "handler": null,
    "slaHours": null,
    "assignedUserId": 2,
    "assignedUserName": "Alice",
    "assignmentId": 3
  }
]
```

---

### `POST /api/projects/:id/activities/:key/complete`

Complete an active activity and advance the workflow.

**Request body** (optional)
```json
{
  "outcome": "yes",
  "output": { "anyKey": "anyValue" }
}
```

- `outcome` — required for decision/gate nodes (matches transition condition)
- `output` — arbitrary JSON stored on the `project_activity` record

**Response** — array of newly activated `project_activity` objects

**Side effects:**
- Runs registered handler (if activity has one)
- Resolves and activates next activities
- Publishes Kafka / SSE event

---

### `POST /api/projects/:id/activities/:key/reject`

Reject a decision activity (shorthand for complete with `outcome: "no"`).

**Response** — array of newly activated activities

---

### `POST /api/projects/:id/activities/:key/set-active`

Reset an activity and all forward-reachable activities back to `pending`, then re-activate the specified activity.

Useful for re-running a portion of the workflow.

**Response** `200 OK`

---

### `POST /api/projects/:id/activities/:key/trigger`

Manually fire the handler for an activity without completing it (useful for testing automated handlers).

**Request body** (optional)
```json
{
  "input": { "latitude": 51.5, "longitude": -0.1 }
}
```

**Response** `200 OK`

---

### `POST /api/projects/:id/activities/:key/assign`

Assign a user to a project activity.

**Request body**
```json
{
  "userId": 3
}
```

**Response** — created assignment object
```json
{
  "id": 1,
  "projectActivityId": 5,
  "userId": 3,
  "assignedAt": "2024-01-01T10:00:00.000Z",
  "completedAt": null,
  "notes": null
}
```

**Validation:** The user must belong to the team that owns the activity.

---

### `GET /api/projects/:id/activities/:key/tasks`

Get task instances for an activity.

- If the activity is active: returns `project_activity_task` rows with status
- If the activity has not started: returns template tasks from `activity_task`

**Response**
```json
[
  {
    "id": 1,
    "title": "Review requirements document",
    "description": "Read the SOW and flag gaps",
    "orderIndex": 0,
    "status": "in_progress",
    "completedAt": null
  }
]
```

---

### `PATCH /api/projects/:id/activities/:key/tasks/:tid`

Update the status of a task instance.

**Request body**
```json
{
  "status": "done"
}
```

Valid transitions: `new` → `in_progress` → `done`

**Side effects:**
- Logs `task.started` event on transition to `in_progress`
- Logs `task.completed` event on transition to `done`
- When all tasks are `done`, the activity is NOT auto-completed (user still clicks complete)

---

## Workflow Definitions

### `GET /api/workflow/versions`

List all workflow versions.

**Response**
```json
[
  {
    "id": 1,
    "name": "1.0",
    "description": "Full SDLC workflow",
    "isActive": 0,
    "createdAt": "2024-01-01T00:00:00.000Z"
  }
]
```

---

### `POST /api/workflow/versions`

Create a blank workflow version.

**Request body**
```json
{
  "name": "3.1",
  "description": "Revised pricing flow"
}
```

---

### `PATCH /api/workflow/versions/:id/activate`

Set a version as active (deactivates all others).

---

### `PATCH /api/workflow/versions/:id/deactivate`

Set a version as inactive.

---

### `GET /api/workflow/activities`

List activity definitions. Pass `?versionId=2` to filter by version; omit to get the active version's activities.

**Response** — array of `activity_definition` rows

---

### `GET /api/workflow/transitions`

List transitions. Pass `?versionId=2` to filter; omit for active version.

---

### `GET /api/workflow/tasks`

List all activity task templates. Pass `?versionId=2` to filter.

---

### `POST /api/workflow/full`

Create a complete workflow version (definition + activities + transitions + tasks) in a single atomic transaction.

**Request body**
```json
{
  "name": "4.0",
  "description": "New workflow",
  "activities": [
    {
      "activityKey": "start",
      "label": "Start",
      "nodeType": "start",
      "col": 0,
      "row": 0,
      "actionType": "manual"
    },
    {
      "activityKey": "review",
      "label": "Review",
      "nodeType": "task",
      "col": 1,
      "row": 0,
      "teamId": 1,
      "actionType": "manual",
      "slaHours": 24,
      "handler": null,
      "inputSchema": null
    },
    {
      "activityKey": "end",
      "label": "End",
      "nodeType": "end",
      "col": 2,
      "row": 0,
      "actionType": "manual"
    }
  ],
  "transitions": [
    { "from": "start", "to": "review" },
    { "from": "review", "to": "end" }
  ],
  "tasks": [
    {
      "activityKey": "review",
      "title": "Read document",
      "description": "",
      "orderIndex": 0
    }
  ]
}
```

**Response** — created workflow version object with `id`

---

### `PUT /api/workflow/full/:id`

Replace an existing workflow version's activities, transitions, and tasks atomically.

Same body shape as `POST /api/workflow/full` (minus `name` and `description` which are optional update fields).

**Warning:** This deletes and re-creates all activities, transitions, and tasks for the version. Existing projects on this version will lose their activity definition references if keys change.

---

## Teams

### `GET /api/teams`

List all teams.

**Response**
```json
[
  { "id": 1, "name": "Analysis", "description": "...", "createdAt": "..." }
]
```

---

## Users

### `GET /api/users`

List all users. Pass `?teamId=1` to filter by team.

**Response**
```json
[
  { "id": 1, "name": "Alice", "email": "alice@example.com", "teamId": 1, "createdAt": "..." }
]
```

---

### `POST /api/users`

Create a user.

**Request body**
```json
{
  "name": "Bob",
  "email": "bob@example.com",
  "teamId": 2
}
```

---

## Artifacts

### `GET /api/projects/:id/artifacts`

List artifacts for a project. Pass `?type=document` to filter by type.

---

### `POST /api/projects/:id/artifacts`

Upload an artifact. Accepts either multipart/form-data (for file uploads) or JSON.

**Multipart fields:**
- `file` — binary file (max 50 MB)
- `type` — `document` | `email` | `message` | `communication`
- `title` — display title

**JSON body (for non-file artifacts):**
```json
{
  "type": "email",
  "title": "Proposal email",
  "content": "Dear customer..."
}
```

---

### `GET /api/projects/:id/artifacts/:aid/file`

Stream/download an artifact file.

---

### `DELETE /api/projects/:id/artifacts/:aid`

Delete an artifact record and its associated file from disk.

---

## Audit Events

### `GET /api/projects/:id/events`

Query the audit log for a project.

**Query parameters:**
- `activityId` — filter by activity key
- `eventType` — filter by event type
- `limit` — max results (default 200, max 1000)

**Response**
```json
[
  {
    "id": 1,
    "projectId": 1,
    "projectActivityId": 5,
    "eventType": "activity.completed",
    "activityId": "gather_requirements",
    "userId": 2,
    "userName": "Alice",
    "activityLabel": "Gather Requirements",
    "payload": "{}",
    "occurredAt": "2024-01-01T11:00:00.000Z"
  }
]
```

**Event types:** `activity.activated`, `activity.completed`, `user.assigned`, `task.started`, `task.completed`

---

## DocuSign

### `POST /api/docusign/send`

Send a DocuSign envelope. Can be standalone or workflow-triggered.

**Request body**
```json
{
  "buyerEmail": "buyer@example.com",
  "buyerName": "John Buyer",
  "sellerEmail": "seller@example.com",
  "sellerName": "Jane Seller",
  "agreementParty": "Acme Corp",
  "jurisdiction": "California",
  "projectId": 1,
  "activityId": "send_proposal"
}
```

- When `projectId` + `activityId` are provided: triggers the activity handler which sends the envelope and completes the activity.
- Without them: sends the envelope directly without advancing any workflow.

---

### `POST /api/docusign/webhook`

DocuSign webhook callback. Called by DocuSign when envelope status changes.

**Request body** — DocuSign Connect event payload

When `envelope-completed` event is received, looks up the project via `docusign_envelope` table and completes the `signed` activity.

---

## Azure Blob Storage

### `POST /api/storage/sas/upload`

Generate a SAS URL for direct client upload.

**Request body**
```json
{
  "container": "documents",
  "blobName": "contract.pdf",
  "expiresInMinutes": 60
}
```

**Response** `{ "sasUrl": "https://..." }`

---

### `POST /api/storage/sas/download`

Generate a SAS URL for direct client download.

Same body shape as upload SAS.

---

### `POST /api/storage/sas/container`

Generate a container-level SAS URL.

**Request body**
```json
{
  "container": "documents",
  "permissions": "r",
  "expiresInMinutes": 60
}
```

---

### `POST /api/storage/:container/upload`

Upload a file to Azure Blob Storage via the server (max 100 MB).

**Multipart fields:** `file`

---

### `POST /api/storage/:container/create`

Create a text or JSON blob.

**Request body**
```json
{
  "blobName": "config.json",
  "content": "{\"key\": \"value\"}",
  "contentType": "application/json"
}
```

---

### `GET /api/storage/:container/download/:blobName`

Stream a blob from Azure.

---

### `GET /api/storage/:container/list`

List blobs in a container. Pass `?prefix=folder/` to filter.

---

### `DELETE /api/storage/:container/:blobName`

Delete a blob.

---

## Salesforce

### `POST /api/salesforce/start`

Create a project from a Salesforce record and advance past the initial step.

**Request body**
```json
{
  "accountNumber": "SF-001",
  "accountName": "Salesforce Customer",
  "workflowVersionId": 3
}
```

**Side effects:** Creates project → `initProject()` → `completeActivity('step1')`

---

### `POST /api/salesforce/submit/:accountNumber`

Advance a Salesforce-created project past step2.

**Request body**
```json
{
  "payload": { "submittedData": "..." }
}
```

**Side effects:** Finds project by `accountNumber` → `completeActivity('step2', { output: payload })`

---

## Real-time (SSE)

### `GET /api/workflow/stream?projectId=:id`

Open a Server-Sent Events stream for a specific project.

Events are emitted when activities complete within that project.

**Event format:**
```
event: message
data: {"type":"activity.completed","projectId":1,"activityId":"gather_requirements","activityLabel":"Gather Requirements","activatedActivities":["prepare_proposal"],"timestamp":"2024-01-01T11:00:00.000Z"}
```

---

### `GET /api/workflow/stream/global`

Open a Server-Sent Events stream for all projects.

Same event format as project-scoped stream. Used for the notification bell in the frontend header.
