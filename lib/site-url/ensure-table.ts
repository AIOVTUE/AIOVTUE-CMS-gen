import "server-only";

import { postgresClient } from "@/db";

const DDL = `
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

let ensurePromise: Promise<void> | null = null;
let tableReady = false;

export const ensureSiteUrlSettingsTable = async () => {
  if (tableReady) return;
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL 未配置，无法保存站点地址。");
  }

  if (!ensurePromise) {
    ensurePromise = (async () => {
      try {
        await postgresClient.unsafe(DDL);
        tableReady = true;
      } catch (error) {
        ensurePromise = null;
        throw error;
      }
    })();
  }

  await ensurePromise;
};
