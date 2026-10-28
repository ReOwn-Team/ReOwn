# Archived frontend (web-v1)

This is the previous ReOwn React 19 / Vite 8 demo, archived before the new Next.js frontend. It is a historical snapshot, not a production-readiness guarantee. No implementation or test fixes were made during archival.

## Run from this directory

Use Node.js compatible with the locked Vite 8 toolchain (Node 22.12+ recommended). From the repository root:

```sh
cd drafts/web-v1
npm ci
npm run dev
```

Other commands, also from `drafts/web-v1`:

```sh
npm test
npm run build
npm run build:single
npm run preview
npm run e2e
```

`build` writes `dist/`; `build:single` writes `dist-single/`. E2E requires a Playwright Chromium installation, builds the demo with an empty API URL, and starts preview on port 4173. If needed, install Chromium separately with `npx playwright install chromium`, or set `PW_CHROMIUM` to an existing compatible executable. Avoid an unrelated preview server on that port.

**Known E2E issue:** one accessibility test is currently reported to fail because an `h1` is missing. This failure was not fixed or re-run during archival. No dependencies were installed and no browser tests were run as part of this move.

## Environment and preserved layout

No `.env` files or secrets were copied. `VITE_API_URL` defaults to the empty string, selecting the local/mock demo. For example:

```sh
VITE_API_URL= npm run dev
```

`apps/web/`, `e2e/`, and the Vite, Playwright, and Vercel configs were moved here unchanged. The original `apps/web` mirror is intentional: the unchanged Vite config and relative imports depend on it. `shared/` is a full copy so relative imports and Vitest shared tests remain local to this archive; the root shared directory is untouched.

`package.json` and `package-lock.json` were copied first, before root dependency replacement. They preserve the original combined dependency set, not a newly trimmed frontend manifest. `README.previous.md` preserves the root README including uncommitted edits at archival time; `DESIGN.md` and `.oxlintrc.json` are snapshots too. The moved `e2e/helpers.js` includes its uncommitted edits.

Dependencies, build outputs, browser artifacts, backend files, and agent tools were not copied. Historical docs and deployment configuration may refer to the former repository layout; they are preserved as-is, not a deployment promise. Install and run this archive independently from the new root app.
