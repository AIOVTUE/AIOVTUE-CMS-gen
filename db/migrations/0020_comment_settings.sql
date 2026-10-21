CREATE TABLE IF NOT EXISTS "comment_settings" (
	"user_id" text PRIMARY KEY NOT NULL,
	"provider" text DEFAULT '' NOT NULL,
	"server_url" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "comment_settings_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action
);
