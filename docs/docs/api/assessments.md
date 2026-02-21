---
sidebar_position: 8
---

# Assessments API

The Assessments API powers DORA (Regulation EU 2022/2554) third-party ICT risk assessments. Vendor documents are uploaded, indexed into an isolated Qdrant collection, and analysed by an agentic gap-analysis pipeline. Results are downloadable as a Word (.docx) compliance report.

## Base Path

```
/api/v1/assessments
```

All endpoints require a valid Bearer token (cookie-based auth) and an active workspace context.

---

## Endpoints

### `POST /assessments`

Create a new assessment and start the ingestion + analysis pipeline.

**Content-Type:** `multipart/form-data`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | ✓ | Short label (e.g. "Annual DORA review 2025") |
| `vendorName` | string | ✓ | Name of the third-party ICT provider |
| `workspaceId` | string | ✓ | Active workspace ID |
| `documents` | file[] | ✓ | 1–5 files (PDF, XLSX, XLS, DOCX — max 25 MB each) |

**Response `201`**

```json
{
  "success": true,
  "data": {
    "assessment": {
      "_id": "...",
      "name": "Annual DORA review 2025",
      "vendorName": "Acme Cloud",
      "status": "indexing",
      "documents": [
        { "fileName": "policy.pdf", "fileType": "application/pdf", "fileSize": 204800, "status": "uploading" }
      ],
      "createdAt": "2025-06-01T10:00:00.000Z"
    }
  }
}
```

The pipeline continues asynchronously. Subscribe to socket event `assessment:update` for progress, or poll `GET /assessments/:id`.

---

### `GET /assessments`

List assessments for the active workspace.

**Query parameters**

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `workspaceId` | string | — | Filter by workspace |
| `status` | `pending\|indexing\|analyzing\|complete\|failed` | — | Filter by status |
| `page` | number | 1 | Page number |
| `limit` | number | 20 | Page size (max 100) |

**Response `200`**

```json
{
  "success": true,
  "data": {
    "assessments": [ /* Assessment objects (gaps array excluded for performance) */ ],
    "pagination": { "page": 1, "limit": 20, "total": 5, "pages": 1 }
  }
}
```

---

### `GET /assessments/:id`

Get a single assessment including full gap results.

**Response `200`**

```json
{
  "success": true,
  "data": {
    "assessment": {
      "_id": "...",
      "status": "complete",
      "results": {
        "gaps": [
          {
            "article": "Article 9",
            "domain": "ICT Security",
            "requirement": "Entities shall maintain up-to-date ICT security policies.",
            "vendorCoverage": "Vendor references an ISO 27001 policy but no version or review date.",
            "gapLevel": "partial",
            "recommendation": "Request the dated, approved security policy document.",
            "sourceChunks": ["chunk-abc", "chunk-xyz"]
          }
        ],
        "overallRisk": "Medium",
        "summary": "The vendor demonstrates partial DORA compliance...",
        "domainsAnalyzed": ["ICT Security", "Business Continuity"],
        "generatedAt": "2025-06-01T10:15:00.000Z"
      }
    }
  }
}
```

---

### `GET /assessments/:id/report`

Download the DORA compliance report as a `.docx` Word document.

**Response `200`**

- Content-Type: `application/vnd.openxmlformats-officedocument.wordprocessingml.document`
- Content-Disposition: `attachment; filename="DORA_Assessment_Acme_Cloud_2025-06-01.docx"`
- Body: binary `.docx` buffer

Only available when `status === 'complete'`.

---

### `DELETE /assessments/:id`

Delete an assessment and its Qdrant vector collection.

- Only the creator can delete an assessment.
- Qdrant cleanup happens asynchronously after the HTTP response.

**Response `200`**

```json
{ "success": true, "message": "Assessment deleted" }
```

---

## Status Lifecycle

```
pending → indexing → analyzing → complete
                            └──→ failed
```

| Status | Meaning |
|--------|---------|
| `pending` | Created, jobs queued |
| `indexing` | Documents being parsed, chunked, and embedded into Qdrant |
| `analyzing` | Gap analysis agent running against DORA knowledge base |
| `complete` | Report ready for download |
| `failed` | Pipeline error — see `statusMessage` for details |

---

## Real-Time Updates

The backend emits `assessment:update` via Socket.io when the status changes.

```typescript
socket.on('assessment:update', (event: {
  assessmentId: string;
  status: AssessmentStatus;
  statusMessage?: string;
}) => { /* refresh UI */ });
```

---

## DORA Knowledge Base

Before running assessments, seed the compliance knowledge base:

```bash
npm run seed:compliance         # Seed DORA articles into Qdrant
npm run seed:compliance:reset   # Delete and re-seed
```

The knowledge base (`compliance_kb` Qdrant collection) contains verbatim article text for DORA Articles 5, 6, 9, 10, 11, 17, 18, 19, 24, 25, 28, 29, and 30.
