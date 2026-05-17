import { existsSync } from "node:fs";
import { envPath, loadEnvFile } from "./load-env-file.mjs";

/**
 * Postgres connection string for hosted Supabase (direct DB), from `.env.local`.
 * @param {string} label Script name for stderr (e.g. `db-push`).
 * @returns {string}
 */
export function resolveRemotePostgresUrl(label) {
  const path = envPath();
  if (!existsSync(path)) {
    console.error(`${label}: no .env.local`);
    process.exit(1);
  }

  const e = loadEnvFile(path);
  const supabaseUrl = e.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const password = e.SUPABASE_DB_PASSWORD?.trim();

  if (!supabaseUrl || !password) {
    console.error(
      `${label}: need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_DB_PASSWORD in .env.local (database password from Supabase → Settings → Database).`
    );
    process.exit(1);
  }

  const hostMatch = supabaseUrl.match(/^https:\/\/([a-z0-9-]+)\.supabase\.co\/?$/i);
  if (!hostMatch) {
    console.error(`${label}: NEXT_PUBLIC_SUPABASE_URL must look like https://<ref>.supabase.co`);
    process.exit(1);
  }

  const ref = hostMatch[1];
  const encoded = encodeURIComponent(password);
  return `postgresql://postgres:${encoded}@db.${ref}.supabase.co:5432/postgres`;
}
