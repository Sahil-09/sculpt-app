# Sculpt — Hevy-style workout tracker (feature parity, original UI)

Monorepo: Next.js web + Expo mobile + custom Node/MongoDB API.

- `apps/web` — Next.js 14 App Router (planning + analytics, big-screen)
- `apps/mobile` — Expo Router (gym logging, offline-first)
- `apps/api` — Node + Express + Mongoose (MongoDB per project decision)
- `packages/shared` — Zod schemas + TypeScript types (single contract for all apps)
- `infra/docker-compose.yml` — MongoDB, Redis, MinIO (S3-compatible media)

## Quickstart

1. Copy env: `copy .env.example .env` (Windows) and fill secrets.
2. Start infra: `docker compose -f infra/docker-compose.yml up -d`
3. Install: `npm install`
4. Run: `npm run dev` (or per-app `dev:api`, `dev:web`, `dev:mobile`)

See phase plan in project history. Phase 0 = auth + skeleton; Phase 1 = library/routines.
