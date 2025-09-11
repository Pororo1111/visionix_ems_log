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

// 장비 에러 로그 테이블 (TimescaleDB hypertable)
export const deviceErrorLogs = pgTable("device_error_logs", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  deviceIp: text("device_ip").notNull(), // 장비 IP 주소 (Prometheus instance)
  errorCode: integer("error_code").notNull().references(() => errorCodes.code), // 에러 코드 (FK)
  errorMessage: text("error_message").notNull(), // 에러 메시지
  occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow().notNull(), // 최초 발생 시간
  lastOccurredAt: timestamp("last_occurred_at", { withTimezone: true }).defaultNow().notNull(), // 최종 발생 시간
  isRead: boolean("is_read").default(false).notNull(), // 읽음 처리 여부
  readAt: timestamp("read_at", { withTimezone: true }), // 읽음 처리 시간
});

// 디바이스 실시간 정보 테이블 (디바이스별 최신 상태 저장)
export const deviceInfos = pgTable("device_infos", {
  deviceIp: text("device_ip").primaryKey(),
  instance: text("instance").notNull(),
  isOnline: boolean("is_online").notNull().default(false),
  cameraValue: integer("camera_value"),
  cpuUsage: real("cpu_usage"),
  memoryUsage: real("memory_usage"),
  lastScraped: timestamp("last_scraped", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// Relations
export const deviceErrorLogsRelations = relations(deviceErrorLogs, ({ one }) => ({
  errorCode: one(errorCodes, {
    fields: [deviceErrorLogs.errorCode],
    references: [errorCodes.code],
  }),
}));

// Types
export type ErrorCode = typeof errorCodes.$inferSelect;
export type NewErrorCode = typeof errorCodes.$inferInsert;
export type DashboardSummary = typeof dashboardSummary.$inferSelect;
export type NewDashboardSummary = typeof dashboardSummary.$inferInsert;
export type DeviceErrorLog = typeof deviceErrorLogs.$inferSelect;
export type NewDeviceErrorLog = typeof deviceErrorLogs.$inferInsert;
export type DeviceInfo = typeof deviceInfos.$inferSelect;
export type NewDeviceInfo = typeof deviceInfos.$inferInsert;
