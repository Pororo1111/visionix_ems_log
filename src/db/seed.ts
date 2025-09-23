import { db } from "./index";
import { errorCodes, dashboardSummary } from "./schema";
import { and, eq } from "drizzle-orm";

// error_codes 초기 데이터 (카메라/HDMI/AC/DC)
const initialErrorCodes = [
  // camera_value (정수 코드)
  { category: "camera", code: 0, name: "정상", description: "카메라 정상" },
  { category: "camera", code: 1, name: "시계멈춤", description: "카메라 시계가 멈춤" },
  { category: "camera", code: 2, name: "신호없음", description: "영상 신호 없음" },
  { category: "camera", code: 3, name: "패널손상", description: "패널 손상 또는 화면 이상" },
  { category: "camera", code: 4, name: "기타 이상감지", description: "그 외 이상 현상" },

  // hdmi_value (0:정상, 1:시계멈춤, 2:신호없음, 3:기타 이상현상)
  { category: "hdmi", code: 0, name: "정상", description: "HDMI 정상" },
  { category: "hdmi", code: 1, name: "시계멈춤", description: "HDMI 입력 시계가 멈춤" },
  { category: "hdmi", code: 2, name: "신호없음", description: "HDMI 신호 없음" },
  { category: "hdmi", code: 3, name: "기타 이상현상", description: "HDMI 기타 이상" },

  // ac_value (0:정상, 1:비정상)
  { category: "ac", code: 0, name: "정상", description: "AC 정상" },
  { category: "ac", code: 1, name: "비정상", description: "AC 비정상" },

  // dc_value (0:정상, 1:비정상)
  { category: "dc", code: 0, name: "정상", description: "DC 정상" },
  { category: "dc", code: 1, name: "비정상", description: "DC 비정상" },
];

export async function seedDatabase() {
  try {
    console.log("🌱 데이터베이스 초기 데이터 삽입 시작...");
    
    // Error codes 삽입 (카테고리+코드 기준 UPSERT)
    for (const ec of initialErrorCodes) {
      const existing = await db
        .select()
        .from(errorCodes)
        .where(and(eq(errorCodes.category, ec.category), eq(errorCodes.code, ec.code)))
        .limit(1);

      if (existing.length === 0) {
        await db.insert(errorCodes).values(ec);
        console.log(`✅ [${ec.category}] 에러 코드 ${ec.code} (${ec.name}) 추가`);
      } else {
        // 기존 코드 갱신
        await db
          .update(errorCodes)
          .set({ name: ec.name, description: ec.description })
          .where(and(eq(errorCodes.category, ec.category), eq(errorCodes.code, ec.code)));
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
        normalHdmiStatus: 0,
        abnormalHdmiStatus: 0,
        normalAcStatus: 0,
        abnormalAcStatus: 0,
        normalDcStatus: 0,
        abnormalDcStatus: 0,
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
