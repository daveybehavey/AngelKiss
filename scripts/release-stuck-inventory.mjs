#!/usr/bin/env node
/**
 * Expire stale checkout sessions and reconcile finite product reservations.
 *
 * Usage:
 *   node scripts/release-stuck-inventory.mjs
 */
import { loadEnvFile, envPath } from "./lib/load-env-file.mjs";

const cwd = process.cwd();
for (const key of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "NEXT_PUBLIC_SUPABASE_URL"]) {
  const file = loadEnvFile(envPath(cwd));
  if (!process.env[key] && file[key]) {
    process.env[key] = file[key];
  }
}

const supabaseUrl =
  process.env.SUPABASE_URL?.trim() || process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || "";

if (!supabaseUrl || !serviceKey) {
  console.error("Set SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

async function rpc(name) {
  const res = await fetch(`${supabaseUrl}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json"
    },
    body: "{}"
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = body.message || body.error || res.statusText;
    throw new Error(`${name}: ${msg}`);
  }
  return body;
}

async function main() {
  const expired = await rpc("expire_stale_checkout_sessions");
  const reconciled = await rpc("reconcile_finite_product_reservations");
  console.log(
    `release-stuck-inventory: expired ${Array.isArray(expired) ? expired.length : 0} session(s), reconciled ${Array.isArray(reconciled) ? reconciled.length : 0} product(s).`
  );
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
