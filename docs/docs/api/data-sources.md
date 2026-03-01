---
sidebar_position: 9
---

# Data Sources API

Manage file, URL, and Confluence data sources that feed the workspace knowledge base.

All endpoints require authentication and a workspace the user is authorised for.

## Base path

```
/api/v1/data-sources
```

---

## Create a data source

```http
POST /api/v1/data-sources
```

Supports two content types depending on the source type:

- **`sourceType: file`** — multipart/form-data (multer, 25 MB limit)
- **`sourceType: url` or `confluence`** — application/json

### File upload

```bash
curl -X POST https://retrieva.online/api/v1/data-sources \
  -F "name=DORA Compliance Guide" \
  -F "sourceType=file" \
  -F "workspaceId=ws-123" \
  -F "file=@/path/to/document.pdf"
```

Supported file types: **pdf**, **docx**, **xlsx**, **xls** (max 25 MB).

### URL source

```json
{
  "name": "EBA Guidelines",
  "sourceType": "url",
  "workspaceId": "ws-123",
  "config": {
    "url": "https://www.eba.europa.eu/sites/default/documents/guidelines.pdf"
  }
}
```

### Confluence space

```json
{
  "name": "Engineering Wiki",
  "sourceType": "confluence",
  "workspaceId": "ws-123",
  "config": {
    "baseUrl": "https://mycompany.atlassian.net",
    "spaceKey": "ENG",
    "email": "user@mycompany.com",
    "apiToken": "ATATT3..."
  }
}
```

### Response `201`

```json
{
  "status": "success",
  "message": "Data source created and queued for sync",
  "data": {
    "dataSource": {
      "_id": "ds-abc123",
      "workspaceId": "ws-123",
      "name": "DORA Compliance Guide",
      "sourceType": "file",
      "status": "pending",
      "storageKey": "organizations/org-1/workspaces/ws-123/datasources/ds-abc123/document.pdf",
      "config": {
        "fileName": "document.pdf",
        "fileType": "pdf",
        "fileSize": 204800
      },
      "createdAt": "2025-01-01T00:00:00.000Z"
    }
  }
}
```

> `config.parsedText` is never returned in responses — it is cleared from the DB after the first successful sync.

---

## List data sources

```http
GET /api/v1/data-sources?workspaceId=ws-123
```

Returns all data sources for the workspace sorted by `createdAt` descending.

### Response `200`

```json
{
  "status": "success",
  "data": {
    "dataSources": [
      {
        "_id": "ds-abc123",
        "name": "DORA Compliance Guide",
        "sourceType": "file",
        "status": "active",
        "stats": {
          "totalDocuments": 1,
          "documentsIndexed": 1
        },
        "lastSyncedAt": "2025-01-02T10:00:00.000Z"
      }
    ]
  }
}
```

---

## Get a single data source

```http
GET /api/v1/data-sources/:id
```

Returns the full data source document (minus `parsedText`). Returns `403` if the caller is not authorised for the owning workspace.

---

## Trigger a sync

```http
POST /api/v1/data-sources/:id/sync
```

Enqueues a new `dataSourceSync` BullMQ job. Returns `409` if a sync is already running.

### Response `200`

```json
{
  "status": "success",
  "message": "Sync job enqueued",
  "data": { "jobId": "1234" }
}
```

Requires `canTriggerSync` workspace permission.

---

## Download the original file

```http
GET /api/v1/data-sources/:id/download
```

Streams the original uploaded file back to the client. Only available for `sourceType: file` data sources when DigitalOcean Spaces is configured and a `storageKey` was recorded on creation.

Returns `404` when:
- the data source does not exist
- `storageKey` is `null` (Spaces not configured at upload time, or non-file source)

### Response `200`

- `Content-Type: application/octet-stream`
- `Content-Disposition: attachment; filename="{original filename}"`
- Body: raw file bytes (streamed directly from Spaces)

---

## Delete a data source

```http
DELETE /api/v1/data-sources/:id
```

1. Soft-deletes all related `DocumentSource` records (`syncStatus: 'deleted'`).
2. Hard-deletes the `DataSource` document from MongoDB.
3. If `storageKey` is set, deletes the file from DigitalOcean Spaces (non-blocking — a warning is logged on failure but the delete still succeeds).

Qdrant vectors for soft-deleted records are pruned on the next document index pass.

### Response `200`

```json
{
  "status": "success",
  "message": "Data source deleted"
}
```

---

## Status lifecycle

| Status | Meaning |
|--------|---------|
| `pending` | Created, waiting for the first sync job to be picked up |
| `syncing` | Sync worker is actively fetching and chunking content |
| `active` | Last sync completed successfully |
| `error` | Last sync failed; `errorLog` contains details |

---

## Source types

### `file`

Text is extracted in the controller at upload time using `fileIngestionService.parseFile()`. The worker reads the pre-parsed text, calls `chunkText()`, and enqueues each chunk to `documentIndexQueue`. `parsedText` is deleted from the DB after the first successful sync to save space.

### `url`

The worker uses axios (10 s timeout) to fetch the URL and strips HTML tags before chunking. Re-syncing re-fetches the live URL.

### `confluence`

The worker paginates `/wiki/rest/api/content?spaceKey=X&type=page` (50 pages per request), fetches the storage-format body of each page, strips Confluence XML, and chunks the plain text. The `apiToken` is encrypted at rest via `createEncryptionPlugin`.
