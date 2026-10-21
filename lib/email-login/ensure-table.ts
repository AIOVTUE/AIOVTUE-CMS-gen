import "server-only";

import { postgresClient } from "@/db";

const DDL = `
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

CREATE UNIQUE INDEX IF NOT EXISTS "uq_email_login_settings_email_hash"
  ON "email_login_settings" USING btree ("email_hash");
`;

let ensurePromise: Promise<void> | null = null;
let tableReady = false;

export const ensureEmailLoginSettingsTable = async () => {
  if (tableReady) return;
  if (!ensurePromise) {
    ensurePromise = (async () => {
      await postgresClient.unsafe(DDL);
      tableReady = true;
    })().finally(() => {
      ensurePromise = null;
    });
  }
  await ensurePromise;
};
