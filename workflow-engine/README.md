# workflow-engine

Express 5 backend for the Workflow orchestration platform. Manages workflow definitions, project execution, real-time event streaming, and integrations with DocuSign, Azure Blob Storage, and Salesforce.

## Tech Stack

- **Runtime:** Node.js with TypeScript
- **Framework:** Express 5
- **Database:** SQLite (via `better-sqlite3`, WAL mode)
- **Messaging:** Apache Kafka (KafkaJS)
- **Cache/Pub-Sub:** Redis (optional, for multi-instance SSE fan-out)
- **Real-time:** Server-Sent Events (SSE)
- **Storage:** Azure Blob Storage SDK
- **E-Signatures:** DocuSign JWT server-to-server auth
- **Excel:** ExcelJS

## Quick Start

```bash
# Install dependencies
npm install

# Copy and fill in environment variables
cp .env.example .env

# Start in development mode (ts-node-dev with hot reload)
npm run dev

# Build for production
npm run build

# Start production build
npm start
```

The server listens on **port 3001** by default (`PORT` env var overrides this).

## Project Structure

```
workflow-engine/
├── src/
│   ├── db/                  # Database layer
│   │   ├── database.ts      # SQLite connection
│   │   ├── IDbAdapter.ts    # Adapter interface
│   │   ├── SqliteAdapter.ts # SQLite implementation
│   │   └── initDb.ts        # Schema + seed data
│   ├── engine/              # Core orchestration
│   │   ├── WorkflowEngine.ts
│   │   └── ActivityHandlerRegistry.ts
│   ├── handlers/            # Activity handler plugins
│   │   ├── index.ts
│   │   ├── weatherHandler.ts
│   │   ├── sendProposalHandler.ts
│   │   └── excelHandler.ts
│   ├── routes/              # Express routers
│   │   ├── project.ts
│   │   ├── activities.ts
│   │   ├── workflow.ts
│   │   ├── artifacts.ts
│   │   ├── events.ts
│   │   ├── teams.ts
│   │   ├── users.ts
│   │   ├── health.ts
│   │   ├── docusign.ts
│   │   ├── azureStorage.ts
│   │   └── salesforce.ts
│   ├── services/            # External service wrappers
│   │   ├── docusign.service.ts
│   │   └── azureStorage.service.ts
│   ├── kafka/               # Kafka + SSE event layer
│   │   ├── client.ts
│   │   ├── producer.ts
│   │   ├── consumer.ts
│   │   └── events.ts
│   └── index.ts             # App entry point
├── data/                    # SQLite database file (auto-created)
├── uploads/                 # Artifact file storage (auto-created)
├── docs/                    # Documentation
├── package.json
└── tsconfig.json
```

## Documentation

| File | Description |
|------|-------------|
| [docs/architecture.md](docs/architecture.md) | System design, patterns, data flow |
| [docs/database-schema.md](docs/database-schema.md) | All tables, columns, relationships |
| [docs/api-reference.md](docs/api-reference.md) | Complete REST API reference |
| [docs/workflow-engine.md](docs/workflow-engine.md) | Core engine & handler registry |
| [docs/handlers.md](docs/handlers.md) | Built-in activity handlers |
| [docs/kafka-events.md](docs/kafka-events.md) | Kafka, Redis, and SSE event system |
| [docs/integrations.md](docs/integrations.md) | DocuSign, Azure Blob, Salesforce |
| [docs/environment.md](docs/environment.md) | All environment variables |

## Key Concepts

- **Workflow Version** — A named, versioned definition of activities and transitions.
- **Project** — An instance of a workflow running for a specific account.
- **Activity** — A single step in a workflow (task, decision, parallel, loop, etc.).
- **Handler** — An async plugin that runs when an automated activity fires.
- **SSE Stream** — Real-time push to the frontend when activities complete.

## Running with Docker / Kafka

See [docs/kafka-events.md](docs/kafka-events.md) for Kafka setup. Both Kafka and Redis are optional; the engine degrades gracefully without them.
