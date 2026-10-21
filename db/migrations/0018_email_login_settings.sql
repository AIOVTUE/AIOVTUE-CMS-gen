CREATE TABLE IF NOT EXISTS "email_login_settings" (
	"user_id" text PRIMARY KEY NOT NULL,
	"email_hash" text NOT NULL,
	"email_ciphertext" text NOT NULL,
	"email_iv" text NOT NULL,
	"password_hash" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "email_login_settings_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_email_login_settings_email_hash" ON "email_login_settings" USING btree ("email_hash");
