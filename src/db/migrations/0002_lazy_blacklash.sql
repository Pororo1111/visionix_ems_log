CREATE TABLE "device_metric_logs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"device_ip" text NOT NULL,
	"instance" text NOT NULL,
	"metric_name" text NOT NULL,
	"metric_value" real,
	"scraped_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "device_metric_logs_device_metric_time_idx" ON "device_metric_logs" USING btree ("device_ip","metric_name","scraped_at");