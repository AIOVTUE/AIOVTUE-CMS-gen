/**
 * Ensure site_url_settings table exists.
 */
import "../envConfig";
import { postgresClient } from "../index";

const sql = `
CREATE TABLE IF NOT EXISTS "site_url_settings" (
	"user_id" text PRIMARY KEY NOT NULL,
	"site_url" text DEFAULT '' NOT NULL,
	"icon_url" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

ALTER TABLE "site_url_settings" ADD COLUMN IF NOT EXISTS "icon_url" text DEFAULT '' NOT NULL;

DO $$ BEGIN
  ALTER TABLE "site_url_settings" ADD CONSTRAINT "site_url_settings_user_id_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
`;

async function main() {
  await postgresClient.unsafe(sql);
  console.log("site_url_settings ensured.");
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
