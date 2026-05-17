#!/usr/bin/env node
/**
 * Lighthouse smoke run: prints category scores + writes HTML/JSON under `./.lighthouse/`.
 *
 * Uses Playwright’s bundled Chromium when available (`LIGHTHOUSE_CHROME_PATH` overrides).
 * On Windows, Lighthouse may exit with `EBUSY` while deleting a temp profile after the
 * report is already written — this script treats that as success when JSON exists.
 *
 * Env:
 *   LIGHTHOUSE_URL        — page to audit (default: https://anglkisscreations.ca/)
 *   LIGHTHOUSE_PRESET     — `desktop` | `experimental` | `perf` (default: desktop)
 *   LIGHTHOUSE_CHROME_PATH — explicit path to chrome.exe (optional)
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..");
const lighthouseCli = path.join(repoRoot, "node_modules", "lighthouse", "cli", "index.js");

const url = (
  process.env.LIGHTHOUSE_URL?.trim() || "https://anglkisscreations.ca/"
).replace(/\/+$/, "");
const presetRaw = process.env.LIGHTHOUSE_PRESET?.trim().toLowerCase() || "desktop";
const preset = ["desktop", "experimental", "perf"].includes(presetRaw) ? presetRaw : "desktop";

async function resolveChromePath() {
  const fromEnv = process.env.LIGHTHOUSE_CHROME_PATH?.trim();
  if (fromEnv) {
    return fromEnv;
  }
  try {
    const { chromium } = await import("playwright");
    return chromium.executablePath();
  } catch {
    return null;
  }
}

const chromePath = await resolveChromePath();

const outDir = path.join(repoRoot, ".lighthouse");
fs.mkdirSync(outDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const outBase = path.join(outDir, `report-${preset}-${stamp}`);

const args = [
  lighthouseCli,
  url,
  "--quiet",
  "--chrome-flags=--headless=new --no-sandbox --disable-gpu",
  `--preset=${preset}`,
  "--only-categories=performance,accessibility,best-practices,seo",
  "--output=json",
  "--output=html",
  `--output-path=${outBase}`
];

if (chromePath) {
  args.splice(1, 0, `--chrome-path=${chromePath}`);
}

const res = spawnSync(process.execPath, args, {
  cwd: repoRoot,
  encoding: "utf8"
});

const jsonPath = `${outBase}.report.json`;
const htmlPath = `${outBase}.report.html`;
const stderr = typeof res.stderr === "string" ? res.stderr : "";
const stdout = typeof res.stdout === "string" ? res.stdout : "";
const busyCleanup =
  stderr.includes("EBUSY") ||
  stderr.includes("resource busy or locked") ||
  stdout.includes("EBUSY") ||
  stdout.includes("resource busy or locked");

if (res.status !== 0 && !fs.existsSync(jsonPath)) {
  if (stderr) {
    process.stderr.write(stderr);
  }
  if (stdout) {
    process.stdout.write(stdout);
  }
  process.exit(res.status ?? 1);
}

if (!fs.existsSync(jsonPath)) {
  process.stderr.write(
    `Lighthouse did not write ${jsonPath}. Install Playwright browsers (npm i) or set LIGHTHOUSE_CHROME_PATH.\n`
  );
  if (stderr) {
    process.stderr.write(stderr);
  }
  process.exit(1);
}

/** @type {{ categories?: Record<string, { score: number | null }> }} */
const data = JSON.parse(fs.readFileSync(jsonPath, "utf8"));

/** @param {string} id */
function scoreLine(id) {
  const raw = data.categories?.[id]?.score;
  if (raw === null || raw === undefined || Number.isNaN(raw)) {
    return "?";
  }
  return `${Math.round(raw * 100)}`;
}

if (busyCleanup && res.status !== 0) {
  process.stderr.write(
    "(warn) Lighthouse exited during temp profile cleanup (Windows EBUSY); report files are OK.)\n"
  );
}

console.log(`
Lighthouse  url=${url}  preset=${preset}${chromePath ? `  chrome=${chromePath}` : ""}
performance ${scoreLine("performance")}
accessibility ${scoreLine("accessibility")}
best-practices ${scoreLine("best-practices")}
seo ${scoreLine("seo")}

Reports:
  HTML ${htmlPath}
  JSON ${jsonPath}
`);
