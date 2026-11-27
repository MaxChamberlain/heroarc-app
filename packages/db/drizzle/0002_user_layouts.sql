CREATE TABLE "user_layouts" (
	"user_id" text PRIMARY KEY NOT NULL,
	"layout" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
