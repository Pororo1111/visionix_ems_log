import { db } from "./index";
import { errorCodes, dashboardSummary } from "./schema";
import { eq } from "drizzle-orm";

const initialErrorCodes = [
  { code: 0, name: "정상", description: "카메라가 정상적으로 작동 중" },
  { code: 1, name: "연결 끊김", description: "카메라와의 연결이 끊어짐" },
  { code: 2, name: "하드웨어 오류", description: "카메라 하드웨어에 문제 발생" },
  { code: 3, name: "영상 손실", description: "영상 신호를 받을 수 없음" },
  { code: 4, name: "네트워크 오류", description: "네트워크 연결 문제" },
  { code: 5, name: "인증 실패", description: "카메라 접근 인증 실패" },
  { code: 999, name: "알 수 없는 오류", description: "정의되지 않은 오류 상태" },
];

export async function seedDatabase() {
  try {
    console.log("🌱 데이터베이스 초기 데이터 삽입 시작...");
    
    // Error codes 삽입
    for (const errorCode of initialErrorCodes) {
      const existing = await db
        .select()
        .from(errorCodes)
        .where(eq(errorCodes.code, errorCode.code))
        .limit(1);
      
      if (existing.length === 0) {
        await db.insert(errorCodes).values(errorCode);
        console.log(`✅ 에러 코드 ${errorCode.code} (${errorCode.name}) 추가`);
      }
    }
    
    // Dashboard summary 초기 레코드 삽입 (id=1)
    const existingDashboard = await db
      .select()
      .from(dashboardSummary)
      .where(eq(dashboardSummary.id, 1))
      .limit(1);
    
    if (existingDashboard.length === 0) {
      await db.insert(dashboardSummary).values({
        id: 1,
        totalDevices: 0,
        activeDevices: 0,
        inactiveDevices: 0,
        normalCameraStatus: 0,
        abnormalCameraStatus: 0,
        avgCpuUsage: 0,
        avgMemoryUsage: 0,
      });
      console.log("✅ 대시보드 요약 초기 레코드 생성");
    }
    
    console.log("✅ 데이터베이스 초기 데이터 삽입 완료");
  } catch (error) {
    console.error("❌ 데이터베이스 초기 데이터 삽입 실패:", error);
    throw error;
  }
}