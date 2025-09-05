CREATE TABLE "dashboard_summary" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"total_devices" integer NOT NULL,
	"active_devices" integer NOT NULL,
	"inactive_devices" integer NOT NULL,
	"online_devices" integer NOT NULL,
	"offline_devices" integer NOT NULL,
	"normal_app_status" integer NOT NULL,
	"abnormal_app_status" integer NOT NULL,
	"avg_cpu_usage" real,
	"avg_memory_usage" real,
	"last_updated" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "device_metrics" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"device_name" text NOT NULL,
	"is_online" boolean NOT NULL,
	"cpu_usage" real,
	"memory_usage" real,
	"temperature" real,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
