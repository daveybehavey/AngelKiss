import { copyFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const example = resolve(root, ".env.example");
const local = resolve(root, ".env.local");

if (existsSync(local)) {
  console.log("bootstrap-env: .env.local already exists — skipped copy.");
  process.exit(0);
}

if (!existsSync(example)) {
  console.error("bootstrap-env: missing .env.example");
  process.exit(1);
}

copyFileSync(example, local);
console.log("bootstrap-env: created .env.local from .env.example");
console.log("bootstrap-env: open .env.local and paste your Supabase + PayPal values, then run: npm run check-env");
