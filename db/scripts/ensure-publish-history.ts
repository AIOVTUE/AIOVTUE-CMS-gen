/**
 * Ensure publish_history table exists (for envs that skip drizzle migrate).
 */
import "../envConfig";
import { postgresClient } from "../index";

const sql = `
CREATE TABLE IF NOT EXISTS "publish_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"owner" text NOT NULL,
	"repo" text NOT NULL,
	"branch" text NOT NULL,
	"commit_sha" text,
	"message" text,
	"file_count" integer DEFAULT 0 NOT NULL,
	"files" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"triggered_by_user_id" text,
	"triggered_by_name" text,
	"triggered_by_email" text,
	"triggered_by_github_username" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_publish_history_repo_created"
  ON "publish_history" USING btree ("owner","repo","branch","created_at");
`;

async function main() {
  await postgresClient.unsafe(sql);
  console.log("publish_history ensured.");
  await postgresClient.end({ timeout: 5 });
}

main().catch(async (error) => {
  console.error(error);
  try {
    await postgresClient.end({ timeout: 5 });
  } catch {
    // ignore
  }
  process.exit(1);
});
