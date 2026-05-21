/**
 * Next.js requires `export const revalidate = <number literal>` in each page — it cannot import
 * from `storefront-data-cache.ts`. This script fails the build if those literals drift from
 * the same rules as `readStorefrontRevalidateSeconds()` in `lib/server/storefront-data-cache.ts`.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvFile, envPath } from "./lib/load-env-file.mjs";

/** @param {string} cwd */
function readStorefrontRevalidateSecondsFromEnv(cwd) {
  const file = loadEnvFile(envPath(cwd));
  const raw = (
    process.env.STOREFRONT_DATA_REVALIDATE_SEC ??
    file.STOREFRONT_DATA_REVALIDATE_SEC ??
    ""
  ).trim();
  if (!raw) {
    return 1800;
  }
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) {
    return 1800;
  }
  return Math.min(86400, Math.max(60, n));
}

/** @param {string} filePath */
function extractRevalidateLiteral(filePath) {
  const text = readFileSync(filePath, "utf8");
  const m = text.match(/export\s+const\s+revalidate\s*=\s*(\d+)\s*;/);
  return m ? Number.parseInt(m[1], 10) : null;
}

const cwd = process.cwd();
const expected = readStorefrontRevalidateSecondsFromEnv(cwd);
const routes = [
  resolve(cwd, "app", "page.tsx"),
  resolve(cwd, "app", "gallery", "page.tsx"),
  resolve(cwd, "app", "shop", "page.tsx"),
  resolve(cwd, "app", "shop", "[slug]", "page.tsx")
];

let ok = true;
for (const p of routes) {
  if (!existsSync(p)) {
    console.error(`check-route-revalidate: missing ${p}`);
    ok = false;
    continue;
  }
  const found = extractRevalidateLiteral(p);
  if (found === null) {
    console.error(`check-route-revalidate: no "export const revalidate = <digits>;" in ${p}`);
    ok = false;
    continue;
  }
  if (found !== expected) {
    console.error(
      `check-route-revalidate: ${p} has revalidate=${found} but STOREFRONT_DATA_REVALIDATE_SEC resolves to ${expected} (see lib/server/storefront-data-cache.ts). Update the literal or env.`
    );
    ok = false;
  }
}

if (!ok) {
  process.exit(1);
}
console.log(
  `check-route-revalidate: OK — storefront route revalidate literals match ${expected}s (STOREFRONT_DATA_REVALIDATE_SEC).`
);
