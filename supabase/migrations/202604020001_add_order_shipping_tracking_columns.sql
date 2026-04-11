ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS shipping_carrier text,
  ADD COLUMN IF NOT EXISTS tracking_number text,
  ADD COLUMN IF NOT EXISTS tracking_url text,
  ADD COLUMN IF NOT EXISTS shipped_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_orders_shipped_at
  ON public.orders (shipped_at DESC)
  WHERE shipped_at IS NOT NULL;
