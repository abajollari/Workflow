# Integrations

## DocuSign

JWT server-to-server integration for sending e-signature envelopes.

### Service: `src/services/docusign.service.ts`

#### `getApiClient(): Promise<docusign.ApiClient>`

Authenticates using JWT with DocuSign's OAuth service. Called before every API call — the token is short-lived (1 hour) so this should be called fresh per request or cached externally.

**Process:**
1. Instantiates DocuSign `ApiClient` with `DOCUSIGN_BASE_PATH`
2. Sets OAuth base path to `DOCUSIGN_OAUTH_BASE_PATH`
3. Calls `requestJWTUserToken()` using `DOCUSIGN_CLIENT_ID`, `DOCUSIGN_USER_ID`, `DOCUSIGN_PRIVATE_KEY`
4. Sets the returned access token on the API client
5. Returns configured client

**Required environment variables:**
```
DOCUSIGN_BASE_PATH=https://demo.docusign.net/restapi
DOCUSIGN_OAUTH_BASE_PATH=account-d.docusign.com
DOCUSIGN_CLIENT_ID=<integration_key>
DOCUSIGN_USER_ID=<impersonated_user_guid>
DOCUSIGN_PRIVATE_KEY=<rsa_private_key_contents>
DOCUSIGN_ACCOUNT_ID=<account_guid>
DOCUSIGN_TEMPLATE_ID=<envelope_template_id>
```

---

#### `sendEnvelopeFromTemplate(params: SendTemplateParams): Promise<{ envelopeId: string }>`

Creates and sends a DocuSign envelope from a template.

**`SendTemplateParams`:**
```typescript
interface SendTemplateParams {
  templateId: string;
  buyer: {
    email: string;
    name: string;
    templateData?: Record<string, string>;
  };
  seller: {
    email: string;
    name: string;
    templateData?: Record<string, string>;
  };
  emailSubject?: string;
  agreementParty: string;
  jurisdiction: string;
}
```

**Process:**
1. Gets authenticated API client via `getApiClient()`
2. Constructs `EnvelopeDefinition` from template ID
3. Maps buyer to template role `"Buyer"` and seller to role `"Seller"`
4. Injects shared tab values: `agreementParty`, `jurisdiction`
5. Merges any signer-specific `templateData` fields into the corresponding role's tabs
6. Calls `EnvelopesApi.createEnvelope()` with `status: 'sent'`
7. Returns `{ envelopeId }`

---

### Route: `src/routes/docusign.ts`

#### `POST /api/docusign/send`

Two modes:

**Workflow-triggered mode** (with `projectId` + `activityId`):
- Calls `workflowEngine.triggerActivity(projectId, activityId, { input })`
- The registered `send_proposal` handler sends the envelope and records the `envelopeId`
- The activity is completed internally

**Standalone mode** (without project context):
- Calls `sendEnvelopeFromTemplate()` directly
- Stores `envelopeId` in `docusign_envelope` if `projectId` is provided

#### `POST /api/docusign/webhook`

DocuSign Connect callback. Parses the XML/JSON event body.

When `envelopeStatus === 'Completed'`:
1. Reads `envelopeId` from the event
2. Looks up `docusign_envelope` to find the associated `projectId`
3. Calls `workflowEngine.completeActivity(projectId, 'signed')`

**Webhook registration:** In DocuSign admin, set the webhook URL to `https://your-domain/api/docusign/webhook` and enable the `envelope-completed` trigger.

---

### Handler: `src/handlers/sendProposalHandler.ts`

Registered as `'send_proposal'`. See [handlers.md](handlers.md) for full details.

---

## Azure Blob Storage

SDK-based integration for uploading, downloading, and managing blobs.

### Service: `src/services/azureStorage.service.ts`

Uses `@azure/storage-blob` SDK. All functions construct a `BlobServiceClient` from the storage account name and key.

**Required environment variables:**
```
AZURE_STORAGE_ACCOUNT_NAME=<account_name>
AZURE_STORAGE_ACCOUNT_KEY=<account_key>
```

#### Functions

**`generateUploadSasUrl(container, blobName, expiresInMinutes?)`**

Generates a SAS URL with `Write` and `Create` permissions. Default expiry: 60 minutes.

**`generateDownloadSasUrl(container, blobName, expiresInMinutes?)`**

Generates a SAS URL with `Read` permission.

**`generateContainerSasUrl(container, permissions, expiresInMinutes?)`**

Generates a container-level SAS URL. `permissions` is a string like `"rw"` (read + write).

**`uploadBlob(container, blobName, buffer, contentType)`**

Uploads a `Buffer` as a block blob. Creates the container if it doesn't exist.

**`downloadBlob(container, blobName): Promise<NodeJS.ReadableStream>`**

Downloads and returns a readable stream for a blob.

**`createTextBlob(container, blobName, content, contentType?)`**

Creates a blob from a string. Default content type: `text/plain`.

**`listBlobs(container, prefix?): Promise<string[]>`**

Returns an array of blob names. Optional `prefix` filters results.

**`deleteBlob(container, blobName)`**

Deletes a single blob.

---

### Route: `src/routes/azureStorage.ts`

See [api-reference.md](api-reference.md#azure-blob-storage) for endpoint details.

File uploads via the server route use Multer with a 100 MB limit.

---

## Salesforce

Inbound integration — Salesforce calls the workflow engine to create and advance projects.

### Route: `src/routes/salesforce.ts`

#### `POST /api/salesforce/start`

Called by a Salesforce Flow or Process Builder to kick off a workflow.

1. Creates a new project via the same logic as `POST /api/projects`
2. Calls `workflowEngine.initProject(projectId)` — starts at the `start` node
3. Calls `workflowEngine.completeActivity(projectId, 'step1')` — advances past the entry step
4. Returns the project record

#### `POST /api/salesforce/submit/:accountNumber`

Called by Salesforce when a record is submitted/approved.

1. Looks up the project by `accountNumber`
2. Calls `workflowEngine.completeActivity(projectId, 'step2', { output: requestBody.payload })`
3. Returns success

**Authentication:** These endpoints currently have no auth — add an API key middleware if exposing to external systems.
