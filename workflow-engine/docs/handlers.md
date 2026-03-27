# Activity Handlers

Handlers are async plugins that execute when an automated activity fires. They are registered in `src/handlers/index.ts` and looked up by the engine using the `handler` column on `activity_definition`.

## Handler Interface

```typescript
type ActivityHandler = (ctx: HandlerContext) => Promise<HandlerResult>;

interface HandlerContext {
  projectId: number;
  activityKey: string;
  projectActivityId: number;
  versionId: number;
  inputData: Record<string, unknown> | null;
}

interface HandlerResult {
  outcome?: string;                      // Sets decisionOutcome on project_activity
  payload?: Record<string, unknown>;     // Stored as output JSON on project_activity
}
```

---

## Built-in Handlers

### `weather`

**File:** `src/handlers/weatherHandler.ts`

Fetches current weather for a given location using the Open-Meteo API (no API key required).

**Input** (via `inputData` or activity's `inputSchema`):
```json
{
  "latitude": 51.5074,
  "longitude": -0.1278,
  "label": "London"
}
```

**Behavior:**
1. Waits 5 seconds (simulates async work for demo purposes)
2. Calls `https://api.open-meteo.com/v1/forecast?latitude=...&longitude=...&current_weather=true`
3. Returns weather data as payload

**Output:**
```json
{
  "outcome": "success",
  "payload": {
    "temperature": 15.2,
    "windspeed": 12.5,
    "weathercode": 3,
    "label": "London"
  }
}
```

**Used by:** The "Prepare Proposal" activity in Workflow 2.0

---

### `send_proposal`

**File:** `src/handlers/sendProposalHandler.ts`

Sends a DocuSign envelope using JWT server-to-server authentication.

**Input** (via `inputData`):
```json
{
  "buyerEmail": "buyer@example.com",
  "buyerName": "John Buyer",
  "sellerEmail": "seller@example.com",
  "sellerName": "Jane Seller",
  "agreementParty": "Acme Corp",
  "jurisdiction": "California"
}
```

**Behavior:**
1. Calls `sendEnvelopeFromTemplate()` from `src/services/docusign.service.ts`
2. Records the returned `envelopeId` in the `docusign_envelope` table (links envelope to project)
3. Returns outcome `'sent'` with the envelope ID

**Output:**
```json
{
  "outcome": "sent",
  "payload": { "envelopeId": "abc-123-..." }
}
```

**Environment variables required:**
- `DOCUSIGN_CLIENT_ID`
- `DOCUSIGN_USER_ID`
- `DOCUSIGN_PRIVATE_KEY`
- `DOCUSIGN_ACCOUNT_ID`
- `DOCUSIGN_TEMPLATE_ID`

---

### `writeToExcel`

**File:** `src/handlers/excelHandler.ts`

Generates an Excel workbook using ExcelJS and writes it to the `uploads/` directory.

**Input:** None required (uses static data for demo)

**Behavior:**
1. Creates a new ExcelJS workbook
2. Adds a "Users" sheet with sample user data
3. Adds an "Inventory" sheet with sample inventory data
4. Writes file to `uploads/output_<timestamp>.xlsx`
5. Returns the file path in the payload

**Output:**
```json
{
  "outcome": "success",
  "payload": {
    "fileName": "output_1704067200000.xlsx",
    "filePath": "uploads/output_1704067200000.xlsx"
  }
}
```

---

## Registering a New Handler

1. Create a new file in `src/handlers/`, e.g. `src/handlers/myHandler.ts`:

```typescript
import { registry } from '../engine/ActivityHandlerRegistry';
import type { HandlerContext, HandlerResult } from '../engine/ActivityHandlerRegistry';

async function myHandler(ctx: HandlerContext): Promise<HandlerResult> {
  const { projectId, inputData } = ctx;

  // Do work...
  const result = await callExternalApi(inputData);

  return {
    outcome: 'success',
    payload: { result }
  };
}

export function registerMyHandler() {
  registry.register('my_handler', myHandler);
}
```

2. Import and call it in `src/handlers/index.ts`:

```typescript
import { registerMyHandler } from './myHandler';

export function registerAllHandlers() {
  // ...existing registrations...
  registerMyHandler();
}
```

3. Set `handler = 'my_handler'` on any `activity_definition` you want to use it.

---

## Handler Error Handling

Handler errors are caught by the engine and logged. A failing handler does **not** prevent the activity from being marked complete — the engine continues the workflow. If you need a handler failure to stop the workflow, throw a specific error type and handle it in the route layer.
