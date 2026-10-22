# Archived backend draft (api-v1)

This directory preserves the previous Express/PostgreSQL backend, migrations, tests, and deployment configuration as reference material for the rewrite in [apps/api/](../../apps/api/). It is **not** connected to the current web app or deployed by the root [vercel.json](../../vercel.json).

- `src/` — application code and database migrations.
- `test/` — backend tests from the old implementation.
- `vercel/` — former serverless entry point; inactive.
- `docker-compose.yml` and `docker-init.sql` — old local PostgreSQL setup.
- `e2e-api.spec.js` — old API-mode browser test; excluded from current browser tests.

If you need to run this draft for comparison, install its dependencies separately and use an isolated database. Check the database URL before running `db:reset`: that command drops the configured database schema and recreates it with sample data. The draft's demo settings are not suitable for a production deployment.

Historical product and architecture notes are in [docs/](../../docs/).
