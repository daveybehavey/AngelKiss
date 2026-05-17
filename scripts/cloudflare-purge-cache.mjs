#!/usr/bin/env node
/**
 * Purge all cached assets for the site zone (HTML edge cache, R2 CDN, /_next/image, etc.).
 *
 * Auth: same as `cf:cache-rule` — CLOUDFLARE_ZONE_API_KEY → CLOUDFLARE_TOKEN_API_KEY → CLOUDFLARE_API_TOKEN,
 * or CLOUDFLARE_EMAIL + Global API Key. Needs Zone → Cache Purge → Purge.
 *
 * Usage:
 *   npm run cf:purge-cache
 *   node scripts/cloudflare-purge-cache.mjs anglkisscreations.ca
 */
import { loadEnvFile, envPath } from "./lib/load-env-file.mjs";
import { authHeaders, pickCloudflareAuth } from "./lib/cloudflare-api-auth.mjs";

const cwd = process.cwd();
const domainArg = process.argv.slice(2).find((a) => !a.startsWith("--"));

async function main() {
  const auth = pickCloudflareAuth(cwd);
  if (!auth) {
    console.error(
      "cf:purge-cache: set CLOUDFLARE_ZONE_API_KEY, CLOUDFLARE_TOKEN_API_KEY, or CLOUDFLARE_API_TOKEN (Bearer), or CLOUDFLARE_EMAIL + Global API Key"
    );
    process.exit(1);
  }
  console.log(`cf:purge-cache: using auth (${auth.source})`);

  const envLocal = loadEnvFile(envPath(cwd));
  let zoneId = process.env.CLOUDFLARE_ZONE_ID?.trim() || envLocal.CLOUDFLARE_ZONE_ID?.trim() || "";
  let hostname = domainArg?.replace(/^https?:\/\//i, "").split("/")[0].toLowerCase() || "";

  if (!hostname) {
    const siteUrl =
      process.env.NEXT_PUBLIC_SITE_URL?.trim() || envLocal.NEXT_PUBLIC_SITE_URL?.trim() || "";
    if (siteUrl) {
      try {
        hostname = new URL(siteUrl).hostname.toLowerCase();
      } catch {
        hostname = "";
      }
    }
  }
  if (!hostname) {
    hostname = "anglkisscreations.ca";
  }

  async function cf(method, path, jsonBody) {
    const opts = {
      method,
      headers: { ...authHeaders(auth) }
    };
    if (jsonBody !== undefined) {
      opts.headers["Content-Type"] = "application/json";
      opts.body = JSON.stringify(jsonBody);
    }
    const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, opts);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = body.errors?.map((e) => e.message).join("; ") || res.statusText;
      throw new Error(`${method} ${path} → ${res.status} ${msg}`);
    }
    if (body.success === false) {
      const msg = body.errors?.map((e) => e.message).join("; ") || "success=false";
      throw new Error(`${method} ${path} → ${msg}`);
    }
    return body.result;
  }

  if (!zoneId) {
    const zones = await cf("GET", `/zones?name=${encodeURIComponent(hostname)}`);
    if (!Array.isArray(zones) || zones.length === 0) {
      console.error(`cf:purge-cache: no zone named "${hostname}". Set CLOUDFLARE_ZONE_ID.`);
      process.exit(2);
    }
    zoneId = zones[0].id;
    console.log(`cf:purge-cache: resolved zone ${zones[0].name} (${zoneId})`);
  } else {
    console.log(`cf:purge-cache: using CLOUDFLARE_ZONE_ID=${zoneId}`);
  }

  const result = await cf("POST", `/zones/${zoneId}/purge_cache`, { purge_everything: true });
  console.log(
    `cf:purge-cache: OK — purge_everything requested for ${hostname}` +
      (result?.id ? ` (id ${result.id})` : "")
  );
}

main().catch((e) => {
  console.error("cf:purge-cache:", e.message || e);
  if (String(e.message || "").includes("403") || String(e.message || "").includes("10000")) {
    console.error("\nHint: API token needs Zone → Cache Purge → Purge and Zone → Zone → Read.\n");
  }
  process.exit(1);
});
