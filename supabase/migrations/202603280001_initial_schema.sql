-- AngelKiss initial schema (logic-first MVP)

begin;

create extension if not exists pgcrypto;

-- Enums
DO $$ BEGIN
  CREATE TYPE public.user_role AS ENUM ('admin', 'customer');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.product_category AS ENUM ('custom_sublimation', 'handmade_crochet_knit');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.product_status AS ENUM ('draft', 'published', 'unpublished');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.inventory_mode AS ENUM ('finite', 'made_to_order');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.inventory_movement_reason AS ENUM (
    'manual_adjustment',
    'restock',
    'correction',
    'checkout_reserve',
    'checkout_release',
    'order_commit'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.checkout_session_status AS ENUM ('open', 'paypal_order_created', 'completed', 'expired', 'failed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.order_status AS ENUM (
    'pending_payment',
    'paid',
    'in_production',
    'ready_to_ship',
    'shipped',
    'delivered',
    'canceled',
    'refunded',
    'payment_failed'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.payment_status AS ENUM ('created', 'captured', 'failed', 'refunded');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Shared utility functions
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Auth profile/roles
CREATE TABLE IF NOT EXISTS public.user_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.user_role NOT NULL DEFAULT 'customer',
  full_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_user_profiles_updated_at ON public.user_profiles;
CREATE TRIGGER trg_user_profiles_updated_at
BEFORE UPDATE ON public.user_profiles
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_profiles up
    WHERE up.id = auth.uid()
      AND up.role = 'admin'
  );
$$;

CREATE TABLE IF NOT EXISTS public.store_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id = true),
  flat_shipping_cents integer NOT NULL DEFAULT 1500 CHECK (flat_shipping_cents >= 0),
  free_shipping_enabled boolean NOT NULL DEFAULT true,
  free_shipping_threshold_cents integer NOT NULL DEFAULT 10000 CHECK (free_shipping_threshold_cents >= 0),
  customer_pays_return_shipping boolean NOT NULL DEFAULT true,
  full_order_refunds_only boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_store_settings_updated_at ON public.store_settings;
CREATE TRIGGER trg_store_settings_updated_at
BEFORE UPDATE ON public.store_settings
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.store_settings (id)
VALUES (true)
ON CONFLICT (id) DO NOTHING;

-- Products
CREATE TABLE IF NOT EXISTS public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9-]+$'),
  name text NOT NULL,
  category public.product_category NOT NULL,
  short_description text,
  long_description text,
  base_price_cents integer NOT NULL CHECK (base_price_cents > 0),
  currency char(3) NOT NULL DEFAULT 'USD' CHECK (currency = upper(currency)),
  inventory_mode public.inventory_mode NOT NULL DEFAULT 'made_to_order',
  stock_quantity integer CHECK (stock_quantity IS NULL OR stock_quantity >= 0),
  reserved_quantity integer NOT NULL DEFAULT 0 CHECK (reserved_quantity >= 0),
  low_stock_threshold integer NOT NULL DEFAULT 2 CHECK (low_stock_threshold >= 0),
  is_available boolean NOT NULL DEFAULT true,
  status public.product_status NOT NULL DEFAULT 'draft',
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (inventory_mode = 'made_to_order' AND stock_quantity IS NULL AND reserved_quantity = 0)
    OR
    (inventory_mode = 'finite' AND stock_quantity IS NOT NULL AND stock_quantity >= reserved_quantity)
  )
);

