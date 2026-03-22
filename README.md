# Workflow

A monorepo containing two projects:

| Project | Description |
|---|---|
| `workflow-app` | Angular 17 frontend |
| `workflow-engine` | Express 5 / TypeScript backend |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Angular 17 (standalone components), RxJS, pure SVG rendering |
| Backend | Express 5, TypeScript, tsx |
| Database | SQLite via better-sqlite3 (WAL mode) |
| Messaging | KafkaJS (workflow events) |
| Real-time | Server-Sent Events (SSE) |
| E-Signatures | DocuSign (JWT server-to-server) |
| File storage | Azure Blob Storage (@azure/storage-blob, 100 MB limit) |
| CRM integration | Salesforce (inbound webhook — project creation & submission) |

---

## Getting Started

### Prerequisites
- Node.js 18+
- Kafka running locally on `localhost:9092` (optional — app degrades gracefully without it)

### Install

```bash
# Frontend
cd workflow-app && npm install

# Backend
cd workflow-engine && npm install
```

### Run

```bash
# Frontend  (http://localhost:4200)
cd workflow-app && npm start

# Backend   (http://localhost:3001)
cd workflow-engine && npm run dev
```

### Build

```bash
cd workflow-app  && npm run build   # Angular production build
cd workflow-engine && npm run build  # TypeScript compile
```

---

## Project Structure

```
Workflow/
├── workflow-app/                         # Angular 17 frontend
│   └── src/app/
│       ├── components/
│       │   ├── header/                   # Project selector, create/delete project
│       │   ├── workflow-graph/           # SVG graph — pan, zoom, node click
│       │   └── activity-tasks/           # Task panel for selected activity node
│       ├── pages/
│       │   ├── home/                     # Main workflow graph view
│       │   ├── workflows/                # Workflow version list
│       │   │   ├── workflow-create       # 4-step creation wizard
│       │   │   └── workflow-edit         # 4-step edit wizard
│       │   └── artifacts/               # Project documents & emails
│       ├── services/
│       │   ├── engine-api.service        # Single HTTP gateway → workflow-engine (:3001)
│       │   ├── workflow-data.service     # Loads nodes/edges from API
│       │   ├── workflow-execution.service # SSE client for live updates
│       │   ├── notification.service      # Global SSE + Angular signals (bell badge)
│       │   └── selected-project.service  # Global project selection signal
│       └── models/
│           └── workflow.model            # WorkflowNode, WorkflowEdge, NodeType, ActionType
│
└── workflow-engine/                      # Express 5 backend
    └── src/
        ├── db/
        │   ├── database.ts               # SQLite connection (WAL mode)
        │   └── initDb.ts                 # Schema creation + seed data
        ├── engine/
        │   ├── WorkflowEngine.ts         # Core execution state machine
        │   └── ActivityHandlerRegistry.ts # Handler name → async function map
        ├── handlers/
        │   ├── weatherHandler.ts         # Open-Meteo API (demo automated step)
        │   └── sendProposalHandler.ts    # DocuSign JWT envelope dispatch
        ├── routes/
        │   ├── project.ts                # CRUD for projects
        │   ├── activities.ts             # Activity completion, tasks, assignment
        │   ├── workflow.ts               # Versions, activities, transitions, tasks
        │   ├── artifacts.ts              # Document/email artifacts
        │   ├── events.ts                 # Audit log queries
        │   ├── teams.ts                  # Team lookup
        │   ├── users.ts                  # User lookup
        │   ├── docusign.ts               # DocuSign send + webhook
        │   ├── azureStorage.ts           # Azure Blob Storage (upload, download, SAS)
        │   ├── salesforce.ts             # Salesforce inbound (start, submit)
        │   └── health.ts                 # Health check
        ├── services/
        │   ├── docusign.service.ts       # DocuSign JWT auth + envelope API
        │   └── azureStorage.service.ts   # Azure SDK wrapper
        └── kafka/
            ├── client.ts                 # Kafka client singleton
            ├── producer.ts               # Publishes activity.completed events
            ├── consumer.ts               # Consumes events, broadcasts via SSE
            └── events.ts                 # SSE registry + WorkflowEvent type
```

---

## Frontend API Gateway

