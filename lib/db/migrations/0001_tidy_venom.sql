CREATE TABLE "prompt_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"body" text NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "prompt_versions_active_unique" ON "prompt_versions" USING btree ("is_active") WHERE is_active;--> statement-breakpoint
CREATE INDEX "prompt_versions_created_idx" ON "prompt_versions" USING btree ("created_at");