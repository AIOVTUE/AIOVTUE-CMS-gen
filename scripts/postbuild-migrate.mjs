/**
 * Run DB migrations after build.
 * On Vercel, skip by default (saves deploy time); set RUN_DB_MIGRATE=1 for first deploy
 * or after schema changes. Local `npm run build` still migrates unless SKIP_DB_MIGRATE=1.
 */
import { spawnSync } from "node:child_process";

const onVercel = process.env.VERCEL === "1";
const force = process.env.RUN_DB_MIGRATE === "1";
const skip = process.env.SKIP_DB_MIGRATE === "1";

if (skip || (onVercel && !force)) {
  console.log(
    onVercel
      ? "[postbuild] Skipping db:migrate on Vercel (set RUN_DB_MIGRATE=1 to run)."
      : "[postbuild] Skipping db:migrate (SKIP_DB_MIGRATE=1).",
  );
  process.exit(0);
}

const result = spawnSync("npm", ["run", "db:migrate"], {
  stdio: "inherit",
  shell: true,
  env: process.env,
});

process.exit(result.status ?? 1);
