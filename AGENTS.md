# AGENTS.md

Shared operating instructions for Cursor Cloud Agents, Codex, ChatGPT Work, and Muse (Jack) working in this repository.

GitHub pull requests are the review and approval boundary. Do not merge, deploy, or change production configuration unless a human explicitly approves that step.

## What this project is

- Production e-commerce storefront for **AnglKiss Creations** (Cydney's business). Live store: https://anglkisscreations.ca
- Stack: **Next.js 15 + React 19 + TypeScript**, **Supabase** (PostgreSQL, Auth, Storage) for products/orders, **PayPal** checkout, deployed to **Cloudflare Workers via OpenNext**.
- App code lives at the **repo root**: `app/` (routes, including the inline footer in `app/layout.tsx`), `components/`, `lib/`, `data/`, `supabase/` (migrations), `tests/`.
- Package manager: **npm** (`package-lock.json`). CI uses **Node 22**.

## Verified commands

All commands run from the repo root and come from `package.json` verbatim:

| Purpose | Command |
| --- | --- |
| Install (as CI) | `npm ci` |
| Dev server | `npm run dev` |
| Production build | `npm run build` |
| Tests | `npm test` |
| Typecheck | `npm run typecheck` |

- `npm run build` and `npm run typecheck` both run `check:route-revalidate` first.
- `npm test` is `tsx --test tests/**/*.test.ts`.
- There is **no lint script** in `package.json` — do not invent one.
- CI (`.github/workflows/ci.yml`) runs typecheck, tests, and build on PRs and pushes to `main`. It validates only; it does not deploy.

## Deployment

- Cloudflare **Worker** `angelkisscreations` (see `wrangler.jsonc`), connected to this repo: pushes to `main` auto-deploy via the Cloudflare Git integration.
- A failed build never replaces live production — the previous deployment keeps serving.
- The repo also carries manual deploy scripts (`npm run deploy`, `npm run deploy:ca`). Agents must **never** run them without explicit human approval.
- "Deployed" means a deployment record tying the live version to the exact commit, plus one runtime check of the changed behaviour. Anything less is "reported", not deployed.

## Team conventions (bind every agent here)

1. Before merging any PR, fetch its **reviews AND review comments** and disposition every finding. Codex review triggers when a draft PR is marked ready or on "@codex review" — it does not run on drafts, so mark ready and wait for that window before merging.
2. Verify code from **source bytes** in the repo — never from another agent's transcription or summary of code.
3. Evidence discipline: "reviewed" names the exact commit; "deployed" requires the deployment record + runtime check described above.
4. Small, focused, reversible changes. No drive-by refactors. No PRs beyond the assigned task.
5. PR bodies and commit messages must not include a "Do not merge" line unless a human explicitly asks for one.

## Owner's hard constraints

- **No customer or third-party sends or posts without David's approval.**
- **No spending.** Free tiers only.
- **Never publish David's home address** — it is private; hidden verification-only fields at most.
- **Truthful marketing only** — no invented claims, prices, reviews, or clients. **EuroPools is a separate, gated business** (David's father's company) and is NOT a EuroDigital client — take no EuroPools actions from this repo and never list it as a client.
- Payments (PayPal), customer data, and Supabase migrations are **high-risk**: the `admin:*`, `db:*`, and `cf:*` scripts mutate production data or configuration — never run them as routine validation or without explicit human approval.
- Never commit secrets, `.env` contents, API keys, or customer data.
