/**
 * Fail before `opennextjs-cloudflare deploy` if the OpenNext output looks like
 * a dev bundle (would 404 every route in production). See README Cloudflare section.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const openNextRoot = join(root, ".open-next");

function walkFiles(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      walkFiles(p, out);
    } else if (e.isFile()) {
      if (!/\.(js|mjs|json|html|map|txt)$/i.test(e.name)) {
        continue;
      }
      try {
        const size = statSync(p).size;
        if (size > 25_000_000) {
          continue;
        }
      } catch {
        continue;
      }
      out.push(p);
    }
  }
  return out;
}

function main() {
  let st;
  try {
    st = statSync(openNextRoot);
  } catch {
    console.error("verify-opennext-production: missing .open-next — run opennextjs-cloudflare build first.");
    process.exit(1);
  }
  if (!st.isDirectory()) {
    console.error("verify-opennext-production: .open-next is not a directory.");
    process.exit(1);
  }

  const needles = ["_next/static/development", "/static/development/"];
  const files = walkFiles(openNextRoot);
  const hits = [];

  for (const file of files) {
    let text;
    try {
      text = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    if (!text || text.length > 25_000_000) {
      continue;
    }
    for (const n of needles) {
      if (text.includes(n)) {
        hits.push({ file, needle: n });
        break;
      }
    }
  }

  if (hits.length > 0) {
    console.error(
      "verify-opennext-production: build references Next.js development static assets."
    );
    console.error(
      "This usually means `next build` failed or was corrupted (e.g. Windows network ECONNRESET)."
    );
    console.error("Fix: npm run clean && npm run build:win (or npm run wsl:deploy), then deploy again.");
    for (const h of hits.slice(0, 12)) {
      console.error(`  hit: ${h.needle} in ${h.file.replace(root + "\\", "").replace(root + "/", "")}`);
    }
    if (hits.length > 12) {
      console.error(`  …and ${hits.length - 12} more file(s).`);
    }
    process.exit(1);
  }

  console.log("verify-opennext-production: OK (no development static paths in .open-next).");
}

main();
