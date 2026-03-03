---
sidebar_position: 1
---

# API Overview

Retrieva provides a RESTful API for all operations. All endpoints are prefixed with `/api/v1`.

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
| POST | `/auth/refresh` | Refresh access token |
| GET | `/auth/me` | Get current user |
| POST | `/auth/forgot-password` | Request password reset email |
| POST | `/auth/reset-password` | Reset password with token |
| POST | `/auth/verify-email` | Verify email address with token |
| POST | `/auth/resend-verification` | Resend email verification link |

### Workspaces (Vendor Registry)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/workspaces` | List workspaces for the current user / org |
| POST | `/workspaces` | Create a new vendor workspace |
| GET | `/workspaces/:id` | Get workspace details |
| PATCH | `/workspaces/:id` | Update vendor profile (tier, country, contracts, certs) |
| DELETE | `/workspaces/:id` | Delete workspace |
| POST | `/workspaces/:id/members` | Add workspace member |
| DELETE | `/workspaces/:id/members/:userId` | Remove workspace member |
| GET | `/workspaces/roi-export` | Download EBA DORA Art. 28(3) RoI XLSX workbook |

### Assessments

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/assessments` | List assessments for a workspace |
| POST | `/assessments` | Create assessment and upload vendor documents |
| GET | `/assessments/:id` | Get assessment details and gap results |
| DELETE | `/assessments/:id` | Delete assessment |
| GET | `/assessments/:id/report` | Download Word (.docx) compliance report |

### Questionnaires

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/questionnaires` | List questionnaires for a workspace |
| POST | `/questionnaires` | Create and send a vendor questionnaire |
| GET | `/questionnaires/:id` | Get questionnaire with scoring results |
| PATCH | `/questionnaires/:id` | Update questionnaire |
| DELETE | `/questionnaires/:id` | Delete questionnaire |

### Organizations

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/organizations` | Create a new organization (first-time onboarding) |
| GET | `/organizations/me` | Get current user's organization |
| PATCH | `/organizations/:id` | Update organization |
| POST | `/organizations/:id/invite` | Invite a team member (sends email with `/join` link) |
| GET | `/organizations/:id/members` | List organization members |
| PATCH | `/organizations/:id/members/:memberId` | Change member role |
| DELETE | `/organizations/:id/members/:memberId` | Revoke membership |

### Analytics

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/analytics/queries` | Query analytics |
| GET | `/analytics/usage` | Usage statistics |
| GET | `/analytics/sources` | Source statistics |

### MCP Data Sources

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/mcp-sources` | Register a new MCP data source |
| GET | `/mcp-sources` | List all MCP sources for the workspace |
| GET | `/mcp-sources/:id` | Get a single MCP source |
| PATCH | `/mcp-sources/:id` | Update connection settings |
| DELETE | `/mcp-sources/:id` | Remove source and its indexed documents |
| POST | `/mcp-sources/test-connection` | Test connectivity without persisting |
| POST | `/mcp-sources/:id/sync` | Trigger a sync job |
| GET | `/mcp-sources/:id/stats` | Document counts and sync stats |

### Compliance (DORA Articles)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/compliance/domains` | List all DORA domains with article counts |
| GET | `/compliance/articles` | List articles, filter by domain or chapter |
| GET | `/compliance/articles/:article` | Get a single article with full regulatory text |

### Data Sources (File / URL / Confluence)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/data-sources` | Create a data source (file upload or JSON) |
| GET | `/data-sources` | List data sources for a workspace |
| GET | `/data-sources/:id` | Get a single data source |
| POST | `/data-sources/:id/sync` | Trigger a re-sync |
| DELETE | `/data-sources/:id` | Delete source and soft-delete indexed documents |

## Health Check

```bash
GET /health
```

Returns service health status:

```json
{
  "status": "success",
  "message": "Service is healthy",
  "data": {
    "status": "up",
    "timestamp": "2024-01-01T00:00:00.000Z",
    "uptime": 123.456
  }
}
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
