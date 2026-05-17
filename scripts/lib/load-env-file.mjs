import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Minimal .env parser (KEY=value, no export keyword, ignores comments/blank lines).
 * @param {string} filePath
 * @returns {Record<string, string>}
 */
export function loadEnvFile(filePath) {
  if (!existsSync(filePath)) {
    return {};
  }
  const out = {};
  let text = readFileSync(filePath, "utf8");
  // Strip UTF-8 BOM so keys like CLOUDFLARE_API_TOKEN parse correctly on Windows editors.
  text = text.replace(/^\uFEFF/, "");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const eq = trimmed.indexOf("=");
    if (eq <= 0) {
      continue;
    }
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

export function envPath(cwd = process.cwd()) {
  return resolve(cwd, ".env.local");
}
