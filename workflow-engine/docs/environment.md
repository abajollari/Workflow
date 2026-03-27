# Environment Variables

Create a `.env` file in the `workflow-engine/` directory. All variables are optional unless marked **required**.

## Server

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | HTTP server port |
| `CORS_ORIGIN` | `http://localhost:4200` | Allowed CORS origin |

## DocuSign JWT Auth

All DocuSign variables are **required** to use the DocuSign integration. The engine starts without them, but `POST /api/docusign/send` and the `send_proposal` handler will fail.

| Variable | Description |
|----------|-------------|
| `DOCUSIGN_BASE_PATH` | DocuSign REST API base URL (e.g. `https://demo.docusign.net/restapi`) |
| `DOCUSIGN_OAUTH_BASE_PATH` | OAuth base path (e.g. `account-d.docusign.com` for sandbox) |
| `DOCUSIGN_CLIENT_ID` | DocuSign Integration Key (Client ID) |
| `DOCUSIGN_USER_ID` | GUID of the DocuSign user to impersonate |
| `DOCUSIGN_PRIVATE_KEY` | RSA private key content (PEM format, or path) |
| `DOCUSIGN_ACCOUNT_ID` | DocuSign account GUID |
| `DOCUSIGN_TEMPLATE_ID` | Envelope template ID to use for proposals |

**Getting credentials:**
1. Create an app in the DocuSign developer account
2. Generate an RSA keypair; paste the private key as `DOCUSIGN_PRIVATE_KEY`
3. Grant consent: `https://account-d.docusign.com/oauth/auth?response_type=code&scope=impersonation%20signature&client_id=<CLIENT_ID>&redirect_uri=https://localhost`

## Azure Blob Storage

Required to use `POST /api/storage/*` endpoints and the artifacts Azure integration.

| Variable | Description |
|----------|-------------|
| `AZURE_STORAGE_ACCOUNT_NAME` | Azure storage account name |
| `AZURE_STORAGE_ACCOUNT_KEY` | Azure storage account key (base64) |

## Kafka

| Variable | Default | Description |
|----------|---------|-------------|
| `KAFKA_BROKERS` | `localhost:9092` | Comma-separated list of Kafka broker addresses |

Kafka is optional. Without it, the engine starts normally but activity completions will not be published as Kafka events, and SSE updates will not fire.

## Redis

| Variable | Default | Description |
|----------|---------|-------------|
| `REDIS_URL` | *(none)* | Redis connection URL, e.g. `redis://localhost:6379` |

Redis is optional. It is only used for SSE fan-out in multi-instance deployments. Without it, SSE broadcasts directly from the Kafka consumer (works for single-instance deployments).

## Example `.env`

```dotenv
# Server
PORT=3001
CORS_ORIGIN=http://localhost:4200

# DocuSign
DOCUSIGN_BASE_PATH=https://demo.docusign.net/restapi
DOCUSIGN_OAUTH_BASE_PATH=account-d.docusign.com
DOCUSIGN_CLIENT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
DOCUSIGN_USER_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
DOCUSIGN_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----"
DOCUSIGN_ACCOUNT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
DOCUSIGN_TEMPLATE_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx

# Azure
AZURE_STORAGE_ACCOUNT_NAME=mystorageaccount
AZURE_STORAGE_ACCOUNT_KEY=base64encodedkey==

# Kafka
KAFKA_BROKERS=localhost:9092

# Redis
REDIS_URL=redis://localhost:6379
```
