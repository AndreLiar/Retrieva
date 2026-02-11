---
sidebar_position: 5
---

# Notion API

Notion integration and synchronization endpoints.

## Start OAuth Flow

```http
GET /api/v1/notion/auth
```

Redirect to Notion OAuth authorization page.

### Query Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| state | string | Optional state for CSRF protection |

### Response

Redirects to Notion OAuth page.

---

## OAuth Callback

```http
GET /api/v1/notion/callback
```

Handle Notion OAuth callback and create workspace.

### Query Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| code | string | Authorization code from Notion |
| state | string | State parameter for verification |

### Response

Redirects to frontend with workspace ID:

```
http://localhost:3000/settings/integrations?workspace=507f1f77bcf86cd799439011
```

---

## List Workspaces

```http
GET /api/v1/notion/workspaces
```

Get all Notion workspaces for the current user.

### Response

```json
{
  "status": "success",
  "data": {
    "workspaces": [
      {
        "id": "507f1f77bcf86cd799439011",
        "workspaceName": "My Workspace",
        "workspaceId": "notion-workspace-uuid",
        "syncStatus": "active",
        "stats": {
          "totalPages": 150,
          "totalDatabases": 5,
          "lastSyncDuration": 120000
        },
        "lastSuccessfulSyncAt": "2024-01-20T08:00:00.000Z",
        "myRole": "owner"
      }
    ]
  }
}
```

---

## Trigger Sync

```http
POST /api/v1/notion/sync
```

Start a synchronization job.

### Request Body

```json
{
  "syncType": "incremental",
  "options": {
    "pageFilter": ["page-id-1", "page-id-2"]
  }
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| syncType | string | incremental | full or incremental |
| options.pageFilter | string[] | - | Specific pages to sync |

### Response

```json
{
  "status": "success",
  "message": "Sync started",
  "data": {
    "jobId": "sync-job-uuid",
    "status": "queued",
    "syncType": "incremental"
  }
}
```

---

## Get Sync Status

```http
GET /api/v1/notion/sync-status
```

Get current sync status and history.

### Response

```json
{
  "status": "success",
  "data": {
    "currentSync": {
      "jobId": "sync-job-uuid",
      "status": "processing",
      "progress": {
        "totalDocuments": 100,
        "processedDocuments": 45,
        "successCount": 43,
        "errorCount": 2,
        "currentDocument": "Engineering Docs"
      },
      "startedAt": "2024-01-20T08:00:00.000Z"
    },
    "recentSyncs": [
      {
        "jobId": "previous-job-uuid",
        "status": "completed",
        "syncType": "full",
        "results": {
          "documentsAdded": 50,
          "documentsUpdated": 30,
          "documentsDeleted": 5,
          "errors": []
        },
        "startedAt": "2024-01-19T08:00:00.000Z",
        "completedAt": "2024-01-19T08:05:00.000Z",
        "duration": 300000
      }
    ],
    "workspace": {
      "syncStatus": "syncing",
      "lastSuccessfulSyncAt": "2024-01-19T08:05:00.000Z",
      "stats": {
        "totalPages": 150,
        "totalDatabases": 5
      }
    }
  }
}
```

---

## Cancel Sync

```http
POST /api/v1/notion/sync/cancel
```

Cancel an in-progress sync job.

### Response

```json
{
  "status": "success",
  "message": "Sync cancelled"
}
```

---

## Get Document Sources

```http
GET /api/v1/notion/sources
```

List all indexed document sources.

### Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| page | number | 1 | Page number |
| limit | number | 50 | Items per page |
| status | string | - | Filter by status |
| search | string | - | Search by title |

### Response

```json
{
  "status": "success",
  "data": {
    "sources": [
      {
        "id": "507f1f77bcf86cd799439011",
        "sourceId": "notion-page-uuid",
        "title": "Engineering Handbook",
        "url": "https://notion.so/...",
        "syncStatus": "indexed",
        "chunkCount": 25,
        "lastModifiedInSource": "2024-01-15T10:00:00.000Z",
        "lastIndexedAt": "2024-01-20T08:00:00.000Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 50,
      "total": 150
    }
  }
}
```

---

## Reindex Document

```http
POST /api/v1/notion/sources/:id/reindex
```

Force reindex a specific document.

### Response

```json
{
  "status": "success",
  "message": "Document queued for reindexing",
  "data": {
    "jobId": "index-job-uuid"
  }
}
```

---

## Delete Workspace

```http
DELETE /api/v1/notion/workspaces/:id
```

Remove Notion workspace and all its data.

:::warning
This permanently deletes all indexed documents and conversations for this workspace.
:::

### Response

```json
{
  "status": "success",
  "message": "Workspace deleted successfully"
}
```

---

## Real-Time Sync Events

Connect via Socket.IO to receive real-time sync updates:

```javascript
const socket = io('/sync', {
  auth: { token: accessToken }
});

socket.on('sync:start', (data) => {
  console.log('Sync started:', data.jobId);
});

socket.on('sync:progress', (data) => {
  console.log(`Progress: ${data.current}/${data.total}`);
});

socket.on('sync:page-fetched', (data) => {
  console.log(`Fetched: ${data.title}`);
});

socket.on('sync:complete', (data) => {
  console.log('Sync complete:', data);
});

socket.on('sync:error', (data) => {
  console.error('Sync error:', data.error);
});
```
