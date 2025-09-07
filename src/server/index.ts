import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { db } from '../db/index';
import { dashboardSummary } from '../db/schema';
import { sql } from 'drizzle-orm';

const app: Express = express();
const PORT = Number(process.env.PORT) || 3001;

// 미들웨어 설정
app.use(helmet());
app.use(cors());
app.use(express.json());

// 헬스 체크 엔드포인트
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 대시보드 요약정보 API
app.get('/api/dashboard-summary', async (req, res) => {
  try {
    const summary = await db.select().from(dashboardSummary).limit(1);
    
    if (summary.length === 0) {
      return res.status(404).json({ 
        error: '대시보드 요약정보가 없습니다',
        message: 'No dashboard summary found'
      });
    }

    // 데이터 그대로 반환 (normalCameraStatus, abnormalCameraStatus는 이미 존재)
    const data = {
      ...summary[0]
    };

    res.json({
      success: true,
      data: data,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('대시보드 요약정보 조회 오류:', error);
    res.status(500).json({ 
      error: '서버 오류가 발생했습니다',
      message: 'Internal server error'
    });
  }
});


// 에러 핸들링 미들웨어
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('서버 오류:', err);
  res.status(500).json({ 
    error: '서버 오류가 발생했습니다',
    message: err.message 
  });
});

// 404 핸들러
app.use((req, res) => {
  res.status(404).json({ 
    error: '요청한 리소스를 찾을 수 없습니다',
    message: 'Not found' 
  });
});

export function startServer() {
  const server = app.listen(PORT, () => {
    console.log(`🚀 마이크로서비스 서버가 포트 ${PORT}에서 실행 중입니다`);
    console.log(`📊 대시보드 요약 API: http://localhost:${PORT}/api/dashboard-summary`);
    console.log(`❤️ 헬스 체크: http://localhost:${PORT}/health`);
  });

  return server;
}

export default app;