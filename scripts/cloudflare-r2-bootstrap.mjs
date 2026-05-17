#!/usr/bin/env node
/**
 * Creates an empty R2 bucket (if missing) using the Cloudflare API — one less click in the dashboard.
 *
 * Auth (never prints secrets):
 *   - CLOUDFLARE_R2_API_KEY (Bearer, optional) — used first for this script only; narrow R2 + API-token scopes, or
 *   - CLOUDFLARE_API_TOKEN (Bearer), or
 *   - CLOUDFLARE_EMAIL + one of CLOUDFLARE_GLOBAL_API_TOKEN | CLOUDFLARE_GLOBAL_API_KEY | CLOUDFLARE_API_KEY
 *     (Global API Key from My Profile → API Tokens → Global API Key — keep in .env.local only; do not commit).
 *
 * Also needs: CLOUDFLARE_ACCOUNT_ID (in .env.local or env).
 *
 * You still must do in the dashboard:
 *   - Public access on the bucket → NEXT_PUBLIC_IMAGE_CDN_BASE_URL
 *   - R2 S3 keys: run `npm run cf:r2-s3-credentials` (API) or dashboard → Manage R2 API Tokens
 *
 * Usage:
 *   npm run cf:r2-bootstrap
 *   npm run cf:r2-bootstrap -- my-bucket-name
 *   npm run cf:r2-bootstrap -- --dry-run
 */
import { mergedCloudflareEnv, pickCloudflareAuthForR2, authHeaders } from "./lib/cloudflare-api-auth.mjs";

const DEFAULT_BUCKET = "angelkiss-catalog-media";

function parseArgs(argv) {
  const dryRun = argv.includes("--dry-run");
  const positional = argv.filter((a) => !a.startsWith("--"));
  const bucket = (positional[0] || DEFAULT_BUCKET).trim().toLowerCase();
  return { dryRun, bucket: bucket || DEFAULT_BUCKET };
}

/** R2 bucket names: lowercase letters, numbers, hyphens; 3–63 chars */
function validateBucketName(name) {
  if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(name)) {
    throw new Error(
      `Invalid bucket name "${name}" — use lowercase letters, numbers, hyphens only (3–63 chars, start/end with alphanumeric).`
    );
  }
}

async function main() {
  const cwd = process.cwd();
  const auth = pickCloudflareAuthForR2(cwd);
  if (!auth) {
    console.error(
      "cf:r2-bootstrap: set CLOUDFLARE_R2_API_KEY, CLOUDFLARE_API_TOKEN, or CLOUDFLARE_EMAIL + CLOUDFLARE_GLOBAL_API_TOKEN (or CLOUDFLARE_API_KEY / CLOUDFLARE_GLOBAL_API_KEY)"
    );
    process.exit(1);
  }

  const env = mergedCloudflareEnv(cwd);
  const accountId = String(env.CLOUDFLARE_ACCOUNT_ID || "").trim();
  if (!accountId) {
    console.error(
      "cf:r2-bootstrap: set CLOUDFLARE_ACCOUNT_ID in .env.local (Cloudflare dashboard → Account ID)"
    );
    process.exit(1);
  }

  const { dryRun, bucket } = parseArgs(process.argv.slice(2));
  validateBucketName(bucket);

  console.log(`cf:r2-bootstrap: using auth (${auth.source}) — secrets are not printed`);
  console.log(`cf:r2-bootstrap: account ${accountId}, bucket "${bucket}"`);

  async function cf(method, path, body) {
    const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
      method,
      headers: {
        ...authHeaders(auth),
        ...(body ? { "Content-Type": "application/json" } : {})
      },
      body: body ? JSON.stringify(body) : undefined
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = json.errors?.map((e) => `${e.code}: ${e.message}`).join("; ") || res.statusText;
      throw new Error(`${method} ${path} → ${res.status} ${msg}`);
    }
    if (json.success === false) {
      const msg = json.errors?.map((e) => e.message).join("; ") || "success=false";
      throw new Error(`${path} → ${msg}`);
    }
    return json.result;
  }

  const list = await cf("GET", `/accounts/${accountId}/r2/buckets`);
  const existing = (Array.isArray(list) ? list : []).some((b) => b.name === bucket);
  if (existing) {
    console.log(`cf:r2-bootstrap: bucket "${bucket}" already exists — nothing to create.`);
  } else if (dryRun) {
    console.log(`cf:r2-bootstrap: [dry-run] would create bucket "${bucket}"`);
  } else {
    await cf("POST", `/accounts/${accountId}/r2/buckets`, { name: bucket });
    console.log(`cf:r2-bootstrap: created bucket "${bucket}".`);
  }

  // Cloudflare deep-link (R2 docs): `?to=/<account_id>/r2/overview` — not `/{id}/r2/buckets`.
  const dash = `https://dash.cloudflare.com/?to=/${accountId}/r2/overview`;
  console.log(`
──────── Next steps (browser) ────────

1) Open R2:  ${dash}
2) Bucket "${bucket}" → Settings → **Public access** (custom hostname or r2.dev URL).
3) Put the public base URL (no trailing slash) in .env.local:
     NEXT_PUBLIC_IMAGE_CDN_BASE_URL=https://……

4) R2 S3 keys for .env.local (pick one):
     npm run cf:r2-s3-credentials -- ${bucket}
     or dashboard → **Manage R2 API Tokens**
     R2_ACCOUNT_ID=${accountId}
     R2_BUCKET_NAME=${bucket}
     R2_ACCESS_KEY_ID=…
     R2_SECRET_ACCESS_KEY=…

5) Production: wrangler secrets + redeploy; then:
     npm run admin:sync-catalog-images-to-r2

If the API returns permission errors with the Global Key, confirm the key is current in Cloudflare → My Profile.
────────`);
}

main().catch((e) => {
  console.error("cf:r2-bootstrap:", e instanceof Error ? e.message : e);
  process.exit(1);
});
