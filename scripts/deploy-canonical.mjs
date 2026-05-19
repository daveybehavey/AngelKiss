/**
 * Production deploy with canonical hostname baked into the Next/OpenNext build.
 * Sets NEXT_PUBLIC_SITE_URL before deploy-best (overrides .env.local for this run).
 *
 * Override: CANONICAL_SITE_URL=https://example.com node scripts/deploy-canonical.mjs
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { applyProductionBuildEnv } from "./apply-production-build-env.mjs";
import { applyCloudflareAuthForWrangler } from "./cloudflare-wrangler-auth.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const root = resolve(scriptDir, "..");

const checkEnv = spawnSync(process.execPath, [resolve(scriptDir, "check-env.mjs")], {
  stdio: "inherit",
  cwd: root,
  shell: false
});
if (checkEnv.status !== 0) {
  process.exit(checkEnv.status === null ? 1 : checkEnv.status);
}

applyCloudflareAuthForWrangler();
applyProductionBuildEnv(root);

const canonical =
  process.env.CANONICAL_SITE_URL?.trim() || "https://anglkisscreations.ca";
process.env.NEXT_PUBLIC_SITE_URL = canonical;
if (!process.env.NEXT_PUBLIC_STOREFRONT_CF_IMAGE_RESIZE?.trim()) {
  process.env.NEXT_PUBLIC_STOREFRONT_CF_IMAGE_RESIZE = "1";
}
if (
  process.env.NEXT_PUBLIC_IMAGE_CDN_BASE_URL?.trim() &&
  !process.env.NEXT_PUBLIC_STOREFRONT_R2_GRID_VARIANTS?.trim()
) {
  process.env.NEXT_PUBLIC_STOREFRONT_R2_GRID_VARIANTS = "1";
}

console.log(`deploy-canonical: NEXT_PUBLIC_SITE_URL=${canonical}`);
console.log(
  `deploy-canonical: NEXT_PUBLIC_STOREFRONT_CF_IMAGE_RESIZE=${process.env.NEXT_PUBLIC_STOREFRONT_CF_IMAGE_RESIZE}`
);
if (process.env.NEXT_PUBLIC_IMAGE_CDN_BASE_URL?.trim()) {
  console.log(
    `deploy-canonical: NEXT_PUBLIC_IMAGE_CDN_BASE_URL=${process.env.NEXT_PUBLIC_IMAGE_CDN_BASE_URL}`
  );
  console.log(
    `deploy-canonical: NEXT_PUBLIC_STOREFRONT_R2_GRID_VARIANTS=${process.env.NEXT_PUBLIC_STOREFRONT_R2_GRID_VARIANTS ?? "(unset)"}`
  );
}

const syncSecrets = spawnSync(process.execPath, [resolve(scriptDir, "cloudflare-sync-worker-secrets.mjs")], {
  stdio: "inherit",
  cwd: root,
  shell: false,
  env: process.env
});
if (syncSecrets.status !== 0) {
  process.exit(syncSecrets.status === null ? 1 : syncSecrets.status);
}

const deployBest = resolve(scriptDir, "deploy-best.mjs");

const r = spawnSync(process.execPath, [deployBest], {
  stdio: "inherit",
  env: process.env,
  cwd: root,
  shell: false
});

process.exit(r.status === null ? 1 : r.status);
