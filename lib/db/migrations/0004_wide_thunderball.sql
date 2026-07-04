ALTER TYPE "public"."chat_message_role" ADD VALUE 'tool_call';--> statement-breakpoint
ALTER TYPE "public"."chat_message_role" ADD VALUE 'tool_result';--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN "payload" jsonb;