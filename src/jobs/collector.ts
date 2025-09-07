import { DashboardService } from "../services/dashboard";

export class MetricsCollector {
  private dashboard: DashboardService;
  private dashboardIntervalId: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor() {
    this.dashboard = new DashboardService();
  }

  start(intervalMs: number = 5000): void {
    if (this.isRunning) {
      console.log("⚠️ 이미 실행 중입니다.");
      return;
    }

    console.log(`🚀 대시보드 메트릭 수집기 시작 (${intervalMs}ms 간격)`);
    this.isRunning = true;

    // 대시보드 데이터 수집 및 업데이트 (5초 간격)
    this.dashboardIntervalId = setInterval(() => {
      this.dashboard.updateDashboardSummary();
    }, intervalMs);

    // 즉시 한 번 실행
    this.dashboard.updateDashboardSummary();
  }

  stop(): void {
    if (!this.isRunning) {
      console.log("⚠️ 실행 중이 아닙니다.");
      return;
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
}