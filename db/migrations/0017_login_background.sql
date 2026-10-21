CREATE TABLE IF NOT EXISTS "login_background" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"desktop_url" text DEFAULT '' NOT NULL,
	"mobile_url" text DEFAULT '' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
