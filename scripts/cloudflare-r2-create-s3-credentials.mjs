#!/usr/bin/env node
/**
 * Creates R2 S3-compatible credentials via the Cloudflare API (no dashboard copy-paste).
 *
 * Uses the same auth rules as `cf:r2-bootstrap`:
 *   - CLOUDFLARE_R2_API_KEY (Bearer, optional) — preferred when set, or
 *   - CLOUDFLARE_EMAIL + Global API Key (CLOUDFLARE_GLOBAL_API_TOKEN / CLOUDFLARE_GLOBAL_API_KEY / CLOUDFLARE_API_KEY), or
 *   - CLOUDFLARE_API_TOKEN (Bearer).
 *
 * Per Cloudflare R2 docs, after creating an API token:
 *   - R2_ACCESS_KEY_ID = token `id`
 *   - R2_SECRET_ACCESS_KEY = SHA-256 (hex) of the token secret `value` (one-time in API response)
 *
 * Account ID and bucket name are identifiers (not generated secrets). They default from env:
 *   CLOUDFLARE_ACCOUNT_ID or R2_ACCOUNT_ID, R2_BUCKET_NAME (else same default as cf:r2-bootstrap).
 *
 * Usage:
 *   npm run cf:r2-s3-credentials
 *   npm run cf:r2-s3-credentials -- my-bucket-name
 *   npm run cf:r2-s3-credentials -- --dry-run
 *   npm run cf:r2-s3-credentials -- --jurisdiction eu my-eu-bucket
 *
 * Requires permission to create API tokens (Global Key usually can; scoped tokens need "API Tokens Write").
 * If POST /accounts/{id}/tokens fails with 403, the script falls back to POST /user/tokens.
 *
 * Security: prints R2_SECRET_ACCESS_KEY once to stdout — redirect to a file or paste into .env.local; never commit.
 */
import { createHash } from "node:crypto";
import { mergedCloudflareEnv, pickCloudflareAuthForR2, authHeaders } from "./lib/cloudflare-api-auth.mjs";

const DEFAULT_BUCKET = "angelkiss-catalog-media";

function parseArgs(argv) {
  const dryRun = argv.includes("--dry-run");
  const rest = argv.filter((a) => a !== "--dry-run");
  let jurisdiction = "default";
  const positional = [];
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === "--jurisdiction" && rest[i + 1]) {
      jurisdiction = String(rest[++i]).trim().toLowerCase();
    } else if (!rest[i].startsWith("--")) {
      positional.push(rest[i]);
    }
  }
  const bucket = (positional[0] || "").trim().toLowerCase();
  return { dryRun, bucket: bucket || null, jurisdiction };
}

function validateBucketName(name) {
  if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(name)) {
    throw new Error(
      `Invalid bucket name "${name}" — use lowercase letters, numbers, hyphens only (3–63 chars, start/end with alphanumeric).`
    );
  }
}

const JURISDICTIONS = new Set(["default", "eu", "fedramp"]);

async function cfJson(auth, method, path, body) {
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
    const err = new Error(`${method} ${path} → ${res.status} ${msg}`);
    err.status = res.status;
    err.errors = json.errors;
    throw err;
  }
  if (json.success === false) {
    const msg = json.errors?.map((e) => e.message).join("; ") || "success=false";
    const err = new Error(`${path} → ${msg}`);
    err.errors = json.errors;
    throw err;
  }
  return json;
}

function r2BucketResourceKey(accountId, jurisdiction, bucketName) {
  const j = JURISDICTIONS.has(jurisdiction) ? jurisdiction : "default";
  return `com.cloudflare.edge.r2.bucket.${accountId}_${j}_${bucketName}`;
}

/** @param {any[]} groups */
function findR2BucketItemWriteGroupId(groups) {
  const want = "Workers R2 Storage Bucket Item Write";
  const g = groups.find((x) => x && typeof x.name === "string" && x.name === want);
  return g?.id || null;
}

function secretAccessKeyFromTokenValue(tokenValue) {
  return createHash("sha256").update(String(tokenValue), "utf8").digest("hex");
}

