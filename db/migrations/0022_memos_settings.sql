CREATE TABLE IF NOT EXISTS "memos_settings" (
	"user_id" text PRIMARY KEY NOT NULL,
	"api_url" text DEFAULT '' NOT NULL,
	"password_ciphertext" text DEFAULT '' NOT NULL,
	"password_iv" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "memos_settings_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action
);
