-- Align DB with storefront: any custom photo product also offers the studio print gallery.
-- Only touch rows whose product still exists (BEFORE UPDATE trigger asserts product_id).
UPDATE public.custom_sublimation_products c
SET allow_gallery_selection = true
FROM public.products p
WHERE c.product_id = p.id
  AND p.deleted_at IS NULL
  AND c.allow_image_upload = true
  AND c.allow_gallery_selection = false;

COMMENT ON COLUMN public.custom_sublimation_products.allow_gallery_selection IS
  'When true, shoppers may pick an active studio print. Custom photo products (allow_image_upload) always offer the gallery in the app; this column is set true on insert/update for those rows.';
