# Kafka, Redis & SSE Event System

Real-time updates flow from the engine through Kafka → Redis (optional) → SSE to connected frontend clients.

## Overview

```
WorkflowEngine.completeActivity()
  │
  ▼
publishWorkflowEvent()          [src/kafka/producer.ts]
  │
  ▼
Kafka topic: "workflow-events"
  │
  ▼
startWorkflowConsumer()         [src/kafka/consumer.ts]
  │
  ├── (if Redis available)
  │     └── Redis PUBLISH "workflow-events"
  │           └── Redis subscriber → broadcastWorkflowEvent()
  │
  └── (if no Redis)
        └── broadcastWorkflowEvent()    [src/kafka/events.ts]
              │
              ├── Project SSE clients (per projectId)
              └── Global SSE clients
```

Both Kafka and Redis are **optional**. Without them the engine still works; real-time updates are just unavailable.

---

## WorkflowEvent

`src/kafka/events.ts`

```typescript
interface WorkflowEvent {
  type: 'activity.completed';
  projectId: number;
  activityId: string;
  activityLabel: string;
  activatedActivities: string[];   // Keys of newly-activated activities
  timestamp: string;               // ISO 8601
}
```

---

## Kafka Client

`src/kafka/client.ts`

Single KafkaJS client instance used by both producer and consumer.

```typescript
const kafka = new Kafka({
  clientId: 'workflow-engine',
  brokers: process.env.KAFKA_BROKERS?.split(',') ?? ['localhost:9092'],
  retry: {
    retries: 15,
    initialRetryTime: 500,
    factor: 1.5,        // Exponential backoff
  },
});
```

---

## Producer

`src/kafka/producer.ts`

**`publishWorkflowEvent(event: WorkflowEvent): Promise<void>`**

- Lazily connects to Kafka on first call
- Publishes to topic `workflow-events`
- Message key is the `projectId` (string) — ensures ordered delivery per project
- Logs published event details

```typescript
await producer.send({
  topic: 'workflow-events',
  messages: [{
    key: String(event.projectId),
    value: JSON.stringify(event),
  }],
});
```

---

## Consumer

`src/kafka/consumer.ts`

**`startWorkflowConsumer(): Promise<void>`**

- Waits 4.5 seconds on startup (allows producer to connect first)
- Creates topic if it doesn't exist (1 partition, replication factor 1)
- Subscribes to `workflow-events` from the beginning
- Processes each message:
  - Parses `WorkflowEvent` from message value
  - If Redis is available: publishes to Redis channel `workflow-events`
  - Otherwise: calls `broadcastWorkflowEvent()` directly

**`stopWorkflowConsumer(): Promise<void>`**

Called during graceful shutdown to disconnect the consumer cleanly.

---

## SSE Registry

`src/kafka/events.ts`

Manages active SSE client connections and broadcasts events to them.

### Connection Types

| Type | Path | Scope |
|------|------|-------|
| Project-scoped | `/api/workflow/stream?projectId=X` | Only events for project X |
| Global | `/api/workflow/stream/global` | All project events |

### Functions

**`addWorkflowSseClient(projectId: number, res: Response): void`**

Registers a response object as a project-scoped SSE client.

**`removeWorkflowSseClient(projectId: number, res: Response): void`**

Deregisters a client (called on connection close).

**`addGlobalSseClient(res: Response): void`**

Registers a global SSE client.

**`removeGlobalSseClient(res: Response): void`**

Deregisters a global client.

**`broadcastWorkflowEvent(event: WorkflowEvent): void`**

Sends the event to:
1. All project-scoped clients registered for `event.projectId`
2. All global clients

Event is sent as a standard SSE message:
```
data: {"type":"activity.completed",...}\n\n
```

**`closeAllSseClients(): void`**

Called during graceful shutdown. Closes all open SSE connections by ending their response streams.

---

## SSE Endpoints

Defined in `src/index.ts`:

### `GET /api/workflow/stream?projectId=:id`

Opens a project-scoped SSE stream.

```
HTTP/1.1 200 OK
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
```

On connection:
1. Registers with `addWorkflowSseClient(projectId, res)`
2. Sends an initial heartbeat comment
3. On `req.on('close')`: calls `removeWorkflowSseClient()`

### `GET /api/workflow/stream/global`

Opens a global SSE stream. Identical pattern using `addGlobalSseClient()`.

---

## Redis Integration

If `REDIS_URL` is set, the consumer publishes to Redis instead of calling `broadcastWorkflowEvent()` directly:

```typescript
await redisPublisher.publish('workflow-events', JSON.stringify(event));
```

A Redis subscriber listens on the same channel and calls `broadcastWorkflowEvent()` when messages arrive.

This enables **multi-instance** deployments: multiple engine processes each have their own SSE client registries. Redis ensures all instances broadcast the event, regardless of which instance's Kafka consumer received it.

---

## Setup (Local Development)

### Kafka with Docker

```yaml
# docker-compose.yml
version: '3'
services:
  zookeeper:
    image: confluentinc/cp-zookeeper:latest
    environment:
      ZOOKEEPER_CLIENT_PORT: 2181

  kafka:
    image: confluentinc/cp-kafka:latest
    depends_on: [zookeeper]
    ports:
      - "9092:9092"
    environment:
      KAFKA_BROKER_ID: 1
      KAFKA_ZOOKEEPER_CONNECT: zookeeper:2181
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://localhost:9092
      KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 1
```

```bash
docker-compose up -d
```

### Redis with Docker

```bash
docker run -d -p 6379:6379 redis:alpine
```

### Environment Variables

```
KAFKA_BROKERS=localhost:9092
REDIS_URL=redis://localhost:6379
```

Both are optional. The engine starts and functions without them.
