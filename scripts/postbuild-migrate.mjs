/**
 * Run DB migrations after build.
 * Default: always migrate (required for first-time setup /auth tables).
 * Set SKIP_DB_MIGRATE=1 to skip (e.g. when migrate runs in a separate CI step).
 */
import { spawnSync } from "node:child_process";

if (process.env.SKIP_DB_MIGRATE === "1") {
  console.log("[postbuild] Skipping db:migrate (SKIP_DB_MIGRATE=1).");
  process.exit(0);
}

const result = spawnSync("npm", ["run", "db:migrate"], {
  stdio: "inherit",
  shell: true,
  env: process.env,
});

process.exit(result.status ?? 1);
