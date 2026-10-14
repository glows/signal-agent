CREATE TABLE "acquisition" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"product" text NOT NULL,
	"agent" jsonb NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"daily_limit" integer DEFAULT 30 NOT NULL,
	"next_run_at" timestamp with time zone NOT NULL,
	"lease_until" timestamp with time zone,
	"lease_id" text,
	"leads" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"runs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "acquisition_userId_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "acquisition" ADD CONSTRAINT "acquisition_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "acquisition_user_id_idx" ON "acquisition" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "acquisition_next_run_at_idx" ON "acquisition" USING btree ("next_run_at");