import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { resolveRemotePostgresUrl } from "./lib/supabase-remote-db-url.mjs";

/**
 * Split migration SQL into single statements for `supabase db query` (one prepared statement each).
 * Strips full-line `--` comments. Not a full SQL parser — fine for simple DDL migrations.
 * @param {string} sql
 * @returns {string[]}
 */
function splitSqlForSupabaseQuery(sql) {
  const lines = sql.split(/\r?\n/);
  const stripped = lines
    .filter((line) => !/^\s*--/.test(line))
    .join("\n")
    .trim();

  const chunks = stripped
    .split(/;\s*(?=\r?\n|$)/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  return chunks;
}

function escapeCmdDoubleQuotes(s) {
  return s.replace(/"/g, '\\"');
}

const rel = process.argv[2] || "supabase/migrations/202604130001_newsletter_subscribers.sql";
const file = resolve(process.cwd(), rel);
if (!existsSync(file)) {
  console.error(`db-sql-file: file not found: ${rel}`);
  process.exit(1);
}

const dbUrl = resolveRemotePostgresUrl("db-sql-file");

const sql = readFileSync(file, "utf8");
const statements = splitSqlForSupabaseQuery(sql);
if (!statements.length) {
  console.error("db-sql-file: no executable statements after stripping comments");
  process.exit(1);
}

console.log(`db-sql-file: running ${statements.length} statement(s) from ${rel} on remote Postgres…`);

for (let i = 0; i < statements.length; i++) {
  const oneLine = `${statements[i]};`.replace(/\s+/g, " ").trim();
  const urlEsc = escapeCmdDoubleQuotes(dbUrl);
  const sqlEsc = escapeCmdDoubleQuotes(oneLine);
  try {
    execSync(`npx supabase db query --db-url "${urlEsc}" "${sqlEsc}"`, {
      stdio: "inherit",
      cwd: process.cwd(),
      shell: true,
      windowsHide: true
    });
  } catch {
    console.error(`db-sql-file: statement ${i + 1}/${statements.length} failed`);
    process.exit(1);
  }
}
