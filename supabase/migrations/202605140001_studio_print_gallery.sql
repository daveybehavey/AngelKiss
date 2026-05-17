-- Studio-owned print gallery: homepage showcase + optional selection on custom sublimation orders.
-- Run via normal Supabase migration workflow.

CREATE TABLE IF NOT EXISTS public.sublimation_studio_prints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  subtitle text,
  storage_path text NOT NULL,
  alt_text text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  /** When set, homepage / gallery CTAs link to /shop/{slug}?studio_print={id} */
  primary_cta_slug text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sublimation_studio_prints_storage_path_nonempty CHECK (length(trim(storage_path)) > 0),
  CONSTRAINT sublimation_studio_prints_title_nonempty CHECK (length(trim(title)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_sublimation_studio_prints_active_sort
  ON public.sublimation_studio_prints (is_active, sort_order DESC, created_at DESC);

DROP TRIGGER IF EXISTS trg_sublimation_studio_prints_updated_at ON public.sublimation_studio_prints;
CREATE TRIGGER trg_sublimation_studio_prints_updated_at
BEFORE UPDATE ON public.sublimation_studio_prints
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.custom_sublimation_products
  ADD COLUMN IF NOT EXISTS allow_gallery_selection boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.custom_sublimation_products.allow_gallery_selection IS
  'When true, shoppers may attach an active studio print instead of (or in addition to upload flows per app rules).';

ALTER TABLE public.sublimation_studio_prints ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read active studio prints" ON public.sublimation_studio_prints;
CREATE POLICY "Public read active studio prints"
ON public.sublimation_studio_prints
FOR SELECT
USING (is_active = true);

DROP POLICY IF EXISTS "Admins manage studio prints" ON public.sublimation_studio_prints;
CREATE POLICY "Admins manage studio prints"
ON public.sublimation_studio_prints
FOR ALL
USING (public.is_admin())
WITH CHECK (public.is_admin());
