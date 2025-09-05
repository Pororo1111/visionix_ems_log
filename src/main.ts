import { testConnection, closeConnection } from "./db";
import { MetricsCollector } from "./jobs/collector";

async function main() {
  console.log("🚀 VisionX EMS 데이터 수집기 시작");

  try {
    // 1. 데이터베이스 연결 테스트
    await testConnection();

    // 2. 메트릭 수집기 초기화
    const collector = new MetricsCollector();
    await collector.initializeErrorCodes();

    // 3. 메트릭 수집 시작
    collector.start(5000);

    const gracefulShutdown = async () => {
      console.log("\n🛑 종료 신호 수신...");
      
      // 수집기 중지
      collector.stop();
      
      // DB 연결 종료
      await closeConnection();
      
      console.log("✅ 데이터 수집기가 정상적으로 종료되었습니다.");
      process.exit(0);
    };

    process.on("SIGINT", gracefulShutdown);
    process.on("SIGTERM", gracefulShutdown);

    console.log("✅ 데이터 수집기가 성공적으로 시작되었습니다.");
    console.log("📊 기본 메트릭 수집: 5초 간격 (app_status, ocr_value)");
    console.log("📈 대시보드 데이터 수집: 5초 간격 (장비 헬스체크, 리소스, 집계)");
    console.log("🗄️ 데이터는 PostgreSQL 데이터베이스에 저장됩니다.");
    console.log("종료하려면 Ctrl+C를 누르세요.");

  } catch (error) {
    console.error("❌ 데이터 수집기 시작 실패:", error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("❌ 예상치 못한 오류:", error);
  process.exit(1);
});