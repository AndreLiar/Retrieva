---
sidebar_position: 3
---

# Conversations API

Manage conversations and their messages.

## List Conversations

```http
GET /api/v1/conversations
```

Get all conversations for the current user in a workspace.

### Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| page | number | 1 | Page number |
| limit | number | 20 | Items per page (max 100) |
| status | string | active | Filter: active, archived, deleted |
| sort | string | -lastMessageAt | Sort field with direction |

### Response

```json
{
  "status": "success",
  "data": {
    "conversations": [
      {
        "id": "507f1f77bcf86cd799439011",
        "title": "Refund Policy Questions",
        "messageCount": 5,
        "lastMessageAt": "2024-01-15T10:30:00.000Z",
        "status": "active",
        "createdAt": "2024-01-15T09:00:00.000Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 45,
      "pages": 3
    }
  }
}
```

---

## Create Conversation

```http
POST /api/v1/conversations
```

Create a new conversation.

### Request Body

```json
{
  "title": "HR Policy Questions"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| title | string | No | Conversation title (default: "New Conversation") |

### Response

```json
{
  "status": "success",
  "data": {
    "conversation": {
      "id": "507f1f77bcf86cd799439011",
      "title": "HR Policy Questions",
      "messageCount": 0,
      "status": "active",
      "createdAt": "2024-01-15T10:00:00.000Z"
    }
  }
}
```

---

## Get Conversation

```http
GET /api/v1/conversations/:id
```

Get a conversation with its messages.

### Path Parameters

| Parameter | Description |
|-----------|-------------|
| id | Conversation ID |

### Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| messageLimit | number | 50 | Number of messages to include |

### Response

```json
{
  "status": "success",
  "data": {
    "conversation": {
      "id": "507f1f77bcf86cd799439011",
      "title": "HR Policy Questions",
      "messageCount": 5,
      "status": "active",
      "createdAt": "2024-01-15T09:00:00.000Z",
      "lastMessageAt": "2024-01-15T10:30:00.000Z"
    },
    "messages": [
      {
        "id": "507f1f77bcf86cd799439012",
        "role": "user",
        "content": "What is our vacation policy?",
        "timestamp": "2024-01-15T09:00:00.000Z"
      },
      {
        "id": "507f1f77bcf86cd799439013",
        "role": "assistant",
        "content": "Our vacation policy allows...",
        "metadata": {
          "confidence": 0.92,
          "sources": [...]
        },
        "timestamp": "2024-01-15T09:00:05.000Z"
      }
    ]
  }
}
```

---

## Update Conversation

```http
PATCH /api/v1/conversations/:id
```

Update conversation properties.

### Request Body

```json
{
  "title": "Updated Title",
  "status": "archived"
}
```

| Field | Type | Description |
|-------|------|-------------|
| title | string | New title |
| status | string | active, archived |

### Response

```json
{
  "status": "success",
  "data": {
    "conversation": {
      "id": "507f1f77bcf86cd799439011",
      "title": "Updated Title",
      "status": "archived"
    }
  }
}
```

---

## Delete Conversation

```http
DELETE /api/v1/conversations/:id
```

Delete a conversation and all its messages.

### Response

```json
{
  "status": "success",
  "message": "Conversation deleted successfully"
}
```

---

## Ask in Conversation

```http
POST /api/v1/conversations/:id/ask
```

Ask a question within conversation context.

### Request Body

```json
{
  "question": "Can you explain more about the exceptions?"
}
```

### Response

Same as RAG `/ask` endpoint, includes conversation context.

---

## Get Conversation Messages

```http
GET /api/v1/conversations/:id/messages
```

Get paginated messages for a conversation.

### Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| page | number | 1 | Page number |
| limit | number | 50 | Messages per page |
| before | string | - | Get messages before this ID |
| after | string | - | Get messages after this ID |

### Response

```json
{
  "status": "success",
  "data": {
    "messages": [
      {
        "id": "507f1f77bcf86cd799439012",
        "role": "user",
        "content": "What is our vacation policy?",
        "timestamp": "2024-01-15T09:00:00.000Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 50,
      "total": 10,
      "hasMore": false
    }
  }
}
```

---

## Clear Conversation

```http
DELETE /api/v1/conversations/:id/messages
```

Delete all messages in a conversation but keep the conversation.

### Response

```json
{
  "status": "success",
  "message": "Messages cleared successfully",
  "data": {
    "deletedCount": 15
  }
}
```

---

## Export Conversation

```http
GET /api/v1/conversations/:id/export
```

Export conversation as JSON or Markdown.

### Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| format | string | json | Export format: json, markdown |

### Response (JSON)

```json
{
  "status": "success",
  "data": {
    "conversation": {...},
    "messages": [...],
    "exportedAt": "2024-01-15T10:00:00.000Z"
  }
}
```

### Response (Markdown)

```markdown
# HR Policy Questions

**Created:** January 15, 2024

---

## User
What is our vacation policy?

## Assistant
Our vacation policy allows...

[Source 1: HR Handbook](https://notion.so/...)

---
```
