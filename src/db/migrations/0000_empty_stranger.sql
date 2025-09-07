CREATE TABLE "dashboard_summary" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"total_devices" integer NOT NULL,
	"active_devices" integer NOT NULL,
	"inactive_devices" integer NOT NULL,
	"normal_camera_status" integer NOT NULL,
	"abnormal_camera_status" integer NOT NULL,
	"avg_cpu_usage" real,
	"avg_memory_usage" real,
	"last_updated" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "device_error_logs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"device_ip" text NOT NULL,
	"error_code" integer NOT NULL,
	"error_message" text NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_read" boolean DEFAULT false NOT NULL,
	"read_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "error_codes" (
	"code" integer PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "device_error_logs" ADD CONSTRAINT "device_error_logs_error_code_error_codes_code_fk" FOREIGN KEY ("error_code") REFERENCES "public"."error_codes"("code") ON DELETE no action ON UPDATE no action;