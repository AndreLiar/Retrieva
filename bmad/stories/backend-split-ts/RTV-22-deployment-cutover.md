---
id: RTV-22-deployment-cutover
title: "Deployment cutover — GitOps + Kargo for retrieva-backend"
status: Ready
type: Story
epic: retrieva-backend
milestone: "RTV — Backend split + TypeScript migration"
estimate: 5
labels: [typescript, devops, gitops, retrieva, cert]
priority: Must
assignee: AndreLiar
repo: andrelair-platform/retrieva
project: 2
---

## Story

As a **Platform Engineer**, I want `retrieva-backend` deployed via GitOps + Kargo so that the new repo's image is the one running in dev and prod, and the monorepo backend build is retired cleanly.

## Background

Retrieva currently uses a **git Warehouse** (2 images, backend + frontend, keyed on the `retrieva` commit). After the split there are two source repos. The backend gets its own build → its own image; the deployment model must move off the shared-commit Warehouse without a mixed-image window.

## Acceptance Criteria

- [ ] AC-1: `retrieva-backend` CI dual-pushes (Harbor dev + ghcr prod-SHA), cosign + SBOM on main.
- [ ] AC-2: gitops updated — the retrieva backend Deployment points at `ghcr.io/andrelair-platform/retrieva-backend` (prod SHA); dev overlay tracks the dev image.
- [ ] AC-3: Kargo re-modelled for two source repos (backend Warehouse on the backend repo; frontend Warehouse on `retrieva`) — no mixed-Freight; prod stays CODEOWNERS-gated, dev auto-promotes.
- [ ] AC-4: `retrieva` repo made frontend-only (backend dir removed; its git-Warehouse/CI no longer builds a backend image).
- [ ] AC-5: dev is Synced/Healthy on the new backend image; prod promotable via Kargo; `/health` + a RAG smoke pass in dev.

## Technical Notes

- Two independent single-image services after the split ⇒ each can use the simpler **image** Warehouse model (mixed-Freight bug only applies to ≥2 images in ONE repo). Re-evaluate per `gitops.md`.
- Watch the ESO/`ghcr-pull` secret + the two-sided ai-ns NetworkPolicies (LiteLLM/Qdrant/Langfuse/MinIO egress) — carry them over unchanged.
- Prod promotion goes THROUGH Kargo (dev-verified Freight → CODEOWNERS PR → squash), never a manual newTag edit.

## Definition of Done

- [ ] All ACs met; dev Synced/Healthy on the new image; prod promotable
- [ ] `retrieva` no longer builds a backend image
- [ ] Issue Done; tracker updated

## Tasks

- [ ] Wire `retrieva-backend` build (dual-push + sign/SBOM)
- [ ] Update gitops overlays + Kargo Warehouses/Stages for the split
- [ ] Make `retrieva` frontend-only
- [ ] Verify dev health + RAG smoke; confirm prod promotable

## Dependencies

- Depends on: RTV-21
- Blocks: RTV-23
