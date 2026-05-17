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

function normalizeCdnBase(raw) {
  const t = (raw || "").trim().replace(/\/+$/, "");
  if (!t) return null;
  const withScheme = /^https?:\/\//i.test(t) ? t : `https://${t}`;
  try {
    return new URL(withScheme).origin;
  } catch {
    return null;
  }
}

const r2Keys = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET_NAME"];
const r2Ready = r2Keys.every((k) => ok(k));
const cdnHost = normalizeCdnBase(e.NEXT_PUBLIC_IMAGE_CDN_BASE_URL);

const required = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_SITE_URL",
  "PAYPAL_ENV",
];

const service = ok("SUPABASE_SERVICE_ROLE_KEY") || ok("SUPABASE_SECRET_KEY");
const paypalSecret =
  ok("PAYPAL_CLIENT_SECRET") ||
  ok("PAYPAL_LIVE_CLIENT_SECRET") ||
  ok("PAYPAL_SANDBOX_CLIENT_SECRET") ||
  ok("PAYPAL_TEST_CLIENT_SECRET") ||
  ok("PAYPAL_CLIENTS_DEV_SECRET");
const paypalId =
  ok("PAYPAL_CLIENT_ID") ||
  ok("PAYPAL_LIVE_CLIENT_ID") ||
  ok("PAYPAL_SANDBOX_CLIENT_ID") ||
  ok("PAYPAL_TEST_CLIENT_ID") ||
  ok("PAYPAL_CLIENTS_DEV_CLIENT") ||
  ok("NEXT_PUBLIC_PAYPAL_CLIENT_ID");
const paypalPublicId = ok("NEXT_PUBLIC_PAYPAL_CLIENT_ID");

const missing = required.filter((k) => !ok(k));
if (!service) {
  missing.push("SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY");
}
if (!paypalId) {
  missing.push(
    "PayPal client id: PAYPAL_CLIENT_ID, PAYPAL_LIVE_CLIENT_ID, PAYPAL_SANDBOX_CLIENT_ID, PAYPAL_TEST_CLIENT_ID, or NEXT_PUBLIC_PAYPAL_CLIENT_ID"
  );
}
if (!paypalSecret) {
  missing.push(
    "PayPal client secret: PAYPAL_CLIENT_SECRET, PAYPAL_LIVE_CLIENT_SECRET, PAYPAL_SANDBOX_CLIENT_SECRET, or PAYPAL_TEST_CLIENT_SECRET"
  );
}
if (!paypalPublicId) {
  missing.push("NEXT_PUBLIC_PAYPAL_CLIENT_ID (browser PayPal button — same app as server for current PAYPAL_ENV)");
}

if (cdnHost && !r2Ready) {
  missing.push(
    "Catalog CDN is set (NEXT_PUBLIC_IMAGE_CDN_BASE_URL) but R2 upload vars are incomplete — set all of: " +
      r2Keys.join(", ")
  );
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

if (cdnHost && r2Ready) {
  console.log(
    "check-env: catalog media — storefront reads from CDN; admin uploads use R2 (no new Supabase Storage objects)."
  );
} else if (r2Ready && !cdnHost) {
  console.log(
    "check-env: note — R2 upload vars set but NEXT_PUBLIC_IMAGE_CDN_BASE_URL unset; storefront still uses Supabase signed URLs."
  );
}

const site = (e.NEXT_PUBLIC_SITE_URL || "").trim().toLowerCase();
if (
  (site.includes("anglkisscreations.com") || site.includes("angelkisscreations.com")) &&
  !site.includes("anglkisscreations.ca")
) {
  console.log(
    "check-env: note — NEXT_PUBLIC_SITE_URL uses .com; production deploy uses .ca via `npm run deploy:ca` (canonical URL baked in)."
  );
}

process.exit(0);
