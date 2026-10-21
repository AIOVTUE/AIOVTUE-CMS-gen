CREATE TABLE "staged_write" (
	"id" serial PRIMARY KEY NOT NULL,
	"owner" text NOT NULL,
	"repo" text NOT NULL,
	"branch" text NOT NULL,
	"path" text NOT NULL,
	"operation" text NOT NULL,
	"content" text,
	"content_encoding" text DEFAULT 'utf8' NOT NULL,
	"base_sha" text,
	"new_path" text,
	"size" integer,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_staged_write_repo_path" ON "staged_write" USING btree ("owner","repo","branch","path");--> statement-breakpoint
CREATE INDEX "idx_staged_write_repo" ON "staged_write" USING btree ("owner","repo","branch");