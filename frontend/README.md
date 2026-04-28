# Frontend

## Purpose

This frontend is a Next.js App Router application for the RAG platform. It provides:

- public marketing and contact pages
- authentication and onboarding flows
- dashboard experiences for workspaces, assessments, questionnaires, chat, billing, and settings

The app integrates with the backend API through cookie-based authentication and workspace-scoped requests.

## Local Setup

Requirements:

- Node.js 20+
- npm 10+

Install dependencies from the monorepo root when possible:

```bash
npm install
```

Run the frontend locally from this directory:

```bash
npm run dev
```

Default local URL:

```bash
http://localhost:3000
```

## Environment Variables

The frontend expects the following environment variables:

```bash
NEXT_PUBLIC_API_URL=http://localhost:3007/api/v1
SENTRY_ORG=your-sentry-org
SENTRY_PROJECT=your-sentry-project
SENTRY_AUTH_TOKEN=your-sentry-auth-token
```

Notes:

- `NEXT_PUBLIC_API_URL` is the backend base URL used by Axios and streaming requests.
- `SENTRY_*` variables are only needed when uploading source maps or enabling Sentry in CI/build environments.
- `.env*` files are gitignored.

## Frontend Architecture

Current high-level structure:

```text
src/app          Route entry points and layouts
src/components   Shared UI and domain-facing components
src/lib/api      API clients and request helpers
src/lib/hooks    Client hooks
src/lib/stores   Zustand stores
src/tests        Vitest unit/component tests
e2e              Playwright end-to-end tests
```

Runtime conventions:

- React Query handles async request orchestration in the UI.
- Zustand stores hold client state such as auth, workspace selection, and UI chrome.
- The app uses cookie-based auth and forwards the active workspace through request headers.
- Sentry is configured for client, server, and edge runtimes.

## Testing Workflow

Run lint:

```bash
npm run lint
```

Run unit and component tests:

```bash
npm run test:run
```

Run tests in watch mode:

```bash
npm run test
```

Run coverage:

```bash
npm run test:coverage
```

Run end-to-end tests:

```bash
npm run test:e2e
```

Open the Playwright report:

```bash
npm run test:e2e:report
```