async function main() {
  const cwd = process.cwd();
  const auth = pickCloudflareAuthForR2(cwd);
  if (!auth) {
    console.error(
      "cf:r2-s3-credentials: set CLOUDFLARE_R2_API_KEY, CLOUDFLARE_API_TOKEN, or CLOUDFLARE_EMAIL + CLOUDFLARE_GLOBAL_API_TOKEN (or CLOUDFLARE_API_KEY / CLOUDFLARE_GLOBAL_API_KEY)"
    );
    process.exit(1);
  }

  const env = mergedCloudflareEnv(cwd);
  const { dryRun, bucket: bucketArg, jurisdiction } = parseArgs(process.argv.slice(2));
  if (!JURISDICTIONS.has(jurisdiction)) {
    console.error(`cf:r2-s3-credentials: invalid --jurisdiction "${jurisdiction}" (use default, eu, or fedramp)`);
    process.exit(1);
  }

  const accountId = String(
    env.CLOUDFLARE_ACCOUNT_ID || env.R2_ACCOUNT_ID || ""
  ).trim();
  if (!accountId) {
    console.error(
      "cf:r2-s3-credentials: set CLOUDFLARE_ACCOUNT_ID or R2_ACCOUNT_ID (Cloudflare dashboard → account ID)"
    );
    process.exit(1);
  }

  const bucket = (bucketArg || env.R2_BUCKET_NAME || DEFAULT_BUCKET).trim().toLowerCase();
  validateBucketName(bucket);

  console.log(`cf:r2-s3-credentials: auth ${auth.source} — Cloudflare secrets are not logged`);
  console.log(`cf:r2-s3-credentials: account ${accountId}, bucket "${bucket}", jurisdiction ${jurisdiction}`);

  if (dryRun) {
    console.log(
      `[dry-run] would list permission groups, then create API token scoped to ${r2BucketResourceKey(accountId, jurisdiction, bucket)}`
    );
    return;
  }

  const permJson = await cfJson(auth, "GET", "/user/tokens/permission_groups");
  const groups = Array.isArray(permJson.result) ? permJson.result : [];
  const permGroupId = findR2BucketItemWriteGroupId(groups);
  if (!permGroupId) {
    console.error(
      'cf:r2-s3-credentials: could not find permission group "Workers R2 Storage Bucket Item Write" in /user/tokens/permission_groups'
    );
    process.exit(1);
  }

  const resourceKey = r2BucketResourceKey(accountId, jurisdiction, bucket);
  const tokenName = `angelkiss-r2-${bucket}-${new Date().toISOString().slice(0, 10)}`;
  const body = {
    name: tokenName,
    policies: [
      {
        effect: "allow",
        resources: {
          [resourceKey]: "*"
        },
        permission_groups: [{ id: permGroupId }]
      }
    ]
  };

  let created;
  try {
    const acc = await cfJson(auth, "POST", `/accounts/${accountId}/tokens`, body);
    created = acc.result;
  } catch (e) {
    if (e && typeof e === "object" && e.status === 403) {
      console.log("cf:r2-s3-credentials: account token create forbidden — trying user token …");
      const user = await cfJson(auth, "POST", "/user/tokens", body);
      created = user.result;
    } else {
      throw e;
    }
  }

  const tokenId = created?.id;
  const tokenValue = created?.value;
  if (!tokenId || !tokenValue) {
    console.error("cf:r2-s3-credentials: API response missing token id or value — cannot derive S3 keys");
    process.exit(1);
  }

  const r2Secret = secretAccessKeyFromTokenValue(tokenValue);

  console.log(`
──────── Paste into .env.local (secret shown once) ────────

R2_ACCOUNT_ID=${accountId}
R2_BUCKET_NAME=${bucket}
R2_ACCESS_KEY_ID=${tokenId}
R2_SECRET_ACCESS_KEY=${r2Secret}

Cloudflare API token name: ${tokenName}
Revoke in: https://dash.cloudflare.com/?to=/${accountId}/r2/api-tokens
Do not commit this output.
────────`);
}

main().catch((e) => {
  console.error("cf:r2-s3-credentials:", e instanceof Error ? e.message : e);
  process.exit(1);
});
