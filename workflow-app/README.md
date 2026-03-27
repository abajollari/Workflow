# workflow-app

Angular 17 frontend for the Workflow orchestration platform. Provides a real-time visual workflow graph, project management, artifact handling, and workflow definition authoring.

## Tech Stack

- **Framework:** Angular 17 (standalone components, signals)
- **Rendering:** SVG-based workflow graph with pan/zoom
- **Real-time:** Server-Sent Events (SSE) client
- **HTTP:** Angular `HttpClient`
- **Styling:** CSS custom properties, dark theme
- **Build:** Angular CLI

## Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm start
# or
ng serve

# Build for production
npm run build
```

The app runs on **port 4200** and proxies API calls to `http://localhost:3001`.

## Project Structure

```
workflow-app/src/app/
├── components/
│   ├── header/                        # Top nav, project selector, notifications
│   ├── workflow-graph/                # SVG graph with pan/zoom/interaction
│   ├── activity-tasks/                # Task checklist and run dialog
│   └── footer/                        # Static footer
├── pages/
│   ├── home/                          # Main workflow view (landing page)
│   ├── artifacts/                     # Document and Azure blob management
│   └── workflows/
│       ├── workflows.component.ts     # Version list
│       ├── workflow-create.component.ts  # 4-step creation wizard
│       └── workflow-edit.component.ts    # 4-step edit wizard
├── services/
│   ├── engine-api.service.ts          # HTTP gateway to backend
│   ├── workflow-data.service.ts       # Loads workflow nodes/edges
│   ├── workflow-execution.service.ts  # SSE client for live updates
│   ├── notification.service.ts        # Global SSE + notification bell
│   └── selected-project.service.ts    # Global project selection signal
├── models/
│   └── workflow.model.ts              # TypeScript interfaces
├── app.component.ts                   # Root layout
├── app.routes.ts                      # Route definitions
└── main.ts                            # Bootstrap entry point
```

## Documentation

| File | Description |
|------|-------------|
| [docs/architecture.md](docs/architecture.md) | App architecture, data flow, Angular patterns |
| [docs/services.md](docs/services.md) | All services: API, data, SSE, notifications |
| [docs/components.md](docs/components.md) | Header, workflow graph, task panel |
| [docs/pages.md](docs/pages.md) | Home, Artifacts, Workflows pages |
| [docs/models.md](docs/models.md) | TypeScript interfaces and types |
| [docs/styling.md](docs/styling.md) | CSS variables, theming, layout |

## Routes

| Path | Component | Description |
|------|-----------|-------------|
| `/` | HomeComponent | Workflow graph and project execution |
| `/artifacts` | ArtifactsComponent | Document and blob storage management |
| `/workflows` | WorkflowsComponent | Workflow version list |
| `/workflows/create` | WorkflowCreateComponent | 4-step creation wizard |
| `/workflows/:id/edit` | WorkflowEditComponent | 4-step edit wizard |

## Key Concepts

- **Project** — Selected globally via header dropdown; drives the entire page context
- **Workflow Graph** — SVG visualization of the active workflow version with live status
- **SSE** — Per-project and global streams for real-time activity completion updates
- **Signals** — Angular 17 signals used for shared state (selected project, notifications)
