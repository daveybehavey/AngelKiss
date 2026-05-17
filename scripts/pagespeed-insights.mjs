#!/usr/bin/env node
/**
 * PageSpeed Insights API (Lighthouse engine in the cloud).
 * No local Chrome — useful when `npm run lighthouse` fails on Windows (profile cleanup EBUSY).
 *
 * Env:
 *   LIGHTHOUSE_URL      — page to audit (default: https://anglkisscreations.ca/)
 *   PAGESPEED_STRATEGY  — MOBILE | DESKTOP (default: DESKTOP)
 *   PAGESPEED_API_KEY   — optional; improves quota
 */
const url = (
  process.env.LIGHTHOUSE_URL?.trim() || "https://anglkisscreations.ca/"
).replace(/\/+$/, "");
const strategy = (process.env.PAGESPEED_STRATEGY?.trim().toUpperCase() || "DESKTOP") === "MOBILE"
  ? "MOBILE"
  : "DESKTOP";
const key = process.env.PAGESPEED_API_KEY?.trim();

let apiUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&strategy=${strategy}`;
for (const c of ["PERFORMANCE", "ACCESSIBILITY", "BEST_PRACTICES", "SEO"]) {
  apiUrl += `&category=${encodeURIComponent(c)}`;
}
if (key) {
  apiUrl += `&key=${encodeURIComponent(key)}`;
}

const res = await fetch(apiUrl);
if (!res.ok) {
  const body = await res.text();
  console.error(`PageSpeed Insights HTTP ${res.status}\n${body.slice(0, 800)}`);
  process.exit(1);
}

/** @type {{ lighthouseResult?: { categories?: Record<string, { score: number | null }> }} } */
const body = await res.json();
const cats = body.lighthouseResult?.categories;
if (!cats) {
  console.error("Unexpected PSI response shape (no lighthouseResult.categories).");
  process.exit(1);
}

/** @param {string} id */
function s(id) {
  const raw = cats[id]?.score;
  return raw === null || raw === undefined ? "?" : `${Math.round(raw * 100)}`;
}

console.log(`
PageSpeed Insights  url=${url}  strategy=${strategy}
performance ${s("performance")}
accessibility ${s("accessibility")}
best-practices ${s("best-practices")}
seo ${s("seo")}
`);
