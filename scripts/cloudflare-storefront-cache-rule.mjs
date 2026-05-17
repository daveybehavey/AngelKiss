/**
 * Ensures a zone Cache Rule marks GET / and /shop* as cache-eligible at the edge,
 * with edge TTL "respect origin" so Next.js ISR Cache-Control (s-maxage) drives TTL.
 * Does not touch /admin, /api, /checkout, /cart, etc.
 *
 * Auth: Bearer tokens (first set wins): **CLOUDFLARE_ZONE_API_KEY** → **CLOUDFLARE_TOKEN_API_KEY** →
 * **CLOUDFLARE_API_TOKEN**. Or Global API Key: CLOUDFLARE_EMAIL + CLOUDFLARE_GLOBAL_API_TOKEN /
 * CLOUDFLARE_GLOBAL_API_KEY / CLOUDFLARE_API_KEY. Needs Zone → Cache Rules → Edit and Zone Read.
 * Needs Zone → Cache Rules → Edit (and Zone Read) on the target zone.
 * Zone: CLOUDFLARE_ZONE_ID, or hostname: first CLI arg (overrides NEXT_PUBLIC_SITE_URL), else site URL host, else anglkisscreations.ca.
 *
 * Usage:
 *   npm run cf:cache-rule
 *   npm run cf:cache-rule -- --dry-run   (prints expression; no token required)
 *   npm run cf:cache-rule -- --remove   (drops only this repo's rule by description)
 *   node scripts/cloudflare-storefront-cache-rule.mjs otherdomain.ca
 */
import { loadEnvFile, envPath } from "./lib/load-env-file.mjs";
import { authHeaders, pickCloudflareAuth } from "./lib/cloudflare-api-auth.mjs";

const RULE_DESCRIPTION =
  "AngelKiss: storefront HTML cache (GET / + /shop; respects origin Cache-Control)";

function storefrontCacheExpression() {
  return (
    '(http.request.method eq "GET") and ' +
    '((http.request.uri.path eq "/") or ' +
    '(http.request.uri.path eq "/shop") or ' +
    '(starts_with(http.request.uri.path, "/shop/")))'
  );
}

function buildRule() {
  return {
    description: RULE_DESCRIPTION,
    expression: storefrontCacheExpression(),
    action: "set_cache_settings",
    enabled: true,
    action_parameters: {
      cache: true,
      edge_ttl: { mode: "respect_origin" },
      browser_ttl: { mode: "respect_origin" }
    }
  };
}

function sanitizeRuleForWrite(r) {
  const out = {
    expression: r.expression,
    description: r.description ?? "",
    action: r.action,
    enabled: r.enabled !== false,
    action_parameters: r.action_parameters ?? {}
  };
  if (r.id) {
    out.id = r.id;
  }
  if (r.logging && typeof r.logging === "object") {
    out.logging = r.logging;
  }
  return out;
}

const cwd = process.cwd();
const argv = process.argv.slice(2);
const dryRun = argv.includes("--dry-run");
const removeOnly = argv.includes("--remove");
const domainArg = argv.find((a) => !a.startsWith("--"));

if (dryRun) {
  console.log(RULE_DESCRIPTION);
  console.log("\nFilter expression:\n  " + storefrontCacheExpression());
  console.log(
    "\nAction: set_cache_settings — cache=true, edge_ttl/browser_ttl mode=respect_origin\n" +
      "(Cloudflare follows your origin Cache-Control / s-maxage from Next.js ISR.)\n"
  );
  console.log(
    "Paths matched: GET /, GET /shop, GET /shop/* only — not /admin, /api, /checkout, /cart, …\n"
  );
  console.log("Run without --dry-run (with CLOUDFLARE_API_TOKEN or CLOUDFLARE_EMAIL + global key) to apply via API.");
  process.exit(0);
}

