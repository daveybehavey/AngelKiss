#!/usr/bin/env node
/**
 * Push server-only secrets from .env.local to the Cloudflare Worker (Wrangler).
 * Does not print secret values.
 *
 * Usage:
 *   npm run cf:sync-secrets
 *   npm run cf:sync-secrets -- --dry-run
 */
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { platform } from "node:os";
import { applyCloudflareAuthForWrangler } from "./cloudflare-wrangler-auth.mjs";
import {
  applyDeployEnvToProcess,
  WORKER_SECRET_KEYS
} from "./lib/load-deploy-env.mjs";

const dryRun = process.argv.includes("--dry-run");

function wranglerArgv(subcommandArgs) {
  try {
    const require = createRequire(import.meta.url);
    const bin = require.resolve("wrangler/bin/wrangler.js");
    return [bin, ...subcommandArgs];
  } catch {
    return ["wrangler", ...subcommandArgs];
  }
}

function putSecret(name, value) {
  if (dryRun) {
    console.log(`cf:sync-secrets: [dry-run] would wrangler secret put ${name}`);
    return { ok: true };
  }
  const argv = wranglerArgv(["secret", "put", name]);
  const result = spawnSync(process.execPath, argv, {
    input: value,
    stdio: ["pipe", "inherit", "inherit"],
    shell: false,
    cwd: process.cwd(),
    env: {
      ...process.env,
      WRANGLER_SEND_METRICS: "false"
    }
  });
  if (result.status !== 0) {
    return { ok: false, error: result.error?.message || `exit ${result.status}` };
  }
  return { ok: true };
}

function main() {
  console.log("cf:sync-secrets: loading .env.local…");
  applyDeployEnvToProcess();
  applyCloudflareAuthForWrangler();

  const account = process.env.R2_ACCOUNT_ID?.trim() || process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
  if (account) {
    process.env.CLOUDFLARE_ACCOUNT_ID = account;
  }

  console.log("cf:sync-secrets: syncing Worker secrets from .env.local (values not printed)");
  if (account) {
    console.log(`cf:sync-secrets: account ${account}`);
  }

  let ok = 0;
  let skipped = 0;
  const failed = [];

  for (const key of WORKER_SECRET_KEYS) {
    const value = process.env[key]?.trim();
    if (!value) {
      console.log(`cf:sync-secrets: skip ${key} (unset)`);
      skipped++;
      continue;
    }
    const result = putSecret(key, value);
    if (result.ok) {
      console.log(`cf:sync-secrets: ${key} OK`);
      ok++;
    } else {
      console.error(`cf:sync-secrets: ${key} failed — ${result.error ?? "unknown"}`);
      failed.push(key);
    }
  }

  if (failed.length) {
    console.error(
      "cf:sync-secrets: fix auth (CLOUDFLARE_EMAIL + Global API key or CLOUDFLARE_API_TOKEN) and retry."
    );
    process.exit(1);
  }

  console.log(`cf:sync-secrets: done — updated ${ok}, skipped ${skipped}`);
}

main();
