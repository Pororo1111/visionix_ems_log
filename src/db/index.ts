import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";
import dotenv from "dotenv";

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// 세션 타임존을 KST(Asia/Seoul)로 설정
pool.on('connect', async (client) => {
  try {
    await client.query("SET TIME ZONE 'Asia/Seoul'");
  } catch (err) {
    console.error('세션 타임존 설정 실패 (Asia/Seoul):', err);
  }
});

export const db = drizzle(pool, { schema });

export async function testConnection() {
  try {
    console.log("🔗 데이터베이스 연결 테스트 중...");
    const client = await pool.connect();
    try {
      const tz = await client.query("SHOW TIME ZONE");
      const tzVal = (tz.rows?.[0] as any)?.TimeZone ?? (tz.rows?.[0] as any)?.timezone ?? 'unknown';
      console.log(`🕒 세션 타임존: ${tzVal}`);
    } finally {
      client.release();
    }
    console.log("✅ 데이터베이스 연결 성공");
    return true;
  } catch (error) {
    console.error("❌ 데이터베이스 연결 실패:", error);
    throw error;
  }
}

export async function closeConnection() {
  try {
    console.log("🔐 데이터베이스 연결 종료 중...");
    await pool.end();
    console.log("✅ 데이터베이스 연결 종료 완료");
  } catch (error) {
    console.error("❌ 데이터베이스 연결 종료 실패:", error);
    throw error;
  }
}
