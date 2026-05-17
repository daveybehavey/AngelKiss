/**
 * Fix products that were folder-imported as sublimation but are crochet (slug starts with "product").
 *
 * Usage:
 *   npm run admin:fix-crochet-categories -- --dry-run
 *   npm run admin:fix-crochet-categories -- --apply
 *
 * Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY) in .env.local
 */
import { createClient } from "@supabase/supabase-js";
import { loadEnvFile, envPath } from "./lib/load-env-file.mjs";

function shouldRecategorizeToHandmade(slug) {
  const s = String(slug).toLowerCase();
  if (!s.startsWith("product")) {
    return false;
  }
  if (s.includes("mug") || s.includes("tumbler")) {
    return false;
  }
  return true;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const dryRun = !apply;

  const env = { ...loadEnvFile(envPath()), ...process.env };
  const url = (env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  const key = (env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY || "").trim();
  if (!url || !key) {
    console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local");
    process.exit(1);
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const { data: rows, error: listErr } = await supabase
    .from("products")
    .select("id, slug, name, category, inventory_mode, stock_quantity, reserved_quantity")
    .eq("category", "custom_sublimation")
    .is("deleted_at", null);

  if (listErr) {
    console.error(listErr.message);
    process.exit(1);
  }

  const targets = (rows ?? []).filter((r) => shouldRecategorizeToHandmade(r.slug));
  console.log(
    dryRun ? `Dry run: would fix ${targets.length} product(s).` : `Applying fixes to ${targets.length} product(s).`
  );

  let ok = 0;
  let fail = 0;

  for (const p of targets) {
    const stock = p.stock_quantity;
    const reserved = p.reserved_quantity ?? 0;
    let nextStock = stock != null && Number.isFinite(stock) ? Math.max(1, Math.trunc(stock)) : 1;
    if (nextStock < reserved) {
      nextStock = reserved;
    }

    if (dryRun) {
      console.log(`  [dry-run] ${p.slug} — ${p.name} → handmade_crochet_knit, stock=${nextStock}`);
      ok++;
      continue;
    }

    try {
      const { error: delErr } = await supabase.from("custom_sublimation_products").delete().eq("product_id", p.id);
      if (delErr) {
        throw new Error(delErr.message);
      }

      const { error: updErr } = await supabase
        .from("products")
        .update({
          category: "handmade_crochet_knit",
          inventory_mode: "finite",
          stock_quantity: nextStock,
          reserved_quantity: reserved
        })
        .eq("id", p.id);

      if (updErr) {
        throw new Error(updErr.message);
      }

      const { error: insErr } = await supabase.from("handmade_products").insert({
        product_id: p.id,
        material: "Cotton yarn",
        care_instructions: null,
        lead_time_days: 7,
        personalization_available: false
      });

      if (insErr) {
        throw new Error(insErr.message);
      }

      console.log(`  OK ${p.slug}`);
      ok++;
    } catch (e) {
      console.error(`  FAIL ${p.slug}: ${e instanceof Error ? e.message : e}`);
      fail++;
    }
  }

  console.log(`\nDone. ${ok} ok, ${fail} failed.`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
