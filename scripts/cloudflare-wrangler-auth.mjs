/**
 * Wrangler accepts Global API Key via CLOUDFLARE_API_KEY + CLOUDFLARE_EMAIL
 * (takes precedence over CLOUDFLARE_API_TOKEN when both key vars are set).
 *
 * This project also supports CLOUDFLARE_GLOBAL_API_TOKEN (or _GLOBAL_API_KEY)
 * as an alias for the Global API Key value — still requires CLOUDFLARE_EMAIL.
 *
 * When global key auth is activated, CLOUDFLARE_API_TOKEN is unset so Wrangler
 * does not send a stale limited token for route attachment.
 */
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvFile, envPath } from "./lib/load-env-file.mjs";

function stripQuotes(v) {
  if (typeof v !== "string") return "";
  let s = v.replace(/\r/g, "").replace(/\u200b/g, "").trim();
  s = s.replace(/^\uFEFF/, "");
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    s = s.slice(1, -1).trim();
  }
  return s;
}

/**
 * Merge .env.local + optional .env into process.env when unset (for CLI children).
 */
function hydrateProcessEnvFromFiles(cwd) {
  const paths = [envPath(cwd), resolve(cwd, ".env")];
  for (const p of paths) {
    const file = loadEnvFile(p);
    for (const [k, v] of Object.entries(file)) {
      if (process.env[k] === undefined || process.env[k] === "") {
        process.env[k] = v;
      }
    }
  }
}

export function applyCloudflareAuthForWrangler(cwd = process.cwd()) {
  hydrateProcessEnvFromFiles(cwd);

  const globalKey = stripQuotes(
    process.env.CLOUDFLARE_GLOBAL_API_TOKEN ||
      process.env.CLOUDFLARE_GLOBAL_API_KEY ||
      ""
  );
  const email = stripQuotes(process.env.CLOUDFLARE_EMAIL || "");

  if (!globalKey) {
    return;
  }

  if (!email) {
    console.error(
      "cloudflare-wrangler-auth: CLOUDFLARE_GLOBAL_API_TOKEN is set but CLOUDFLARE_EMAIL is missing.\n" +
        "Add CLOUDFLARE_EMAIL=your-cloudflare-login@email.com to .env.local (Global API Key requires both)."
    );
    process.exit(1);
  }

  delete process.env.CLOUDFLARE_API_TOKEN;
  process.env.CLOUDFLARE_API_KEY = globalKey;
  process.env.CLOUDFLARE_EMAIL = email;
}

// Allow: node scripts/cloudflare-wrangler-auth.mjs (no-op test / side effect for shell)
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  applyCloudflareAuthForWrangler();
}
