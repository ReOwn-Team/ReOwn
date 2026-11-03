# ReOwn

A secondhand marketplace project for students, being rebuilt with Next.js and NestJS.

> The Next.js frontend implements the ReOwn marketplace UI with real account authentication through a server-side Redis session. Marketplace transactions, payments and verification remain demo flows. The previous Vite demo is preserved in [`drafts/web-v1`](drafts/web-v1/README.md).

## Current stack

| Area                   | Implementation                                                                                               |
| ---------------------- | ------------------------------------------------------------------------------------------------------------ |
| Frontend               | Next.js 16 App Router, React, TypeScript, Tailwind CSS 4                                                     |
| Backend                | NestJS, TypeScript, PostgreSQL, Prisma                                                                       |
| API contract           | OpenAPI plus generated types in `shared/api`                                                                 |
| Authentication backend | Email/phone-password login, short-lived JWT, rotating HttpOnly refresh cookies                               |
| Shared logic           | Existing JavaScript search, scoring and policy modules                                                       |
| Tests                  | Vitest for shared logic, Playwright for the new web shell, Jest and PostgreSQL integration tests for the API |

Redis supports shared API auth rate limits and JSON caching with TTL; see [Redis setup](apps/api/REDIS.md). Cloudflare R2, deployment containers and marketplace endpoints remain future integrations. Search options such as PostgreSQL full-text search, pgvector or Elasticsearch should be evaluated against real requirements. PyTorch/TensorFlow are not current dependencies; there is no selected AI provider or custom model stack.

## Run the new frontend

Use Node.js 22.12+ and npm. From the repository root:

```bash
npm ci
npm ci --prefix apps/web
npm run dev
```

Visit **http://localhost:3001**. Each app owns its package and lockfile; this repository does not use npm workspaces. Root scripts delegate web commands to `apps/web`, while root dependencies only run shared tests.

The web uses a Next.js BFF and Redis sessions. Copy `apps/web/.env.example` to `.env.local`, start Redis and the API, then run the web. Credentials stay server-side; the browser keeps an opaque HttpOnly session cookie. See [web setup](apps/web/README.md), [server session architecture](apps/web/SERVER_SESSIONS.md), [API account setup](apps/api/USERS.md) and [OpenAPI contract](apps/api/OPENAPI.md).

## Run the API

From the repository root:

```bash
npm ci --prefix apps/api
npm --prefix apps/api run prisma:generate
npm --prefix apps/api run dev
```

Configure `apps/api/.env` first, including PostgreSQL `DATABASE_URL`, a strong `JWT_SECRET` and origin/cookie settings. Review migrations before applying them to a database with data. The API listens on port 3000; routes use `/api/v1`, with Swagger at `/docs`. See [backend README](apps/api/README.md) for setup and limitations.

## Development commands

Run from the repository root:

| Command             | Purpose                                                                |
| ------------------- | ---------------------------------------------------------------------- |
| `npm run dev`       | Start Next.js on port 3001                                             |
| `npm run build`     | Build the frontend into `apps/web/.next`                               |
| `npm start`         | Serve the built frontend on port 3001                                  |
| `npm run lint`      | ESLint for the new web app                                             |
| `npm run typecheck` | Next route type generation and TypeScript checking                     |
| `npm test`          | Shared unit tests, independent of frontend demo data                   |
| `npm run e2e`       | Desktop/mobile smoke and accessibility tests against the built web app |

Before running E2E locally:

```bash
npm --prefix apps/web exec -- playwright install chromium
npm run build
npm run e2e
```

Backend tests remain under `apps/api/tests`; run them from that app. OpenAPI changes require `npm run openapi:generate` and `npm run openapi:check` there. Do not edit generated contract files manually.

GitHub Actions installs root/web dependencies separately, runs shared tests and web lint/typecheck/build/smoke tests. API quality/contract and isolated PostgreSQL jobs remain separate. Archived prototype tests are retained but are no longer gates for the new frontend.

## Repository layout

```text
apps/
  web/                New Next.js frontend scaffold
  api/                NestJS API with auth/session/profile endpoints
shared/
  api/                Generated contract and type-only exports
  tests/              Shared unit tests and independent fixture data
  scoring/            Existing scoring logic
drafts/
  web-v1/             Complete previous Vite frontend snapshot
  api-v1/             Archived Express/PostgreSQL backend
docs/                 Product/architecture reference documents
.github/workflows/    Web/shared and backend CI
```

The frontend archive mirrors the former root layout (`apps/web`, `shared`, `e2e`, package files and Vite configuration), so it can run independently after its own `npm ci`. Its `README.previous.md` preserves the earlier root README, including uncommitted edits at archive time. Older documents may describe historical implementations rather than the current scaffold.

## Deployment

For the new frontend, set the Vercel project's **Root Directory to `apps/web`** and use Next.js. Its configuration is now `apps/web/vercel.json`; allow access to repository files outside the root directory for `shared/api` types. The former root Vite config is preserved only in the archive.

Do not reuse the old Vite build command, `dist` output directory or demo environment setup. Configure the real API URL and HTTPS origin/cookie settings before deployment. This initialization did not deploy an app, change production data, or configure API hosting.
