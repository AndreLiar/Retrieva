---
sidebar_position: 7
---

# Database Operations

Operational notes for the MongoDB layer: transactions, migrations, indexes,
connection pooling, and local-dev gotchas.

## Transactions require a replica set ⚠️

MongoDB **multi-document transactions only work on a replica set** (or a sharded
cluster). The app uses them in:

- `services/AssessmentService.js` — risk decision (assessment update + workspace
  update, atomic)
- `services/rag.js` — conversation/message persistence

| Environment | Topology | Transactions |
| --- | --- | --- |
| Production / staging (MongoDB Atlas) | Replica set | ✅ work |
| Local single-node (`docker compose` mongo, or Homebrew `mongod`) | Standalone | ❌ throw `Transaction numbers are only allowed on a replica set member or mongos` |

So the transactional flows **cannot be exercised against a default local single
node**. To test them locally, run Mongo as a **single-node replica set**:

```bash
# mongod must be started with --replSet, then initiated once:
mongod --dbpath /data/db --replSet rs0
mongosh --eval "rs.initiate()"
# then use:  MONGODB_URI=mongodb://localhost:27017/enterprise_rag?replicaSet=rs0
```

Otherwise validate these flows on staging.

## Migrations (migrate-mongo)

Schema/data changes go through **migrate-mongo** (`backend/migrations/`), not
ad-hoc scripts.

```bash
npm --prefix backend run migrate:status      # show applied / pending
npm --prefix backend run migrate:up          # apply pending (run on deploy)
npm --prefix backend run migrate:down        # roll back the last one
npm --prefix backend run migrate:create <name>
```

Run `migrate:up` against each environment's `MONGODB_URI` as part of the deploy
step. Migrations must be **idempotent** (only touch rows that still need it).

## Indexes

Indexes are declared on the Mongoose schemas. In **production** `autoIndex` is
disabled (no blocking index builds on every boot) and declared indexes are
**synced explicitly once on startup** (`config/database.js`). In dev/test
`autoIndex` stays on for convenience.

`strictQuery` is enabled globally (filter conditions on non-schema paths are
dropped). Global `sanitizeFilter` is intentionally **not** enabled — it would
wrap legitimate code-written operator queries (`{ $in }`, `{ $gte }`) in `$eq`;
request-level NoSQL-injection defense lives in `middleware/securitySanitizer.js`.

## Connection pooling

`config/database.js` sets explicit pool/timeout options:

- `maxPoolSize: 50`, `minPoolSize: 10`
- `serverSelectionTimeoutMS: 10000`, `socketTimeoutMS: 45000`, `heartbeatFrequencyMS: 2000`
- `retryWrites` / `retryReads` on, with auto-reconnect + backoff

## Local-dev gotcha: two Mongos on port 27017

If you run **both** a host `mongod` (e.g. Homebrew `mongodb-community`) **and**
the `docker compose` Mongo, both try to bind `27017`. On loopback the **host
`mongod` wins**, so anything connecting to `localhost:27017` (the app,
`migrate-mongo`, `mongosh`) hits the **host** instance — not the container.
Symptoms: seeded data "disappears", migrations seem to do nothing in the
container. Fix: stop one of them (`brew services stop mongodb-community`, or
don't map the container's 27017) so there's a single source of truth.