All HTTP and SSE calls from the frontend pass through a single service:

```
EngineApiService  (workflow-app/src/app/services/engine-api.service.ts)
  baseUrl = 'http://localhost:3001'
  get / post / patch / put / delete
```

No component or other service calls `HttpClient` directly. `WorkflowExecutionService` and `NotificationService` construct SSE URLs from `engine.baseUrl`.

---

## Features

### Workflow Management (`/workflows`)
- View all workflow versions with active/inactive status
- **Create Workflow** — 4-step wizard:
  1. Version name and description
  2. Activities (activityKey, label, nodeType, actionType, team, SLA hours, grid position)
  3. Transitions (from → to, condition, edge type)
  4. Tasks (checklist items per activity)
- **Edit Workflow** — same wizard pre-populated with existing data
- Activate / deactivate versions
- Activity labels support `\n` or spaces to insert line breaks in the graph

### Project Execution (Home)
- Select a customer project from the header dropdown; create or delete projects inline
- SVG workflow graph with pan, zoom, and node click — active node auto-selected on load
- Clicking a node opens the **Activity Tasks** panel
- Tasks cycle `new → in_progress → done`; all tasks done auto-advances the activity
- Real-time graph updates via Kafka → SSE when any client completes an activity

### Audit Log
- Every activity activation/completion, task start/complete, and user assignment is recorded
- Query via `GET /api/projects/:id/events` with optional `activityId` and `eventType` filters

### Artifacts (`/artifacts`)
- Attach documents and emails to a project

### Azure Blob Storage
- Upload files (up to 100 MB) to Azure Blob containers via multipart or direct SDK
- Generate SAS URLs for upload/download/container-level access
- Download, list, and delete blobs

### Salesforce Integration
- `POST /api/salesforce/start` — creates a project from an inbound Salesforce record and advances the workflow past the `pqr_created` activity
- `POST /api/salesforce/submit/:accountNumber` — advances the project past the `pqr_submitted` activity with the submitted payload

---

## API Reference

### Projects
| Method | Path | Description |
|---|---|---|
| `GET` | `/api/projects` | List all projects |
| `GET` | `/api/projects/:id` | Get project |
| `POST` | `/api/projects` | Create project |
| `PATCH` | `/api/projects/:id` | Update project |
| `DELETE` | `/api/projects/:id` | Delete project and all related data |

### Activities
| Method | Path | Description |
|---|---|---|
| `GET` | `/api/projects/:id/activities` | List project activity instances |
| `POST` | `/api/projects/:id/activities/:key/complete` | Complete an activity |
| `POST` | `/api/projects/:id/activities/:key/trigger` | Trigger automated handler |
| `POST` | `/api/projects/:id/activities/:key/assign` | Assign user to activity |
| `GET` | `/api/projects/:id/activities/:key/tasks` | Get tasks for activity |
| `PATCH` | `/api/projects/:id/activities/:key/tasks/:tid` | Update task status |

### Workflow
| Method | Path | Description |
|---|---|---|
| `GET` | `/api/workflow/versions` | List all workflow versions |
| `POST` | `/api/workflow/versions` | Create version |
| `PATCH` | `/api/workflow/versions/:id/activate` | Set version active |
| `PATCH` | `/api/workflow/versions/:id/deactivate` | Set version inactive |
| `GET` | `/api/workflow/activities` | Activity definitions for a version |
| `GET` | `/api/workflow/transitions` | Transitions for a version |
| `GET` | `/api/workflow/tasks` | Task templates for a version |
| `POST` | `/api/workflow/full` | Create complete workflow in one transaction |
| `PUT` | `/api/workflow/full/:id` | Replace complete workflow in one transaction |
| `GET` | `/api/workflow/stream?projectId=X` | SSE — project-scoped live updates |
| `GET` | `/api/workflow/stream/global` | SSE — all-project notifications |

### Azure Blob Storage
| Method | Path | Description |
|---|---|---|
| `POST` | `/api/storage/sas/upload` | Generate upload SAS URL |
| `POST` | `/api/storage/sas/download` | Generate download SAS URL |
| `POST` | `/api/storage/sas/container` | Generate container SAS URL |
| `POST` | `/api/storage/:container/upload` | Upload file (multipart, 100 MB max) |
| `POST` | `/api/storage/:container/create` | Create text/JSON blob |
| `GET` | `/api/storage/:container/download/:blobName` | Download blob (streamed) |
| `GET` | `/api/storage/:container/list` | List blobs (optional `?prefix=`) |
| `DELETE` | `/api/storage/:container/:blobName` | Delete blob |

