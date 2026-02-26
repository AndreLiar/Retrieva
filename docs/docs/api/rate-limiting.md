---
sidebar_position: 9
---

# Rate Limiting

API rate limits protect the service from abuse and ensure fair usage.

## Rate Limit Tiers

### Global Limits

| Endpoint Pattern | Limit | Window |
|------------------|-------|--------|
| `/api/v1/*` (default) | 1 000 requests | 1 hour |
| `/health` | Unlimited | - |
| `/sync-status` | Unlimited | - |

### Endpoint-Specific Limits

These limits run **in addition to** the global budget and are keyed by authenticated user ID where possible (not IP), so shared office NAT addresses do not bleed into each other's quota.

| Endpoint | Limit | Window | Key | Notes |
|----------|-------|--------|-----|-------|
| `GET /notifications/count` | 120 | 1 hour | User ID | Badge count; primary delivery is WebSocket push — HTTP only on mount + 5-min reconciliation poll |
| `POST /rag/query` | 100 (auth) / 20 (anon) | 1 hour | User ID / IP | Each query triggers multiple LLM calls |
| `POST /rag/stream` | 50 (auth) / 10 (anon) | 1 hour | User ID / IP | Streaming is more resource-intensive |
| `POST /rag/*` burst | 5 | 10 seconds | User ID / IP | Prevents rapid-fire RAG requests |
| `POST /ragas/evaluate` | 10 | 1 hour | User ID / IP | Calls external RAGAS service |

## Response Headers

Rate limit information is included in response headers:

```http
HTTP/1.1 200 OK
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1704067260
```

| Header | Description |
|--------|-------------|
| X-RateLimit-Limit | Maximum requests allowed in window |
| X-RateLimit-Remaining | Requests remaining in current window |
| X-RateLimit-Reset | Unix timestamp when limit resets |

## Rate Limit Exceeded

When rate limit is exceeded, you receive:

```http
HTTP/1.1 429 Too Many Requests
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1704067260
Retry-After: 45

{
  "status": "error",
  "message": "Too many requests, please try again later",
  "error": {
    "code": "RATE_LIMIT_EXCEEDED"
  }
}
```

## Rate Limit Storage

Rate limits are tracked per:

1. **User ID** — for authenticated requests (preferred; immune to shared-IP issues)
2. **IP Address** — fallback for unauthenticated requests

Limits use an in-memory store (no Redis dependency). This means limits reset on server restart and are not shared across multiple backend instances, which is acceptable for the current single-instance deployment.

## Notification Badge

The `/notifications/count` endpoint deserves special mention because it is the most frequently hit polling endpoint. To avoid burning through the global 1 000 req/hr budget, the frontend uses **WebSocket push** as the primary update path:

1. On mount, one HTTP call fetches the initial count.
2. `SocketProvider` listens for `notification:new` events and calls `queryClient.setQueryData` to increment the badge count locally — **zero extra HTTP requests per notification**.
3. A 5-minute background poll reconciles the count in case a socket event was missed (server restart, brief disconnect).
4. `refetchOnWindowFocus` is disabled so switching browser tabs does not fire additional requests.

This reduces notification-related HTTP traffic from ~120 requests/hour (old 30-second polling) to ~12 requests/hour (5-minute reconciliation) under normal usage.

## Handling Rate Limits

### Retry Strategy

```javascript
async function fetchWithRetry(url, options, maxRetries = 3) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const response = await fetch(url, options);

    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After');
      const delay = retryAfter
        ? parseInt(retryAfter) * 1000
        : Math.pow(2, attempt) * 1000; // Exponential backoff

      console.log(`Rate limited. Retrying in ${delay}ms`);
      await sleep(delay);
      continue;
    }

    return response;
  }

  throw new Error('Max retries exceeded');
}
```

### Client-Side Rate Limiting

Prevent hitting limits by implementing client-side throttling:

```javascript
import { throttle } from 'lodash';

// Throttle RAG requests to 1 per 3 seconds
const throttledAsk = throttle(async (question) => {
  return await api.ask(question);
}, 3000);
```

### React Query Example

```typescript
import { useQuery } from '@tanstack/react-query';

const useRAGQuery = (question: string) => {
  return useQuery({
    queryKey: ['rag', question],
    queryFn: () => api.ask(question),
    retry: (failureCount, error) => {
      // Don't retry on rate limit
      if (error.status === 429) return false;
      return failureCount < 3;
    },
    retryDelay: (attemptIndex, error) => {
      if (error.status === 429) {
        const retryAfter = error.headers.get('Retry-After');
        return retryAfter ? parseInt(retryAfter) * 1000 : 60000;
      }
      return Math.min(1000 * 2 ** attemptIndex, 30000);
    },
  });
};
```

## Rate Limit Configuration

Environment variables for customization:

```bash
# Global rate limit
RATE_LIMIT_WINDOW_MS=60000      # 1 minute
RATE_LIMIT_MAX=100               # 100 requests

# Auth rate limits
AUTH_RATE_LIMIT_WINDOW_MS=900000  # 15 minutes
AUTH_RATE_LIMIT_MAX=10

# RAG rate limits
RAG_RATE_LIMIT_WINDOW_MS=60000   # 1 minute
RAG_RATE_LIMIT_MAX=20

# Sync rate limits
SYNC_RATE_LIMIT_WINDOW_MS=3600000  # 1 hour
SYNC_RATE_LIMIT_MAX=5
```

## Increasing Limits

For high-volume use cases, contact support to discuss:

- **Enterprise plans** with higher limits
- **Dedicated instances** with custom limits
- **API keys** with elevated quotas

## Best Practices

1. **Cache responses** - Reduce API calls by caching
2. **Batch requests** - Combine multiple operations when possible
3. **Use webhooks** - Subscribe to events instead of polling
4. **Implement backoff** - Use exponential backoff on retries
5. **Monitor usage** - Track your rate limit headers
6. **Optimize queries** - Make queries more specific to reduce retries
