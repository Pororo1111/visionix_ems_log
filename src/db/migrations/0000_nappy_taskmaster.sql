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
CREATE TABLE "error_codes" (
	"code" integer PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now()
);
