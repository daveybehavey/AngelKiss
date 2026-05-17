import { spawnSync } from "node:child_process";
import { resolveRemotePostgresUrl } from "./lib/supabase-remote-db-url.mjs";

const dbUrl = resolveRemotePostgresUrl("db-push");

console.log("db-push: applying pending migrations to remote Postgres (Supabase)…");

const result = spawnSync("npx", ["supabase", "db", "push", "--db-url", dbUrl, "--yes"], {
  stdio: "inherit",
  cwd: process.cwd(),
  shell: true
});

if (result.status !== 0) {
  console.error(`
db-push: troubleshooting
  • Compare local vs remote: npm run db:migrations
  • Repair history: https://supabase.com/docs/reference/cli/supabase-migration-repair
  • README: db:sql, db:newsletter
`);
}

process.exit(result.status === null ? 1 : result.status);
