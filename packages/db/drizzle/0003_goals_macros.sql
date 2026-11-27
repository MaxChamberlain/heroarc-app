ALTER TABLE "user_goals" ADD COLUMN "carbs_g" integer;--> statement-breakpoint
ALTER TABLE "user_goals" ADD COLUMN "fat_g" integer;--> statement-breakpoint
ALTER TABLE "user_goals" ADD COLUMN "track_macros" boolean DEFAULT false NOT NULL;