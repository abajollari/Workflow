# Architecture

## Overview

`workflow-app` is a single-page Angular 17 application with a persistent header layout, signal-based shared state, and real-time SSE updates.

```
┌──────────────────────────────────────────────────────────┐
│  AppComponent (root)                                      │
│  ┌────────────────────────────────────────────────────┐  │
│  │  HeaderComponent                                    │  │
│  │  - Project selector (SelectedProjectService)        │  │
│  │  - Notification bell (NotificationService)          │  │
│  │  - DocuSign dialog                                  │  │
│  └────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────┐  │
│  │  <router-outlet>                                    │  │
│  │  ├── HomeComponent           (path: /)              │  │
│  │  │     └── WorkflowGraphComponent                   │  │
│  │  │           └── ActivityTasksComponent             │  │
│  │  ├── ArtifactsComponent      (path: /artifacts)     │  │
│  │  ├── WorkflowsComponent      (path: /workflows)     │  │
│  │  ├── WorkflowCreateComponent (path: /workflows/create) │
│  │  └── WorkflowEditComponent   (path: /workflows/:id/edit) │
│  └────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────┐  │
│  │  FooterComponent                                    │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

## Angular 17 Patterns

### Standalone Components

All components use `standalone: true`. There is no `AppModule`. Dependencies are declared directly in each component's `imports` array.

### Signals

Shared mutable state uses Angular 17 signals:

- `SelectedProjectService.selected` — `signal<Project | null>(null)` — current project
- `NotificationService.notifications` — `signal<AppNotification[]>([])` — notification list
- `NotificationService.unreadCount` — `computed(() => ...)` — derived unread count

Signals trigger automatic change detection without needing `ChangeDetectorRef` or `async` pipe in most places.

### Dependency Injection

Services are provided at the root level (`providedIn: 'root'`) and injected via Angular's `inject()` function in component constructors.

---

## Data Flow

### Project Selection

```
User picks project in header dropdown
  │
  ▼
SelectedProjectService.select(project)
  │
  ├── HeaderComponent connects SSE via WorkflowExecutionService.connect(id)
  └── HomeComponent reads selected() signal → renders WorkflowGraphComponent
        └── WorkflowGraphComponent reads project from parent Input or service
```

### Workflow Graph Render

```
WorkflowDataService.loadWorkflow()
  │
  ├── GET /api/workflow/activities  → nodes$
  └── GET /api/workflow/transitions → edges$
        │
        ▼
  WorkflowGraphComponent
    ├── Reads nodes/edges from WorkflowDataService
    ├── Reads project_activities from GET /api/projects/:id/activities
    ├── Computes completedNodes via BFS (getCompletedNodes)
    └── Renders SVG (nodes + bezier edges + legend)
```

### Real-time Updates

```
WorkflowEngine completes activity → Kafka → SSE endpoint
  │
  ▼
WorkflowExecutionService (EventSource)
  │
  ▼
WorkflowEvent emitted on event$ Subject
  │
  ▼
WorkflowGraphComponent subscription
  ├── Updates activeNode
  └── Re-fetches project activities (triggers re-render)
```

### Notifications

```
GET /api/workflow/stream/global (EventSource)
  │
  ▼
NotificationService
  ├── Appends to notifications signal
  ├── Persists to localStorage (max 50)
  └── Header reads unreadCount computed signal → shows badge
```

---

## Module Bootstrap

`main.ts` bootstraps `AppComponent` and provides:
- `provideRouter(routes)` — client-side routing
- `provideAnimations()` — Angular animations support
- `provideHttpClient()` — global `HttpClient` instance

---

## HTTP Communication

All backend calls go through `EngineApiService` (see [services.md](services.md)). The base URL is hardcoded to `http://localhost:3001`. To change it for production, update `engine-api.service.ts`.

---

## Real-time Communication

Two SSE connections can be active simultaneously:

| Service | Endpoint | Lifetime |
|---------|----------|---------|
| `WorkflowExecutionService` | `/api/workflow/stream?projectId=X` | Per project selection — connects on select, disconnects on change or destroy |
| `NotificationService` | `/api/workflow/stream/global` | Application lifetime — auto-reconnects on error |
