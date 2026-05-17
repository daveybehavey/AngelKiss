/**
 * Set CAD prices for print listings: mug* slugs → $19.99, tumbler* → $29.99 (custom_sublimation only).
 *
 *   npm run admin:set-print-prices -- --dry-run
 *   npm run admin:set-print-prices -- --apply
 *
 * Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY)
 */
import { createClient } from "@supabase/supabase-js";
import { loadEnvFile, envPath } from "./lib/load-env-file.mjs";

const MUG_CENTS = 1999;
const TUMBLER_CENTS = 2999;

function priceForSlug(slug) {
  const s = String(slug).toLowerCase();
  if (s.includes("tumbler")) {
    return TUMBLER_CENTS;
  }
  if (s.includes("mug")) {
    return MUG_CENTS;
  }
  return null;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const env = { ...loadEnvFile(envPath()), ...process.env };
  const url = (env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  const key = (env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY || "").trim();
  if (!url || !key) {
    console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local");
    process.exit(1);
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const { data: rows, error } = await supabase
    .from("products")
    .select("id, slug, name, base_price_cents, category")
    .eq("category", "custom_sublimation")
    .is("deleted_at", null);

  if (error) {
    console.error(error.message);
    process.exit(1);
  }

  const targets = (rows ?? []).filter((r) => priceForSlug(r.slug) != null);
  console.log(apply ? `Applying ${targets.length} price update(s).` : `Dry run: ${targets.length} row(s).`);

  let ok = 0;
  let fail = 0;

  for (const row of targets) {
    const next = priceForSlug(row.slug);
    if (next === row.base_price_cents) {
      console.log(`  skip ${row.slug} (already ${(next / 100).toFixed(2)} CAD)`);
      ok++;
      continue;
    }

    if (!apply) {
      console.log(
        `  [dry-run] ${row.slug} "${row.name}" ${(row.base_price_cents / 100).toFixed(2)} → ${(next / 100).toFixed(2)} CAD`
      );
      ok++;
      continue;
    }

    const { error: upErr } = await supabase
      .from("products")
      .update({ base_price_cents: next })
      .eq("id", row.id);

    if (upErr) {
      console.error(`  FAIL ${row.slug}: ${upErr.message}`);
      fail++;
    } else {
      console.log(`  OK ${row.slug} → ${(next / 100).toFixed(2)} CAD`);
      ok++;
    }
  }

  console.log(`\nDone. ${ok} ok, ${fail} failed.`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
