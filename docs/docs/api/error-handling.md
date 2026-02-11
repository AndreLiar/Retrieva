---
sidebar_position: 8
---

# Error Handling

Standard error responses and error codes.

## Error Response Format

All errors follow this format:

```json
{
  "status": "error",
  "message": "Human-readable error description",
  "error": {
    "code": "ERROR_CODE",
    "details": ["Additional details if available"]
  }
}
```

## HTTP Status Codes

### 400 Bad Request

Validation or client errors.

```json
{
  "status": "error",
  "message": "Validation failed: question is required",
  "error": {
    "code": "VALIDATION_ERROR",
    "details": [
      "question: is required",
      "conversationId: must be a valid ObjectId"
    ]
  }
}
```

### 401 Unauthorized

Authentication required or token invalid.

```json
{
  "status": "error",
  "message": "Authentication required",
  "error": {
    "code": "AUTH_REQUIRED"
  }
}
```

```json
{
  "status": "error",
  "message": "Token expired",
  "error": {
    "code": "TOKEN_EXPIRED"
  }
}
```

### 403 Forbidden

Authenticated but lacks permission.

```json
{
  "status": "error",
  "message": "Access denied to this workspace",
  "error": {
    "code": "ACCESS_DENIED"
  }
}
```

```json
{
  "status": "error",
  "message": "Permission denied: canInvite",
  "error": {
    "code": "PERMISSION_DENIED",
    "details": ["Required permission: canInvite"]
  }
}
```

### 404 Not Found

Resource doesn't exist.

```json
{
  "status": "error",
  "message": "Conversation not found",
  "error": {
    "code": "NOT_FOUND"
  }
}
```

### 409 Conflict

Resource conflict (duplicate, etc.).

```json
{
  "status": "error",
  "message": "User already exists with this email",
  "error": {
    "code": "DUPLICATE_RESOURCE"
  }
}
```

### 429 Too Many Requests

Rate limit exceeded.

```json
{
  "status": "error",
  "message": "Too many requests, please try again later",
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "details": ["Retry after 60 seconds"]
  }
}
```

Headers included:

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1704067260
Retry-After: 60
```

### 500 Internal Server Error

Server-side error.

```json
{
  "status": "error",
  "message": "An unexpected error occurred",
  "error": {
    "code": "INTERNAL_ERROR"
  }
}
```

In development, includes stack trace:

```json
{
  "status": "error",
  "message": "Cannot read property 'id' of undefined",
  "error": {
    "code": "INTERNAL_ERROR"
  },
  "stack": "TypeError: Cannot read property...\n    at processQuery..."
}
```

### 503 Service Unavailable

Dependency unavailable.

```json
{
  "status": "error",
  "message": "LLM service unavailable",
  "error": {
    "code": "SERVICE_UNAVAILABLE",
    "details": ["Azure OpenAI connection failed"]
  }
}
```

## Error Codes Reference

### Authentication Errors

| Code | Description |
|------|-------------|
| AUTH_REQUIRED | No authentication provided |
| TOKEN_EXPIRED | JWT token has expired |
| TOKEN_INVALID | JWT token is malformed |
| REFRESH_TOKEN_INVALID | Refresh token invalid or expired |
| INVALID_CREDENTIALS | Wrong email or password |

### Authorization Errors

| Code | Description |
|------|-------------|
| ACCESS_DENIED | No access to resource |
| PERMISSION_DENIED | Missing required permission |
| OWNER_REQUIRED | Operation requires owner role |

### Validation Errors

| Code | Description |
|------|-------------|
| VALIDATION_ERROR | Request body validation failed |
| INVALID_ID | Invalid ObjectId format |
| MISSING_REQUIRED_FIELD | Required field not provided |
| INVALID_FIELD_VALUE | Field value invalid |

### Resource Errors

| Code | Description |
|------|-------------|
| NOT_FOUND | Resource doesn't exist |
| DUPLICATE_RESOURCE | Resource already exists |
| RESOURCE_EXPIRED | Resource has expired |

### RAG Errors

| Code | Description |
|------|-------------|
| RAG_NO_CONTEXT | No relevant documents found |
| RAG_LLM_ERROR | LLM generation failed |
| RAG_TIMEOUT | Request timed out |
| RAG_LOW_CONFIDENCE | Answer confidence too low |

### Sync Errors

| Code | Description |
|------|-------------|
| SYNC_IN_PROGRESS | Sync already running |
| SYNC_FAILED | Sync job failed |
| NOTION_AUTH_EXPIRED | Notion token expired |
| NOTION_RATE_LIMITED | Notion API rate limited |

### System Errors

| Code | Description |
|------|-------------|
| INTERNAL_ERROR | Unexpected server error |
| SERVICE_UNAVAILABLE | External service down |
| RATE_LIMIT_EXCEEDED | Too many requests |
| MAINTENANCE_MODE | System under maintenance |

## Client Error Handling

### JavaScript Example

```javascript
async function apiCall(endpoint, options) {
  try {
    const response = await fetch(endpoint, options);
    const data = await response.json();

    if (!response.ok) {
      switch (response.status) {
        case 401:
          if (data.error?.code === 'TOKEN_EXPIRED') {
            await refreshToken();
            return apiCall(endpoint, options); // Retry
          }
          redirectToLogin();
          break;

        case 403:
          showError('You do not have permission for this action');
          break;

        case 429:
          const retryAfter = response.headers.get('Retry-After');
          showError(`Rate limited. Try again in ${retryAfter}s`);
          break;

        default:
          showError(data.message || 'An error occurred');
      }
      throw new ApiError(data);
    }

    return data;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new NetworkError('Network request failed');
  }
}
```

### React Hook Example

```typescript
function useApiError() {
  const handleError = useCallback((error: ApiError) => {
    switch (error.code) {
      case 'AUTH_REQUIRED':
      case 'TOKEN_EXPIRED':
        logout();
        navigate('/login');
        break;

      case 'PERMISSION_DENIED':
        toast.error('Permission denied');
        break;

      case 'RATE_LIMIT_EXCEEDED':
        toast.warning('Too many requests. Please slow down.');
        break;

      default:
        toast.error(error.message);
    }
  }, []);

  return { handleError };
}
```
