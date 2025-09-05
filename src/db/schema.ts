import { pgTable, integer, text, timestamp, bigserial, real, boolean } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export const errorCodes = pgTable("error_codes", {
  code: integer("code").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const appLogs = pgTable("app_logs", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  appStatus: integer("app_status")
    .notNull()
    .references(() => errorCodes.code, { onUpdate: "cascade" }),
});

// 장비별 메트릭 로그 테이블 (기존 device 테이블의 device_name 참조)
export const deviceMetrics = pgTable("device_metrics", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  deviceName: text("device_name").notNull(), // device 테이블의 device_name 참조
  isOnline: boolean("is_online").notNull(), // 온라인/오프라인 상태
  cpuUsage: real("cpu_usage"), // CPU 사용률 (0-100)
  memoryUsage: real("memory_usage"), // 메모리 사용률 (0-100)
  temperature: real("temperature"), // 온도 (옵션)
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// 대시보드 단일 레코드 테이블 (항상 업데이트)
export const dashboardSummary = pgTable("dashboard_summary", {
  id: integer("id").primaryKey().default(1), // 항상 1인 단일 레코드
  totalDevices: integer("total_devices").notNull(), // 전체 장비 수
  activeDevices: integer("active_devices").notNull(), // active 상태 장비 수
  inactiveDevices: integer("inactive_devices").notNull(), // inactive 상태 장비 수
  normalAppStatus: integer("normal_app_status").notNull(), // app_status=0인 정상 로그 수 (최근 5분)
  abnormalAppStatus: integer("abnormal_app_status").notNull(), // app_status!=0인 비정상 로그 수 (최근 5분)
  avgCpuUsage: real("avg_cpu_usage"), // 평균 CPU 사용률 (최근 5분)
  avgMemoryUsage: real("avg_memory_usage"), // 평균 메모리 사용률 (최근 5분)
  lastUpdated: timestamp("last_updated", { withTimezone: true }).defaultNow().notNull(),
});

// Relations
export const errorCodesRelations = relations(errorCodes, ({ many }) => ({
  appLogs: many(appLogs),
}));

export const appLogsRelations = relations(appLogs, ({ one }) => ({
  errorCode: one(errorCodes, {
    fields: [appLogs.appStatus],
    references: [errorCodes.code],
  }),
}));

// Types
export type ErrorCode = typeof errorCodes.$inferSelect;
export type NewErrorCode = typeof errorCodes.$inferInsert;
export type AppLog = typeof appLogs.$inferSelect;
export type NewAppLog = typeof appLogs.$inferInsert;
export type DeviceMetric = typeof deviceMetrics.$inferSelect;
export type NewDeviceMetric = typeof deviceMetrics.$inferInsert;
export type DashboardSummary = typeof dashboardSummary.$inferSelect;
export type NewDashboardSummary = typeof dashboardSummary.$inferInsert;