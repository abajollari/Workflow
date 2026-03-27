# Data Models

TypeScript interfaces used throughout the frontend application.

**File:** `src/app/models/workflow.model.ts`

---

## Node & Edge Types

### `NodeType`

```typescript
type NodeType = 'start' | 'end' | 'task' | 'decision' | 'loop' | 'parallel';
```

| Value | Shape | Description |
|-------|-------|-------------|
| `start` | Circle | Entry point of the workflow |
| `end` | Circle | Terminal node |
| `task` | Rounded rectangle | Standard work step |
| `decision` | Diamond | Branching point with condition-based transitions |
| `loop` | Pill | Repeatable step with a back-edge |
| `parallel` | Hexagon | Split/join for concurrent branches |

### `ActionType`

```typescript
type ActionType = 'manual' | 'automated' | 'approval' | 'gate';
```

| Value | Description |
|-------|-------------|
| `manual` | User completes manually |
| `automated` | Handler fires automatically on activation |
| `approval` | Requires explicit approval |
| `gate` | Waits for an external event (e.g. DocuSign webhook) |

---

## WorkflowNode

Represents a single node in the workflow graph.

```typescript
interface WorkflowNode {
  id: string;               // activityKey (e.g. "gather_requirements")
  label: string;            // Display label (may contain newlines)
  type: NodeType;
  col: number;              // Grid column (used to compute SVG x position)
  row: number;              // Grid row (used to compute SVG y position)
  actionType: ActionType;
  inputSchema?: InputField[];  // Optional form fields for triggered input
}
```

---

## WorkflowEdge

Represents a directed edge between two nodes.

```typescript
interface WorkflowEdge {
  from: string;             // Source node id (activityKey)
  to: string;               // Target node id (activityKey)
  label?: string;           // Condition label displayed on edge
  type?: 'loop' | 'normal'; // Determines edge rendering style
}
```

Loop edges use a curved path that arcs above the source node. Normal edges use a cubic bezier curve.

---

## InputField

Defines a single field in an activity's input form (from `activity_definition.inputSchema`).

```typescript
interface InputField {
  key: string;                                          // Form control name
  label: string;                                        // Display label
  type: 'text' | 'email' | 'number' | 'textarea';
  required?: boolean;
  placeholder?: string;
  defaultValue?: string;
}
```

Used by `ActivityTasksComponent` to render a dynamic form when triggering an automated activity.

**Example inputSchema (stored as JSON in the database):**
```json
[
  { "key": "buyerEmail", "label": "Buyer Email", "type": "email", "required": true },
  { "key": "buyerName",  "label": "Buyer Name",  "type": "text",  "required": true },
  { "key": "jurisdiction", "label": "Jurisdiction", "type": "text", "defaultValue": "California" }
]
```

---

## Geometry Types

Used internally by `WorkflowGraphComponent` for SVG layout calculations.

### `Point`

```typescript
interface Point {
  x: number;
  y: number;
}
```

### `ViewBox`

```typescript
interface ViewBox {
  x: number;
  y: number;
  w: number;
  h: number;
}
```

### `NodeColors`

```typescript
interface NodeColors {
  bg: string;       // Fill color
  border: string;   // Stroke color
  glow: string;     // Drop-shadow / glow filter color
}
```

Color sets are defined per node type and status (pending / active / completed).

---

## Backend Response Types

These are not declared in `workflow.model.ts` but used inline in services and components.

### `Project`

```typescript
interface Project {
  id: number;
  accountNumber: string;
  accountName: string;
  activity: string | null;
  workflowVersionId: number;
  createdAt: string;
  updatedAt: string;
}
```

### `ProjectActivity`

```typescript
interface ProjectActivity {
  id: number;
  projectId: number;
  activityId: string;
  status: 'pending' | 'active' | 'completed' | 'skipped';
  decisionOutcome: string | null;
  iterationCount: number;
  startedAt: string | null;
  completedAt: string | null;
  input: string | null;
  output: string | null;
  // Joined fields
  label: string;
  nodeType: NodeType;
  actionType: ActionType;
  teamId: number | null;
  teamName: string | null;
  handler: string | null;
  slaHours: number | null;
  assignedUserId: number | null;
  assignedUserName: string | null;
  assignmentId: number | null;
}
```

### `WorkflowVersion`

```typescript
interface WorkflowVersion {
  id: number;
  name: string;
  description: string | null;
  isActive: number;   // SQLite integer (0 or 1)
  createdAt: string;
}
```

### `AppNotification`

```typescript
interface AppNotification {
  id: string;
  projectId: number;
  message: string;
  timestamp: string;
  read: boolean;
}
```

### `WorkflowEvent` (SSE payload)

```typescript
interface WorkflowEvent {
  type: 'activity.completed';
  projectId: number;
  activityId: string;
  activityLabel: string;
  activatedActivities: string[];
  timestamp: string;
}
```
