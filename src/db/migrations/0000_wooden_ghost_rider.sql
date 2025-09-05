CREATE TABLE "app_logs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"app_status" integer NOT NULL,
	"ocr_value" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "error_codes" (
	"code" integer PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "app_logs" ADD CONSTRAINT "app_logs_app_status_error_codes_code_fk" FOREIGN KEY ("app_status") REFERENCES "public"."error_codes"("code") ON DELETE no action ON UPDATE cascade;