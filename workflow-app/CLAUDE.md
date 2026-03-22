# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

Install dependencies (both frontend and backend must be installed separately):
```bash
npm install
cd backend && npm install
```

Start full development environment (Angular + Express concurrently):
```bash
npm run dev
```

Start frontend only (http://localhost:4200):
```bash
npm start
```

Start backend only (http://localhost:3000):
```bash
npm run backend
```

Production build:
```bash
npm run build        # Frontend Angular build
cd backend && npm run build  # Backend TypeScript compile
```

There are no test commands configured yet.

## Architecture

**Full-stack app**: Angular 17 frontend + Express 5 backend with SQLite.

- Frontend lives in `src/`, built with Angular 17 standalone components (no NgModules).
- Backend lives in `backend/src/`, served on port 3000 with CORS configured for `http://localhost:4200`.
- The frontend currently uses **hardcoded data** — no backend API calls are made yet. The backend has only a `GET /api/health` endpoint.
- SQLite database at `backend/data/app.db` uses WAL mode. A migration framework is in place at `backend/src/db/migrate.ts` but no migrations are defined yet.

**Frontend data flow**: `WorkflowDataService` (root-scoped) holds static workflow nodes/edges and computes completed nodes via BFS traversal. Components consume it via DI.

**Frontend component tree**:
```
AppComponent
├── HeaderComponent
├── router-outlet → HomeComponent
│   └── WorkflowGraphComponent  (SVG-based, pan/zoom/click interactions)
└── FooterComponent
```

**Workflow node types**: `start`, `end`, `task`, `decision`, `loop`, `parallel` — each with distinct SVG shapes and colors.

**TypeScript path aliases** (configured in `tsconfig.json`):
- `@components/*` → `src/app/components/*`
- `@pages/*` → `src/app/pages/*`
- `@models/*` → `src/app/models/*`

## Key Tech

- Angular 17 (standalone), RxJS, pure SVG rendering (no D3/Canvas)
- Express 5, better-sqlite3, tsx for dev execution
- Global CSS custom properties in `src/styles.css` define the entire color/font/spacing theme — use these variables, don't hardcode values