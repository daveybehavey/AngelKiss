/**
 * Apply production build-time env from .env.local (NEXT_PUBLIC_* for OpenNext).
 * Called by deploy-canonical / deploy-best before build.
 */
import { fileURLToPath } from "node:url";
import {
  applyDeployEnvToProcess,
  normalizeImageCdnBaseUrl,
  PRODUCTION_BUILD_PUBLIC_KEYS,
  loadDeployEnv
} from "./lib/load-deploy-env.mjs";

function resolvePublicPayPalClientId(env) {
  const direct = env.NEXT_PUBLIC_PAYPAL_CLIENT_ID?.trim();
  if (direct) {
    return direct;
  }
  const mode = env.PAYPAL_ENV?.trim().toLowerCase();
  if (mode === "live") {
    return env.PAYPAL_LIVE_CLIENT_ID?.trim() || env.PAYPAL_CLIENT_ID?.trim() || "";
  }
  return (
    env.PAYPAL_SANDBOX_CLIENT_ID?.trim() ||
    env.PAYPAL_CLIENT_ID?.trim() ||
    env.PAYPAL_TEST_CLIENT_ID?.trim() ||
    ""
  );
}

export function applyProductionBuildEnv(cwd = process.cwd()) {
  applyDeployEnvToProcess(cwd);

  const paypalPublic = resolvePublicPayPalClientId(loadDeployEnv(cwd));
  if (paypalPublic) {
    process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID = paypalPublic;
  }

  const cdnRaw = process.env.NEXT_PUBLIC_IMAGE_CDN_BASE_URL;
  const cdnNorm = normalizeImageCdnBaseUrl(cdnRaw);
  if (cdnNorm) {
    process.env.NEXT_PUBLIC_IMAGE_CDN_BASE_URL = cdnNorm;
  }

  const applied = [];
  for (const key of PRODUCTION_BUILD_PUBLIC_KEYS) {
    if (process.env[key]?.trim()) {
      applied.push(key);
    }
  }

  if (cdnRaw && !cdnNorm) {
    console.warn(
      "apply-production-build-env: NEXT_PUBLIC_IMAGE_CDN_BASE_URL is set but invalid — fix before deploy."
    );
  }

  return { applied, cdnNormalized: cdnNorm };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { applied, cdnNormalized } = applyProductionBuildEnv();
  console.log("apply-production-build-env:", applied.join(", ") || "(none)");
  if (cdnNormalized) {
    console.log(`  CDN host: ${new URL(cdnNormalized).host}`);
  }
}
