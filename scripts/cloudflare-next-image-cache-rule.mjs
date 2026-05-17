/**
 * Ensures a zone Cache Rule caches GET `/_next/image` responses at the edge.
 * This improves repeat-view image latency and reduces origin variability.
 *
 * Edge TTL: 7 days (override origin)
 * Browser TTL: respect origin headers
 *
 * Auth and zone discovery follow the same conventions as `cloudflare-storefront-cache-rule.mjs`.
 *
 * Usage:
 *   npm run cf:cache-rule:image
 *   npm run cf:cache-rule:image -- --dry-run
 *   npm run cf:cache-rule:image -- --remove
 *   node scripts/cloudflare-next-image-cache-rule.mjs anglkisscreations.ca
 */
import { loadEnvFile, envPath } from "./lib/load-env-file.mjs";
import { authHeaders, pickCloudflareAuth } from "./lib/cloudflare-api-auth.mjs";

const RULE_DESCRIPTION = "AngelKiss: next/image edge cache (GET /_next/image, 7d edge TTL)";

function imageCacheExpression() {
  return '(http.request.method eq "GET") and (http.request.uri.path eq "/_next/image")';
}

function buildRule() {
  return {
    description: RULE_DESCRIPTION,
    expression: imageCacheExpression(),
    action: "set_cache_settings",
    enabled: true,
    action_parameters: {
      cache: true,
      edge_ttl: { mode: "override_origin", default: 604800 },
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
  console.log("\nFilter expression:\n  " + imageCacheExpression());
  console.log("\nAction: set_cache_settings — cache=true, edge_ttl override_origin=604800 (7d), browser_ttl=respect_origin\n");
  process.exit(0);
}

async function main() {
  const auth = pickCloudflareAuth(cwd);
  if (!auth) {
    console.error(
      "cf:cache-rule:image: set CLOUDFLARE_ZONE_API_KEY, CLOUDFLARE_TOKEN_API_KEY, or CLOUDFLARE_API_TOKEN (Bearer), or CLOUDFLARE_EMAIL + Global API Key"
    );
    process.exit(1);
  }
  console.log(`cf:cache-rule:image: using auth (${auth.source})`);

  const envLocal = loadEnvFile(envPath(cwd));
  const zoneIdRaw = process.env.CLOUDFLARE_ZONE_ID?.trim() || envLocal.CLOUDFLARE_ZONE_ID?.trim();
  let zoneId = zoneIdRaw || "";
  let hostname = "";

  if (!zoneId) {
    if (domainArg) {
      hostname = domainArg.replace(/^https?:\/\//i, "").split("/")[0].toLowerCase();
    }
    if (!hostname) {
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim() || envLocal.NEXT_PUBLIC_SITE_URL?.trim() || "";
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
    const opts = { method, headers: { ...authHeaders(auth) } };
    if (jsonBody !== undefined) {
      opts.headers["Content-Type"] = "application/json";
      opts.body = JSON.stringify(jsonBody);
    }
    const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, opts);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = body.errors?.map((e) => e.message).join("; ") || res.statusText;
      throw new Error(`${method} ${path} -> ${res.status} ${msg}`);
    }
    if (body.success === false) {
      const msg = body.errors?.map((e) => e.message).join("; ") || "success=false";
      throw new Error(`${method} ${path} -> ${msg}`);
    }
    return body.result;
  }

  if (!zoneId) {
    const zones = await cf("GET", `/zones?name=${encodeURIComponent(hostname)}`);
    if (!Array.isArray(zones) || zones.length === 0) {
      console.error(`cf:cache-rule:image: no zone named "${hostname}". Set CLOUDFLARE_ZONE_ID or NEXT_PUBLIC_SITE_URL.`);
      process.exit(2);
    }
    zoneId = zones[0].id;
    console.log(`cf:cache-rule:image: resolved zone ${zones[0].name} (${zoneId})`);
  } else {
    console.log(`cf:cache-rule:image: using CLOUDFLARE_ZONE_ID=${zoneId}`);
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
      console.log("cf:cache-rule:image: no http_request_cache_settings ruleset — nothing to remove.");
      process.exit(0);
    }
    console.log("cf:cache-rule:image: creating zone ruleset (first Cache Rule in this zone)...");
    await cf("POST", `/zones/${zoneId}/rulesets`, {
      name: "Storefront cache (zone)",
      kind: "zone",
      phase: "http_request_cache_settings",
      rules: [buildRule()]
    });
    console.log("cf:cache-rule:image: OK — created ruleset with next/image rule.");
    process.exit(0);
  }

  const rulesIn = Array.isArray(entry.rules) ? entry.rules : [];
  const filtered = rulesIn.filter((r) => (r.description || "") !== RULE_DESCRIPTION);
  const removedCount = rulesIn.length - filtered.length;

  if (removeOnly) {
    if (removedCount === 0) {
      console.log("cf:cache-rule:image: rule not present — nothing to remove.");
      process.exit(0);
    }
    await cf("PUT", `/zones/${zoneId}/rulesets/${entry.id}`, {
      rules: filtered.map(sanitizeRuleForWrite)
    });
    console.log(`cf:cache-rule:image: OK — removed ${removedCount} matching rule(s).`);
    process.exit(0);
  }

  const newRules = [buildRule(), ...filtered.map(sanitizeRuleForWrite)];
  await cf("PUT", `/zones/${zoneId}/rulesets/${entry.id}`, { rules: newRules });
  if (removedCount > 0) {
    console.log(`cf:cache-rule:image: OK — replaced previous rule; ${newRules.length} rule(s) total.`);
  } else {
    console.log(`cf:cache-rule:image: OK — inserted next/image rule at top; ${newRules.length} rule(s) total.`);
  }
}

main().catch((e) => {
  console.error("cf:cache-rule:image:", e.message || e);
  process.exit(1);
});
