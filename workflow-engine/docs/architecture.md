# Architecture

## Overview

`workflow-engine` is a stateful workflow orchestration backend. It stores workflow definitions and project execution state in SQLite, drives state transitions through a core engine, and broadcasts real-time events to connected frontend clients via SSE.

```
┌─────────────────────────────────────────────────────────────────┐
│                        workflow-app (Angular)                    │
│                   SSE client  |  REST HTTP calls                 │
└──────────────────┬────────────┴──────────────────────────────────┘
                   │
┌──────────────────▼────────────────────────────────────────────────┐
│                        Express 5 (port 3001)                       │
│  /api/projects  /api/workflow  /api/docusign  /api/storage  ...    │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────┐     │
│  │                    WorkflowEngine                         │     │
│  │  initProject → completeActivity → resolveNextActivities   │     │
│  │  activateActivity → (run handler) → publishKafkaEvent     │     │
│  └──────────────────────┬───────────────────────────────────┘     │
│                          │                                         │
│  ┌───────────────────────▼──────────────────────────────────┐     │
│  │               ActivityHandlerRegistry                     │     │
│  │   weather | send_proposal | writeToExcel | ...            │     │
│  └──────────────────────────────────────────────────────────┘     │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────┐     │
│  │                      SQLite (WAL)                         │     │
│  │  workflow_version | activity_definition | project | ...   │     │
│  └──────────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────────────┘
                   │
┌──────────────────▼──────────────────┐
│   Kafka topic: workflow-events       │
│   Consumer → Redis pub/sub → SSE     │
└──────────────────────────────────────┘
```

## Layers

### 1. HTTP Layer (`src/routes/`)

Thin Express routers. Each route module is responsible for a single domain (projects, activities, workflow definitions, artifacts, etc.). Routes do minimal logic — they validate inputs and delegate to the WorkflowEngine or service layer.

### 2. Engine Layer (`src/engine/`)

`WorkflowEngine` is the single source of truth for execution state. It:

- Loads workflow definitions from the database via `IDbAdapter`
- Runs the state machine (pending → active → completed/skipped)
- Calls handlers for automated activities
- Resolves graph transitions using BFS
- Detects and enforces parallel joins
- Publishes Kafka events after each successful completion

`ActivityHandlerRegistry` is a simple `Map<string, ActivityHandler>` that lets handlers be registered at startup and looked up by name at runtime.

### 3. Database Layer (`src/db/`)

- `IDbAdapter` — abstract interface decoupling the engine from SQLite
- `SqliteAdapter` — wraps `better-sqlite3` (synchronous) in an async Promise API
- `initDb.ts` — idempotent schema creation + seed data on first run

SQLite is configured with:
- WAL journal mode (better concurrent read performance)
- Foreign key enforcement

### 4. Handler Layer (`src/handlers/`)

Pluggable async functions registered into `ActivityHandlerRegistry`. A handler receives a `HandlerContext` and returns a `HandlerResult` with an optional outcome string and output payload. Errors in handlers are caught and logged without crashing the engine.

### 5. Event Layer (`src/kafka/`)

```
WorkflowEngine.completeActivity()
  └─▶ publishWorkflowEvent()       (Kafka producer)
        └─▶ Kafka topic: workflow-events
              └─▶ Consumer
                    ├─▶ Redis PUBLISH workflow-events  (if Redis available)
                    │     └─▶ Redis subscriber → broadcastWorkflowEvent()
                    └─▶ broadcastWorkflowEvent()         (if no Redis)
                          └─▶ SSE clients (per-project + global)
```

Redis is optional. Without it, SSE broadcast happens directly from the Kafka consumer (works for single-instance deployments). With Redis, multiple engine instances can share the same SSE state.

### 6. Service Layer (`src/services/`)

Thin wrappers around third-party SDKs:
- `docusign.service.ts` — JWT auth + envelope creation
- `azureStorage.service.ts` — SAS generation, blob upload/download/delete

## Key Architectural Patterns

### Dependency Injection for DB

`WorkflowEngine` accepts an `IDbAdapter` in its constructor. This makes the engine unit-testable by swapping in an in-memory adapter without touching SQLite.

### Handler Registry (Plugin Pattern)

Handlers are registered at application startup in `src/handlers/index.ts`. Adding a new automated activity type means creating a handler file and calling `registry.register(name, fn)` — no changes to the engine are required.

### BFS for Graph Traversal

Two places in the codebase use BFS over the activity graph:

1. **Resolving next activities** after a completion — traverses transitions, evaluates conditions, handles parallel joins.
2. **Computing completed nodes** in the frontend data service (mirrored pattern) — determines which nodes to shade as done.

### Atomic Workflow Creation

`POST /api/workflow/full` and `PUT /api/workflow/full/:id` wrap activity + transition + task creation in a single SQLite transaction, ensuring either the whole workflow is persisted or nothing is.

### SSE Fan-out Scoping

Two types of SSE connections:
- **Project-scoped** (`/api/workflow/stream?projectId=X`) — only receives events for a specific project
- **Global** (`/api/workflow/stream/global`) — receives all project events (used for the notification bell)

## Data Flow: Completing an Activity

1. `POST /api/projects/:id/activities/:key/complete` hits the router
2. Router calls `workflowEngine.completeActivity(projectId, activityKey, opts)`
3. Engine validates the activity is currently active
4. Engine runs the registered handler (if any), captures output
5. Engine marks `project_activity.status = 'completed'`
6. Engine resolves next activities via BFS on `activity_transition`
7. Engine activates each next activity (creates `project_activity` rows, instantiates tasks)
8. Engine publishes a `WorkflowEvent` to Kafka
9. Kafka consumer broadcasts via SSE to all connected clients for that project
10. Frontend SSE handler fires, updates the graph in real time

## Graceful Shutdown

On `SIGTERM` / `SIGINT`:
1. Stop accepting new connections
2. Close Kafka consumer
3. Close all open SSE client connections
4. Close SQLite connection
