# AnglKiss Creations API Contracts (MVP)

Repository **AngelKiss**; brand **AnglKiss Creations**.

## Conventions
- Base path: `/api`
- Auth:
  - Public routes: no auth
  - Admin routes: authenticated user with role `admin`
- Currency: all amounts in integer cents (`*_cents`)
- IDs: UUID unless stated
- Timestamps: ISO 8601 UTC
- Variant policy: no variants in MVP (one listing per actual item style/color/size).
- Inventory policy: no backorders for `finite` products.
- Checkout reservation timeout: 30 minutes.
- Shipping policy: simple destination-zone rates with free shipping threshold.

## 1) Admin Product Management

### `GET /api/admin/products`
Query params:
- `category` optional (`custom_sublimation` | `handmade_crochet_knit`)
- `status` optional (`draft` | `published` | `unpublished`)
- `inventory_filter` optional (`all` | `low_stock` | `out_of_stock`)
- `q` optional search text
- `limit` optional (default 20, max 100)
- `cursor` optional

Response `200`:
- `{ items: ProductSummary[], nextCursor: string | null }`

### `POST /api/admin/products`
Request body:
- `name`, `slug`, `category`
- `short_description`, `long_description`
- `base_price_cents`, `currency`
- `inventory_mode` (`finite` | `made_to_order`)
- `stock_quantity?`, `low_stock_threshold?`, `is_available?`
- Category-specific object:
  - `custom_sublimation_details` OR
  - `handmade_details`

Response `201`:
- `{ product: ProductDetail }`

### `GET /api/admin/products/:id`
Response `200`:
- `{ product: ProductDetail }`

### `PATCH /api/admin/products/:id`
Request body (partial update):
- Any updatable shared field and/or category detail fields.
- Includes price changes (`base_price_cents`) and availability toggle (`is_available`).

Response `200`:
- `{ product: ProductDetail }`

### `DELETE /api/admin/products/:id`
Behavior:
- Soft delete (`deleted_at` set).

Response `204`

### `POST /api/admin/products/:id/publish`
Behavior:
- Validates category detail row exists.
- Sets `status=published`.

Response `200`:
- `{ id, status: "published" }`

### `POST /api/admin/products/:id/unpublish`
Behavior:
- Sets `status=unpublished`.

Response `200`:
- `{ id, status: "unpublished" }`

### `POST /api/admin/products/:id/inventory/adjust`
Request body:
- `{ delta: number, reason: "manual_adjustment" | "restock" | "correction", note?: string }`

Behavior:
- For `finite` products only.
- Applies atomic stock adjustment and records an inventory movement row.

Response `200`:
- `{ id, inventory_mode, stock_quantity, reserved_quantity, available_quantity }`

### `POST /api/admin/products/:id/images/upload-url`
Request body:
- `{ filename, content_type }`

Response `200`:
- `{ uploadUrl, storagePath, expiresAt }`

### `POST /api/admin/products/:id/images`
Request body:
- `{ storage_path, alt_text?, sort_order?, is_primary? }`

Response `201`:
- `{ image: ProductImage }`

### `PATCH /api/admin/products/:id/images/:imageId`
Request body:
- `{ alt_text?, sort_order?, is_primary? }`

Response `200`:
- `{ image: ProductImage }`

### `DELETE /api/admin/products/:id/images/:imageId`
Response `204`

## 2) Storefront Product Read

### `GET /api/products`
Public.

Query params:
- `category` optional
- `limit` optional
- `cursor` optional

Behavior:
- Returns only products where:
  - `status=published`
  - `deleted_at IS NULL`
  - `is_available=true`
  - sold-out finite products remain visible

Notes:
- Include availability fields in each item so UI can show sold-out state:
  - `inventory_mode`
  - `available_quantity`
  - `is_sold_out`

Response `200`:
- `{ items: StorefrontProductCard[], nextCursor: string | null }`

### `GET /api/products/:slug`
Public.

Behavior:
- Returns product when:
  - `status=published`
  - `deleted_at IS NULL`
  - `is_available=true`
- Include `is_sold_out` and `available_quantity` in response.

Response `200`:
- `{ product: StorefrontProductDetail }`

## 3) Storefront customization upload (Phase 1)

### `POST /api/products/:slug/customization/upload-url`
Public. Body: `{ filename, content_type, file_size_bytes? }`.

Behavior:
- Only for **published**, **available** `custom_sublimation` products with `allow_image_upload`.
- Returns a **signed Supabase Storage** upload URL scoped to `customizations/{productId}/…`.

Response `200`:
- `{ uploadUrl, storagePath, bucket, expiresAt, maxUploadMb, token }` (Supabase signed upload fields).

Checkout (`POST /api/checkout/sessions`) accepts the resulting storage metadata under each line item’s `customization` object; see `lib/checkout/customization.ts` for the exact schema (`rights_acknowledged`, etc.).

**Future (not in MVP contracts):** `/api/customizer/*` canvas validation would apply only if a Konva-style editor is added.

## 4) Checkout + Payment

### `POST /api/checkout/sessions`
Request body:
- `customer_email`
- `shipping_address` object containing:
  - `country_code` (e.g. `CA`, `US`)
  - `province_code` (for CA)
  - `city`
  - `postal_code`
