# AGENTS.md

## Cursor Cloud specific instructions

### Overview

AngelKiss is a Next.js 15 (App Router) e-commerce storefront with Supabase backend and PayPal payments, targeting Cloudflare Workers deployment. The codebase is a single service — no monorepo, no Docker.

### Running the dev environment

- **Dev server**: `npm run dev` (port 3000). The server starts without real Supabase/PayPal credentials; those are only needed when hitting API routes that touch external services.
- **Quality checks** (see `package.json` scripts): `npm run typecheck`, `npm run test`, `npm run build`.
- Tests use Node's built-in test runner via `tsx --test` — no Jest or Vitest.

### Environment variables

Copy `.env.example` → `.env.local`. Placeholder values are sufficient for the dev server to boot and for static pages (`/shop`, `/cart`, `/checkout`, `/admin`, `/returns`, `/shipping`) to render. Real Supabase/PayPal credentials are required only for API route testing (checkout, admin CRUD, webhooks).

### Key caveats

- The `output: "standalone"` setting in `next.config.ts` is for Cloudflare Workers deployment — it does not affect `npm run dev`.
- Node.js 22 is used in CI. The VM already has v22 installed.
- `npm` is the package manager (lockfile is `package-lock.json`).
- Database migrations live in `supabase/migrations/` and must be applied manually to a Supabase instance; there is no local migration runner in the dev workflow.
