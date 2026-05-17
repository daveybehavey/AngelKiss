/**
 * Verify a Cloudflare API token and that the .ca zone exists in this account.
 * Reads CLOUDFLARE_API_TOKEN from process.env or .env.local (never print the token).
 *
 * Create a token: Cloudflare Dashboard → My Profile → API Tokens → Create Token
 * Suggested permissions: Zone → Zone → Read, Zone → DNS → Edit (if you automate DNS later),
 *   Account → Workers Scripts → Edit (for deploy). Tighten to the anglkisscreations.ca zone when possible.
 *
 * Usage: node scripts/cloudflare-preflight.mjs
 *    or: node scripts/cloudflare-preflight.mjs otherdomain.ca
 */
import { resolve } from "node:path";
import { loadEnvFile, envPath } from "./lib/load-env-file.mjs";

const domain = (process.argv[2] || "anglkisscreations.ca").trim().toLowerCase();

function normalizeToken(raw) {
  if (typeof raw !== "string") return "";
  let t = raw.replace(/\r/g, "").replace(/\u200b/g, "").trim();
  t = t.replace(/^["']|["']$/g, "").trim();
  // Common mistake: pasting "Bearer xxx" into .env — API expects only xxx in Authorization header.
  if (/^bearer\s+/i.test(t)) {
    t = t.replace(/^bearer\s+/i, "").trim();
  }
  return t;
}

function pickCloudflareToken(cwd) {
  const sources = [
    ["process.env", process.env.CLOUDFLARE_API_TOKEN],
    [".env.local", loadEnvFile(envPath(cwd)).CLOUDFLARE_API_TOKEN],
    [".dev.vars", loadEnvFile(resolve(cwd, ".dev.vars")).CLOUDFLARE_API_TOKEN],
    [".env", loadEnvFile(resolve(cwd, ".env")).CLOUDFLARE_API_TOKEN]
  ];
  for (const [label, raw] of sources) {
    const t = normalizeToken(raw);
    if (t) {
      return { token: t, source: label };
    }
  }
  return { token: "", source: null };
}

const cwd = process.cwd();
const { token, source } = pickCloudflareToken(cwd);

if (!token) {
  console.error(
    "cloudflare-preflight: set CLOUDFLARE_API_TOKEN in process.env, .env.local, .dev.vars, or .env"
  );
  process.exit(1);
}

console.log(`cloudflare-preflight: using token from ${source}`);

async function cf(path) {
  const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = body.errors?.map((e) => e.message).join("; ") || res.statusText;
    throw new Error(`${path} → ${res.status} ${msg}`);
  }
  if (body.success === false) {
    const msg = body.errors?.map((e) => e.message).join("; ") || "success=false";
    throw new Error(`${path} → ${msg}`);
  }
  return body.result;
}

try {
  let verifyOk = false;
  try {
    const verify = await cf("/user/tokens/verify");
    verifyOk = true;
    console.log("cloudflare-preflight: API token OK (/user/tokens/verify)");
    if (verify?.status) {
      console.log(`  status: ${verify.status}`);
    }
  } catch (verifyErr) {
    const msg = String(verifyErr.message || "");
    if (!msg.includes("401")) {
      throw verifyErr;
    }
    console.warn(
      "cloudflare-preflight: /user/tokens/verify returned 401 — probing /zones (some tokens still work here)…"
    );
  }

  const zones = await cf(`/zones?name=${encodeURIComponent(domain)}`);
  if (!verifyOk) {
    console.log("cloudflare-preflight: /zones accepted this token (verify endpoint may not apply to this token type).");
  }
  if (!Array.isArray(zones) || zones.length === 0) {
    console.warn(
      `\ncloudflare-preflight: no zone named "${domain}" in this account.\n` +
        "  Add the site in Cloudflare (Websites → Add a site), then point the registrar NS to Cloudflare.\n"
    );
    process.exit(2);
  }

  const z = zones[0];
  console.log(`\ncloudflare-preflight: zone found`);
  console.log(`  name: ${z.name}`);
  console.log(`  id:   ${z.id}`);
  console.log(`  status: ${z.status} (active = DNS is on Cloudflare)`);
  console.log("\nNext (from repo root):");
  console.log("  npm run deploy:ca");
  console.log("\nOptional: export this for other scripts:");
  console.log(`  set CLOUDFLARE_ZONE_ID=${z.id}`);
} catch (e) {
  console.error("cloudflare-preflight:", e.message || e);
  if (String(e.message || "").includes("401")) {
    console.error(
      "\nHint: use a My Profile → API Token (Bearer in Authorization), or Global API Key with CLOUDFLARE_EMAIL.\n" +
        "Check for stray quotes/spaces in .env.local. Duplicate CLOUDFLARE_API_TOKEN lines can confuse parsers."
    );
  }
  process.exit(1);
}
