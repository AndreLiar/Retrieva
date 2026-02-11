---
sidebar_position: 7
---

# Analytics API

Query analytics and usage statistics.

## Query Analytics

```http
GET /api/v1/analytics/queries
```

Get query-level analytics.

### Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| startDate | string | 7 days ago | ISO date string |
| endDate | string | now | ISO date string |
| groupBy | string | day | day, hour, week |

### Response

```json
{
  "status": "success",
  "data": {
    "summary": {
      "totalQueries": 1250,
      "averageConfidence": 0.82,
      "averageResponseTime": 2340,
      "cacheHitRate": 0.35
    },
    "timeline": [
      {
        "date": "2024-01-15",
        "queries": 180,
        "avgConfidence": 0.84,
        "avgResponseTime": 2100
      },
      {
        "date": "2024-01-16",
        "queries": 210,
        "avgConfidence": 0.81,
        "avgResponseTime": 2450
      }
    ],
    "intents": [
      { "intent": "factual", "count": 450, "percentage": 36 },
      { "intent": "explanation", "count": 280, "percentage": 22 },
      { "intent": "procedural", "count": 220, "percentage": 18 }
    ]
  }
}
```

---

## Usage Statistics

```http
GET /api/v1/analytics/usage
```

Get workspace usage statistics.

### Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| period | string | month | day, week, month, year |

### Response

```json
{
  "status": "success",
  "data": {
    "period": "month",
    "usage": {
      "totalQueries": 5420,
      "uniqueUsers": 25,
      "totalConversations": 340,
      "documentsIndexed": 155,
      "storageUsedMB": 450
    },
    "comparison": {
      "queriesChange": 15,
      "usersChange": 8,
      "conversationsChange": 12
    },
    "topUsers": [
      {
        "userId": "507f1f77bcf86cd799439011",
        "name": "John Doe",
        "queryCount": 320
      }
    ]
  }
}
```

---

## Source Statistics

```http
GET /api/v1/analytics/sources
```

Get statistics about indexed sources.

### Response

```json
{
  "status": "success",
  "data": {
    "summary": {
      "totalSources": 155,
      "totalChunks": 3240,
      "indexedSources": 150,
      "pendingSources": 3,
      "errorSources": 2
    },
    "byType": [
      { "type": "page", "count": 150 },
      { "type": "database", "count": 5 }
    ],
    "topCited": [
      {
        "sourceId": "507f1f77bcf86cd799439011",
        "title": "Engineering Handbook",
        "citationCount": 245
      },
      {
        "sourceId": "507f1f77bcf86cd799439012",
        "title": "HR Policies",
        "citationCount": 180
      }
    ],
    "recentlyUpdated": [
      {
        "sourceId": "507f1f77bcf86cd799439013",
        "title": "Security Guidelines",
        "lastIndexedAt": "2024-01-20T08:00:00.000Z"
      }
    ]
  }
}
```

---

## Quality Metrics

```http
GET /api/v1/analytics/quality
```

Get answer quality metrics.

### Response

```json
{
  "status": "success",
  "data": {
    "overall": {
      "averageConfidence": 0.82,
      "groundedPercentage": 94,
      "hallucinationRate": 3,
      "averageCitationCount": 2.4
    },
    "byIntent": [
      {
        "intent": "factual",
        "avgConfidence": 0.88,
        "groundedPct": 96
      },
      {
        "intent": "explanation",
        "avgConfidence": 0.79,
        "groundedPct": 92
      }
    ],
    "lowQualityQueries": [
      {
        "question": "What is the meaning of life?",
        "confidence": 0.15,
        "reason": "out_of_scope",
        "timestamp": "2024-01-15T10:00:00.000Z"
      }
    ]
  }
}
```

---

## Sync Metrics

```http
GET /api/v1/analytics/sync
```

Get synchronization metrics.

### Response

```json
{
  "status": "success",
  "data": {
    "summary": {
      "totalSyncs": 45,
      "successfulSyncs": 42,
      "failedSyncs": 3,
      "averageDuration": 180000,
      "averageDocsPerSync": 155
    },
    "recentSyncs": [
      {
        "jobId": "sync-uuid",
        "status": "completed",
        "duration": 150000,
        "documentsProcessed": 155,
        "startedAt": "2024-01-20T08:00:00.000Z"
      }
    ],
    "errors": [
      {
        "errorType": "rate_limit",
        "count": 5
      },
      {
        "errorType": "network",
        "count": 2
      }
    ]
  }
}
```

---

## Export Analytics

```http
GET /api/v1/analytics/export
```

Export analytics data as CSV.

### Query Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| type | string | queries, usage, sources |
| startDate | string | Start date |
| endDate | string | End date |

### Response

Returns CSV file:

```csv
date,queries,avgConfidence,avgResponseTime,cacheHits
2024-01-15,180,0.84,2100,63
2024-01-16,210,0.81,2450,74
```

---

## Real-Time Metrics (WebSocket)

Connect to receive real-time metrics:

```javascript
const socket = io('/analytics', {
  auth: { token: accessToken }
});

socket.emit('subscribe', { workspaceId });

socket.on('metrics:update', (data) => {
  // Live query count, active users, etc.
  console.log('Active queries:', data.activeQueries);
});
```
