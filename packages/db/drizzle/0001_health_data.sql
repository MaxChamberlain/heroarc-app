CREATE TABLE "daily_metrics" (
	"user_id" text NOT NULL,
	"date" date NOT NULL,
	"sleep_score" integer,
	"readiness" integer,
	"sleep_hours" real,
	"hrv" real,
	"rhr" real,
	"bed_min" integer,
	"wake_min" integer,
	"stress_min" integer,
	"recovery_min" integer,
	"stress_summary" text,
	"steps" integer,
	"active_kcal" integer,
	"total_kcal" integer,
	"source" text DEFAULT 'oura' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "daily_metrics_user_id_date_pk" PRIMARY KEY("user_id","date")
);
--> statement-breakpoint
CREATE TABLE "habit_checks" (
	"user_id" text NOT NULL,
	"date" date NOT NULL,
	"habit_id" text NOT NULL,
	"done" boolean NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "habit_checks_user_id_date_habit_id_pk" PRIMARY KEY("user_id","date","habit_id")
);
--> statement-breakpoint
CREATE TABLE "habits" (
	"user_id" text NOT NULL,
	"id" text NOT NULL,
	"name" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "habits_user_id_id_pk" PRIMARY KEY("user_id","id")
);
--> statement-breakpoint
CREATE TABLE "meals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"date" date NOT NULL,
	"time" text,
	"meal" text NOT NULL,
	"items" text NOT NULL,
	"kcal" real NOT NULL,
	"protein_g" real NOT NULL,
	"carbs_g" real,
	"fat_g" real,
	"confidence" text,
	"source" text,
	"notes" text,
	"created_by" text DEFAULT 'user' NOT NULL,
	"event_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mood_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"date" date NOT NULL,
	"mood" smallint NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"logged_at" timestamp with time zone DEFAULT now() NOT NULL,
	"event_id" text
);
--> statement-breakpoint
CREATE TABLE "training_plans" (
	"user_id" text PRIMARY KEY NOT NULL,
	"workouts" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "training_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"date" date NOT NULL,
	"workout" text,
	"status" text NOT NULL,
	"lifts" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"logged_at" timestamp with time zone DEFAULT now() NOT NULL,
	"event_id" text
);
--> statement-breakpoint
CREATE TABLE "user_goals" (
	"user_id" text PRIMARY KEY NOT NULL,
	"kcal" integer NOT NULL,
	"protein_g" integer NOT NULL,
	"steps" integer DEFAULT 10000 NOT NULL,
	"active_kcal" integer DEFAULT 500 NOT NULL,
	"goals_set" boolean DEFAULT false NOT NULL,
	"sex" text,
	"age" integer,
	"height_in" real,
	"weight_lb" real,
	"activity" text,
	"goal" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "weight_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"date" date NOT NULL,
	"weight_lb" real NOT NULL,
	"source" text DEFAULT 'app' NOT NULL,
	"event_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "meals_user_id_date_index" ON "meals" USING btree ("user_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "meals_user_id_event_id_index" ON "meals" USING btree ("user_id","event_id");--> statement-breakpoint
CREATE INDEX "mood_entries_user_id_date_index" ON "mood_entries" USING btree ("user_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "mood_entries_user_id_event_id_index" ON "mood_entries" USING btree ("user_id","event_id");--> statement-breakpoint
CREATE INDEX "training_sessions_user_id_date_index" ON "training_sessions" USING btree ("user_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "training_sessions_user_id_event_id_index" ON "training_sessions" USING btree ("user_id","event_id");--> statement-breakpoint
CREATE INDEX "weight_entries_user_id_date_index" ON "weight_entries" USING btree ("user_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "weight_entries_user_id_event_id_index" ON "weight_entries" USING btree ("user_id","event_id");