async function main() {
  const auth = pickCloudflareAuth(cwd);
  if (!auth) {
    console.error(
      "cf:cache-rule: set CLOUDFLARE_ZONE_API_KEY, CLOUDFLARE_TOKEN_API_KEY, or CLOUDFLARE_API_TOKEN (Bearer), or CLOUDFLARE_EMAIL + Global API Key"
    );
    process.exit(1);
  }
  console.log(`cf:cache-rule: using auth (${auth.source})`);

  const envLocal = loadEnvFile(envPath(cwd));
  const zoneIdRaw = process.env.CLOUDFLARE_ZONE_ID?.trim() || envLocal.CLOUDFLARE_ZONE_ID?.trim();
  let zoneId = zoneIdRaw || "";
  let hostname = "";

  if (!zoneId) {
    if (domainArg) {
      hostname = domainArg.replace(/^https?:\/\//i, "").split("/")[0].toLowerCase();
    }
    if (!hostname) {
      const siteUrl =
        process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
        envLocal.NEXT_PUBLIC_SITE_URL?.trim() ||
        "";
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
      console.error(`cf:cache-rule: no zone named "${hostname}". Set CLOUDFLARE_ZONE_ID or NEXT_PUBLIC_SITE_URL.`);
      process.exit(2);
    }
    zoneId = zones[0].id;
    console.log(`cf:cache-rule: resolved zone ${zones[0].name} (${zoneId})`);
  } else {
    console.log(`cf:cache-rule: using CLOUDFLARE_ZONE_ID=${zoneId}`);
  }

  const entryPath = `/zones/${zoneId}/rulesets/phases/http_request_cache_settings/entrypoint`;
  let entry;
  try {
    entry = await cf("GET", entryPath);
  } catch (e) {
    if (String(e.message).includes("404")) {
      entry = null;
    } else {
      throw e;
    }
  }

  if (!entry) {
    if (removeOnly) {
      console.log("cf:cache-rule: no http_request_cache_settings ruleset — nothing to remove.");
      process.exit(0);
    }
    console.log("cf:cache-rule: creating zone ruleset (first Cache Rule in this zone)…");
    await cf("POST", `/zones/${zoneId}/rulesets`, {
      name: "Storefront cache (zone)",
      kind: "zone",
      phase: "http_request_cache_settings",
      rules: [buildRule()]
    });
    console.log("cf:cache-rule: OK — created ruleset with storefront rule.");
    process.exit(0);
  }

  const rulesIn = Array.isArray(entry.rules) ? entry.rules : [];
  const filtered = rulesIn.filter((r) => (r.description || "") !== RULE_DESCRIPTION);
  const removedCount = rulesIn.length - filtered.length;

  if (removeOnly) {
    if (removedCount === 0) {
      console.log("cf:cache-rule: rule not present — nothing to remove.");
      process.exit(0);
    }
    const newRules = filtered.map(sanitizeRuleForWrite);
    await cf("PUT", `/zones/${zoneId}/rulesets/${entry.id}`, { rules: newRules });
    console.log(`cf:cache-rule: OK — removed ${removedCount} matching rule(s).`);
    process.exit(0);
  }

  const newRule = buildRule();
  const newRules = [newRule, ...filtered.map(sanitizeRuleForWrite)];

  await cf("PUT", `/zones/${zoneId}/rulesets/${entry.id}`, { rules: newRules });
  if (removedCount > 0) {
    console.log(`cf:cache-rule: OK — replaced previous AngelKiss storefront rule; ${newRules.length} rule(s) total.`);
  } else {
    console.log(`cf:cache-rule: OK — inserted storefront rule at top; ${newRules.length} rule(s) total.`);
  }
}

main().catch((e) => {
  console.error("cf:cache-rule:", e.message || e);
  if (String(e.message || "").includes("403") || String(e.message || "").includes("10000")) {
    console.error(
      "\nHint: create an API token with Zone → Cache Rules → Edit and Zone → Zone → Read.\n"
    );
  }
  process.exit(1);
});
