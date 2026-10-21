/**
 * Wipe local DB app data for a fresh /setup test.
 * Keeps table schemas; does not drop migrations.
 *
 * Usage: node --env-file=.env.local scripts/reset-local-data.mjs
 */
import postgres from "postgres";

const url =
  process.env.DATABASE_URL ||
  "postgresql://pagescms:pagescms@localhost:5432/pagescms";

const TABLES = [
  "publish_history",
  "staged_write",
  "action_run",
  "ai_summary_task",
  "ai_settings",
  "cache_file",
  "cache_file_meta",
  "cache_permission",
  "config",
  "collaborator_invite",
  "collaborator",
  "github_installation_token",
  "session",
  "account",
  "verification",
  "user",
  "email_login_settings",
  "login_background",
  "site_url_settings",
  "comment_settings",
  "webdav_settings",
  "webanalysi_settings",
  "memos_settings",
  "app_config",
];

const sql = postgres(url, { max: 1 });

try {
  const existing = await sql`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  `;
  const names = new Set(existing.map((r) => r.tablename));
  const toClear = TABLES.filter((t) => names.has(t));

  if (toClear.length === 0) {
    console.log("No known tables found — run npm run db:migrate first.");
    process.exit(1);
  }

  await sql.unsafe(
    `TRUNCATE TABLE ${toClear.map((t) => `"${t}"`).join(", ")} RESTART IDENTITY CASCADE`,
  );
  console.log(`reset ok — truncated ${toClear.length} tables`);
  console.log(toClear.join(", "));
} catch (error) {
  console.error("reset failed:", error?.message || error);
  process.exit(1);
} finally {
  await sql.end();
}