- `items[]`:
  - `product_id`
  - `quantity`
  - `customization` (optional; required for `custom_sublimation`)

Behavior:
- Validates stock + pricing + customization.
- Reserves inventory for `finite` products (`reserved_quantity += qty`) atomically.
- Rejects checkout when requested quantity exceeds available quantity for any `finite` item (no backorders).
- Computes shipping from shipping settings + zone rates:
  - determine `shipping_zone` from destination country/province/city
  - match active shipping rule by `shipping_zone`
  - apply free shipping when subtotal >= configured threshold (`$100.00` default)
- Snapshots product fields/prices into session items.

Response `201`:
- `{ checkoutSessionId, status: "open", expiresAt, totals }`

`totals` object:
- `subtotal_cents`
- `shipping_cents`
- `total_cents`
- `shipping_zone` (`local` | `regional` | `national` | `usa`)
- `free_shipping_applied` (boolean)

### `POST /api/checkout/sessions/:id/paypal-order`
Request body:
- `{ paypalOrderId }`

Behavior:
- Stores `paypal_order_id` on checkout session.
- In MVP scaffold, PayPal order creation itself can happen in client or an integration service.

Response `200`:
- `{ checkoutSessionId, paypalOrderId }`

### `POST /api/checkout/sessions/:id/cancel`
Behavior:
- Releases any reserved inventory for `finite` products.
- Marks checkout session `failed` or `expired`.

Response `200`:
- `{ id, status }`

## 5) Admin Store Settings

### `GET /api/admin/settings/shipping`
Response `200`:
- `{ free_shipping_enabled, free_shipping_threshold_cents, origin }`

`origin`:
- `country_code`, `province_code`, `city`, `postal_code`

### `PATCH /api/admin/settings/shipping`
Request body:
- `{ free_shipping_enabled?, free_shipping_threshold_cents?, origin? }`

Response `200`:
- `{ free_shipping_enabled, free_shipping_threshold_cents, origin }`

### `GET /api/admin/settings/shipping/rates`
Response `200`:
- `{ rules: ShippingRateRule[] }`

`ShippingRateRule`:
- `id`
- `zone` (`local` | `regional` | `national` | `usa`)
- `shipping_cents`
- `is_active`
- `label`
- `sort_order`

### `PATCH /api/admin/settings/shipping/rates`
Request body:
- `{ rules: Array<{ id?, zone, shipping_cents, is_active?, label?, sort_order? }> }`

Behavior:
- Upserts shipping matrix rules.
- Exactly one active rule per zone is expected in MVP.

Response `200`:
- `{ rules: ShippingRateRule[] }`

## 6) PayPal Webhook

### `POST /api/webhooks/paypal`
Public endpoint. **When `PAYPAL_WEBHOOK_ID` is set**, the handler requires PayPal transmission headers and calls PayPal **`POST /v1/notifications/verify-webhook-signature`** before running business logic. If verification returns anything other than `verification_status: SUCCESS`, the route responds **`401`**.

If `PAYPAL_WEBHOOK_ID` is unset (local dev only), verification is skipped; **production must set the webhook ID**.

Behavior after verification:
- Idempotently stores webhook event by `paypal_event_id`.
- On successful capture event:
  - creates local `orders` row from checkout session snapshot if not already created
  - creates `order_items`
  - creates `payments`
  - writes `order_status_history`
  - sets order status to `paid`

Response:
- `200` for processed/duplicate events.
- `400` for malformed payload or RPC rejection.
- `401` for failed signature verification when `PAYPAL_WEBHOOK_ID` is configured.

## 7) Admin Orders

### `GET /api/admin/orders`
Query params:
- `status` optional
- `limit` optional
- `cursor` optional

Response `200`:
- `{ items: AdminOrderSummary[], nextCursor: string | null }`

### `GET /api/admin/orders/:id`
Response `200`:
- `{ order: AdminOrderDetail }`

### `PATCH /api/admin/orders/:id/status`
Request body:
- `{ status, note? }`

Behavior:
- Enforces allowed status transitions from spec.
- Writes row to `order_status_history`.
- Refund guardrails in MVP:
  - only full-order refunds (`status=refunded`)
  - operational policy is customer-paid return shipping (handled by support/admin process, not automatic label flow in MVP)

Response `200`:
- `{ id, status }`

## 8) Newsletter (public subscribe + admin list)

### `POST /api/newsletter/subscribe`
Public. JSON body:
- `email` (required)
- `company` (optional honeypot; must be empty or omitted for real signups)

Behavior:
- Normalizes and validates email server-side.
- Inserts into `newsletter_subscribers` with `source` defaulting to `footer` (implementation-defined).
- Duplicate email (unique on normalized address) returns a friendly message, not a server error.

Response `200` / `201` (success shape is implementation-defined; includes ok/message).

Response `400` for invalid email, honeypot hit, or malformed JSON.

### `GET /api/admin/newsletter/subscribers`
Admin auth required (same as other `/api/admin/*` routes).

Query params:
- `limit` optional (capped by server; e.g. up to 500)

Response `200`:
- `{ items: Array<{ email, created_at, source }> }`

Response `401` when not authenticated as admin.
