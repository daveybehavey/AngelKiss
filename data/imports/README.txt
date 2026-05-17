Bulk product import
-------------------
1. Copy products-import.example.csv to a new file (e.g. my-products.csv) and fill in your rows.
2. Add to .env.local:
   - ADMIN_SUPABASE_ACCESS_TOKEN = your JWT while logged in as admin (short-lived).
   - NEXT_PUBLIC_SITE_URL = your site origin (e.g. https://anglkisscreations.ca or http://127.0.0.1:3010).
3. Run: npm run admin:import-products -- data/imports/my-products.csv
   Dry run (no API calls): add --dry-run

Columns (header row required; names case-insensitive):
  name              — required
  slug              — optional; generated from name if empty
  category          — custom_sublimation | handmade_crochet_knit (aliases: sublimation, handmade)
  price_cad         — required (e.g. 24.99)
  track_stock       — true/false; default true for handmade, false for sublimation
  stock             — required when track_stock is true (non-negative integer)
  listing           — for sublimation only: ready_made (default) | customer_upload
  publish           — true to POST publish after create (default false; draft otherwise)
  material          — handmade only (default Cotton yarn)
  status              — draft | published (usually use publish column instead)
  short_description, long_description, is_available, default_blank_color — optional

Get ADMIN_SUPABASE_ACCESS_TOKEN: log into /admin, open DevTools → Network, trigger any admin action,
  click a request to /api/admin/..., copy the Authorization Bearer value (without "Bearer ").

Import from a folder of photos (groups by filename)
---------------------------------------------------
Default folder: pictures/unsorted

Folder import pricing (--price-cad default: auto)
  - Filename group contains "mug" → $19.99 CAD
  - Contains "tumbler" → $29.99 CAD
  - Handmade crochet (product*) → $24.99 CAD
  - Other print groups → $24.99 CAD
  - Override for every row: --price-cad 34.99

Set existing mug/tumbler print prices in the database:
  npm run admin:set-print-prices -- --dry-run
  npm run admin:set-print-prices -- --apply

Naming (examples):
  - Multi-angle: myitem-one.jpg, myitem-two.jpg, myitem-three.jpg
  - Glued number + word (also supported): product10two.jpg → same group as product10-one.jpg
  - Single image: myitem.jpg

Category (--category default: auto):
  - Filename group base starting with "product" (e.g. product02, product10) → handmade crochet/knit
  - Base containing "mug" or "tumbler" → custom sublimation (prints)
  - Override: --category custom_sublimation | handmade_crochet_knit | auto

If crochet items were imported earlier as prints (ready-made pill), fix DB once:
  npm run admin:fix-crochet-categories -- --dry-run
  npm run admin:fix-crochet-categories -- --apply

Try first:
  npm run admin:import-folder -- --dry-run
  npm run admin:import-folder -- --dry-run --dir pictures/unsorted

Create draft products + upload images (same defaults: custom sublimation, ready-made listing, $24.99 CAD):
  npm run admin:import-folder -- --dir pictures/unsorted --price-cad 29.99

Options:
  --publish              Publish each item after images upload (default: leave draft)
  --listing ready_made | customer_upload
  --category custom_sublimation | handmade_crochet_knit
  --delay-ms 120         Pause between uploads (rate limiting)

If two photos belong together but land in separate groups, align the base name (same spelling
before -one / -two). Example: mug-04-two.jpg vs mug04-one.jpg → use one pattern (e.g. mug04-…).


Studio print gallery (folder → Supabase Storage + DB)
-----------------------------------------------------
Optimizes each image with Sharp (EXIF rotate, max long edge 2048px default, WebP quality ~84,
no upscaling), uploads under studio-gallery/…, inserts sublimation_studio_prints (active, sort by filename).

Env: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY). Optional SUPABASE_PRODUCT_IMAGES_BUCKET.

  npm run admin:import-studio-prints -- --dry-run --dir "C:\Users\david\OneDrive\ANGLKISS"
  npm run admin:import-studio-prints -- --dir "C:\Users\david\OneDrive\ANGLKISS"

Options: --max-edge 2048  --quality 84  --delay-ms 80  --limit 5  --skip 0
Or set STUDIO_PRINT_IMPORT_DIR in .env.local and run without --dir.

Prefer OneDrive files fully downloaded (Files on-demand) before a large import.
