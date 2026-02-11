---
sidebar_position: 1
---

# API Overview

The RAG Platform provides a RESTful API for all operations. All endpoints are prefixed with `/api/v1`.

## Base URL

```
Development: http://localhost:3007/api/v1
Production:  https://your-domain.com/api/v1
```

## Authentication

Most endpoints require authentication via JWT tokens.

### Token Format

Include the access token in cookies (preferred) or Authorization header:

```bash
# Cookie (set automatically on login)
Cookie: accessToken=eyJhbGciOiJIUzI1NiIs...

# Or Authorization header
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

### Workspace Header

Protected endpoints require the workspace ID:

```bash
X-Workspace-Id: 507f1f77bcf86cd799439011
```

## Response Format

### Success Response

```json
{
  "status": "success",
  "message": "Operation completed successfully",
  "data": {
    // Response payload
  }
}
```

### Error Response

```json
{
  "status": "error",
  "message": "Error description",
  "error": {
    "code": "VALIDATION_ERROR",
    "details": ["field is required"]
  }
}
```

## Common HTTP Status Codes

| Code | Description |
|------|-------------|
| 200 | Success |
| 201 | Created |
| 400 | Bad Request - Validation error |
| 401 | Unauthorized - Invalid/missing token |
| 403 | Forbidden - Insufficient permissions |
| 404 | Not Found |
| 429 | Too Many Requests - Rate limited |
| 500 | Internal Server Error |

## API Endpoints Summary

### RAG

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/rag` | Ask a question |
| POST | `/rag/stream` | Ask with SSE streaming |

### Conversations

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/conversations` | List conversations |
| POST | `/conversations` | Create conversation |
| GET | `/conversations/:id` | Get conversation |
| PATCH | `/conversations/:id` | Update conversation |
| DELETE | `/conversations/:id` | Delete conversation |
| POST | `/conversations/:id/ask` | Ask in conversation |

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/auth/register` | Register user |
| POST | `/auth/login` | Login |
| POST | `/auth/logout` | Logout |
| POST | `/auth/refresh` | Refresh token |
| GET | `/auth/me` | Get current user |

### Notion

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/notion/auth` | Start OAuth flow |
| GET | `/notion/callback` | OAuth callback |
| POST | `/notion/sync` | Trigger sync |
| GET | `/notion/sync-status` | Get sync status |
| GET | `/notion/workspaces` | List workspaces |

### Workspaces

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/workspaces` | List user workspaces |
| GET | `/workspaces/:id` | Get workspace |
| PATCH | `/workspaces/:id` | Update workspace |
| DELETE | `/workspaces/:id` | Delete workspace |
| POST | `/workspaces/:id/members` | Add member |
| DELETE | `/workspaces/:id/members/:userId` | Remove member |

### Analytics

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/analytics/queries` | Query analytics |
| GET | `/analytics/usage` | Usage statistics |
| GET | `/analytics/sources` | Source statistics |

## Health Check

```bash
GET /health
```

Returns service health status:

```json
{
  "status": "healthy",
  "version": "1.0.0",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "services": {
    "mongodb": "connected",
    "redis": "connected",
    "qdrant": "connected",
    "ollama": "connected"
  }
}
```

## Swagger Documentation

Interactive API documentation is available at:

```
http://localhost:3007/api-docs
```

## Rate Limiting

| Endpoint | Limit |
|----------|-------|
| General | 100 requests/minute |
| Auth | 10 requests/15 minutes |
| RAG | 20 requests/minute |
| Sync | 5 requests/hour |

Rate limit headers are included in responses:

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1704067200
```

## Pagination

List endpoints support pagination:

```bash
GET /conversations?page=1&limit=20
```

Response includes pagination metadata:

```json
{
  "status": "success",
  "data": {
    "items": [...],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 150,
      "pages": 8
    }
  }
}
```

## Filtering & Sorting

```bash
# Filter by status
GET /conversations?status=active

# Sort by field
GET /conversations?sort=-createdAt  # Descending
GET /conversations?sort=createdAt   # Ascending
```

## CORS

The API supports CORS for configured origins:

```bash
Access-Control-Allow-Origin: http://localhost:3000
Access-Control-Allow-Credentials: true
Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization, X-Workspace-Id
```
