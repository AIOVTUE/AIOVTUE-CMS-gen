import "server-only";

import { postgresClient } from "@/db";

const CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS "webanalysi_settings" (
	"user_id" text PRIMARY KEY NOT NULL,
	"api_url" text DEFAULT '' NOT NULL,
	"password_ciphertext" text DEFAULT '' NOT NULL,
	"password_iv" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
`;

const ADD_FK_SQL = `
DO $$ BEGIN
  ALTER TABLE "webanalysi_settings" ADD CONSTRAINT "webanalysi_settings_user_id_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
`;

let ensurePromise: Promise<void> | null = null;
let tableReady = false;

export const ensureWebanalysiSettingsTable = async () => {
  if (tableReady) return;
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL 未配置，无法保存 Webanalysi 设置。");
  }

  if (!ensurePromise) {
    ensurePromise = (async () => {
      try {
        const existing = await postgresClient<{ table_exists: boolean }[]>`
          SELECT EXISTS (
            SELECT 1
            FROM information_schema.tables
            WHERE table_schema = 'public'
              AND table_name = 'webanalysi_settings'
          ) AS table_exists
        `;

        if (!existing[0]?.table_exists) {
          // Neon / PgBouncer: prefer single statements over multi-statement scripts.
          await postgresClient.unsafe(CREATE_TABLE_SQL);
          try {
            await postgresClient.unsafe(ADD_FK_SQL);
          } catch {
            // FK is optional for runtime use; table alone is enough to save settings.
          }
        }

        tableReady = true;
      } catch (error) {
        ensurePromise = null;
        throw error;
      }
    })();
  }

  await ensurePromise;
};
