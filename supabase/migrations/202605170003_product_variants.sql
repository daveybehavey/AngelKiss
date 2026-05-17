-- Product color/style variants under a single listing (shared product-level stock for finite items).

CREATE TABLE IF NOT EXISTS public.product_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  label text NOT NULL,
  slug text NOT NULL,
  price_cents integer CHECK (price_cents IS NULL OR price_cents > 0),
  sort_order integer NOT NULL DEFAULT 0,
  is_available boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_variants_label_nonempty CHECK (length(trim(label)) > 0),
  CONSTRAINT product_variants_slug_format CHECK (slug ~ '^[a-z0-9-]+$'),
  CONSTRAINT uq_product_variants_product_slug UNIQUE (product_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_product_variants_product_sort
  ON public.product_variants (product_id, sort_order DESC, label ASC);

DROP TRIGGER IF EXISTS trg_product_variants_updated_at ON public.product_variants;
CREATE TRIGGER trg_product_variants_updated_at
BEFORE UPDATE ON public.product_variants
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.product_images
  ADD COLUMN IF NOT EXISTS variant_id uuid REFERENCES public.product_variants(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_product_images_variant
  ON public.product_images (variant_id)
  WHERE variant_id IS NOT NULL;

ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read available product variants" ON public.product_variants;
CREATE POLICY "Public read available product variants"
ON public.product_variants
FOR SELECT
USING (
  is_available = true
  AND EXISTS (
    SELECT 1
    FROM public.products p
    WHERE p.id = product_id
      AND p.deleted_at IS NULL
      AND p.status = 'published'
      AND p.is_available = true
  )
);

DROP POLICY IF EXISTS "Admins manage product variants" ON public.product_variants;
CREATE POLICY "Admins manage product variants"
ON public.product_variants
FOR ALL
USING (public.is_admin())
WITH CHECK (public.is_admin());
