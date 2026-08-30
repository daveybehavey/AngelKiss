<div align="center">

# AngelKissCreations

**Full-stack e-commerce storefront with product management, custom uploads, payments, order workflows, and production QA.**

[Live Store](https://anglkisscreations.ca) · [EuroDigital Portfolio](https://eurodigital.ca)

</div>

---

## Overview

AngelKissCreations is a production e-commerce project built for a creative small business. The application combines a customer-facing storefront with product administration, inventory/order workflows, customer customization uploads, payment processing, database-backed data, and Cloudflare deployment tooling.

The project is designed around the full commerce lifecycle rather than a static catalogue: products are managed in an admin surface, customers can browse and customize items, checkout is handled through PayPal, and order state is persisted and managed through Supabase.

## Product Highlights

- Responsive storefront, cart, checkout, and product-detail experiences
- Admin product and order-management workflows
- Product publishing, inventory adjustment, pricing, and image management
- Customer customization/image upload flow
- PayPal order creation, capture, cancellation, and webhook processing
- Supabase-backed products, orders, authentication, migrations, and storage
- Newsletter subscription workflow
- Cloudflare Workers deployment through OpenNext
- Mobile QA, live-site checks, Lighthouse auditing, and automated tests
- Cloudflare R2/image-management tooling and production deployment checks

## Tech Stack

| Area | Technology |
| --- | --- |
| Frontend | Next.js 15, React 19, TypeScript |
| Data & Auth | Supabase, PostgreSQL, Supabase Auth |
| Payments | PayPal Checkout + verified webhook handling |
| Storage | Supabase Storage, Cloudflare R2 tooling |
| Hosting | Cloudflare Workers, OpenNext, Wrangler |
| QA | Node test runner, Playwright, Lighthouse, TypeScript checks |
| Media | Sharp image processing |

## Engineering & QA

The repository includes dedicated tooling for reliability and production readiness, including:

- automated test and typecheck commands
- mobile viewport QA
- storefront and live-production audits
- Lighthouse/PageSpeed checks
- environment validation and setup diagnostics
- database migration tooling
- Cloudflare deployment preflight checks
- production bundle verification before deployment
- explicit webhook verification for payment events

```bash
npm run typecheck
npm run test
npm run build
npm run qa:mobile
npm run audit:storefront
```

## Application Surfaces

Customer-facing routes include the storefront, cart, checkout, product pages, and newsletter flow. Administrative routes support product creation/editing, publishing, inventory, images, orders, and shipping settings.

The backend exposes APIs for product data, admin operations, checkout sessions, PayPal order lifecycle actions, webhook processing, newsletter subscriptions, and order management.

## Local Development

```bash
npm install
npm run setup
npm run dev
```

Environment requirements are documented in `.env.example`. Database migrations live under `supabase/migrations/`.

## Deployment

The application is configured for Cloudflare Workers through OpenNext. Production deploys use the repository's validation and deployment tooling rather than treating deployment itself as the test step.

**Live:** https://anglkisscreations.ca

---

<div align="center">

Built and maintained as part of **EuroDigital** small-business web development work.

</div>
