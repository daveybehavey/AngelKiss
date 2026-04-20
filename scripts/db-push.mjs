import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { envPath, loadEnvFile } from "./lib/load-env-file.mjs";

const path = envPath();
if (!existsSync(path)) {
  console.error("db-push: no .env.local");
  process.exit(1);
}

const e = loadEnvFile(path);
const supabaseUrl = e.NEXT_PUBLIC_SUPABASE_URL?.trim();
const password = e.SUPABASE_DB_PASSWORD?.trim();

if (!supabaseUrl || !password) {
  console.error(
    "db-push: need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_DB_PASSWORD in .env.local (database password from Supabase → Settings → Database)."
  );
  process.exit(1);
}

const hostMatch = supabaseUrl.match(/^https:\/\/([a-z0-9-]+)\.supabase\.co\/?$/i);
if (!hostMatch) {
  console.error("db-push: NEXT_PUBLIC_SUPABASE_URL must look like https://<ref>.supabase.co");
  process.exit(1);
}

const ref = hostMatch[1];
const user = "postgres";
const encoded = encodeURIComponent(password);
const dbUrl = `postgresql://${user}:${encoded}@db.${ref}.supabase.co:5432/postgres`;

console.log("db-push: applying pending migrations to remote Postgres (Supabase)…");

const result = spawnSync("npx", ["supabase", "db", "push", "--db-url", dbUrl, "--yes"], {
  stdio: "inherit",
  cwd: process.cwd(),
  shell: true
});

if (result.status !== 0) {
  console.error(
    "\ndb-push: if this failed due to migration history drift, run `npm run db:newsletter` for the email list table, or see README (db:push / migration repair)."
  );
}

process.exit(result.status === null ? 1 : result.status);
