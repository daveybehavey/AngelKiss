# AnglKiss Creations MVP Build Spec (Logic-First)

Repository codename **AngelKiss**; customer-facing brand **AnglKiss Creations**.

## 1) Frozen MVP Decisions
- Stack: Next.js (App Router) + Supabase (Postgres/Auth/Storage) + PayPal.
- Product categories:
  - `custom_sublimation`
  - `handmade_crochet_knit`
- Admin capabilities required in MVP:
  - Add/edit/unpublish/delete products
  - Upload/manage product images
  - Manage inventory counts for limited items
  - Pause/unpause product availability
  - Adjust prices
  - Manage shipping origin, zone rates, and free-shipping settings
  - Update order status
- UI scope for now: no styling work, logic and contracts only.

## 2) Exact Product Fields

### Shared Product Fields (all categories)
- `id` (UUID)
- `slug` (unique string)
- `name`
- `category` (`custom_sublimation` | `handmade_crochet_knit`)
- `short_description`
- `long_description`
- `base_price_cents`
- `currency` (default `USD`)
- `inventory_mode` (`finite` | `made_to_order`)
- `stock_quantity` (integer, nullable for made-to-order)
- `reserved_quantity` (integer, checkout holds)
- `low_stock_threshold` (integer, default 2)
- `is_available` (manual on/off switch)
- `status` (`draft` | `published` | `unpublished`)
- `deleted_at` (soft delete)
- `created_at`, `updated_at`

### Category Fields: Custom Sublimation
- `template_image_path` (storage path)
- `default_blank_color` (default `white`)
- Safe print area in template pixels:
  - `safe_area_x`
  - `safe_area_y`
  - `safe_area_width`
  - `safe_area_height`
- Upload limits:
  - `max_upload_mb` (default 20)
  - `allow_image_upload` (boolean)
- Text overlay rules:
  - `allow_text_overlay` (boolean)
  - `max_text_layers` (default 3)
  - `allowed_fonts` (whitelist array)

### Category Fields: Handmade Crochet/Knit
- `material`
- `care_instructions`
- `lead_time_days`
- `personalization_available` (boolean)

Inventory defaults by category:
- `custom_sublimation`: `inventory_mode=made_to_order`, `stock_quantity=NULL`
- `handmade_crochet_knit`: `inventory_mode=finite`, `stock_quantity>=0`
- No variants in MVP:
  - one product listing = one real item style/color/size
  - if she makes a different color/style, it is a separate product listing
- Storefront visibility rule:
  - product must be `status=published`
  - `is_available=true` (manual hide/show control)
  - sold-out items are still visible on product and category pages
- Storefront purchasable rule:
  - for `made_to_order`: purchasable when visible
  - for `finite`: purchasable only when `stock_quantity - reserved_quantity >= requested_quantity`
  - no backorders in MVP

## 3) Exact Order Statuses
- `pending_payment`: checkout started, payment not confirmed yet.
- `paid`: PayPal capture confirmed, order accepted.
- `in_production`: production/crafting started.
- `ready_to_ship`: packed and waiting dispatch.
- `shipped`: carrier accepted shipment.
- `delivered`: final delivery confirmed.
- `canceled`: canceled before fulfillment completed.
- `refunded`: payment refunded (full order-level in MVP).
- `payment_failed`: PayPal payment failed and order not accepted.

Allowed transitions:
- `pending_payment -> paid | payment_failed | canceled`
- `paid -> in_production | canceled | refunded`
- `in_production -> ready_to_ship | canceled`
- `ready_to_ship -> shipped | canceled`
- `shipped -> delivered | refunded`
- `delivered -> refunded`
- `canceled` is terminal.
- `payment_failed` is terminal.
- `refunded` is terminal.

## 4) Customization (Phase 1 — shipped)

**Phase 1 (MVP storefront):** For `custom_sublimation` products, the customer flow is **signed image upload** to Supabase Storage plus optional **notes** and **rights confirmation** (no in-browser canvas editor).

- Upload URL: `POST /api/products/:slug/customization/upload-url` (see `docs/api-contracts.md`).
- Checkout validates customization with `lib/checkout/customization.ts` (Zod): `upload` metadata, `rights_acknowledged`, optional `customer_notes`.

**Phase 2 (optional / future):** In-browser layout (`react-konva` or similar): text layers, drag/resize, safe-area preview, exported `preview_image_path`. Not required for launch if Phase 1 meets fulfillment workflow.

## 5) Checkout + Payment Flow (MVP)
1. Client creates checkout session with item snapshots and per-item `customization` (Phase 1 shape from `lib/checkout/customization.ts`).
2. Checkout reservation timeout is 30 minutes (best-practice default for MVP).
3. For `finite` inventory items, server reserves quantity (`reserved_quantity += qty`).
4. For `finite` inventory items, no backorders are allowed.
5. Server creates PayPal order and stores PayPal order ID on session.
6. PayPal webhook confirms successful capture.
7. Webhook handler is idempotent:
   - records webhook event
   - creates local order from checkout session snapshot if missing
   - creates payment record
   - sets order status to `paid`
   - converts reserved stock to sold stock for `finite` items (`stock_quantity -= qty`, `reserved_quantity -= qty`)
8. If checkout expires/fails/cancels, reservations are released (`reserved_quantity -= qty`).
9. Shipping policy in MVP:
   - simple zone-based shipping
   - zones:
     - `local` (same origin city + province)
     - `regional` (same province, different city)
     - `national` (different province in Canada)
     - `usa`
   - launch rates:
     - local: `2100` cents
     - regional: `2100` cents
     - national: `3100` cents
     - usa tracked: `2700` cents
   - free shipping for orders with subtotal >= `$100.00` (`10000` cents)
10. Refund policy in MVP:
   - full-order refunds only
   - customer pays return shipping
11. Admin progresses order through fulfillment statuses.

## 6) Locked Decisions (March 28, 2026)
1. Sold-out products remain visible to customers.
2. Reservation timeout: 30 minutes.
3. No backorders for finite handmade products.
4. Shipping: simple zone-based rates + free shipping at `$100+`.
5. Refunds: full-order only; customer pays return shipping.

## 7) Day 1 Deliverables (This Spec + Contracts)
- Frozen domain model and status machine.
- Supabase migration for core tables/enums/constraints.
- API contract list for admin/storefront/customization upload/checkout/webhook.
