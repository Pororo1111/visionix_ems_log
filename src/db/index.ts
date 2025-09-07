import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";
import dotenv from "dotenv";

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export const db = drizzle(pool, { schema });

export async function testConnection() {
  try {
    console.log("🔗 데이터베이스 연결 테스트 중...");
    const result = await db.execute(`SELECT 1 as test`);
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