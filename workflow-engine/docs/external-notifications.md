# External Notification Architecture

Diagrams covering the three notification channels added to the workflow engine for external systems that cannot use Kafka.

---

## Overview — All Three Channels

```mermaid
flowchart TD
    ACT([Activity Activates\nin WorkflowEngine])
    ACT --> TOKEN[Generate callbackToken UUID\nStore in project_activity]
    TOKEN --> NS[NotificationService]

    NS -->|reads webhook_subscription| WH_DEL[Webhook Delivery\nHTTP POST]
    NS -->|reads email_subscription| EMAIL[Email Service\nnodemailer SMTP]

    subgraph OPTION_A [Option A — Webhooks]
        WH_DEL -->|POST with callbackUrl + secret| EXT_A[External Automated System\ne.g. RPA · Power Automate · n8n]
        EXT_A -->|does its work| EXT_A
        EXT_A -->|POST /api/callback/:token\nbody: outcome, notes| CB_POST
    end

    subgraph OPTION_B [Option B — Polling]
        EXT_B[External Legacy System\ne.g. cron job · scheduled task] -->|GET /api/activities/pending\n?activityKey=step3\nX-Api-Key: xxx| POLL[Pending Route]
        POLL -->|returns callbackUrl, approveUrl, rejectUrl| EXT_B
        EXT_B -->|POST /api/callback/:token\nbody: outcome, notes| CB_POST
    end

    subgraph OPTION_C [Option C — Magic Links]
        EMAIL -->|HTML email with two buttons| HUMAN[Human Approver]
        HUMAN -->|clicks Approve| CB_APPROVE[GET /api/callback/:token/approve]
        HUMAN -->|clicks Reject| CB_REJECT[GET /api/callback/:token/reject]
        CB_APPROVE -->|outcome = yes| COMPLETE
        CB_REJECT  -->|outcome = no | COMPLETE
    end

    CB_POST[POST /api/callback/:token] -->|outcome, userId, notes| COMPLETE
    COMPLETE([completeActivity\nWorkflowEngine])
    COMPLETE --> NEXT([Next activities activate])
```

---

## Option A — Webhook Detail

```mermaid
sequenceDiagram
    participant WE as WorkflowEngine
    participant NS as NotificationService
    participant DB as SQLite
    participant EXT as External System

    WE->>DB: INSERT project_activity (callbackToken = UUID)
    WE->>NS: notifyWebhooks(projectId, activityKey, label, token)
    NS->>DB: SELECT url, secret FROM webhook_subscription WHERE activityKey = ?
    DB-->>NS: [ { url, secret } ]

    loop for each subscription
        NS-->>EXT: POST /your-endpoint\nX-Webhook-Secret: <secret>\n{ event, projectId, activityId, activityLabel, callbackUrl }
        EXT-->>NS: 202 Accepted
    end

    Note over EXT: External system does its work asynchronously

    EXT->>WE: POST /api/callback/:token\n{ outcome: "yes", notes: "..." }
    WE-->>EXT: 200 { activated: [...] }
```

**Manage subscriptions:**

| Method | Path | Body |
|---|---|---|
| `POST` | `/api/webhooks` | `{ activityKey, url, secret? }` |
| `GET` | `/api/webhooks` | — |
| `DELETE` | `/api/webhooks/:id` | — |

---

## Option B — Polling Detail

```mermaid
sequenceDiagram
    participant EXT as External System
    participant API as GET /api/activities/pending
    participant DB as SQLite
    participant WE as WorkflowEngine

    loop every N minutes
        EXT->>API: GET /api/activities/pending?activityKey=step3\nX-Api-Key: <key>
        API->>DB: SELECT active activities + callbackToken
        DB-->>API: rows
        API-->>EXT: [ { projectId, activityId, activityLabel,\n  callbackUrl, approveUrl, rejectUrl, startedAt } ]
    end

    Note over EXT: External system processes pending items

    EXT->>WE: POST /api/callback/:token\n{ outcome: "yes" }
    WE-->>EXT: 200 { activated: [...] }
```

**Query parameters:**

| Param | Description |
|---|---|
| `activityKey` | Filter by activity type (e.g. `step3`) |
| `projectId` | Filter by specific project |
| `apiKey` | API key (alternative to `X-Api-Key` header) |

---

## Option C — Magic Link Detail

```mermaid
sequenceDiagram
    participant WE as WorkflowEngine
    participant NS as NotificationService
    participant SMTP as SMTP Server
    participant HUMAN as Human Approver
    participant CB as Callback Route

    WE->>NS: notifyEmailSubscribers(projectId, activityKey, label, token)
    NS->>DB: SELECT email, name FROM email_subscription WHERE activityKey = ?
    DB-->>NS: [ { email, name } ]

    loop for each subscriber
        NS->>SMTP: sendMail({ to, subject, html with approve/reject links })
        SMTP-->>HUMAN: Email: "Action required: PQR Approved?"
    end

    alt User clicks Approve
        HUMAN->>CB: GET /api/callback/:token/approve
        CB->>WE: completeActivity(outcome = "yes")
        CB-->>HUMAN: HTML: "Approved ✓"
    else User clicks Reject
        HUMAN->>CB: GET /api/callback/:token/reject
        CB->>WE: completeActivity(outcome = "no")
        CB-->>HUMAN: HTML: "Rejected"
    end
```

**Manage email subscriptions:**

| Method | Path | Body |
|---|---|---|
| `POST` | `/api/webhooks/emails` | `{ activityKey, email, name? }` |
| `GET` | `/api/webhooks/emails` | — |
| `DELETE` | `/api/webhooks/emails/:id` | — |

---

## Subscription & Token Data Model

```mermaid
erDiagram
    project_activity {
        int id PK
        int projectId FK
        text activityId
        text status
        text callbackToken "UUID — one per activation"
        text startedAt
    }

    webhook_subscription {
        int id PK
        text activityKey
        text url
        text secret
    }

    email_subscription {
        int id PK
        text activityKey
        text email
        text name
    }

    project_activity ||--o{ webhook_subscription : "activityKey matches"
    project_activity ||--o{ email_subscription   : "activityKey matches"
```

---

## Environment Variables

| Variable | Used by | Description |
|---|---|---|
| `BASE_URL` | All | Base URL embedded in callback/approve/reject URLs |
| `POLLING_API_KEY` | Option B | API key required on the polling endpoint (leave blank to disable auth) |
| `SMTP_HOST` | Option C | SMTP server hostname |
| `SMTP_PORT` | Option C | SMTP port (default 587) |
| `SMTP_SECURE` | Option C | `true` for port 465 / SSL |
| `SMTP_USER` | Option C | SMTP username |
| `SMTP_PASS` | Option C | SMTP password |
| `SMTP_FROM` | Option C | Sender address shown in emails |
