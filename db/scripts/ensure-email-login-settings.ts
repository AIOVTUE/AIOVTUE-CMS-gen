/**
 * Ensure email_login_settings table exists (password hashed, email encrypted).
 */
import "../envConfig";
import { postgresClient } from "../index";

const sql = `
CREATE TABLE IF NOT EXISTS "email_login_settings" (
	"user_id" text PRIMARY KEY NOT NULL,
	"email_hash" text NOT NULL,
	"email_ciphertext" text NOT NULL,
	"email_iv" text NOT NULL,
	"password_hash" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "email_login_settings" ADD CONSTRAINT "email_login_settings_user_id_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Migrate from reversible password columns if an older draft table exists.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'email_login_settings' AND column_name = 'password_ciphertext'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'email_login_settings' AND column_name = 'password_hash'
  ) THEN
    ALTER TABLE "email_login_settings" ADD COLUMN "password_hash" text;
    UPDATE "email_login_settings" SET "password_hash" = '' WHERE "password_hash" IS NULL;
    ALTER TABLE "email_login_settings" ALTER COLUMN "password_hash" SET NOT NULL;
    ALTER TABLE "email_login_settings" DROP COLUMN IF EXISTS "password_ciphertext";
    ALTER TABLE "email_login_settings" DROP COLUMN IF EXISTS "password_iv";
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "uq_email_login_settings_email_hash"
  ON "email_login_settings" USING btree ("email_hash");
`;

async function main() {
  await postgresClient.unsafe(sql);
  console.log("email_login_settings ensured.");
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
