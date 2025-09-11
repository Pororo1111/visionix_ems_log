import { testConnection, closeConnection } from "./db";
import { startServer } from "./server";
import { DashboardService } from "./services/dashboard";
import { DeviceService } from "./services/device";
import { seedDatabase } from "./db/seed";

async function main() {
  console.log("🚀 VisionX EMS 마이크로서비스 서버 시작");

  try {
    // 1. 데이터베이스 연결 테스트
    await testConnection();

    // 2. 초기 데이터 삽입 (error_codes 등)
    await seedDatabase();

    // 3. HTTP 서버 시작
    const server = startServer();

    // 4. 대시보드 서비스 초기화 및 주기적 업데이트 시작
    const dashboardService = new DashboardService();
    const deviceService = new DeviceService();
    const intervalMs = Number(process.env.COLLECTION_INTERVAL || 5000);
    
    // 초기 업데이트 실행
    console.log("📊 초기 대시보드 요약정보 업데이트 실행...");
    await dashboardService.updateDashboardSummary();
    
    // 5초마다 주기적 업데이트
    const updateInterval = setInterval(async () => {
      await dashboardService.updateDashboardSummary();
    }, 5000);

    // 디바이스 IP 기반 주기 수집 (DEVICE_IPS 사용)
    const deviceInterval = deviceService.startAutoDiscoveryCollection(intervalMs);

    console.log("📊 대시보드 요약정보 주기적 업데이트 시작 (5초 간격)");

    const gracefulShutdown = async () => {
      console.log("\n🛑 종료 신호 수신...");
      
      // 주기적 업데이트 중지
      clearInterval(updateInterval);
      if (typeof deviceInterval !== 'undefined' && deviceInterval) {
        clearInterval(deviceInterval);
      }
      
      // HTTP 서버 종료
      server.close();
      
      // DB 연결 종료
      await closeConnection();
      
      console.log("✅ 마이크로서비스 서버가 정상적으로 종료되었습니다.");
      process.exit(0);
    };

    process.on("SIGINT", gracefulShutdown);
    process.on("SIGTERM", gracefulShutdown);

    console.log("✅ 마이크로서비스 서버가 성공적으로 시작되었습니다.");

  } catch (error) {
    console.error("❌ 마이크로서비스 서버 시작 실패:", error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("❌ 예상치 못한 오류:", error);
  process.exit(1);
});
