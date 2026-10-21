import "server-only";

import { postgresClient } from "@/db";

const DDL = `
CREATE TABLE IF NOT EXISTS "app_config" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"setup_complete" boolean DEFAULT false NOT NULL,
	"base_url" text DEFAULT '' NOT NULL,
	"auth_secret_ciphertext" text DEFAULT '' NOT NULL,
	"auth_secret_iv" text DEFAULT '' NOT NULL,
	"github_app_id" text DEFAULT '' NOT NULL,
	"github_app_name" text DEFAULT '' NOT NULL,
	"github_app_client_id" text DEFAULT '' NOT NULL,
	"github_app_client_secret_ciphertext" text DEFAULT '' NOT NULL,
	"github_app_client_secret_iv" text DEFAULT '' NOT NULL,
	"github_app_private_key_ciphertext" text DEFAULT '' NOT NULL,
	"github_app_private_key_iv" text DEFAULT '' NOT NULL,
	"github_app_webhook_secret_ciphertext" text DEFAULT '' NOT NULL,
	"github_app_webhook_secret_iv" text DEFAULT '' NOT NULL,
	"email_provider" text DEFAULT '' NOT NULL,
	"email_from" text DEFAULT '' NOT NULL,
	"resend_api_key_ciphertext" text DEFAULT '' NOT NULL,
	"resend_api_key_iv" text DEFAULT '' NOT NULL,
	"smtp_host" text DEFAULT '' NOT NULL,
	"smtp_port" text DEFAULT '587' NOT NULL,
	"smtp_secure" boolean DEFAULT false NOT NULL,
	"smtp_user" text DEFAULT '' NOT NULL,
	"smtp_password_ciphertext" text DEFAULT '' NOT NULL,
	"smtp_password_iv" text DEFAULT '' NOT NULL,
	"admin_emails" text DEFAULT '' NOT NULL,
	"github_allowed_usernames" text DEFAULT '' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
`;

let ensurePromise: Promise<void> | null = null;
let tableReady = false;

export const ensureAppConfigTable = async () => {
  if (tableReady) return;
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL 未配置，无法读写应用配置。");
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
