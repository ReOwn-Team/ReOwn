# ReOwn

**A secondhand marketplace experience designed for students.** ReOwn brings product discovery, budget-aware recommendations, and buyer and seller trust signals into one responsive web app.

> [!IMPORTANT]
> ReOwn is currently a **frontend prototype** with a minimal NestJS API scaffold (`GET /health`). Accounts, listings, orders, wallets, and installment payments are simulated with sample data stored in the browser. No transactions, identity checks, lending, or payments are processed. Marketplace backend features are not implemented.

## What you can explore

- Browse and search secondhand listings, then filter by category, price, condition, and seller trust.
- Adjust income, savings, and interests to explore budget-based recommendations.
- Walk through simulated buying, selling, messaging, notifications, and order flows.
- Inspect buyer and seller scoring explanations and example installment schedules.
- Use the responsive interface in light or dark mode.

These flows demonstrate product behavior, **not** a production financial service.

## Technology

### Planned stack

| Layer | Technology |
| --- | --- |
| Frontend | Next.js, React, TypeScript |
| Styling | Tailwind CSS |
| Backend | NestJS, TypeScript |
| Runtime | Node.js |
| Database | PostgreSQL |
| ORM | Prisma |
| Cache and job queues | Redis (planned) |
| Object storage | Cloudflare R2 |
| Containers | Docker |
| Source control and CI | GitHub, GitHub Actions |

Redis is intended for short-lived caching, rate limiting, and background jobs; PostgreSQL remains the system of record. Job queue tooling is not selected yet.

### Search and AI: future options

| Need | Candidate | When to consider it |
| --- | --- | --- |
| Product search | PostgreSQL full-text search first; Elasticsearch only if search requirements or scale justify a separate index | Advanced relevance, typo tolerance, or high-volume faceting beyond the simpler approach. |
| Semantic search | PostgreSQL with pgvector | Vector-based retrieval if a validated feature needs it. |
| Custom model training | PyTorch **or** TensorFlow | Only if real data and a defined AI use case warrant training and maintaining a model. |

These are **evaluation candidates**, not selected dependencies. Elasticsearch is a search engine, not a replacement for PostgreSQL as the system of record; PyTorch and TensorFlow are machine-learning frameworks, not required for API-based AI features. Any AI service would sit behind the NestJS API. Model provider and inference tooling remain undecided. Current scoring and recommendations are rule-based, not AI-powered.

### Current prototype

The runnable frontend uses React 19, React Router 7, JavaScript (JSX), CSS, and Vite 8. Mock data and interactions run in the browser using `localStorage` and shared JavaScript modules. Vitest and Playwright cover the frontend; Vercel currently builds the static web app. A minimal NestJS/TypeScript API scaffold exists in [apps/api/](apps/api/) but is not connected to the frontend or deployed. The former Express/PostgreSQL backend is archived in [drafts/api-v1/](drafts/api-v1/) and is not deployed. PostgreSQL and Docker exist only in that archive. **Next.js, Tailwind CSS, Prisma, Redis, and Cloudflare R2 are not implemented yet.**

## Run locally

**Requirements:** Node.js 22 and npm.

```bash
npm ci
npm run dev
```

Visit http://localhost:5173. The prototype runs without PostgreSQL or an API server. Leave `VITE_API_URL` unset or empty to enable the browser-based demo. Demo state is stored in your browser; clearing site storage resets local changes.

To run the independent NestJS API scaffold:

```bash
cd apps/api
npm install
npm run dev
```

Visit http://localhost:3000/health. The API is not connected to the frontend.

## Development

| Command | Description |
| --- | --- |
| `npm test` | Run unit tests for shared logic and the web prototype. |
| `npm run build` | Create a production build in `dist/`. |
| `npm run preview` | Serve the production build locally. |
| `npm run e2e` | Run Playwright tests against the demo. |

Install the browser before the first end-to-end run:

```bash
npx playwright install chromium
npm run e2e
```

GitHub Actions runs unit tests, builds the web app, and exercises browser flows on pushes and pull requests.

## Repository layout

```text
apps/
  web/               Current React/Vite prototype; planned Next.js frontend
  api/               Minimal NestJS/TypeScript API scaffold (health endpoint only)
shared/              Search, scoring, and policy logic
drafts/
  api-v1/            Archived Express/PostgreSQL backend
docs/                Product and architecture documentation
.github/workflows/    Automated checks
```

The [archived backend](drafts/api-v1/) includes its tests and former Vercel entry point. It is retained for reference, not deployed. Some [documentation](docs/) describes that earlier implementation.

## Deployment status

[vercel.json](vercel.json) builds and serves the static frontend only. No backend function, API route, or scheduled job is configured. The Vercel build clears `VITE_API_URL` to keep the deployed app in demo mode. Changes to this repository do not affect an existing deployment until it is redeployed.

For the backend rewrite, start in [apps/api/](apps/api/). Review the archived code and documentation as references, not as production-ready components.
