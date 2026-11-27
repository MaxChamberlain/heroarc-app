CREATE TABLE "agent_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"actor" text NOT NULL,
	"chat_id" uuid,
	"tool" text NOT NULL,
	"summary" text NOT NULL,
	"status" text NOT NULL,
	"input" jsonb NOT NULL,
	"undo" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"settled_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "coach_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"mime" text NOT NULL,
	"data" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coach_chats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"title" text DEFAULT 'New chat' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coach_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chat_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	"content" jsonb NOT NULL,
	"display" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coach_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "meals" ADD COLUMN "photo_id" uuid;--> statement-breakpoint
ALTER TABLE "coach_messages" ADD CONSTRAINT "coach_messages_chat_id_coach_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."coach_chats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_actions_user_id_created_at_index" ON "agent_actions" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "coach_attachments_user_id_index" ON "coach_attachments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "coach_chats_user_id_updated_at_index" ON "coach_chats" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE INDEX "coach_messages_chat_id_created_at_index" ON "coach_messages" USING btree ("chat_id","created_at");--> statement-breakpoint
CREATE INDEX "coach_notes_user_id_index" ON "coach_notes" USING btree ("user_id");