CREATE TABLE "ai_settings" (
	"user_id" text PRIMARY KEY NOT NULL,
	"provider" text DEFAULT 'deepseek' NOT NULL,
	"model" text DEFAULT 'deepseek-chat' NOT NULL,
	"api_key_ciphertext" text,
	"api_key_iv" text,
	"auto_summary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_summary_task" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"owner" text NOT NULL,
	"repo" text NOT NULL,
	"branch" text NOT NULL,
	"path" text NOT NULL,
	"title" text,
	"collection_name" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"summary" text,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "ai_settings" ADD CONSTRAINT "ai_settings_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_summary_task" ADD CONSTRAINT "ai_summary_task_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_ai_summary_task_user_repo" ON "ai_summary_task" USING btree ("user_id","owner","repo","branch");--> statement-breakpoint
CREATE INDEX "idx_ai_summary_task_status" ON "ai_summary_task" USING btree ("user_id","owner","repo","branch","status");