CREATE INDEX IF NOT EXISTS idx_products_category_status
  ON public.products (category, status)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_products_created_at
  ON public.products (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_products_inventory_lookup
  ON public.products (inventory_mode, is_available, status)
  WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS trg_products_updated_at ON public.products;
CREATE TRIGGER trg_products_updated_at
BEFORE UPDATE ON public.products
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.product_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  alt_text text,
  sort_order integer NOT NULL DEFAULT 0,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_product_images_product_sort
  ON public.product_images (product_id, sort_order, created_at);

CREATE UNIQUE INDEX IF NOT EXISTS uq_product_primary_image
  ON public.product_images (product_id)
  WHERE is_primary = true;

CREATE TABLE IF NOT EXISTS public.product_inventory_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  delta integer NOT NULL CHECK (delta <> 0),
  reason public.inventory_movement_reason NOT NULL,
  note text,
  created_by uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_product_inventory_movements_product_created
  ON public.product_inventory_movements (product_id, created_at DESC);

-- Category-specific detail tables
CREATE TABLE IF NOT EXISTS public.custom_sublimation_products (
  product_id uuid PRIMARY KEY REFERENCES public.products(id) ON DELETE CASCADE,
  template_image_path text NOT NULL,
  default_blank_color text NOT NULL DEFAULT 'white',
  safe_area_x integer NOT NULL DEFAULT 0 CHECK (safe_area_x >= 0),
  safe_area_y integer NOT NULL DEFAULT 0 CHECK (safe_area_y >= 0),
  safe_area_width integer NOT NULL CHECK (safe_area_width > 0),
  safe_area_height integer NOT NULL CHECK (safe_area_height > 0),
  max_upload_mb integer NOT NULL DEFAULT 20 CHECK (max_upload_mb > 0),
  allow_image_upload boolean NOT NULL DEFAULT true,
  allow_text_overlay boolean NOT NULL DEFAULT true,
  max_text_layers integer NOT NULL DEFAULT 3 CHECK (max_text_layers >= 0),
  allowed_fonts text[] NOT NULL DEFAULT ARRAY['Arial', 'Montserrat', 'Playfair Display'],
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_custom_sublimation_products_updated_at ON public.custom_sublimation_products;
CREATE TRIGGER trg_custom_sublimation_products_updated_at
BEFORE UPDATE ON public.custom_sublimation_products
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.handmade_products (
  product_id uuid PRIMARY KEY REFERENCES public.products(id) ON DELETE CASCADE,
  material text NOT NULL,
  care_instructions text,
  lead_time_days integer NOT NULL DEFAULT 7 CHECK (lead_time_days >= 0),
  personalization_available boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_handmade_products_updated_at ON public.handmade_products;
CREATE TRIGGER trg_handmade_products_updated_at
BEFORE UPDATE ON public.handmade_products
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.assert_product_category_match()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  expected public.product_category;
  actual public.product_category;
BEGIN
  expected := TG_ARGV[0]::public.product_category;

  SELECT p.category
  INTO actual
  FROM public.products p
  WHERE p.id = NEW.product_id
    AND p.deleted_at IS NULL;

  IF actual IS NULL THEN
    RAISE EXCEPTION 'Product % not found or deleted', NEW.product_id;
  END IF;

  IF actual <> expected THEN
    RAISE EXCEPTION 'Category mismatch for product %: expected %, got %', NEW.product_id, expected, actual;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_custom_category_check ON public.custom_sublimation_products;
CREATE TRIGGER trg_custom_category_check
BEFORE INSERT OR UPDATE ON public.custom_sublimation_products
FOR EACH ROW EXECUTE FUNCTION public.assert_product_category_match('custom_sublimation');

DROP TRIGGER IF EXISTS trg_handmade_category_check ON public.handmade_products;
CREATE TRIGGER trg_handmade_category_check
BEFORE INSERT OR UPDATE ON public.handmade_products
FOR EACH ROW EXECUTE FUNCTION public.assert_product_category_match('handmade_crochet_knit');

CREATE OR REPLACE FUNCTION public.adjust_product_inventory(
  p_product_id uuid,
  p_delta integer,
  p_reason public.inventory_movement_reason,
  p_note text DEFAULT NULL,
  p_created_by uuid DEFAULT NULL
)
RETURNS TABLE (
  product_id uuid,
  stock_quantity integer,
  reserved_quantity integer,
  available_quantity integer
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_inventory_mode public.inventory_mode;
BEGIN
  IF p_delta = 0 THEN
    RAISE EXCEPTION 'Inventory delta cannot be 0';
  END IF;

  UPDATE public.products p
  SET stock_quantity = p.stock_quantity + p_delta
  WHERE p.id = p_product_id
    AND p.inventory_mode = 'finite'
    AND p.deleted_at IS NULL
    AND p.stock_quantity + p_delta >= p.reserved_quantity
  RETURNING p.inventory_mode, p.stock_quantity, p.reserved_quantity
  INTO v_inventory_mode, stock_quantity, reserved_quantity;

  IF NOT FOUND THEN
    SELECT p.inventory_mode
    INTO v_inventory_mode
    FROM public.products p
    WHERE p.id = p_product_id
      AND p.deleted_at IS NULL;

    IF v_inventory_mode IS NULL THEN
      RAISE EXCEPTION 'Product % not found or deleted', p_product_id;
    END IF;

    IF v_inventory_mode <> 'finite' THEN
      RAISE EXCEPTION 'Inventory adjustments are only allowed for finite products (% has mode %)', p_product_id, v_inventory_mode;
    END IF;

    RAISE EXCEPTION 'Inventory adjustment would make stock lower than reserved quantity for product %', p_product_id;
  END IF;

  INSERT INTO public.product_inventory_movements (
    product_id,
    delta,
    reason,
    note,
    created_by
  ) VALUES (
    p_product_id,
    p_delta,
    p_reason,
    p_note,
    p_created_by
  );

  product_id := p_product_id;
  available_quantity := stock_quantity - reserved_quantity;
  RETURN NEXT;
END;
$$;

-- Checkout
CREATE TABLE IF NOT EXISTS public.checkout_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_email text NOT NULL,
  shipping_address jsonb NOT NULL,
  status public.checkout_session_status NOT NULL DEFAULT 'open',
  paypal_order_id text UNIQUE,
  subtotal_cents integer NOT NULL CHECK (subtotal_cents >= 0),
  shipping_cents integer NOT NULL DEFAULT 0 CHECK (shipping_cents >= 0),
  total_cents integer NOT NULL CHECK (total_cents >= 0),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 minutes'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_checkout_sessions_status_created
  ON public.checkout_sessions (status, created_at DESC);

DROP TRIGGER IF EXISTS trg_checkout_sessions_updated_at ON public.checkout_sessions;
CREATE TRIGGER trg_checkout_sessions_updated_at
BEFORE UPDATE ON public.checkout_sessions
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.checkout_session_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checkout_session_id uuid NOT NULL REFERENCES public.checkout_sessions(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_price_cents integer NOT NULL CHECK (unit_price_cents > 0),
  product_snapshot jsonb NOT NULL,
  customization_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_checkout_items_session
  ON public.checkout_session_items (checkout_session_id);

-- Orders
CREATE TABLE IF NOT EXISTS public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  checkout_session_id uuid UNIQUE REFERENCES public.checkout_sessions(id) ON DELETE RESTRICT,
  paypal_order_id text UNIQUE,
  customer_email text NOT NULL,
  customer_name text,
  shipping_address jsonb NOT NULL,
  status public.order_status NOT NULL DEFAULT 'pending_payment',
  subtotal_cents integer NOT NULL CHECK (subtotal_cents >= 0),
  shipping_cents integer NOT NULL DEFAULT 0 CHECK (shipping_cents >= 0),
  total_cents integer NOT NULL CHECK (total_cents >= 0),
  currency char(3) NOT NULL DEFAULT 'USD' CHECK (currency = upper(currency)),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_orders_status_created
  ON public.orders (status, created_at DESC);

DROP TRIGGER IF EXISTS trg_orders_updated_at ON public.orders;
CREATE TRIGGER trg_orders_updated_at
BEFORE UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_price_cents integer NOT NULL CHECK (unit_price_cents > 0),
  line_total_cents integer GENERATED ALWAYS AS (quantity * unit_price_cents) STORED,
  product_snapshot jsonb NOT NULL,
  customization_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_items_order
  ON public.order_items (order_id);

CREATE TABLE IF NOT EXISTS public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'paypal',
  provider_order_id text NOT NULL,
  provider_capture_id text,
  status public.payment_status NOT NULL,
  amount_cents integer NOT NULL CHECK (amount_cents >= 0),
  currency char(3) NOT NULL DEFAULT 'USD' CHECK (currency = upper(currency)),
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_order_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_provider_capture
  ON public.payments (provider_capture_id)
  WHERE provider_capture_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payments_order
  ON public.payments (order_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_payments_updated_at ON public.payments;
CREATE TRIGGER trg_payments_updated_at
BEFORE UPDATE ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.order_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  from_status public.order_status,
  to_status public.order_status NOT NULL,
  changed_by uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_status_history_order_created
  ON public.order_status_history (order_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.paypal_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  paypal_event_id text NOT NULL UNIQUE,
  event_type text NOT NULL,
  resource_type text,
  payload jsonb NOT NULL,
  processed_at timestamptz,
  processing_error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_paypal_webhook_events_type_created
  ON public.paypal_webhook_events (event_type, created_at DESC);

-- Order status transition guard
CREATE OR REPLACE FUNCTION public.is_valid_order_status_transition(
  from_status public.order_status,
  to_status public.order_status
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN from_status = to_status THEN true
    WHEN from_status = 'pending_payment' AND to_status IN ('paid', 'payment_failed', 'canceled') THEN true
    WHEN from_status = 'paid' AND to_status IN ('in_production', 'canceled', 'refunded') THEN true
    WHEN from_status = 'in_production' AND to_status IN ('ready_to_ship', 'canceled') THEN true
    WHEN from_status = 'ready_to_ship' AND to_status IN ('shipped', 'canceled') THEN true
    WHEN from_status = 'shipped' AND to_status IN ('delivered', 'refunded') THEN true
    WHEN from_status = 'delivered' AND to_status = 'refunded' THEN true
    ELSE false
  END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_order_status_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT public.is_valid_order_status_transition(OLD.status, NEW.status) THEN
      RAISE EXCEPTION 'Invalid order status transition: % -> %', OLD.status, NEW.status;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_status_transition ON public.orders;
CREATE TRIGGER trg_orders_status_transition
BEFORE UPDATE OF status ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.enforce_order_status_transition();

-- RLS baseline
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_sublimation_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.handmade_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checkout_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checkout_session_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.paypal_webhook_events ENABLE ROW LEVEL SECURITY;

-- user_profiles
DROP POLICY IF EXISTS "Users can view own profile" ON public.user_profiles;
CREATE POLICY "Users can view own profile"
ON public.user_profiles
FOR SELECT
USING (id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "Admins manage profiles" ON public.user_profiles;
CREATE POLICY "Admins manage profiles"
ON public.user_profiles
FOR ALL
USING (public.is_admin())
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Public read store settings" ON public.store_settings;
CREATE POLICY "Public read store settings"
ON public.store_settings
FOR SELECT
USING (true);

DROP POLICY IF EXISTS "Admins manage store settings" ON public.store_settings;
CREATE POLICY "Admins manage store settings"
ON public.store_settings
FOR ALL
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- products + images (public can read published)
DROP POLICY IF EXISTS "Public read published products" ON public.products;
CREATE POLICY "Public read published products"
ON public.products
FOR SELECT
USING (status = 'published' AND is_available = true AND deleted_at IS NULL);

DROP POLICY IF EXISTS "Admins manage products" ON public.products;
CREATE POLICY "Admins manage products"
ON public.products
FOR ALL
USING (public.is_admin())
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Public read images for published products" ON public.product_images;
CREATE POLICY "Public read images for published products"
ON public.product_images
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.products p
    WHERE p.id = product_images.product_id
      AND p.status = 'published'
      AND p.is_available = true
      AND p.deleted_at IS NULL
  )
);

DROP POLICY IF EXISTS "Admins manage product images" ON public.product_images;
CREATE POLICY "Admins manage product images"
ON public.product_images
FOR ALL
USING (public.is_admin())
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins manage inventory movements" ON public.product_inventory_movements;
CREATE POLICY "Admins manage inventory movements"
ON public.product_inventory_movements
FOR ALL
USING (public.is_admin())
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Public read custom details for published products" ON public.custom_sublimation_products;
CREATE POLICY "Public read custom details for published products"
ON public.custom_sublimation_products
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.products p
    WHERE p.id = custom_sublimation_products.product_id
      AND p.status = 'published'
      AND p.is_available = true
      AND p.deleted_at IS NULL
  )
);

DROP POLICY IF EXISTS "Admins manage custom details" ON public.custom_sublimation_products;
CREATE POLICY "Admins manage custom details"
ON public.custom_sublimation_products
FOR ALL
USING (public.is_admin())
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Public read handmade details for published products" ON public.handmade_products;
CREATE POLICY "Public read handmade details for published products"
ON public.handmade_products
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.products p
    WHERE p.id = handmade_products.product_id
      AND p.status = 'published'
      AND p.is_available = true
      AND p.deleted_at IS NULL
  )
);

DROP POLICY IF EXISTS "Admins manage handmade details" ON public.handmade_products;
CREATE POLICY "Admins manage handmade details"
ON public.handmade_products
FOR ALL
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- Admin-only data tables
DROP POLICY IF EXISTS "Admins manage checkout sessions" ON public.checkout_sessions;
CREATE POLICY "Admins manage checkout sessions"
ON public.checkout_sessions
FOR ALL
USING (public.is_admin())
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins manage checkout session items" ON public.checkout_session_items;
CREATE POLICY "Admins manage checkout session items"
ON public.checkout_session_items
FOR ALL
USING (public.is_admin())
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins manage orders" ON public.orders;
CREATE POLICY "Admins manage orders"
ON public.orders
FOR ALL
USING (public.is_admin())
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins manage order items" ON public.order_items;
CREATE POLICY "Admins manage order items"
ON public.order_items
FOR ALL
USING (public.is_admin())
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins manage payments" ON public.payments;
CREATE POLICY "Admins manage payments"
ON public.payments
FOR ALL
USING (public.is_admin())
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins manage order status history" ON public.order_status_history;
CREATE POLICY "Admins manage order status history"
ON public.order_status_history
FOR ALL
USING (public.is_admin())
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins manage paypal webhook events" ON public.paypal_webhook_events;
CREATE POLICY "Admins manage paypal webhook events"
ON public.paypal_webhook_events
FOR ALL
USING (public.is_admin())
WITH CHECK (public.is_admin());

commit;
