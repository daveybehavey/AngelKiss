-- Pixel dimensions of the stored image (WebP in product-images bucket).
-- Used by the storefront to set per-print aspect ratio and reduce pillarboxing with object-fit: contain.

ALTER TABLE public.sublimation_studio_prints
  ADD COLUMN IF NOT EXISTS image_width integer,
  ADD COLUMN IF NOT EXISTS image_height integer;

ALTER TABLE public.sublimation_studio_prints
  DROP CONSTRAINT IF EXISTS sublimation_studio_prints_image_dims_pair;

ALTER TABLE public.sublimation_studio_prints
  ADD CONSTRAINT sublimation_studio_prints_image_dims_pair CHECK (
    (image_width IS NULL) = (image_height IS NULL)
    AND (image_width IS NULL OR (image_width > 0 AND image_height > 0 AND image_width <= 32000 AND image_height <= 32000))
  );

COMMENT ON COLUMN public.sublimation_studio_prints.image_width IS 'Stored image width in px (aspect ratio for gallery).';
COMMENT ON COLUMN public.sublimation_studio_prints.image_height IS 'Stored image height in px (aspect ratio for gallery).';
