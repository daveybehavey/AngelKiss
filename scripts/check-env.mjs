import { existsSync } from "node:fs";
import { envPath, loadEnvFile } from "./lib/load-env-file.mjs";

const path = envPath();
if (!existsSync(path)) {
  console.error("check-env: no .env.local — run: npm run bootstrap-env");
  process.exit(1);
}

const e = loadEnvFile(path);

function ok(name) {
  const v = e[name];
  return typeof v === "string" && v.trim().length > 0;
}

const required = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_SITE_URL",
  "NEXT_PUBLIC_PAYPAL_CLIENT_ID",
  "PAYPAL_ENV",
];

const service = ok("SUPABASE_SERVICE_ROLE_KEY") || ok("SUPABASE_SECRET_KEY");
const paypalSecret = ok("PAYPAL_CLIENT_SECRET") || ok("PAYPAL_TEST_CLIENT_SECRET");
const paypalId =
  ok("PAYPAL_CLIENT_ID") || ok("PAYPAL_TEST_CLIENT_ID") || ok("NEXT_PUBLIC_PAYPAL_CLIENT_ID");

const missing = required.filter((k) => !ok(k));
if (!service) {
  missing.push("SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY");
}
if (!paypalId) {
  missing.push("PAYPAL_CLIENT_ID (or PAYPAL_TEST_CLIENT_ID / NEXT_PUBLIC_PAYPAL_CLIENT_ID)");
}
if (!paypalSecret) {
  missing.push("PAYPAL_CLIENT_SECRET (or PAYPAL_TEST_CLIENT_SECRET for sandbox)");
}

if (missing.length) {
  console.error("check-env: missing or empty:");
  for (const m of missing) {
    console.error(`  - ${m}`);
  }
  process.exit(1);
}

console.log("check-env: required variables look present.");

const optionalHints = [];
if (!ok("PAYPAL_WEBHOOK_ID")) {
  optionalHints.push("PAYPAL_WEBHOOK_ID unset — set in production for verified PayPal webhooks.");
}
if (!ok("SUPABASE_DB_PASSWORD")) {
  optionalHints.push("SUPABASE_DB_PASSWORD unset — needed only for npm run db:push (remote migrations).");
}
if (!ok("NEXT_PUBLIC_CLOUDFLARE_WEB_ANALYTICS_TOKEN")) {
  optionalHints.push(
    "NEXT_PUBLIC_CLOUDFLARE_WEB_ANALYTICS_TOKEN unset — Cloudflare Web Analytics disabled (optional)."
  );
}

for (const h of optionalHints) {
  console.log(`check-env: note — ${h}`);
}

process.exit(0);
