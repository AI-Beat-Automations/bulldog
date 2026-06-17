CREATE TABLE "calls" (
	"id" text PRIMARY KEY NOT NULL,
	"call_id" text NOT NULL,
	"agent_id" text NOT NULL,
	"customer_name" text,
	"customer_phone" text,
	"customer_address" text,
	"customer_city" text,
	"customer_zipcode" text,
	"service" text,
	"summary" text,
	"call_date" text,
	"event" text,
	"retell_event" text,
	"call_status" text,
	"disconnection_reason" text,
	"start_timestamp" bigint,
	"end_timestamp" bigint,
	"duration_ms" integer,
	"audio_url" text,
	"call_cost" numeric(10, 6),
	"transcript" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "calls_call_id_agent_id_idx" ON "calls" USING btree ("call_id","agent_id");