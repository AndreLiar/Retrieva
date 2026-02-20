---
sidebar_position: 6
---

# Data Source Connectors

Retrieva supports multiple data sources through a standard adapter protocol. Notion is connected natively; all other sources (Confluence, GitHub, Google Drive, Jira, Slack, …) are connected via the **Model Context Protocol (MCP)**.

## Design Principle

Rather than building a custom adapter for every data source, Retrieva defines a single standard interface that external services implement. A data source owner runs a lightweight **MCP server** that exposes their content through a fixed set of tools. Retrieva acts as the **MCP client** and connects to any number of these servers — without changes to the core RAG pipeline.

```
External Service         MCP Server           Retrieva (MCP Client)
─────────────────        ──────────────        ──────────────────────────────
Confluence API    ──▶    list_documents  ──▶   MCPDataSourceAdapter
GitHub API        ──▶    fetch_document  ──▶   mcpSyncWorker
Google Drive API  ──▶    get_changes     ──▶   documentIndexQueue
Jira API          ──▶    get_source_info ──▶   documentIndexWorker ──▶ Qdrant
```

## MCP Tool Contract

Every MCP data source server must expose exactly four tools:

### `get_source_info`

Returns metadata about the source. Used for connectivity checks and display.

```json
{
  "name": "Confluence Space: ENG",
  "type": "confluence",
  "totalDocuments": 342,
  "description": "Engineering wiki pages"
}
```

### `list_documents`

Returns a lightweight list of all available documents. Used to determine what to sync.

```json
[
  {
    "id": "page-123",
    "title": "API Design Guidelines",
    "url": "https://company.atlassian.net/wiki/...",
    "lastModified": "2026-02-15T10:00:00Z",
    "type": "page",
    "parentId": "page-100"
  }
]
```

### `fetch_document`

Returns the full content for a single document. This is the payload that flows into the indexing pipeline.

**Arguments:** `{ document_id: string }`

```json
{
  "id": "page-123",
  "title": "API Design Guidelines",
  "url": "https://company.atlassian.net/wiki/...",
  "content": "# API Design Guidelines\n\nAll APIs must...",
  "contentHash": "sha256-hex-string",
  "createdAt": "2025-01-01T00:00:00Z",
  "lastModified": "2026-02-15T10:00:00Z",
  "author": "Alice Smith",
  "parentId": "page-100",
  "parentType": "page",
  "properties": { "spaceKey": "ENG", "version": 12 }
}
```

The `content` field must be **markdown or plain text**. Retrieva uses the same `RecursiveCharacterTextSplitter` chunking path as the Notion legacy fallback when no `blocks` are provided.

### `get_changes`

Returns documents that changed since a given timestamp. Used for incremental syncs. If not implemented, the worker falls back to a full re-sync.

**Arguments:** `{ since: "2026-02-19T00:00:00Z" }`

```json
[
  { "id": "page-123", "changeType": "modified" },
  { "id": "page-999", "changeType": "deleted" }
]
```

`changeType` values: `created` | `modified` | `deleted`

## Transport and Authentication

The MCP server must accept **StreamableHTTP** (POST) requests at a single endpoint (e.g. `/mcp`). Retrieva sends an `Authorization: Bearer <token>` header if a token is configured for the source.

```
POST https://mcp.company.internal/confluence
Authorization: Bearer <authToken>
Content-Type: application/json
```

The auth token is stored encrypted (AES-GCM) in MongoDB and decrypted at sync time.

## Ingestion Pipeline

Once the MCP worker fetches a document it enqueues it to the standard `documentIndexQueue` — the same queue used by the Notion sync worker. The `documentIndexWorker` handles everything downstream: chunking, PII scanning, embedding, Qdrant indexing, sparse vector indexing, and M3 memory processing.

```
MCPDataSourceAdapter.getDocumentContent(id)
  └─▶ documentIndexQueue.add('indexDocument', {
        workspaceId,
        sourceId,
        sourceType: 'confluence',  // flows into Qdrant chunk metadata
        documentContent,           // { id, title, url, content, contentHash, … }
        operation: 'add' | 'update',
      })
        └─▶ documentIndexWorker
              ├─ prepareNotionDocumentForIndexing(doc, wsId, null, sourceType)
              │    └─ RecursiveCharacterTextSplitter (no blocks → legacy path)
              ├─ Qdrant dense vectors (Azure OpenAI text-embedding-3-small)
              ├─ BM25 sparse vectors (hybrid search)
              └─ M3 summary + entity extraction (async)
```

## Source Type in Metadata

The `sourceType` string (e.g. `'confluence'`) is written into every Qdrant chunk's `metadata.sourceType` field. This means:
- Citations in the UI show the correct source badge (Confluence, GitHub, etc.)
- RAG retrieval filters can be scoped to a specific source type
- Analytics correctly attribute queries to their source

## Registering a Data Source

See the [MCP Sources API reference](../api/mcp-sources) for the full REST API.

Quick example:

```bash
# 1. Start the MCP server (see mcp-servers/example-confluence/)
node mcp-servers/example-confluence/index.js

# 2. Test connectivity
curl -X POST /api/v1/mcp-sources/test-connection \
  -d '{ "serverUrl": "http://localhost:3100/mcp", "authToken": "secret", "sourceType": "confluence" }'

# 3. Register
curl -X POST /api/v1/mcp-sources \
  -d '{ "name": "Confluence", "sourceType": "confluence", "serverUrl": "...", "authToken": "..." }'

# 4. Sync
curl -X POST /api/v1/mcp-sources/<id>/sync \
  -d '{ "syncType": "full" }'
```

## Reference Implementation

`mcp-servers/example-confluence/` is a complete working MCP server that wraps the Confluence REST API. Use it as a template for building connectors to other services.

Key environment variables:

```bash
PORT=3100
MCP_AUTH_TOKEN=my-secret              # Required by Retrieva
CONFLUENCE_BASE_URL=https://company.atlassian.net
CONFLUENCE_USERNAME=me@company.com
CONFLUENCE_API_TOKEN=my-api-token
CONFLUENCE_SPACE_KEY=ENG              # Optional: limit to one space
```
