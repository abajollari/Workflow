# Components

Shared/layout components used across multiple pages.

---

## HeaderComponent

`src/app/components/header/header.component.ts`

Top navigation bar. Contains the project selector, notification bell, and DocuSign dialog.

### Features

- **Brand logo** and app name
- **Navigation links:** Home, Workflows, Artifacts
- **Project dropdown** — loads all projects from `GET /api/projects`, emits selection to `SelectedProjectService`
- **Delete project** button — shows confirmation, calls `DELETE /api/projects/:id`, refreshes list
- **Notification bell** — shows unread count badge from `NotificationService.unreadCount()`
- **Notification panel** — popup list of recent global events, Mark All Read / Clear controls
- **DocuSign dialog** — form to send a proposal envelope

### Key Methods

**`onProjectChange(projectId: number)`**
1. Finds selected project in the loaded list
2. Calls `selectedProject.select(project)`
3. Connects SSE via `workflowExecution.connect(projectId)`

**`deleteProject()`**
1. Shows `window.confirm()` dialog
2. Calls `DELETE /api/projects/:id`
3. If the deleted project was selected, clears the selection
4. Refreshes the project list

**`toggleNotif()`**

Toggles the notification popup panel. Calls `notificationService.markAllRead()` when opening.

**`sendDocuSign()`**
1. Collects buyer/seller details from dialog form
2. Calls `POST /api/docusign/send` with `projectId` and `activityId`
3. Shows spinner during request
4. Closes dialog on success

### Inputs

None — uses injected services for all state.

---

## WorkflowGraphComponent

`src/app/components/workflow-graph/workflow-graph.component.ts`

The main SVG workflow visualization with pan, zoom, and node interaction.

### Inputs

```typescript
@Input() projectId: number | null
@Input() projectActivity: string | null   // Current active activity key
```

### Features

- **SVG graph** — renders all workflow nodes and edges
- **Node types:** start (circle), end (circle), task (rounded rect), decision (diamond), loop (pill), parallel (hexagon)
- **Edge rendering:** cubic bezier curves; loop edges curve upward/around
- **Edge labels:** condition text displayed on transitions
- **Status coloring:** completed (muted), active (bright accent), pending (dim)
- **Pan & zoom:** scroll wheel to zoom, drag background to pan
- **Node click** — selects node, opens `ActivityTasksComponent` panel
- **Legend** — node type color key
- **Stats bar** — total nodes, loop count, completion percentage
- **Show/hide toggle** — collapses the graph panel

### Grid Layout Constants

```typescript
CELL_W = 140   // Cell width in pixels
CELL_H = 120   // Cell height in pixels
NODE_W = 100   // Node rectangle width
NODE_H = 56    // Node rectangle height
PADDING = 80   // Canvas padding
```

Nodes are positioned at `(col * CELL_W + PADDING, row * CELL_H + PADDING)`.

### State

```typescript
selectedNode: WorkflowNode | null    // Clicked node (opens task panel)
activeNode: string | null            // From project activity
completedNodes: Set<string>          // BFS-computed set
zoom: number                         // Current zoom level (default 1.0)
panX: number                         // Pan offset X
panY: number                         // Pan offset Y
showGraph: boolean                   // Toggle graph visibility
```

### Key Methods

**`loadActivities()`**

Fetches `GET /api/projects/:id/activities`, determines `activeNode`, calls `workflowDataService.getCompletedNodes(activeNode)`.

**`onNodeClick(node: WorkflowNode)`**

Sets `selectedNode`. The `ActivityTasksComponent` reads this to display the task panel.

**`onWheel(event)`**

Zoom in/out centered on cursor position.

**`onMouseDown / onMouseMove / onMouseUp`**

Pan the graph by dragging the background.

**`completeSelected()`**

Calls `POST /api/projects/:id/activities/:key/complete`. Refreshes activities.

**`setInProgress()`**

Calls `POST /api/projects/:id/activities/:key/set-active` to reset forward states.

### Real-time

Subscribes to `WorkflowExecutionService.event$`. On each event, calls `loadActivities()` to refresh the graph state.

---

## ActivityTasksComponent

`src/app/components/activity-tasks/activity-tasks.component.ts`

Task checklist and activity trigger panel. Displayed inside the workflow graph when a node is selected.

### Inputs

```typescript
@Input() projectId: number
@Input() activityKey: string
@Input() isActive: boolean          // True if this activity is currently active
@Input() activityLabel: string
@Input() actionType: ActionType     // 'manual' | 'automated' | 'approval' | 'gate'
@Input() inputSchema: InputField[] | undefined
```

### Features

- **Task list** — shows task instances with status badges (new / in_progress / done)
- **Task cycling** — click task to advance status: `new → in_progress → done`
- **Run button** — visible only when `isActive && actionType !== 'gate'`
- **Input form** — if activity has `inputSchema`, shows form fields before triggering
- **Auto-detect** — detects when all tasks are done (informational only; does not auto-complete the activity)

### Key Methods

**`loadTasks()`**

Fetches `GET /api/projects/:id/activities/:key/tasks`.

**`toggleTaskStatus(task)`**

1. Computes next status (`new → in_progress → done`)
2. Calls `PATCH /api/projects/:id/activities/:key/tasks/:tid` with new status

**`triggerManual()`**

Calls `POST /api/projects/:id/activities/:key/trigger` (no input).

**`submitWithInputs()`**

Calls `POST /api/projects/:id/activities/:key/trigger` with form data collected from `inputSchema` fields.

### Status Badge Colors

| Status | Color |
|--------|-------|
| `new` | Gray |
| `in_progress` | Amber/yellow |
| `done` | Green |

---

## FooterComponent

`src/app/components/footer/footer.component.ts`

Static footer. Displays brand, copyright year, environment indicator, and links.

### Displayed Info

- App name
- `© 2024` copyright
- `DEV` environment badge
- Links: Docs, API, Help
