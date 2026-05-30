---
sidebar_position: 8
---

# Database capacity planning

Operational sizing of the MongoDB Atlas cluster powering Retrieva — current state, per-entity footprint, scenarios, and upgrade thresholds.

## Current state (snapshot)

Live measurement against the production Atlas free tier (`M0`) cluster, database `enterprise_rag`:

| Metric | Value |
|---|---|
| Collections | 19 |
| Total objects | 35 |
| `dataSize` | 0.05 MB |
| `storageSize` (compressed) | 0.47 MB |
| `indexSize` | **1.42 MB** |
| **Used (data + indexes)** | **1.47 MB / 512 MB (0.3%)** |
| Remaining | 510.5 MB |

:::note Index size dominates today
At this early-life stage the indexes weigh ~28× the data. That's normal for an empty cluster (~10 indexes per collection × 19 collections = ~190 indexes, each ~7-10 KB of metadata + B-tree pages). It means that as volume grows, **indexes will scale proportionally** — budget for 25-30% index overhead on top of every data growth projection.
:::

Top collections by total footprint (size + indexes):

| Collection | Docs | Size (MB) | Indexes (MB) |
|---|---:|---:|---:|
| `assessments` | 3 | 0.01 | 0.21 |
| `conversations` | 7 | 0.00 | 0.19 |
| `workspacemembers` | 1 | 0.00 | 0.18 |
| `messages` | 18 | 0.02 | 0.14 |
| `workspaces` | 1 | 0.00 | 0.14 |
| `organizationmembers` | 1 | 0.00 | 0.14 |
| `users` | 1 | 0.00 | 0.07 |
| `organizations` | 1 | 0.00 | 0.07 |
| `questionnairetemplates` | 1 | 0.01 | 0.05 |

The 10 other collections (DLQ, document sources, sparse vectors, vocabularies, inverted indexes, vendor questionnaires, datasources, content hashes, workspace stats, changelog) are empty or near-empty in this snapshot — vestiges of earlier semantic-search experiments and pre-allocated slots for upcoming features.

## MongoDB Atlas free tier (`M0`) — hard limits

| Resource | M0 limit | Note |
|---|---|---|
| Storage | **512 MB** | Hard cap. Writes block once reached. |
| RAM | ~512 MB shared | Multi-tenant on the underlying host — latency variable under contention. |
| vCPU | Shared | No performance guarantee. |
| Concurrent connections | 500 | Generous; rarely the bottleneck for this stack. |
| Automatic backups | ❌ None | The biggest operational risk. |
| Atlas Search | 3 indexes max, limited | Not used today (vector store is Qdrant, separate). |
| Network | Soft throttle | No hard quota, but Atlas may throttle on abuse. |
| Monitoring / audit | Very limited | Limited visibility on incidents. |
| Upgrade path | M0 → M2 ($9/mo) → M10 ($57/mo) → … | In-place migration, low downtime. |

## Per-entity sizing (Mongoose model estimates)

Conservative averages based on the actual Mongoose schemas:

| Entity | Average size | Notes |
|---|---|---|
| `User` | ~2 KB | bcrypt hash + encrypted MFA secret + lastLogin |
| `Organization` | ~1 KB | metadata + plan + trial |
| `OrganizationMember` | ~0.5 KB | userId + role + permissions |
| `Workspace` (= vendor) | ~5 KB | vendor profile + certifications + contract + ICT functions |
| `WorkspaceMember` | ~0.5 KB | userId + role + 3 permissions |
| `Assessment` (DORA, complete) | **30-80 KB** | `results.gaps[]` typically 20-50 entries × 1-2 KB |
| `Assessment` (CONTRACT_A30 with signoffs) | **40-90 KB** | + 12 `clauseSignoffs` × 1 KB |
| `VendorQuestionnaire` (complete) | ~15-30 KB | questions + responses + scoring |
| `Conversation` | ~1 KB | metadata only |
| `Message` (user) | ~2 KB | |
| `Message` (assistant with sources) | **5-15 KB** | `sources[]` carries excerpts + scores |
| `AuditLog` (post #348) | ~1 KB | per audited action |
| `Finding` (post #365) | ~3 KB | + history |
| `Subcontractor` (post #350) | ~1 KB | |

Plus the **~25-30% index overhead** observed in the live snapshot — multiply every data projection by 1.3.

## Capacity scenarios

### Scenario A — Demo / pilot (very light)

5 users · 10 vendors · 1 DORA assessment + 1 A30 per vendor · 10 conversations × 5 messages each.

| Item | Calc | Size |
|---|---|---:|
| Users + Org + Members | 5×2 + 1 + 5×0.5 + 10×0.5×3 | ~30 KB |
| 10 Workspaces | 10 × 5 | 50 KB |
| 20 Assessments | 10 × (50 + 60) | ~1.1 MB |
| 10 Questionnaires | 10 × 20 | 200 KB |
| Chat | 10 × 5 × 8 KB | 400 KB |
| Index overhead (~30%) | | ~550 KB |
| **Total / org** | | **~2.4 MB** |

**→ M0 holds ~200 organisations at this usage level.**

### Scenario B — Realistic production SME

10 users · 50 vendors · 2 DORA + 1 A30 assessments per year per vendor · moderate chat (50 conv × 15 msg).

| Item | Calc | Size |
|---|---|---:|
| Users + Org + Members | 10×2 + 1 + 10×0.5 + 50×0.5×3 | ~100 KB |
| 50 Workspaces | 50 × 5 | 250 KB |
| 150 Assessments | 50 × (2×50 + 60) | ~8 MB |
| 50 Questionnaires | 50 × 20 | 1 MB |
| Chat | 50 × 15 × 10 KB | 7.5 MB |
| AuditLog (~5,000 entries/yr, post #348) | | 5 MB |
| Index overhead (~30%) | | ~6.5 MB |
| **Total / org / yr** | | **~28 MB** |

**→ M0 holds ~15-18 organisations at this usage level.**

### Scenario C — HDI Affinitaire (200 vendors, 30-person team)

30 users · 200 vendors · 3 assessments per vendor per year · heavy chat (200 conv × 30 msg) · Findings tracker active.

| Item | Calc | Size |
|---|---|---:|
| Users + Org + Members | 30×2 + 1 + 30×0.5 + 200×30×0.5 | ~3.2 MB |
| 200 Workspaces | 200 × 5 | 1 MB |
| 600 Assessments | 200 × 3 × 60 | 36 MB |
| 200 Questionnaires | 200 × 20 | 4 MB |
| Chat | 200 × 30 × 10 KB | 60 MB |
| AuditLog (~30k entries/yr) | | 30 MB |
| Findings (~3,000 open) | | 9 MB |
| Subcontractors (~500) | | 0.5 MB |
| Index overhead (~30%) | | ~43 MB |
| **Total / org / yr** | | **~186 MB** |

**→ M0 holds ~2-3 customers of this size. Far too tight for real production.**

## What blows up first

Statistically, in this order:

1. **🔴 Storage (512 MB)** — bottleneck #1. Chat copilot + AuditLog + assessments fill it fast. A single real customer at HDI scale would exhaust M0 in 2-3 months.
2. **🟠 LLM-related query latency** — not a hard limit, but RAG queries against `Conversation.list` and `Message.find` become visibly slow above ~100 MB of chat data because of the shared CPU.
3. **🟡 No backups** — not a capacity limit but **the most severe operational risk**. Without backups, an incident is catastrophic — and no regulator will validate a Retrieva deployment without a backup policy.
4. **🟢 Connections (500)** — never hit in practice with the current architecture (API + workers + dev sessions = ~30 max).

## Upgrade thresholds and pricing (Atlas dedicated)

| Tier | Storage | RAM | Cost / month | Use case |
|---|---|---|---|---|
| **M0** (current) | 512 MB | 0.5 GB shared | $0 | Demo only, < 5 small orgs |
| **M2** | 2 GB | 0.5 GB | $9 | Pilot / 10-15 small orgs |
| **M5** | 5 GB | 0.5 GB | $25 | Light production / 1-3 SME customers |
| **M10** | 10 GB | 2 GB | **$57** | First serious production / 1 HDI-scale customer **+ backups** |
| **M20** | 20 GB | 4 GB | $146 | Multi-customer SME production (5-10) |
| **M30** | 40 GB | 8 GB | $384 | Real multi-tenant production / 10-30 HDI-scale customers |

:::important M10 is the "sellable to compliance" floor
From `M10` onwards Atlas unlocks **automatic backups** (continuous + on-demand snapshots) and dedicated RAM. **Below M10, a compliance officer at a regulated entity cannot validate the platform** — they will ask about disaster recovery, and the answer must include backups.
:::

## Recommendations

| Phase | Action |
|---|---|
| **Today** (dev / demo / lead nurture) | M0 is fine. Check `db.stats()` once a week. Plan the upgrade when `dataSize + indexSize` crosses **300 MB** (~60% full). |
| **Before first paying customer** (even PoC) | Upgrade to **M10**. Unlocks continuous backups, dedicated RAM, predictable chat-copilot latency, Atlas SLA, monitoring visibility. **Non-negotiable for any sales motion.** |
| **At 3-5 production customers, or one HDI-scale customer** | Move to **M20-M30**. By then revenue covers the $146-$384/month easily. |
| **Before signing HDI or similar regulated enterprise** | M30 + **enable Atlas Backup Encryption** + **enable Field Level Encryption** on the sensitive collections (`AssessmentRiskDecision`, `ClauseSignoff`, `User`). These are the controls the regulator checks. |

## Capacity self-check (run anytime)

Connect with `mongosh` to the cluster and run:

```js
use enterprise_rag;
const s = db.runCommand({ dbStats: 1, scale: 1 });
const mb = (b) => (Number(b) / 1024 / 1024).toFixed(2);
print("dataSize:    " + mb(s.dataSize) + " MB");
print("storageSize: " + mb(s.storageSize) + " MB");
print("indexSize:   " + mb(s.indexSize) + " MB");
print("used:        " + mb(Number(s.dataSize) + Number(s.indexSize)) + " MB of 512 MB on M0");

db.getCollectionNames().sort().forEach(c => {
  const cs = db.runCommand({ collStats: c, scale: 1 });
  print(c.padEnd(38) +
        String(cs.count).padStart(8) +
        mb(cs.size).padStart(10) + " MB" +
        mb(cs.totalIndexSize).padStart(10) + " MB idx");
});
```

Save the result with `db.stats()` in a weekly cron so growth is tracked over time. When you cross **300 MB**, schedule the M10 migration **before** the next sales call.

## Marginal infrastructure cost summary

| Customer count (mixed sizes) | Atlas tier | Monthly cost |
|---|---|---|
| 0 paying (dev only) | M0 | $0 |
| 1 paying PoC | M10 | $57 |
| 3 SME + 1 HDI-class | M30 | $384 |
| 10 SME + 2 HDI-class | M40+ or dedicated cluster | $700-1,200 |

At expected ARR per customer ($30k-150k depending on segment), Mongo infrastructure stays well under 1% of revenue — never the cost lever to optimise.

## Related

- `/docs/deployment/production-checklist.md` — full production readiness checklist
- `/docs/deployment/environment-variables.md` — `MONGODB_URI` configuration
- `/docs/security/data-protection.md` — encryption at rest, Field Level Encryption setup
