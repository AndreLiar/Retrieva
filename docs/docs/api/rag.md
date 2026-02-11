---
sidebar_position: 2
---

# RAG API

The RAG (Retrieval-Augmented Generation) endpoints handle question answering.

## Ask Question

```http
POST /api/v1/rag
```

Ask a question and get an answer based on your Notion documents.

### Headers

| Header | Required | Description |
|--------|----------|-------------|
| Authorization | Yes | Bearer token |
| X-Workspace-Id | Yes | Workspace ID |
| Content-Type | Yes | application/json |

### Request Body

```json
{
  "question": "What is our refund policy?",
  "conversationId": "507f1f77bcf86cd799439011",
  "filters": {
    "page": "page-id-123",
    "section": "Policies",
    "dateRange": {
      "start": "2024-01-01",
      "end": "2024-12-31"
    }
  }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| question | string | Yes | The question to ask (1-5000 chars) |
| conversationId | string | No | Conversation ID for context |
| filters | object | No | Optional retrieval filters |
| filters.page | string | No | Filter to specific page |
| filters.section | string | No | Filter to section |
| filters.dateRange | object | No | Filter by date range |

### Response

```json
{
  "status": "success",
  "data": {
    "answer": "Our refund policy allows returns within 30 days of purchase [Source 1]. Items must be in original condition [Source 2].",
    "formattedAnswer": {
      "text": "Our refund policy...",
      "format": "markdown"
    },
    "sources": [
      {
        "id": "source-1",
        "sourceNumber": 1,
        "title": "Return Policy",
        "content": "Returns are accepted within 30 days...",
        "url": "https://notion.so/...",
        "section": "Refunds",
        "score": 0.92
      }
    ],
    "citedSources": [
      {
        "sourceNumber": 1,
        "title": "Return Policy",
        "url": "https://notion.so/..."
      }
    ],
    "validation": {
      "confidence": 0.85,
      "isGrounded": true,
      "hasHallucinations": false,
      "isRelevant": true,
      "issues": []
    },
    "conversationId": "507f1f77bcf86cd799439011",
    "totalTime": 2350
  }
}
```

### Error Responses

**400 Bad Request** - Validation error
```json
{
  "status": "error",
  "message": "Validation failed: question is required"
}
```

**401 Unauthorized** - Invalid token
```json
{
  "status": "error",
  "message": "Authentication required"
}
```

**403 Forbidden** - No workspace access
```json
{
  "status": "error",
  "message": "Access denied to this workspace"
}
```

---

## Streaming Ask

```http
POST /api/v1/rag/stream
```

Ask a question with real-time streaming response via SSE.

### Headers

Same as `/rag` endpoint.

### Request Body

Same as `/rag` endpoint.

### Response

Server-Sent Events stream:

```
event: status
data: {"message": "Retrieving context...", "timestamp": 1704067200000}

event: sources
data: {"sources": [...], "timestamp": 1704067201000}

event: status
data: {"message": "Generating answer...", "timestamp": 1704067202000}

event: chunk
data: {"text": "Our ", "timestamp": 1704067203000}

event: chunk
data: {"text": "refund ", "timestamp": 1704067204000}

event: chunk
data: {"text": "policy ", "timestamp": 1704067205000}

event: metadata
data: {"confidence": 0.85, "citedSources": [...], "timestamp": 1704067210000}

event: saved
data: {"conversationId": "507f1f77bcf86cd799439011", "timestamp": 1704067211000}

event: done
data: {"message": "Streaming complete", "timestamp": 1704067212000}
```

### Event Types

| Event | Description | Payload |
|-------|-------------|---------|
| status | Progress updates | `{ message: string }` |
| sources | Retrieved sources | `{ sources: Source[] }` |
| chunk | Answer text chunk | `{ text: string }` |
| metadata | Answer metadata | `{ confidence, citedSources, ... }` |
| saved | Message saved | `{ conversationId: string }` |
| done | Stream complete | `{ message: string }` |
| error | Error occurred | `{ message: string, code?: string }` |

### Client Example

```javascript
const eventSource = new EventSource('/api/v1/rag/stream', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Workspace-Id': workspaceId,
  },
  body: JSON.stringify({ question }),
});

eventSource.addEventListener('chunk', (event) => {
  const { text } = JSON.parse(event.data);
  appendToAnswer(text);
});

eventSource.addEventListener('sources', (event) => {
  const { sources } = JSON.parse(event.data);
  displaySources(sources);
});

eventSource.addEventListener('done', () => {
  eventSource.close();
});

eventSource.addEventListener('error', (event) => {
  console.error('Stream error:', event);
  eventSource.close();
});
```

---

## Ask in Conversation

```http
POST /api/v1/conversations/:id/ask
```

Ask a question within an existing conversation context.

### Path Parameters

| Parameter | Description |
|-----------|-------------|
| id | Conversation ID |

### Request Body

```json
{
  "question": "Can you explain more about the exceptions?",
  "filters": {}
}
```

### Response

Same as `/rag` endpoint.

---

## Request Examples

### cURL

```bash
# Simple question
curl -X POST http://localhost:3007/api/v1/rag \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Workspace-Id: $WORKSPACE_ID" \
  -d '{"question": "What is our vacation policy?"}'

# With filters
curl -X POST http://localhost:3007/api/v1/rag \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Workspace-Id: $WORKSPACE_ID" \
  -d '{
    "question": "What changed in the security policy?",
    "filters": {
      "section": "Security",
      "dateRange": {
        "start": "2024-01-01",
        "end": "2024-06-30"
      }
    }
  }'

# Streaming
curl -X POST http://localhost:3007/api/v1/rag/stream \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Workspace-Id: $WORKSPACE_ID" \
  -H "Accept: text/event-stream" \
  -d '{"question": "How do I submit an expense report?"}'
```

### JavaScript (Fetch)

```javascript
const response = await fetch('/api/v1/rag', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Workspace-Id': workspaceId,
  },
  credentials: 'include',
  body: JSON.stringify({
    question: 'What is our refund policy?',
    conversationId: conversationId,
  }),
});

const result = await response.json();
console.log(result.data.answer);
```

### Python

```python
import requests

response = requests.post(
    'http://localhost:3007/api/v1/rag',
    headers={
        'Content-Type': 'application/json',
        'Authorization': f'Bearer {token}',
        'X-Workspace-Id': workspace_id,
    },
    json={
        'question': 'What is our refund policy?'
    }
)

result = response.json()
print(result['data']['answer'])
```
