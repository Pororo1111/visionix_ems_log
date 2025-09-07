import { db } from "./index";
import { errorCodes } from "./schema";

// 카메라 상태 초기 에러코드 정의
export const initialErrorCodes = [
  { code: 0, name: "정상", description: "카메라 정상 작동 상태" },
  { code: 1, name: "시계멈춤", description: "카메라 시계 기능 이상" },
  { code: 2, name: "신호없음", description: "카메라 신호 수신 불가" },
  { code: 3, name: "패널손상", description: "카메라 패널 물리적 손상" },
  { code: 4, name: "기타이상감지", description: "기타 알 수 없는 이상 상태" },
] as const;

/**
 * error_codes 테이블에 초기 데이터를 삽입합니다.
 * 이미 존재하는 코드는 업데이트하고, 없는 코드는 새로 삽입합니다.
 */
export async function seedErrorCodes() {
  try {
    console.log("🌱 error_codes 테이블 초기화 시작...");

    // upsert 방식으로 데이터 삽입/업데이트
    for (const errorCode of initialErrorCodes) {
      await db
        .insert(errorCodes)
        .values(errorCode)
        .onConflictDoUpdate({
          target: errorCodes.code,
          set: {
            name: errorCode.name,
            description: errorCode.description,
          },
        });
    }

    console.log(`✅ error_codes 테이블 초기화 완료: ${initialErrorCodes.length}개 코드 삽입/업데이트`);
  } catch (error) {
    console.error("❌ error_codes 테이블 초기화 실패:", error);
    throw error;
  }
}

/**
 * 모든 초기 데이터를 삽입하는 메인 시드 함수
 */
export async function seedDatabase() {
  try {
    console.log("🌱 데이터베이스 초기화 시작...");
    
    await seedErrorCodes();
    
    console.log("✅ 데이터베이스 초기화 완료");
  } catch (error) {
    console.error("❌ 데이터베이스 초기화 실패:", error);
    throw error;
  }
}