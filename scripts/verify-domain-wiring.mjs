#!/usr/bin/env node
/**
 * Verify all storefront domains respond and .com / www redirect to anglkisscreations.ca.
 *
 * Usage: node scripts/verify-domain-wiring.mjs
 */
const CANONICAL = "https://anglkisscreations.ca";

const HOSTS = [
  "anglkisscreations.ca",
  "www.anglkisscreations.ca",
  "anglkisscreations.com",
  "www.anglkisscreations.com",
  "angelkisscreations.com",
  "www.angelkisscreations.com"
];

const SHOULD_REDIRECT = new Set([
  "www.anglkisscreations.ca",
  "anglkisscreations.com",
  "www.anglkisscreations.com",
  "angelkisscreations.com",
  "www.angelkisscreations.com"
]);

async function checkHost(host) {
  const url = `https://${host}/`;
  const res = await fetch(url, { redirect: "manual" });
  const location = res.headers.get("location");
  const expectRedirect = SHOULD_REDIRECT.has(host);
  const ok = expectRedirect
    ? res.status >= 301 &&
      res.status <= 308 &&
      location?.startsWith(CANONICAL)
    : res.status >= 200 &&
      res.status < 400;
  return { host, status: res.status, location, expectRedirect, ok };
}

async function main() {
  console.log(`verify-domain-wiring: canonical ${CANONICAL}\n`);
  let failed = 0;
  for (const host of HOSTS) {
    try {
      const r = await checkHost(host);
      const tag = r.ok ? "OK" : "FAIL";
      const detail = r.expectRedirect
        ? `→ ${r.location ?? "(no location)"}`
        : `serves site (${r.status})`;
      console.log(`  [${tag}] ${host} ${detail}`);
      if (!r.ok) failed++;
    } catch (e) {
      console.log(`  [FAIL] ${host} ${e instanceof Error ? e.message : e}`);
      failed++;
    }
  }
  if (failed) {
    console.log(`\n${failed} check(s) failed. Run npm run deploy:ca after DNS is active on Cloudflare.`);
    process.exit(1);
  }
  console.log("\nAll domain checks passed.");
}

main();
