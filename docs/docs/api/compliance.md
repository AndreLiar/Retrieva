---
sidebar_position: 10
---

# Compliance API

Serves DORA article reference data from the shared compliance knowledge base. These endpoints expose the regulatory text and obligations used by the gap analysis agent, making them available to frontend tooling and external integrations.

All endpoints require authentication. No workspace context is needed — the compliance KB is shared read-only reference data.

## Base path

```
/api/v1/compliance
```

---

## List domains

```http
GET /api/v1/compliance/domains
```

Returns all DORA domains with article counts.

### Response `200`

```json
{
  "status": "success",
  "data": {
    "total": 7,
    "domains": [
      { "domain": "General Provisions",       "articleCount": 4,  "articles": ["Article 1", "Article 2", "Article 3", "Article 4"] },
      { "domain": "ICT Risk Management",       "articleCount": 12, "articles": ["Article 5", ...] },
      { "domain": "Incident Reporting",        "articleCount": 7,  "articles": ["Article 17", ...] },
      { "domain": "Resilience Testing",        "articleCount": 4,  "articles": ["Article 24", ...] },
      { "domain": "Third-Party Risk",          "articleCount": 3,  "articles": ["Article 28", "Article 29", "Article 30"] },
      { "domain": "ICT Third-Party Oversight", "articleCount": 14, "articles": ["Article 31", ...] },
      { "domain": "Information Sharing",       "articleCount": 1,  "articles": ["Article 45"] }
    ]
  }
}
```

---

## List articles

```http
GET /api/v1/compliance/articles
```

Returns all DORA articles, optionally filtered.

### Query parameters

| Param | Type | Description |
|-------|------|-------------|
| `domain` | string | Filter by domain name (exact match) |
| `chapter` | string | Filter by chapter Roman numeral: `I`, `II`, `III`, `IV`, `V`, `VI` |

### Chapter → article mapping

| Chapter | Articles | Domain |
|---------|----------|--------|
| I | 1–4 | General Provisions |
| II | 5–16 | ICT Risk Management |
| III | 17–23 | Incident Reporting |
| IV | 24–27 | Resilience Testing |
| V | 28–44 | Third-Party Risk + ICT Third-Party Oversight |
| VI | 45–49 | Information Sharing |

### Examples

```bash
# All articles
GET /api/v1/compliance/articles

# By domain
GET /api/v1/compliance/articles?domain=ICT%20Risk%20Management

# By chapter
GET /api/v1/compliance/articles?chapter=III
```

### Response `200`

```json
{
  "status": "success",
  "data": {
    "total": 7,
    "articles": [
      {
        "regulation": "DORA",
        "article": "Article 17",
        "title": "ICT-Related Incident Management Process",
        "domain": "Incident Reporting",
        "obligations": [
          "Establish and implement ICT-related incident management process",
          "Define roles and responsibilities for incident management",
          "..."
        ]
      }
    ]
  }
}
```

> `text` (full regulatory text) is only included in the single-article response below.

---

## Get a single article

```http
GET /api/v1/compliance/articles/:article
```

`:article` can be passed as:
- URL-encoded: `Article%2030` (space encoded as `%20`)
- Kebab form: `Article-30` (hyphen treated as space)

### Example

```bash
GET /api/v1/compliance/articles/Article%2030
GET /api/v1/compliance/articles/Article-30
```

### Response `200`

```json
{
  "status": "success",
  "data": {
    "article": {
      "regulation": "DORA",
      "article": "Article 30",
      "title": "Key Contractual Provisions",
      "domain": "Third-Party Risk",
      "text": "1. Financial entities shall include in the contractual arrangements on the use of ICT services...",
      "obligations": [
        "Ensure contractual arrangements include specific ICT security, incident response, data protection requirements",
        "Include audit rights and inspection provisions",
        "..."
      ]
    }
  }
}
```

### Response `404`

```json
{
  "status": "error",
  "message": "Article not found: Article 99"
}
```

---

## DORA full coverage

The compliance KB covers all 45 articles across 7 domains:

| Chapter | Articles | Domain | Coverage |
|---------|----------|--------|----------|
| I | 1–4 | General Provisions | ✅ 4 articles |
| II | 5–16 | ICT Risk Management | ✅ 12 articles |
| III | 17–23 | Incident Reporting | ✅ 7 articles |
| IV | 24–27 | Resilience Testing | ✅ 4 articles |
| V | 28–30 | Third-Party Risk | ✅ 3 articles |
| V | 31–44 | ICT Third-Party Oversight | ✅ 14 articles |
| VI | 45 | Information Sharing | ✅ 1 article |

---

## Seeding the knowledge base

The compliance KB must be seeded before running gap analyses:

```bash
# Seed once (skips if collection already exists)
npm run seed:compliance --prefix backend

# Wipe and re-seed
npm run seed:compliance:reset --prefix backend
```

The seed script reads `backend/data/compliance/dora-articles.json`, embeds all articles via Azure OpenAI `text-embedding-3-small`, and upserts them into the shared `compliance_kb` Qdrant collection.
