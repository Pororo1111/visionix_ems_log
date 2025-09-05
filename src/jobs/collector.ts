import { PrometheusService } from "../services/prometheus";
import { DashboardService } from "../services/dashboard";
import { db, schema } from "../db";

export class MetricsCollector {
  private prometheus: PrometheusService;
  private dashboard: DashboardService;
  private intervalId: NodeJS.Timeout | null = null;
  private dashboardIntervalId: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor() {
    this.prometheus = new PrometheusService();
    this.dashboard = new DashboardService();
  }

  async collectAndStore(): Promise<void> {
    try {
      console.log("📊 메트릭 수집 시작...");

      const appStatus = await this.prometheus.getAppStatus();
      
      if (appStatus === null) {
        console.warn("⚠️ app_status 값이 null입니다. 기본값 99(UNKNOWN_ERROR)로 설정");
      }

      const finalAppStatus = appStatus ?? 99;

      await db.insert(schema.appLogs).values({
        appStatus: finalAppStatus,
      });

      console.log(`✅ 데이터 저장 완료 - app_status: ${finalAppStatus}`);
    } catch (error) {
      console.error("❌ 메트릭 수집/저장 실패:", error);
    }
  }

  start(intervalMs: number = 5000): void {
    if (this.isRunning) {
      console.log("⚠️ 이미 실행 중입니다.");
      return;
    }

    console.log(`🚀 메트릭 수집기 시작 (${intervalMs}ms 간격)`);
    this.isRunning = true;

    // 기본 app_status, ocr_value 수집 (5초 간격)
    this.intervalId = setInterval(() => {
      this.collectAndStore();
    }, intervalMs);

    // 대시보드 데이터 수집 및 집계 (5초 간격으로 변경)
    this.dashboardIntervalId = setInterval(() => {
      this.dashboard.collectAndAggregate();
    }, intervalMs);

    // 즉시 한 번 실행
    this.collectAndStore();
    this.dashboard.collectAndAggregate(); // 즉시 대시보드 수집
  }

  stop(): void {
    if (!this.isRunning) {
      console.log("⚠️ 실행 중이 아닙니다.");
      return;
    }

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    if (this.dashboardIntervalId) {
      clearInterval(this.dashboardIntervalId);
      this.dashboardIntervalId = null;
    }

    this.isRunning = false;
    console.log("🛑 메트릭 수집기 중지");
  }

  isCollecting(): boolean {
    return this.isRunning;
  }

  async initializeErrorCodes(): Promise<void> {
    try {
      console.log("🔧 기본 에러코드 초기화...");

      const errorCodes = [
        { code: 1, name: "OK", description: "정상 상태" },
        { code: 2, name: "DB_ERROR", description: "데이터베이스 연결 오류" },
        { code: 3, name: "NETWORK_ERROR", description: "네트워크 장애" },
        { code: 99, name: "UNKNOWN_ERROR", description: "정의되지 않은 오류" },
      ];

      for (const errorCode of errorCodes) {
        try {
          await db
            .insert(schema.errorCodes)
            .values(errorCode)
            .onConflictDoNothing();
        } catch (insertError) {
        }
      }

      console.log("✅ 기본 에러코드 초기화 완료");
    } catch (error) {
      console.error("❌ 에러코드 초기화 실패:", error);
    }
  }
}