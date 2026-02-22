---
sidebar_position: 8
---

# MCP Data Sources

Manage external data sources connected via the [Model Context Protocol](../architecture/data-source-connectors). Each MCP source points to a remote MCP server that exposes its documents through a standard set of tools. Retrieva syncs those documents into the same Qdrant pipeline used for Notion.

All endpoints require authentication and are workspace-scoped.

The **Sources** page (`/sources`) provides a full UI for this API: `MCPServerCard` displays each source with its sync status and action buttons, and `MCPConnectDialog` lets users register a new server with an inline test-connection step before submitting. See [Sources Components](../frontend/components#sources-components) for component details.

---

## Register a Data Source

```
POST /api/v1/mcp-sources
```

Registers a new MCP data source and verifies connectivity before persisting. Returns `422` if the server is unreachable.

### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Human-readable label (max 120 chars) |
| `sourceType` | string | Yes | `confluence` \| `gdrive` \| `github` \| `jira` \| `slack` \| `custom` |
| `serverUrl` | string | Yes | Full HTTP URL of the MCP server endpoint |
| `authToken` | string | No | Bearer token sent to the MCP server |
| `syncSettings` | object | No | `{ autoSync: bool, syncIntervalHours: number }` |

```json
{
  "name": "Confluence - Engineering Wiki",
  "sourceType": "confluence",
  "serverUrl": "https://mcp.company.internal/confluence",
  "authToken": "secret-bearer-token",
  "syncSettings": { "autoSync": false }
}
```

### Response `201`

```json
{
  "status": "success",
  "message": "MCP data source registered",
  "data": {
    "source": {
      "_id": "664f1a2b3c4d5e6f7a8b9c0d",
      "workspaceId": "ws-123",
      "name": "Confluence - Engineering Wiki",
      "sourceType": "confluence",
      "serverUrl": "https://mcp.company.internal/confluence",
      "syncStatus": "pending",
      "syncSettings": { "autoSync": false, "syncIntervalHours": 24 },
      "stats": { "totalDocuments": 0 },
      "createdAt": "2026-02-20T16:00:00.000Z"
    }
  }
}
```

---

## List Data Sources

```
GET /api/v1/mcp-sources
```

Returns all MCP data sources for the current workspace. Auth tokens are never included in the response.

### Response `200`

```json
{
  "status": "success",
  "data": {
    "sources": [
      {
        "_id": "664f1a2b3c4d5e6f7a8b9c0d",
        "name": "Confluence - Engineering Wiki",
        "sourceType": "confluence",
        "serverUrl": "https://mcp.company.internal/confluence",
        "syncStatus": "active",
        "lastSyncedAt": "2026-02-20T14:30:00.000Z",
        "stats": { "totalDocuments": 342, "documentsIndexed": 338 }
      }
    ]
  }
}
```

---

## Get a Data Source

```
GET /api/v1/mcp-sources/:id
```

### Response `200`

Same shape as a single item from the list response.

---

## Update a Data Source

```
PATCH /api/v1/mcp-sources/:id
```

Update the name, server URL, auth token, or sync settings. If `serverUrl` or `authToken` changes, connectivity is re-verified before saving.

### Request Body (all fields optional)

```json
{
  "name": "Confluence - Engineering Wiki (updated)",
  "syncSettings": { "autoSync": true, "syncIntervalHours": 12 }
}
```

### Response `200`

Returns the updated source object.

---

## Delete a Data Source

```
DELETE /api/v1/mcp-sources/:id
```

Removes the MCP source record and soft-deletes all `DocumentSource` records that were indexed from it. The vectors in Qdrant will be cleaned up on the next indexing run.

### Response `200`

```json
{ "status": "success", "message": "MCP data source deleted" }
```

---

## Test Connection

```
POST /api/v1/mcp-sources/test-connection
```

Probe a candidate MCP server without persisting anything. Useful for validating credentials before registering a source.

### Request Body

```json
{
  "serverUrl": "https://mcp.company.internal/confluence",
  "authToken": "secret-bearer-token",
  "sourceType": "confluence"
}
```

### Response `200` (success)

```json
{
  "status": "success",
  "message": "Connection successful",
  "data": {
    "ok": true,
    "sourceInfo": {
      "name": "Confluence Space: ENG",
      "type": "confluence",
      "totalDocuments": 342,
      "description": "Confluence pages via MCP"
    }
  }
}
```

### Response `422` (failure)

```json
{
  "status": "success",
  "message": "Connection failed",
  "data": {
    "ok": false,
    "error": "MCP operation timed out after 15000ms: connect"
  }
}
```

---

## Trigger a Sync

```
POST /api/v1/mcp-sources/:id/sync
```

Enqueues a `mcpSync` BullMQ job. Returns `202 Accepted` immediately; sync happens asynchronously.

### Request Body

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `syncType` | string | `"full"` | `"full"` re-indexes everything; `"incremental"` only fetches changes since `lastSyncedAt` |

```json
{ "syncType": "incremental" }
```

### Response `202`

```json
{
  "status": "success",
  "message": "MCP sync job queued",
  "data": { "jobId": "mcp-sync-664f1a2b-1771603532" }
}
```

### Error `409`

Returned when a sync is already in progress or the source is paused.

---

## Get Stats

```
GET /api/v1/mcp-sources/:id/stats
```

Returns document counts broken down by sync status, plus the last sync metadata.

### Response `200`

```json
{
  "status": "success",
  "message": "MCP data source stats",
  "data": {
    "source": "Confluence - Engineering Wiki",
    "sourceType": "confluence",
    "syncStatus": "active",
    "lastSyncedAt": "2026-02-20T14:30:00.000Z",
    "stats": {
      "totalDocuments": 342,
      "documentsIndexed": 338,
      "documentsSkipped": 4,
      "documentsErrored": 0,
      "lastSyncDurationMs": 45200
    },
    "documents": {
      "synced": 338,
      "pending": 0,
      "error": 4,
      "deleted": 12
    }
  }
}
```

---

## Building an MCP Server

To connect a new data source you need to run an MCP server that exposes four tools:

| Tool | Arguments | Returns |
|------|-----------|---------|
| `get_source_info` | — | `{ name, type, totalDocuments, description }` |
| `list_documents` | — | `[{ id, title, url, lastModified, type, parentId }]` |
| `fetch_document` | `{ document_id }` | `{ id, title, url, content, contentHash, createdAt, lastModified, author, properties }` |
| `get_changes` | `{ since }` (ISO-8601) | `[{ id, changeType: 'created'\|'modified'\|'deleted' }]` |

A working reference implementation for Confluence is available at [`mcp-servers/example-confluence/`](https://github.com/AndreLiar/Retrieva/tree/main/mcp-servers/example-confluence).

```bash
# Run the example server
cd mcp-servers/example-confluence
npm install
MCP_AUTH_TOKEN=my-secret \
CONFLUENCE_BASE_URL=https://company.atlassian.net \
CONFLUENCE_USERNAME=me@company.com \
CONFLUENCE_API_TOKEN=my-api-token \
node index.js
# → Listening on http://localhost:3100/mcp
```

Then register it in Retrieva:

```bash
curl -X POST https://retrieva.online/api/v1/mcp-sources \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Confluence - Engineering",
    "sourceType": "confluence",
    "serverUrl": "https://mcp.company.internal/confluence",
    "authToken": "my-secret"
  }'
```
