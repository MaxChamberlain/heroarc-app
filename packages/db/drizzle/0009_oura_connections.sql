CREATE TABLE "oura_connections" (
	"user_id" text PRIMARY KEY NOT NULL,
	"access_token" text NOT NULL,
	"refresh_token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"scopes" text[] DEFAULT '{}' NOT NULL,
	"connected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_sync_at" timestamp with time zone,
	"status" text DEFAULT 'ok' NOT NULL,
	"last_error" text,
	"synced_from" text
);
--> statement-breakpoint
ALTER TABLE "oura_connections" ADD CONSTRAINT "oura_connections_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;