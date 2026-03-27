# Services

All services are provided at root scope (`providedIn: 'root'`) and injected via `inject()`.

---

## EngineApiService

`src/app/services/engine-api.service.ts`

Generic HTTP gateway for all backend calls.

**Base URL:** `http://localhost:3001`

### Methods

All methods return an `Observable<T>`.

```typescript
get<T>(path: string): Observable<T>
post<T>(path: string, body: unknown): Observable<T>
patch<T>(path: string, body: unknown): Observable<T>
put<T>(path: string, body: unknown): Observable<T>
delete<T>(path: string): Observable<T>
```

### Usage

```typescript
private api = inject(EngineApiService);

// GET example
this.api.get<Project[]>('/api/projects').subscribe(projects => { ... });

// POST example
this.api.post<Project>('/api/projects', { accountNumber: 'ACC-999', accountName: 'New Co', workflowVersionId: 2 }).subscribe(project => { ... });
```

---

## WorkflowDataService

`src/app/services/workflow-data.service.ts`

Loads and caches the workflow graph definition (nodes and edges) from the backend.

### Properties

```typescript
nodes$: BehaviorSubject<WorkflowNode[]>
edges$: BehaviorSubject<WorkflowEdge[]>

get nodes(): WorkflowNode[]
get edges(): WorkflowEdge[]
```

### Methods

**`loadWorkflow(versionId?: number): void`**

Fetches activities and transitions for the given version (or the active version if omitted). Makes two parallel HTTP calls:
- `GET /api/workflow/activities?versionId=X`
- `GET /api/workflow/transitions?versionId=X`

Parses `inputSchema` JSON strings into `InputField[]` arrays. Emits to `nodes$` and `edges$`.

**`getCompletedNodes(activeNodeId: string): Set<string>`**

Returns a set of node IDs that should be displayed as "completed". Uses BFS from the `start` node, following the graph edges, stopping when it reaches `activeNodeId`.

```
start → node1 → node2 → [activeNodeId]
                    ↑
               these are "completed"
```

---

## WorkflowExecutionService

`src/app/services/workflow-execution.service.ts`

Manages a project-scoped SSE connection for real-time activity completion events.

### Properties

```typescript
event$: Subject<WorkflowEvent>   // Emits on each SSE message
```

### Methods

**`connect(projectId: number): void`**

Opens an `EventSource` to `/api/workflow/stream?projectId=<id>`.

- Runs the `onmessage` handler inside `NgZone.run()` to ensure Angular change detection fires
- Emits parsed `WorkflowEvent` on `event$`
- Closes any existing connection first

**`disconnect(): void`**

Closes the `EventSource`. Called when a different project is selected or the component is destroyed.

### Lifecycle

`WorkflowExecutionService` implements `OnDestroy`. The `EventSource` is always cleaned up when the service is destroyed.

### Usage

```typescript
private execution = inject(WorkflowExecutionService);

ngOnInit() {
  this.execution.connect(this.projectId);
  this.execution.event$.subscribe(event => {
    console.log('Activity completed:', event.activityLabel);
    this.refreshActivities();
  });
}

ngOnDestroy() {
  this.execution.disconnect();
}
```

---

## NotificationService

`src/app/services/notification.service.ts`

Manages a global SSE connection and the in-app notification list.

### Signals

```typescript
notifications: Signal<AppNotification[]>
unreadCount: Signal<number>   // computed from notifications
```

### AppNotification

```typescript
interface AppNotification {
  id: string;
  projectId: number;
  message: string;
  timestamp: string;
  read: boolean;
}
```

### Methods

**`markAllRead(): void`**

Sets `read = true` on all notifications and saves to localStorage.

**`clear(): void`**

Empties the notification list and clears localStorage.

### Internals

- Connects to `GET /api/workflow/stream/global` on service creation
- On each SSE message, prepends a new `AppNotification` to the signal
- Caps the list at **50** notifications
- Persists the list to `localStorage` under key `workflow_notifications`
- Auto-reconnects after 5 seconds on error

---

## SelectedProjectService

`src/app/services/selected-project.service.ts`

Global signal tracking which project the user has selected in the header.

### Signal

```typescript
selected: Signal<Project | null>
```

### Methods

**`select(project: Project | null): void`**

Updates the `selected` signal. Any component reading `selected()` re-renders automatically.

### Usage

```typescript
private selectedProject = inject(SelectedProjectService);

// Read in template
{{ selectedProject.selected()?.accountName }}

// Read in code
const project = this.selectedProject.selected();
if (project) { ... }

// Update
this.selectedProject.select(newProject);
```
