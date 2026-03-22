# Workflow App

A full-stack workflow management application built with Angular 17 and Express 5. Define multi-step workflows, run customer projects through them, track activity progress, assign users, manage tasks, and capture an append-only audit trail — with real-time updates via Kafka and SSE.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Angular 17 (standalone components), RxJS, pure SVG rendering |
| Backend | Express 5, TypeScript, tsx |
| Database | SQLite via better-sqlite3 (WAL mode) |
| Messaging | KafkaJS (workflow events) |
| Real-time | Server-Sent Events (SSE) |

---

## Getting Started

### Prerequisites
- Node.js 18+
- Kafka running locally on `localhost:9092` (optional — app degrades gracefully without it)

### Install

```bash
# Frontend
npm install

# Backend
cd backend && npm install
```

### Run

```bash
# Both frontend and backend together
npm run dev

# Frontend only  (http://localhost:4200)
npm start

# Backend only   (http://localhost:3000)
npm run backend
```

### Build

```bash
npm run build                  # Angular production build
cd backend && npm run build    # TypeScript compile
```

---

## Project Structure

```
workflow-app/
├── src/                              # Angular frontend
│   └── app/
│       ├── components/
│       │   ├── header/               # Project selector, create/delete project
│       │   ├── workflow-graph/       # SVG graph — pan, zoom, node click
│       │   └── activity-tasks/       # Task panel for selected activity node
│       ├── pages/
│       │   ├── home/                 # Main workflow graph view
│       │   ├── workflows/            # Workflow version list
│       │   │   ├── workflow-create   # 4-step creation wizard
│       │   │   └── workflow-edit     # 4-step edit wizard
│       │   ├── artifacts/            # Project documents & emails
│       │   └── weather/              # Weather demo (Kafka SSE)
│       ├── services/
│       │   ├── workflow-data.service       # Loads nodes/edges from API
│       │   ├── workflow-execution.service  # SSE client for live updates
│       │   └── selected-project.service   # Global project selection signal
│       └── models/
│           └── workflow.model        # WorkflowNode, WorkflowEdge types
│
└── backend/
    └── src/
        ├── db/
        │   ├── database.ts           # SQLite connection (WAL mode)
        │   └── initDb.ts             # Schema creation + seed data
        ├── engine/
        │   └── WorkflowEngine.ts     # Core execution engine
        ├── routes/
        │   ├── project.ts            # CRUD for projects
        │   ├── activities.ts         # Activity completion, tasks, assignment
        │   ├── workflow.ts           # Versions, activities, transitions, tasks
        │   ├── artifacts.ts          # Document/email artifacts
        │   ├── events.ts             # Audit log queries
        │   ├── teams.ts              # Team lookup
        │   ├── users.ts              # User lookup
        │   └── weather.ts            # Weather API (Kafka producer)
        └── kafka/
            ├── client.ts             # Kafka client singleton
            ├── workflowProducer.ts   # Publishes activity.completed events
            ├── workflowConsumer.ts   # Consumes events, broadcasts via SSE
            └── workflowEvents.ts     # SSE registry + WorkflowEvent type
```

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
- Attach documents, emails, messages, and communications to a project

---

## API Reference

### Projects
| Method | Path | Description |
|---|---|---|
| `GET` | `/api/projects` | List all projects |
| `GET` | `/api/projects/:id` | Get project |
| `POST` | `/api/projects` | Create project (start activity auto-completed) |
| `PATCH` | `/api/projects/:id` | Update project |
| `DELETE` | `/api/projects/:id` | Delete project and all related data |

### Activities
| Method | Path | Description |
|---|---|---|
| `GET` | `/api/projects/:id/activities` | List project activity instances |
| `POST` | `/api/projects/:id/activities/:activityId/complete` | Complete an activity |
| `POST` | `/api/projects/:id/activities/:activityId/assign` | Assign user to activity |
| `GET` | `/api/projects/:id/activities/:activityId/tasks` | Get tasks for activity |
| `PATCH` | `/api/projects/:id/activities/:activityId/tasks/:taskId` | Update task status |

### Workflow
| Method | Path | Description |
|---|---|---|
| `GET` | `/api/workflow/versions` | List all workflow versions |
| `POST` | `/api/workflow/versions` | Create version (name/description only) |
| `PATCH` | `/api/workflow/versions/:id/activate` | Set version active |
| `PATCH` | `/api/workflow/versions/:id/deactivate` | Set version inactive |
| `GET` | `/api/workflow/activities` | List activity definitions for a version |
| `GET` | `/api/workflow/transitions` | List transitions for a version |
| `GET` | `/api/workflow/tasks` | List activity tasks for a version |
| `POST` | `/api/workflow/full` | Create complete workflow in one transaction |
| `PUT` | `/api/workflow/full/:id` | Replace complete workflow in one transaction |
| `GET` | `/api/workflow/stream?projectId=X` | SSE stream for live activity updates |

### Other
| Method | Path | Description |
|---|---|---|
| `GET` | `/api/projects/:id/events` | Audit log |
| `GET` | `/api/projects/:id/artifacts` | List artifacts |
| `POST` | `/api/projects/:id/artifacts` | Create artifact |
| `GET` | `/api/teams` | List teams |
| `GET` | `/api/users` | List users |
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

`WorkflowEngine` (`backend/src/engine/WorkflowEngine.ts`) drives execution:

- **`initProject`** — activates `start`, immediately completes it, advancing to the first real activity
- **`completeActivity`** — marks activity completed, resolves transitions (respecting decision outcomes and parallel joins), activates next activities, logs events
- **`activateActivity`** — inserts a `project_activity` row, instantiates its tasks, logs `activity.activated`
- **`assignUser`** — creates an `assignment`, validates team membership, logs `user.assigned`

### Real-time event flow
```
POST /activities/:id/complete
  → WorkflowEngine.completeActivity()
      → logs activity.completed
      → activates next activities + logs activity.activated
  → publishWorkflowEvent()  [Kafka topic: workflow-events]
      → workflowConsumer
          → broadcastWorkflowEvent()  [SSE]
              → WorkflowExecutionService (frontend)
                  → graph re-renders with new active node
```
