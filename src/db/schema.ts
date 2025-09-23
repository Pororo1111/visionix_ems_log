import {
    pgTable,
    integer,
    text,
    timestamp,
    bigserial,
    real,
    boolean,
    index,
    primaryKey,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export const errorCodes = pgTable(
    "error_codes",
    {
        // 카테고리 + 코드 복합 PK
        category: text("category").notNull(), // 'camera' | 'hdmi' | 'ac' | 'dc' 등
        code: integer("code").notNull(),
        name: text("name").notNull(),
        description: text("description"),
        createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    },
    (table) => ({
        pk: primaryKey({ columns: [table.category, table.code] }),
    })
);

// 대시보드 단일 레코드 테이블 (항상 업데이트)
export const dashboardSummary = pgTable("dashboard_summary", {
    id: integer("id").primaryKey().default(1), // 항상 1인 단일 레코드
    totalDevices: integer("total_devices").notNull(), // 전체 장비 수
    activeDevices: integer("active_devices").notNull(), // active 상태 장비 수
    inactiveDevices: integer("inactive_devices").notNull(), // inactive 상태 장비 수
    normalCameraStatus: integer("normal_camera_status").notNull(), // camera_value=0인 정상 상태 수
    abnormalCameraStatus: integer("abnormal_camera_status").notNull(), // camera_value!=0인 비정상 상태 수
    // 추가 메트릭 집계 (OCR 제외)
    normalHdmiStatus: integer("normal_hdmi_status").notNull().default(0), // hdmi_value=0 정상
    abnormalHdmiStatus: integer("abnormal_hdmi_status").notNull().default(0), // hdmi_value!=0 비정상
    normalAcStatus: integer("normal_ac_status").notNull().default(0), // ac_value=0 정상
    abnormalAcStatus: integer("abnormal_ac_status").notNull().default(0), // ac_value=1 비정상
    normalDcStatus: integer("normal_dc_status").notNull().default(0), // dc_value=0 정상
    abnormalDcStatus: integer("abnormal_dc_status").notNull().default(0), // dc_value=1 비정상
    avgCpuUsage: real("avg_cpu_usage"), // 평균 CPU 사용률 (최근 5분)
    avgMemoryUsage: real("avg_memory_usage"), // 평균 메모리 사용률 (최근 5분)
    lastUpdated: timestamp("last_updated", { withTimezone: true })
        .defaultNow()
        .notNull(),
});

// 장비 에러 로그 테이블 (TimescaleDB hypertable)
export const deviceErrorLogs = pgTable("device_error_logs", {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    deviceIp: text("device_ip").notNull(), // 장비 IP 주소 (Prometheus instance)
    // 주: 기존 데이터 호환을 위해 nullable로 추가 (애플리케이션에서는 항상 값 설정)
    errorCategory: text("error_category"), // 에러 카테고리 (camera|hdmi|ac|dc 등)
    errorCode: integer("error_code").notNull(), // 에러 코드 (카테고리와 복합 FK)
    errorMessage: text("error_message").notNull(), // 에러 메시지
    occurredAt: timestamp("occurred_at", { withTimezone: true })
        .defaultNow()
        .notNull(), // 최초 발생 시간
    lastOccurredAt: timestamp("last_occurred_at", { withTimezone: true })
        .defaultNow()
        .notNull(), // 최종 발생 시간
    isRead: boolean("is_read").default(false).notNull(), // 읽음 처리 여부
    readAt: timestamp("read_at", { withTimezone: true }), // 읽음 처리 시간
    // 컨텍스트 메트릭 값(선택): 발생 시점의 상태 기록
    cameraValue: integer("camera_value"),
    ocrValueSeconds: integer("ocr_value_seconds"),
    hdmiValue: integer("hdmi_value"),
    acValue: integer("ac_value"),
    dcValue: integer("dc_value"),
});

// 디바이스 실시간 정보 테이블 (디바이스별 최신 상태 저장)
export const deviceInfos = pgTable("device_infos", {
    deviceIp: text("device_ip").primaryKey(),
    instance: text("instance").notNull(),
    isOnline: boolean("is_online").notNull().default(false),
    cameraValue: integer("camera_value"),
    ocrValueSeconds: integer("ocr_value_seconds"),
    hdmiValue: integer("hdmi_value"),
    acValue: integer("ac_value"),
    dcValue: integer("dc_value"),
    cpuUsage: real("cpu_usage"),
    memoryUsage: real("memory_usage"),
    lastScraped: timestamp("last_scraped", { withTimezone: true })
        .defaultNow()
        .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
        .defaultNow()
        .notNull(),
});

// 디바이스 메트릭 로그 테이블 (정기 스냅샷 저장)
export const deviceMetricLogs = pgTable(
    "device_metric_logs",
    {
        id: bigserial("id", { mode: "number" }).primaryKey(),
        deviceIp: text("device_ip").notNull(),
        instance: text("instance").notNull(),
        // 명시적 컬럼(선택): 스냅샷 당시의 주요 메트릭 값 저장
        cameraValue: integer("camera_value"),
        ocrValueSeconds: integer("ocr_value_seconds"),
        hdmiValue: integer("hdmi_value"),
        acValue: integer("ac_value"),
        dcValue: integer("dc_value"),
        scrapedAt: timestamp("scraped_at", { withTimezone: true }).notNull(),
        createdAt: timestamp("created_at", { withTimezone: true })
            .defaultNow()
            .notNull(),
    },
    (table) => ({
        deviceMetricTimeIdx: index(
            "device_metric_logs_device_metric_time_idx"
        ).on(table.deviceIp, table.instance, table.scrapedAt),
    })
);

// Relations
export const deviceErrorLogsRelations = relations(
    deviceErrorLogs,
    ({ one }) => ({
        errorCode: one(errorCodes, {
            fields: [deviceErrorLogs.errorCategory, deviceErrorLogs.errorCode],
            references: [errorCodes.category, errorCodes.code],
        }),
    })
);

// Types
export type ErrorCode = typeof errorCodes.$inferSelect;
export type NewErrorCode = typeof errorCodes.$inferInsert;
export type DashboardSummary = typeof dashboardSummary.$inferSelect;
export type NewDashboardSummary = typeof dashboardSummary.$inferInsert;
export type DeviceErrorLog = typeof deviceErrorLogs.$inferSelect;
export type NewDeviceErrorLog = typeof deviceErrorLogs.$inferInsert;
export type DeviceInfo = typeof deviceInfos.$inferSelect;
export type NewDeviceInfo = typeof deviceInfos.$inferInsert;
export type DeviceMetricLog = typeof deviceMetricLogs.$inferSelect;
export type NewDeviceMetricLog = typeof deviceMetricLogs.$inferInsert;
