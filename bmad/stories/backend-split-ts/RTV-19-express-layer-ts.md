---
id: RTV-19-express-layer-ts
title: "Convert the Express layer (routes/controllers/middleware) to TypeScript"
status: Ready
type: Story
epic: retrieva-backend
milestone: "RTV — Backend split + TypeScript migration"
estimate: 5
labels: [typescript, backend, api, retrieva, cert]
priority: Must
assignee: AndreLiar
repo: andrelair-platform/retrieva
project: 2
---

## Story

As a **Backend Developer**, I want the HTTP layer typed so that handlers get compile-time guarantees on params, bodies, responses, and the authenticated user.

## Background

`@types/express` is mature; the usual friction is typing `req.user` after auth middleware and typed error middleware. With DTO types now derived from Zod (RTV-18), handlers can be end-to-end typed.

## Acceptance Criteria

- [ ] AC-1: `controllers/*.js`, `middleware/*.js`, route registrations, and `app.js` → `.ts`.
- [ ] AC-2: Handlers typed with `RequestHandler` / `Request<Params, ResBody, ReqBody>`; request/response bodies use the Zod-derived DTO types from RTV-18.
- [ ] AC-3: `req.user` (and any auth context) typed via a single `declare global { namespace Express { interface Request { … } } }` augmentation.
- [ ] AC-4: Typed centralised error-handling middleware; async handler wrapper typed (no unhandled-rejection regressions).
- [ ] AC-5: helmet/cors/rate-limit/compression/mongo-sanitize/hpp/xss middleware chain compiles and behaves identically; supertest integration tests green.

## Technical Notes

- Keep validation at the boundary (Zod `.parse`/`.safeParse`) — the parsed result is already typed, so downstream code needs no casts.
- socket.io handlers may be touched here if coupled to routes; otherwise they belong to RTV-20.

## Definition of Done

- [ ] All ACs met; `tsc --noEmit` green; supertest suite green
- [ ] No `any` on `req`/`res` in converted handlers
- [ ] Issue Done; tracker updated

## Tasks

- [ ] Convert controllers/middleware/routes/app to `.ts`
- [ ] Add the `Express.Request` augmentation for `req.user`
- [ ] Type the error + async-wrapper middleware
- [ ] Keep supertest integration green

## Dependencies

- Depends on: RTV-18
- Blocks: RTV-21
