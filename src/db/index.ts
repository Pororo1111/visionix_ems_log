import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";
import dotenv from "dotenv";

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || "postgresql://username:password@localhost:5432/visionx_ems",
});

export const db = drizzle(pool, { schema });

export async function testConnection() {
  try {
    const client = await pool.connect();
    console.log("✅ DB 연결 성공");
    
    // 간단한 쿼리로 연결 테스트
    await client.query('SELECT 1');
    client.release();
  } catch (error) {
    console.error("❌ DB 연결 실패:", error);
    throw error;
  }
}

export async function closeConnection() {
  try {
    await pool.end();
    console.log("✅ DB 연결 종료");
  } catch (error) {
    console.error("❌ DB 연결 종료 실패:", error);
  }
}

export { schema };