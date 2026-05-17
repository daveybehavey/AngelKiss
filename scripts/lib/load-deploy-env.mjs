/**
 * Merge .env.local (and .env) into process.env for deploy / wrangler CLI.
 * Never logs secret values.
 */
import { resolve } from "node:path";
import { loadEnvFile, envPath } from "./load-env-file.mjs";

export function loadDeployEnv(cwd = process.cwd()) {
  const fromFile = {};
  for (const p of [envPath(cwd), resolve(cwd, ".env")]) {
    Object.assign(fromFile, loadEnvFile(p));
  }
  // .env.local wins over inherited shell env (avoids stale CLOUDFLARE_ACCOUNT_ID / tokens).
  return { ...process.env, ...fromFile };
}

export function applyDeployEnvToProcess(cwd = process.cwd()) {
  const merged = loadDeployEnv(cwd);
  for (const [k, v] of Object.entries(merged)) {
    if (v !== undefined && v !== "") {
      process.env[k] = v;
    }
  }
}

export function normalizeImageCdnBaseUrl(raw) {
  const t = typeof raw === "string" ? raw.trim() : "";
  if (!t) return null;
  const noTrail = t.replace(/\/+$/, "");
  const withScheme = /^https?:\/\//i.test(noTrail) ? noTrail : `https://${noTrail}`;
  try {
    const u = new URL(withScheme);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    const path = u.pathname.replace(/\/+$/, "") || "";
    return path ? `${u.origin}${path}` : u.origin;
  } catch {
    return null;
  }
}

/** Keys pushed to the Worker with `wrangler secret put` (server-only). */
export const WORKER_SECRET_KEYS = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_SECRET_KEY",
  "PAYPAL_ENV",
  "PAYPAL_CLIENT_ID",
  "PAYPAL_CLIENT_SECRET",
  "PAYPAL_LIVE_CLIENT_ID",
  "PAYPAL_LIVE_CLIENT_SECRET",
  "PAYPAL_WEBHOOK_ID",
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET_NAME"
];

/** Baked into the OpenNext / Next production build (public). */
export const PRODUCTION_BUILD_PUBLIC_KEYS = [
  "NEXT_PUBLIC_IMAGE_CDN_BASE_URL",
  "NEXT_PUBLIC_PAYPAL_CLIENT_ID"
];
