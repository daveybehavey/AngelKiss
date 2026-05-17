import { spawnSync } from "node:child_process";
import { resolveRemotePostgresUrl } from "./lib/supabase-remote-db-url.mjs";

const dbUrl = resolveRemotePostgresUrl("db-migrations");

console.log("db-migrations: local vs remote migration history (Supabase CLI)…\n");

const result = spawnSync(
  "npx",
  ["supabase", "migration", "list", "--db-url", dbUrl],
  { stdio: "inherit", cwd: process.cwd(), shell: true }
);

process.exit(result.status === null ? 1 : result.status);
