CREATE TABLE "device_infos" (
	"device_ip" text PRIMARY KEY NOT NULL,
	"instance" text NOT NULL,
	"is_online" boolean DEFAULT false NOT NULL,
	"camera_value" integer,
	"cpu_usage" real,
	"memory_usage" real,
	"last_scraped" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
