-- Optional comma-separated tags for gallery search (not shown on tiles).

ALTER TABLE public.sublimation_studio_prints
  ADD COLUMN IF NOT EXISTS search_tags text;

COMMENT ON COLUMN public.sublimation_studio_prints.search_tags IS
  'Comma-separated keywords for /gallery search (e.g. floral, mug, mom). Not shown to shoppers on tiles.';
