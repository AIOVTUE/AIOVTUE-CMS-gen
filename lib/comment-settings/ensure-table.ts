import "server-only";

import { postgresClient } from "@/db";

const CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS "comment_settings" (
	"user_id" text PRIMARY KEY NOT NULL,
	"provider" text DEFAULT '' NOT NULL,
	"server_url" text DEFAULT '' NOT NULL,
	"password_ciphertext" text DEFAULT '' NOT NULL,
	"password_iv" text DEFAULT '' NOT NULL,
	"backup_enabled" boolean DEFAULT false NOT NULL,
	"backup_remote_path" text DEFAULT '/pagecms/comments' NOT NULL,
	"backup_interval_hours" integer DEFAULT 24 NOT NULL,
	"last_backup_at" timestamp,
	"last_backup_status" text DEFAULT '' NOT NULL,
	"last_backup_message" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
`;

const ADD_FK_SQL = `
DO $$ BEGIN
  ALTER TABLE "comment_settings" ADD CONSTRAINT "comment_settings_user_id_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
`;

const ADD_COLUMNS_SQL = `
DO $$ BEGIN
  ALTER TABLE "comment_settings" ADD COLUMN IF NOT EXISTS "password_ciphertext" text DEFAULT '' NOT NULL;
  ALTER TABLE "comment_settings" ADD COLUMN IF NOT EXISTS "password_iv" text DEFAULT '' NOT NULL;
  ALTER TABLE "comment_settings" ADD COLUMN IF NOT EXISTS "backup_enabled" boolean DEFAULT false NOT NULL;
  ALTER TABLE "comment_settings" ADD COLUMN IF NOT EXISTS "backup_remote_path" text DEFAULT '/pagecms/comments' NOT NULL;
  ALTER TABLE "comment_settings" ADD COLUMN IF NOT EXISTS "backup_interval_hours" integer DEFAULT 24 NOT NULL;
  ALTER TABLE "comment_settings" ADD COLUMN IF NOT EXISTS "last_backup_at" timestamp;
  ALTER TABLE "comment_settings" ADD COLUMN IF NOT EXISTS "last_backup_status" text DEFAULT '' NOT NULL;
  ALTER TABLE "comment_settings" ADD COLUMN IF NOT EXISTS "last_backup_message" text DEFAULT '' NOT NULL;
EXCEPTION
  WHEN duplicate_column THEN null;
END $$;
`;

const FALLBACK_COLUMNS = [
  `ALTER TABLE "comment_settings" ADD COLUMN "password_ciphertext" text DEFAULT '' NOT NULL`,
  `ALTER TABLE "comment_settings" ADD COLUMN "password_iv" text DEFAULT '' NOT NULL`,
  `ALTER TABLE "comment_settings" ADD COLUMN "backup_enabled" boolean DEFAULT false NOT NULL`,
  `ALTER TABLE "comment_settings" ADD COLUMN "backup_remote_path" text DEFAULT '/pagecms/comments' NOT NULL`,
  `ALTER TABLE "comment_settings" ADD COLUMN "backup_interval_hours" integer DEFAULT 24 NOT NULL`,
  `ALTER TABLE "comment_settings" ADD COLUMN "last_backup_at" timestamp`,
  `ALTER TABLE "comment_settings" ADD COLUMN "last_backup_status" text DEFAULT '' NOT NULL`,
  `ALTER TABLE "comment_settings" ADD COLUMN "last_backup_message" text DEFAULT '' NOT NULL`,
];

let ensurePromise: Promise<void> | null = null;
let tableReady = false;

export const ensureCommentSettingsTable = async () => {
  if (tableReady) return;
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL 未配置，无法保存评论设置。");
  }

  if (!ensurePromise) {
    ensurePromise = (async () => {
      try {
        const existing = await postgresClient<{ table_exists: boolean }[]>`
          SELECT EXISTS (
            SELECT 1
            FROM information_schema.tables
            WHERE table_schema = 'public'
              AND table_name = 'comment_settings'
          ) AS table_exists
        `;

        if (!existing[0]?.table_exists) {
          await postgresClient.unsafe(CREATE_TABLE_SQL);
          try {
            await postgresClient.unsafe(ADD_FK_SQL);
          } catch {
            // FK optional for runtime
          }
        } else {
          try {
            await postgresClient.unsafe(ADD_COLUMNS_SQL);
          } catch {
            for (const sql of FALLBACK_COLUMNS) {
              try {
                await postgresClient.unsafe(sql);
              } catch {
                /* already present */
              }
            }
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
