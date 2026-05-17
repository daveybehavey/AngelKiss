# AngelKiss

Logic-first MVP scaffold for:
- product admin creation
- checkout session creation with simple zone shipping
- PayPal webhook processing

## Prereqs
- Node.js 20+
- A Supabase project

## One-command local setup
From the repo root (after you have a Supabase project and PayPal sandbox keys):

```bash
npm run setup
```

That installs dependencies, creates `.env.local` from `.env.example` if missing, and checks required variables.

After `.env.local` is filled in, apply the newsletter table to production (idempotent) with:

```bash
npm run setup:newsletter
```

To apply SQL migrations to your **hosted** Supabase database (uses `SUPABASE_DB_PASSWORD` + project ref from `NEXT_PUBLIC_SUPABASE_URL`):

```bash
npm run db:push
```

To print **local vs remote** migration rows (same credentials as `db:push`):

```bash
npm run db:migrations
```

If `db:push` reports **migration history mismatch** or **“Remote migration versions not found in local migrations directory”**, run `npm run db:migrations` first to see mismatched rows. You can also compare with `select version from supabase_migrations.schema_migrations order by 1;` (SQL editor) against local files under `supabase/migrations/` (each file must be named `TIMESTAMP_description.sql`). Orphan short versions (for example `20260328`) often cannot be paired with a valid local file once newer migrations are already applied; in that case use [`supabase migration repair --status reverted`](https://supabase.com/docs/reference/cli/supabase-migration-repair) for the orphan version, then push again. You can also apply a single file with `npm run db:sql -- …` (see below). For the newsletter table only, use:

```bash
npm run db:newsletter
```

For any SQL file under `supabase/migrations/`:

```bash
npm run db:sql -- supabase/migrations/202604020001_add_order_shipping_tracking_columns.sql
```

## Environment
Copy `.env.example` to `.env.local` and set:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_SITE_URL` (for production, set `https://anglkisscreations.ca`)
- `SUPABASE_SERVICE_ROLE_KEY` (or `SUPABASE_SECRET_KEY`)
- optional `SUPABASE_PRODUCT_IMAGES_BUCKET` (default `product-images`)
- optional `SUPABASE_CUSTOM_UPLOADS_BUCKET` (default `customer-design-uploads`)
- `PAYPAL_WEBHOOK_ID` (optional in local dev; **set in production** so `/api/webhooks/paypal` verifies events with PayPal before processing)
- `PAYPAL_ENV` (`sandbox` or `live`)
- `PAYPAL_CLIENT_ID`
- `PAYPAL_CLIENT_SECRET`
- optional aliases: `PAYPAL_TEST_CLIENT_ID`, `PAYPAL_TEST_CLIENT_SECRET`, or sandbox-oriented `PAYPAL_CLIENTS_DEV_CLIENT` / `PAYPAL_CLIENTS_DEV_SECRET` (server only)
- `NEXT_PUBLIC_PAYPAL_CLIENT_ID` — same PayPal **client id** as the active server credentials (sandbox id when `PAYPAL_ENV=sandbox`, live id when `live`)
- optional `NEXT_PUBLIC_CLOUDFLARE_WEB_ANALYTICS_TOKEN` (free Cloudflare Web Analytics “Site token”)
- optional `SUPABASE_DB_PASSWORD` (for `npm run db:push` / `npm run db:migrations`; find under Supabase → Settings → Database)

### Analytics (free)
This project is wired for **Cloudflare Web Analytics** (free). To enable it:
1. In Cloudflare Dashboard → **Analytics & Logs → Web Analytics**, create/select your site and copy the **Site token**.
2. Set `NEXT_PUBLIC_CLOUDFLARE_WEB_ANALYTICS_TOKEN` in your production environment (Cloudflare Workers env vars / Wrangler secrets or vars).
3. Deploy the site, then check Cloudflare Web Analytics realtime/overview.

## Database
Run SQL migrations in `supabase/migrations/` in order:
1. `202603280001_initial_schema.sql`
2. `202603280002_shipping_matrix_and_checkout_logic.sql`
3. `202603280003_checkout_and_paypal_functions.sql`
4. Later dated files in chronological order (for example `202603310001_*`, `202603310002_*`, `202603310003_*`, `202604020001_*`, `202604130001_newsletter_subscribers.sql`, `202605140001_*`, `202605150001_*`, `202605150002_*`)

## Run
```bash
npm install
npm run dev
npm run test
```

Open:
- `/shop` for the basic customer storefront
- `/cart` for cart management
- `/checkout` for customer info + checkout session creation
- `/admin` for the simple admin manager UI
- `/admin/orders` for the simple order manager UI

## Quality Checks
- `npm run typecheck`
- `npm run test`
- `npm run build`

Windows + OneDrive note: if `npm run build` fails with a `readlink` / `EINVAL` error, run:
- `npm run build:clean`

### Optional: run builds/deploys through WSL automatically (Windows)
If you want OpenNext/Next builds to run in Linux (more reliable than Windows + OneDrive), use:
- `npm run wsl:test`
- `npm run wsl:build`
- `npm run wsl:deploy`

These copy the repo from `/mnt/c/Users/david/OneDrive/Desktop/AngelKiss` into `~/code/AngelKiss` inside WSL (first run only), then run the command there.

Optional (recommended inside Ubuntu): install `rsync` for faster syncs between Windows checkout and `~/code/AngelKiss`:
```bash
sudo apt-get update && sudo apt-get install -y rsync
```

### Recommended Windows workflow (code on Windows, ship reliably)
- **Local dev (Windows):** `npm run dev`
- **Sanity check toolchain:** `npm run doctor`
- **Production-ish build when WSL is installed:** `npm run build:win` (auto-routes through WSL)
- **Deploy:** `npm run deploy` (auto-routes through WSL on Windows when `wsl.exe` exists)

Optional mobile viewport overflow check (requires local dev server running):
- `npm run qa:mobile`

## Cloudflare Deployment (Workers)
This project is configured for Cloudflare Workers via OpenNext:
- `open-next.config.ts`
- `wrangler.jsonc`
- package scripts: `preview`, `deploy`, `cf-typegen`, `cf:preflight`, `cf:cache-rule`, `cf:cache-rule:ca`

### One-time setup
1. Authenticate Wrangler:
```bash
npx wrangler login
```
2. Confirm your worker name in `wrangler.jsonc` (currently `angelkisscreations`).

**Cloudflare-only DNS:** add the **.ca** zone in the same Cloudflare account as the Worker, finish nameserver cutover at the registrar, then verify the API token sees the zone before deploy:
```bash
# Put CLOUDFLARE_API_TOKEN in .env.local (scoped token; do not commit), then:
npm run cf:preflight
# Optional: pass another apex, e.g. npm run cf:preflight -- angelkisscreations.com
```

**Edge HTML cache (optional):** after the zone is active, run `npm run cf:cache-rule` (uses `NEXT_PUBLIC_SITE_URL`’s hostname unless you pass one: `npm run cf:cache-rule -- anglkisscreations.ca`, or set `CLOUDFLARE_ZONE_ID`). Token needs **Zone → Cache Rules → Edit**. Rule: **GET /** and **GET /shop…** cache-eligible at the edge, **respect_origin** TTL. Preview: `npm run cf:cache-rule -- --dry-run`. Remove: `npm run cf:cache-rule -- --remove`.

When `deploy:ca` / `wrangler deploy` runs, `wrangler.jsonc` routes attach **anglkisscreations.ca** (and **www**) to this Worker; Cloudflare creates the needed hostname/DNS bindings for those routes in-dashboard if prompted.

### Local Cloudflare runtime preview
```bash
npm run preview
```

### Deploy to Cloudflare Workers
```bash
npm run deploy
```

**Canonical `.ca` domain (recommended):** runs **`npm run check-env`** first, then bakes `https://anglkisscreations.ca` into the production build and deploys (same WSL/Windows routing as `deploy`):
```bash
npm run deploy:ca
```

Dashboard steps we cannot automate from git (PayPal webhook, Supabase redirect URLs, DNS clicks):
```bash
npm run go-live:domain
```

Notes:
- If the live site returns **404 for every URL** (including `/`), open the HTML source: paths like `/_next/static/development/` or `pages/_app.js` mean a **broken deploy** (often `next build` failing mid-run on Windows, e.g. `read ECONNRESET`). Fix: `npm run clean`, then **`npm run build:win`** or **`npm run wsl:deploy`**, then deploy again. `deploy:clean` runs `scripts/verify-opennext-production.mjs` after the OpenNext build to block shipping a dev-looking bundle.
- On **Windows**, `npm run deploy` will automatically run through **WSL** when `wsl.exe` exists (recommended for OpenNext + OneDrive reliability).
- If you need a plain Windows deploy path (or WSL isn’t set up yet), run:
```bash
npm run deploy:clean
```

### Optional type generation for Worker env
```bash
npm run cf-typegen
```

Notes:
- Use `CLOUDFLARE_API_TOKEN` (scoped) for CI when possible. If Wrangler route attachment fails (`code: 10000`), widen the token or use **Global API Key** + `CLOUDFLARE_EMAIL` (see `.env.example`: `CLOUDFLARE_GLOBAL_API_TOKEN` + `CLOUDFLARE_EMAIL`).
- Keep `NEXT_PUBLIC_SITE_URL=https://anglkisscreations.ca` in production env vars (canonical domain).
- Attach **both** `.ca` and `.com` custom domains on the Worker (see `wrangler.jsonc` routes). Traffic to the old **.com** host is **301-redirected** to the canonical URL via `middleware.ts` (optional override: `LEGACY_SITE_HOSTS`).
- After switching the public domain, update **PayPal** (return URLs + **webhook** endpoint) and **Supabase Auth** redirect URLs if they still reference the `.com` host.

## First Admin Setup
1. Create a user in Supabase Auth (Dashboard -> Authentication -> Users).
2. In Supabase SQL Editor, run:

```sql
insert into public.user_profiles (id, role, full_name)
select id, 'admin', 'Store Admin'
from auth.users
where email = 'your-admin-email@example.com'
on conflict (id) do update
set role = excluded.role;
```

## Implemented API routes
- `GET /api/products`
- `GET /api/products/:slug`
- `POST /api/products/:slug/customization/upload-url`
- `GET /api/admin/products`
- `POST /api/admin/products`
- `GET /api/admin/products/:id`
- `PATCH /api/admin/products/:id`
- `DELETE /api/admin/products/:id`
- `POST /api/admin/products/:id/publish`
- `POST /api/admin/products/:id/unpublish`
- `POST /api/admin/products/:id/inventory/adjust`
- `POST /api/admin/products/:id/images/upload-url`
- `GET /api/admin/products/:id/images`
- `POST /api/admin/products/:id/images`
- `PATCH /api/admin/products/:id/images/:imageId`
- `DELETE /api/admin/products/:id/images/:imageId`
- `GET /api/admin/orders`
- `GET /api/admin/orders/:id`
- `PATCH /api/admin/orders/:id/status`
- `GET /api/admin/settings/shipping`
- `PATCH /api/admin/settings/shipping`
- `GET /api/admin/settings/shipping/rates`
- `PATCH /api/admin/settings/shipping/rates`
- `POST /api/checkout/sessions`
- `POST /api/checkout/sessions/:id/paypal-order`
- `POST /api/checkout/sessions/:id/paypal-order/create`
- `POST /api/checkout/sessions/:id/paypal-order/capture`
- `POST /api/checkout/sessions/:id/cancel`
- `POST /api/webhooks/paypal`
- `POST /api/newsletter/subscribe`
- `GET /api/admin/newsletter/subscribers`
