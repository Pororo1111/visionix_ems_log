import { pgTable, integer, text, timestamp, bigserial, real, boolean } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export const errorCodes = pgTable("error_codes", {
  code: integer("code").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// 대시보드 단일 레코드 테이블 (항상 업데이트)
export const dashboardSummary = pgTable("dashboard_summary", {
  id: integer("id").primaryKey().default(1), // 항상 1인 단일 레코드
  totalDevices: integer("total_devices").notNull(), // 전체 장비 수
  activeDevices: integer("active_devices").notNull(), // active 상태 장비 수
  inactiveDevices: integer("inactive_devices").notNull(), // inactive 상태 장비 수
  normalCameraStatus: integer("normal_camera_status").notNull(), // camera_value=0인 정상 상태 수
  abnormalCameraStatus: integer("abnormal_camera_status").notNull(), // camera_value!=0인 비정상 상태 수
  avgCpuUsage: real("avg_cpu_usage"), // 평균 CPU 사용률 (최근 5분)
  avgMemoryUsage: real("avg_memory_usage"), // 평균 메모리 사용률 (최근 5분)
  lastUpdated: timestamp("last_updated", { withTimezone: true }).defaultNow().notNull(),
});

// Relations

// Types
export type ErrorCode = typeof errorCodes.$inferSelect;
export type NewErrorCode = typeof errorCodes.$inferInsert;
export type DashboardSummary = typeof dashboardSummary.$inferSelect;
export type NewDashboardSummary = typeof dashboardSummary.$inferInsert;