#!/usr/bin/env node
/**
 * Create a single Cloudflare API token with deploy + zone + R2 permissions.
 * Uses Global API Key + CLOUDFLARE_EMAIL, or any Bearer with User → API Tokens → Edit.
 * Prints only token id/name — writes CLOUDFLARE_API_TOKEN to .env.local (never logs the secret).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { authHeaders, mergedCloudflareEnv, pickCloudflareAuth } from "./lib/cloudflare-api-auth.mjs";
import { envPath } from "./lib/load-env-file.mjs";

const cwd = process.cwd();
const env = mergedCloudflareEnv(cwd);
const KNOWN_ACCOUNT_ID = "c5699cbcedce27a6ad755bdeb815f6de";
const KNOWN_ZONE_ID = "a7fea591373f0af76b5db43dd768a3c6";

function resolveAccountId(raw) {
  const id = (raw || "").trim();
  if (/^[a-f0-9]{32}$/i.test(id) && id !== "4793d734c0b8e484dfc37ec392b5fa8a") {
    return id;
  }
  return KNOWN_ACCOUNT_ID;
}

const accountId = resolveAccountId(env.CLOUDFLARE_ACCOUNT_ID);
const zoneId = (env.CLOUDFLARE_ZONE_ID || KNOWN_ZONE_ID).trim();
const zoneName = "anglkisscreations.ca";

const WANTED_GROUPS = [
  "Workers Scripts Write",
  "Workers Scripts Read",
  "Workers Routes Write",
  "Workers Routes Read",
  "Account Settings Read",
  "Workers R2 Storage Write",
  "Workers R2 Storage Read",
  "Zone Read",
  "Zone Settings Read",
  "Cache Purge",
  "Cache Rules Write",
  "Cache Rules Read",
  "DNS Read",
  "User API Tokens Write",
  "User API Tokens Read"
];

function pickAuthForTokenAdmin() {
  const adminKeys = [
    "CLOUDFLARE_TOKEN_API_KEY",
    "CLOUDFLARE_API_TOKEN",
    "CLOUDFLARE_R2_API_KEY",
    "CLOUDFLARE_ZONE_API_KEY"
  ];
  for (const key of adminKeys) {
    const token = (env[key] || "").trim();
    if (token) {
      return { mode: "bearer", token, source: key };
    }
  }
  const email = (env.CLOUDFLARE_EMAIL || "").trim();
  const key = (env.CLOUDFLARE_GLOBAL_API_TOKEN || env.CLOUDFLARE_GLOBAL_API_KEY || env.CLOUDFLARE_API_KEY || "").trim();
  if (email && key.length > 20) {
    return { mode: "global", email, key, source: "CLOUDFLARE_EMAIL+Global_API_Key" };
  }
  return null;
}

async function cf(auth, method, path, body) {
  const opts = { method, headers: { ...authHeaders(auth) } };
  if (body !== undefined) {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, opts);
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.success === false) {
    const msg = json.errors?.map((e) => e.message).join("; ") || res.statusText;
    throw new Error(`${method} ${path} → ${res.status} ${msg}`);
  }
  return json.result;
}

function matchGroup(pg) {
  const name = pg.name || "";
  return WANTED_GROUPS.some((w) => name === w || name.includes(w.replace(" Write", "").replace(" Read", "")));
}

function upsertEnvLocal(tokenValue) {
  const path = envPath(cwd);
  let text = "";
  try {
    text = readFileSync(path, "utf8");
  } catch {
    text = "";
  }

  const lines = text.split(/\r?\n/);
  const out = [];
  const seen = new Set();
  const setKeys = {
    CLOUDFLARE_API_TOKEN: tokenValue,
    CLOUDFLARE_ACCOUNT_ID: accountId || undefined
  };
  const removePrefixes = [
    "CLOUDFLARE_ZONE_API_KEY",
    "CLOUDFLARE_TOKEN_API_KEY",
    "CLOUDFLARE_GLOBAL_API_TOKEN",
    "CLOUDFLARE_GLOBAL_API_KEY"
  ];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      out.push(line);
      continue;
    }
    const eq = line.indexOf("=");
    if (eq === -1) {
      out.push(line);
      continue;
    }
    const key = line.slice(0, eq).trim();
    if (removePrefixes.includes(key)) {
      out.push(`# ${key}=  # removed — use CLOUDFLARE_API_TOKEN (unified token)`);
      continue;
    }
    if (key in setKeys) {
      out.push(`${key}=${setKeys[key]}`);
      seen.add(key);
      continue;
    }
    out.push(line);
  }

  if (!seen.has("CLOUDFLARE_API_TOKEN")) {
    out.push("", "# Unified Cloudflare API token (deploy, purge, cache rules, R2)", `CLOUDFLARE_API_TOKEN=${tokenValue}`);
  }
  if (accountId && !seen.has("CLOUDFLARE_ACCOUNT_ID")) {
    out.push(`CLOUDFLARE_ACCOUNT_ID=${accountId}`);
  }

  writeFileSync(path, `${out.join("\n").replace(/\n{3,}/g, "\n\n")}\n`, "utf8");
}

async function main() {
  if (!accountId) {
    console.error("create-unified-cloudflare-token: set CLOUDFLARE_ACCOUNT_ID in .env.local");
    process.exit(1);
  }

  const auth = pickAuthForTokenAdmin();
  if (!auth) {
    console.error(
      "create-unified-cloudflare-token: need CLOUDFLARE_EMAIL + CLOUDFLARE_GLOBAL_API_TOKEN, or a Bearer with API Tokens Write"
    );
    process.exit(1);
  }
  console.log(`create-unified-cloudflare-token: admin auth via ${auth.source || auth.mode}`);

  const allGroups = await cf(auth, "GET", "/user/tokens/permission_groups");
  const accountNames = new Set([
    "Workers Scripts Write",
    "Workers Scripts Read",
    "Workers Routes Write",
    "Workers Routes Read",
    "Account Settings Read",
    "Workers R2 Storage Write",
    "Workers R2 Storage Read",
    "User API Tokens Write",
    "User API Tokens Read"
  ]);
  const zoneNames = new Set([
    "Zone Read",
    "Zone Settings Read",
    "Cache Purge",
    "Cache Rules",
    "Cache Rules Write",
    "Cache Rules Read",
    "DNS Read"
  ]);

  const accountGroups = [];
  const zoneGroups = [];
  for (const pg of allGroups) {
    const scopes = pg.scopes || [];
    const entry = { id: pg.id, name: pg.name };
    if (accountNames.has(pg.name)) {
      accountGroups.push(entry);
    } else if (zoneNames.has(pg.name)) {
      zoneGroups.push(entry);
    }
  }

  if (accountGroups.length < 4 || zoneGroups.length < 3) {
    console.warn("create-unified-cloudflare-token: missing groups; using fuzzy match…");
    for (const pg of allGroups) {
      const entry = { id: pg.id, name: pg.name };
      const scopes = pg.scopes || [];
      if (scopes.includes("com.cloudflare.api.account") && matchGroup(pg)) {
        if (!accountGroups.some((g) => g.id === pg.id)) accountGroups.push(entry);
      }
      if (scopes.includes("com.cloudflare.api.account.zone") && matchGroup(pg)) {
        if (!zoneGroups.some((g) => g.id === pg.id)) zoneGroups.push(entry);
      }
    }
  }

  console.log(`create-unified-cloudflare-token: account groups (${accountGroups.length}):`);
  for (const s of accountGroups) console.log(`  - ${s.name}`);
  console.log(`create-unified-cloudflare-token: zone groups (${zoneGroups.length}):`);
  for (const s of zoneGroups) console.log(`  - ${s.name}`);

  const tokenName = `AngelKiss unified ${new Date().toISOString().slice(0, 10)}`;
  const policies = [
    {
      effect: "allow",
      resources: {
        [`com.cloudflare.api.account.${accountId}`]: "*"
      },
      permission_groups: accountGroups.map(({ id, name }) => ({ id, name }))
    },
    {
      effect: "allow",
      resources: {
        [`com.cloudflare.api.account.zone.${zoneId}`]: "*"
      },
      permission_groups: zoneGroups.map(({ id, name }) => ({ id, name }))
    }
  ];

  const created = await cf(auth, "POST", "/user/tokens", {
    name: tokenName,
    policies
  });

  if (!created?.value) {
    throw new Error("Token created but no value returned — copy from dashboard");
  }

  upsertEnvLocal(created.value);
  console.log(`\ncreate-unified-cloudflare-token: OK`);
  console.log(`  name: ${created.name}`);
  console.log(`  id:   ${created.id}`);
  console.log(`  .env.local: CLOUDFLARE_API_TOKEN updated; ZONE/TOKEN zone keys commented out`);
  console.log(`  tip: comment out CLOUDFLARE_GLOBAL_API_TOKEN in .env.local so Wrangler uses the new API token`);
  console.log(`\nVerify:`);
  console.log(`  npm run cf:preflight`);
  console.log(`  npm run cf:purge-cache`);
}

main().catch((e) => {
  console.error("create-unified-cloudflare-token:", e.message || e);
  process.exit(1);
});
