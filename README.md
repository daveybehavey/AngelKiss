# AngelKiss

Logic-first MVP scaffold for:
- product admin creation
- checkout session creation with simple zone shipping
- PayPal webhook processing

## Prereqs
- Node.js 20+
- A Supabase project

## Environment
Copy `.env.example` to `.env.local` and set:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_SITE_URL` (for production, set `https://angelkisscreations.com`)
- `SUPABASE_SERVICE_ROLE_KEY` (or `SUPABASE_SECRET_KEY`)
- optional `SUPABASE_PRODUCT_IMAGES_BUCKET` (default `product-images`)
- optional `SUPABASE_CUSTOM_UPLOADS_BUCKET` (default `customer-design-uploads`)
- optional `PAYPAL_WEBHOOK_ID`
- `PAYPAL_ENV` (`sandbox` or `live`)
- `PAYPAL_CLIENT_ID`
- `PAYPAL_CLIENT_SECRET`
- optional aliases: `PAYPAL_TEST_CLIENT_ID`, `PAYPAL_TEST_CLIENT_SECRET`
- `NEXT_PUBLIC_PAYPAL_CLIENT_ID`

## Database
Run SQL migrations in `supabase/migrations/` in order:
1. `202603280001_initial_schema.sql`
2. `202603280002_shipping_matrix_and_checkout_logic.sql`
3. `202603280003_checkout_and_paypal_functions.sql`

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

Optional mobile viewport overflow check (requires local dev server running):
- `npm run qa:mobile`

## Cloudflare Deployment (Workers)
This project is configured for Cloudflare Workers via OpenNext:
- `open-next.config.ts`
- `wrangler.jsonc`
- package scripts: `preview`, `deploy`, `cf-typegen`

### One-time setup
1. Authenticate Wrangler:
```bash
npx wrangler login
```
2. Confirm your worker name in `wrangler.jsonc` (currently `angelkisscreations`).

### Local Cloudflare runtime preview
```bash
npm run preview
```

### Deploy to Cloudflare Workers
```bash
npm run deploy
```

### Optional type generation for Worker env
```bash
npm run cf-typegen
```

Notes:
- Use `CLOUDFLARE_API_TOKEN` (scoped token) for CI deploys, not a global API key.
- Keep `NEXT_PUBLIC_SITE_URL=https://angelkisscreations.com` in production env vars.

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