### DocuSign
| Method | Path | Description |
|---|---|---|
| `POST` | `/api/docusign/send` | Send envelope (standalone or workflow-triggered) |
| `POST` | `/api/docusign/webhook` | DocuSign Connect callback |

### Salesforce
| Method | Path | Description |
|---|---|---|
| `POST` | `/api/salesforce/start` | Create project from Salesforce record |
| `POST` | `/api/salesforce/submit/:accountNumber` | Advance project with submitted data |

### Other
| Method | Path | Description |
|---|---|---|
| `GET` | `/api/projects/:id/events` | Audit log |
| `GET` | `/api/projects/:id/artifacts` | List artifacts |
| `POST` | `/api/projects/:id/artifacts` | Create artifact |
| `GET` | `/api/projects/:id/artifacts/:aid/file` | Download artifact file |
| `DELETE` | `/api/projects/:id/artifacts/:aid` | Delete artifact |
| `GET` | `/api/teams` | List teams |
| `GET` | `/api/users` | List users |
| `POST` | `/api/users` | Create user |
| `GET` | `/api/health` | Health check |

---

## Database Schema

### Tables

| Table | Purpose |
|---|---|
| `workflow_version` | Versioned workflow definitions |
| `activity_definition` | Activities within a version (graph nodes) |
| `activity_transition` | Directed edges between activities |
| `activity_task` | Checklist task templates per activity |
| `project` | Customer/account projects |
| `project_activity` | Runtime activity instances per project |
| `project_activity_task` | Task execution state per project activity |
| `assignment` | User assignments to project activities |
| `artifact` | Documents and communications per project |
| `activity_event` | Append-only audit log |
| `docusign_envelope` | Envelope ID ↔ project mapping |
| `team` | Organisational teams |
| `user` | Users belonging to teams |

### Key relationships
```
workflow_version
  ├── activity_definition  (1:N)
  │     ├── activity_transition  from/to  (N:N)
  │     └── activity_task        (1:N)
  └── project              (1:N)
        ├── project_activity     (1:N)
        │     ├── project_activity_task  (1:N)
        │     ├── assignment             (1:N)
        │     └── activity_event        (1:N)
        └── artifact             (1:N)
```

---

## Workflow Engine

`WorkflowEngine` (`workflow-engine/src/engine/WorkflowEngine.ts`) drives execution:

- **`initProject`** — activates `start`, immediately completes it, advancing to the first real activity
- **`completeActivity`** — marks activity completed, resolves transitions (respecting decision outcomes and parallel joins), activates next activities, logs events
- **`activateActivity`** — inserts a `project_activity` row, instantiates its tasks, logs `activity.activated`
- **`assignUser`** — creates an `assignment`, validates team membership, logs `user.assigned`
- **`triggerActivity`** — manually fires the handler for an approval or automated activity

### Real-time event flow
```
POST /activities/:key/complete
  → WorkflowEngine.completeActivity()
      → logs activity.completed
      → activates next activities + logs activity.activated
  → publishWorkflowEvent()  [Kafka topic: workflow-events]
      → workflowConsumer
          → broadcastWorkflowEvent()  [SSE]
              → WorkflowExecutionService (frontend)
                  → graph re-renders with new active node
```

---

## Environment Variables

### workflow-engine/.env

```
# DocuSign
DOCUSIGN_BASE_PATH=https://demo.docusign.net/restapi
DOCUSIGN_CLIENT_ID=...
DOCUSIGN_USER_ID=...
DOCUSIGN_PRIVATE_KEY=...
DOCUSIGN_ACCOUNT_ID=...
DOCUSIGN_TEMPLATE_ID=...

# Azure Blob Storage
AZURE_STORAGE_ACCOUNT_NAME=...
AZURE_STORAGE_ACCOUNT_KEY=...

# Optional
PORT=3001
CORS_ORIGIN=http://localhost:4200
```
