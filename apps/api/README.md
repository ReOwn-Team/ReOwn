# New backend

This directory is reserved for a NestJS backend written in TypeScript and running on Node.js. The planned data stack is PostgreSQL with Prisma, Redis for caching, rate limiting, and background jobs, Cloudflare R2 for object storage, and Docker for containerized development and deployment. PostgreSQL remains the system of record; job queue tooling has not been selected. No API is implemented or deployed here yet.

Future search and AI options include PostgreSQL full-text search first, Elasticsearch if advanced search needs justify a separate index, and pgvector for semantic retrieval. PyTorch or TensorFlow would be considered only for a defined custom-model training use case. None of these options, nor an AI provider or inference stack, has been selected or implemented.

The previous Express/PostgreSQL implementation is archived in [drafts/api-v1/](../../drafts/api-v1/) for reference. Review its security, data model, and deployment assumptions before reusing any code or configuration.
