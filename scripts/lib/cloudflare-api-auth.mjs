/**
 * Cloudflare v4 API auth: Bearer API token OR Global API Key + email (same rules as Wrangler).
 * Never log secret values.
 */
import { resolve } from "node:path";
import { loadEnvFile, envPath } from "./load-env-file.mjs";

export function normalizeToken(raw) {
  if (typeof raw !== "string") return "";
  let t = raw.replace(/\r/g, "").replace(/\u200b/g, "").trim();
  t = t.replace(/^["']|["']$/g, "").trim();
  if (/^bearer\s+/i.test(t)) {
    t = t.replace(/^bearer\s+/i, "").trim();
  }
  return t;
}

/** Merge file env so .env.local is visible when vars are only in the file. */
export function mergedCloudflareEnv(cwd) {
  const out = { ...process.env };
  for (const p of [envPath(cwd), resolve(cwd, ".dev.vars"), resolve(cwd, ".env")]) {
    const file = loadEnvFile(p);
    for (const [k, v] of Object.entries(file)) {
      if (out[k] === undefined || out[k] === "") {
        out[k] = v;
      }
    }
  }
  return out;
}

/**
 * First non-empty env wins (each value is a **Bearer API token**, not the account Global API Key).
 * @param {Record<string, string | undefined>} env
 * @param {string[]} keys
 * @returns {{ token: string, source: string } | null}
 */
function firstBearerFromEnvKeys(env, keys) {
  for (const key of keys) {
    const token = normalizeToken(env[key] || "");
    if (token) {
      return { token, source: key };
    }
  }
  return null;
}

/**
 * Bearer tokens (in order): zone-scoped key → account/token-management key → default deploy token.
 * Then Global API Key + email (Wrangler-style `.env.local`).
 * @returns {{ mode: "bearer", token: string, source: string } | { mode: "global", key: string, email: string, source: string } | null}
 */
export function pickCloudflareAuth(cwd) {
  const env = mergedCloudflareEnv(cwd);
  const bearer = firstBearerFromEnvKeys(env, [
    "CLOUDFLARE_ZONE_API_KEY",
    "CLOUDFLARE_TOKEN_API_KEY",
    "CLOUDFLARE_API_TOKEN"
  ]);
  if (bearer) {
    return { mode: "bearer", token: bearer.token, source: bearer.source };
  }
  const globalKey = normalizeToken(
    env.CLOUDFLARE_GLOBAL_API_TOKEN ||
      env.CLOUDFLARE_GLOBAL_API_KEY ||
      env.CLOUDFLARE_API_KEY ||
      ""
  );
  const email = normalizeToken(env.CLOUDFLARE_EMAIL || "");
  if (globalKey && email) {
    return { mode: "global", key: globalKey, email, source: "CLOUDFLARE_EMAIL+Global_API_Key" };
  }
  return null;
}

/**
 * Auth for R2 REST helpers (`cf:r2-bootstrap`, `cf:r2-s3-credentials`).
 * When `CLOUDFLARE_R2_API_KEY` is set, it is used as a Bearer token and wins over
 * Global+email / `CLOUDFLARE_API_TOKEN` so you can keep a narrow-scoped token for R2 only.
 */
export function pickCloudflareAuthForR2(cwd) {
  const env = mergedCloudflareEnv(cwd);
  const r2 = normalizeToken(env.CLOUDFLARE_R2_API_KEY || "");
  if (r2) {
    return { mode: "bearer", token: r2, source: "CLOUDFLARE_R2_API_KEY" };
  }
  return pickCloudflareAuth(cwd);
}

export function authHeaders(auth) {
  if (auth.mode === "bearer") {
    return { Authorization: `Bearer ${auth.token}` };
  }
  return { "X-Auth-Email": auth.email, "X-Auth-Key": auth.key };
}
