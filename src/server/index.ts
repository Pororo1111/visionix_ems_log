import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { db } from '../db/index';
import { dashboardSummary, deviceInfos, deviceMetricLogs } from '../db/schema';
import { dashboardService } from '../services/dashboard';
import { DeviceService } from '../services/device';
import { sql, inArray, eq, and, gte, lte, desc, asc, count, type SQL } from 'drizzle-orm';

const app: Express = express();
const PORT = Number(process.env.PORT) || 3001;
const deviceService = new DeviceService();

// 미들웨어 설정
app.use(helmet());
app.use(cors());
app.use(express.json());

// 마이그레이션으로 테이블을 준비하는 것을 권장합니다.

// 헬스 체크 엔드포인트
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 디바이스 IP 목록 상태 조회 API
// body: { ips: string[], port?: number, store?: boolean }
app.post('/api/devices/status', async (req, res) => {
  try {
    const ips: string[] = Array.isArray(req.body?.ips) ? req.body.ips : [];
    const port: number | undefined = req.body?.port ? Number(req.body.port) : undefined;
    const store: boolean = req.body?.store !== false; // 기본 저장

    if (!ips || ips.length === 0) {
      return res.status(400).json({
        error: 'ip 목록이 비어있습니다',
        message: 'Provide body { ips: string[] }',
      });
    }

    const statuses = store
      ? await deviceService.getAndStoreStatuses(ips, port)
      : await deviceService.fetchCameraValuesByIps(ips, port);

    res.json({
      success: true,
      data: statuses,
      count: statuses.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('디바이스 상태 조회 API 실패:', error);
    res.status(500).json({
      error: '서버 오류가 발생했습니다',
      message: 'Internal server error',
    });
  }
});

// 저장된 디바이스 상태 조회 (DB 기반)
// query: /api/devices/saved?ips=ip1,ip2
app.get('/api/devices/saved', async (req, res) => {
  try {
    const ipsParam = req.query.ips;
    let ips: string[] = [];

    if (Array.isArray(ipsParam)) {
      ips = (ipsParam as string[]).flatMap((s) => s.split(',')).map((s) => s.trim()).filter(Boolean);
    } else if (typeof ipsParam === 'string') {
      ips = ipsParam.split(',').map((s) => s.trim()).filter(Boolean);
    }

    if (!ips || ips.length === 0) {
      return res.status(400).json({
        error: 'ips 쿼리스트링이 비어있습니다',
        message: 'Use /api/devices/saved?ips=ip1,ip2',
      });
    }

    const rows = await db
      .select()
      .from(deviceInfos)
      .where(inArray(deviceInfos.deviceIp, ips));

    res.json({
      success: true,
      data: rows,
      count: rows.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('저장된 디바이스 조회 API 실패:', error);
    res.status(500).json({
      error: '서버 오류가 발생했습니다',
      message: 'Internal server error',
    });
  }
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

// 읽지 않은 에러 로그 조회 API
app.get('/api/error-logs/unread', async (req, res) => {
  try {
    const unreadLogs = await dashboardService.getUnreadErrorLogs();
    
    res.json({
      success: true,
      data: unreadLogs,
      count: unreadLogs.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('읽지 않은 에러 로그 조회 오류:', error);
    res.status(500).json({ 
      error: '서버 오류가 발생했습니다',
      message: 'Internal server error'
    });
  }
});

// 에러 로그 읽음 처리 API
app.post('/api/error-logs/:id/mark-read', async (req, res) => {
  try {
    const logId = parseInt(req.params.id);
    
    if (isNaN(logId)) {
      return res.status(400).json({
        error: '잘못된 로그 ID입니다',
        message: 'Invalid log ID'
      });
    }

    await dashboardService.markErrorLogAsRead(logId);
    
    res.json({
      success: true,
      message: '에러 로그가 읽음 처리되었습니다',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('에러 로그 읽음 처리 오류:', error);
    res.status(500).json({ 
      error: '서버 오류가 발생했습니다',
      message: 'Internal server error'
    });
  }
});

// 모든 에러 로그 읽음 처리 API
app.post('/api/error-logs/mark-all-read', async (req, res) => {
  try {
    await dashboardService.markAllErrorLogsAsRead();
    
    res.json({
      success: true,
      message: '모든 에러 로그가 읽음 처리되었습니다',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('모든 에러 로그 읽음 처리 오류:', error);
    res.status(500).json({ 
      error: '서버 오류가 발생했습니다',
      message: 'Internal server error'
    });
  }
});

// 디바이스 메트릭 로그 조회 API
app.get('/api/logs', async (req: Request, res: Response) => {
  try {
    const { from, to } = req.query;
    const limitParam = req.query.limit;
    const offsetParam = req.query.offset;
    const orderParam = req.query.order;

    const getFirstString = (value: unknown): string | undefined => {
      if (typeof value === 'string') {
        return value;
      }
      if (Array.isArray(value)) {
        for (const item of value) {
          if (typeof item === 'string') {
            return item;
          }
        }
      }
      return undefined;
    };

    const parseListParam = (value: unknown): string[] => {
      if (value === undefined || value === null) {
        return [];
      }
      const source = Array.isArray(value) ? value : [value];
      const tokens: string[] = [];

      for (const entry of source) {
        if (typeof entry !== 'string') {
          continue;
        }
        tokens.push(...entry.split(','));
      }

      return tokens.map((token) => token.trim()).filter((token) => token.length > 0);
    };

    const deviceIps = parseListParam(req.query.deviceIp);
    const metricNames = parseListParam(req.query.metricName ?? req.query.metricNames);
    const instances = parseListParam(req.query.instance);

    const limitRaw = getFirstString(limitParam);
    let parsedLimit: number | undefined;
    if (limitRaw !== undefined) {
      const limitNumber = Number(limitRaw);
      if (!Number.isFinite(limitNumber)) {
        return res.status(400).json({
          error: '잘못된 limit 파라미터입니다',
          message: 'limit 값은 숫자여야 합니다',
        });
      }
      parsedLimit = limitNumber;
    }
    const limit = Math.min(Math.max(parsedLimit ?? 100, 1), 500);

    const offsetRaw = getFirstString(offsetParam);
    let parsedOffset: number | undefined;
    if (offsetRaw !== undefined) {
      const offsetNumber = Number(offsetRaw);
      if (!Number.isFinite(offsetNumber)) {
        return res.status(400).json({
          error: '잘못된 offset 파라미터입니다',
          message: 'offset 값은 숫자여야 합니다',
        });
      }
      parsedOffset = offsetNumber;
    }
    const offset = Math.max(parsedOffset ?? 0, 0);

    const orderRaw = getFirstString(orderParam);
    const orderDirection = orderRaw && orderRaw.toLowerCase() === 'asc' ? 'asc' : 'desc';
    const conditions: SQL[] = [];

    if (deviceIps.length === 1) {
      conditions.push(eq(deviceMetricLogs.deviceIp, deviceIps[0]));
    } else if (deviceIps.length > 1) {
      conditions.push(inArray(deviceMetricLogs.deviceIp, deviceIps));
    }

    if (metricNames.length === 1) {
      conditions.push(eq(deviceMetricLogs.metricName, metricNames[0]));
    } else if (metricNames.length > 1) {
      conditions.push(inArray(deviceMetricLogs.metricName, metricNames));
    }

    if (instances.length === 1) {
      conditions.push(eq(deviceMetricLogs.instance, instances[0]));
    } else if (instances.length > 1) {
      conditions.push(inArray(deviceMetricLogs.instance, instances));
    }

    const fromRaw = getFirstString(from);
    if (fromRaw) {
      const fromDate = new Date(fromRaw);
      if (Number.isNaN(fromDate.getTime())) {
        return res.status(400).json({
          error: '잘못된 from 파라미터입니다',
          message: 'from 날짜 형식이 유효하지 않습니다',
        });
      }
      conditions.push(gte(deviceMetricLogs.scrapedAt, fromDate));
    }

    const toRaw = getFirstString(to);
    if (toRaw) {
      const toDate = new Date(toRaw);
      if (Number.isNaN(toDate.getTime())) {
        return res.status(400).json({
          error: '잘못된 to 파라미터입니다',
          message: 'to 날짜 형식이 유효하지 않습니다',
        });
      }
      conditions.push(lte(deviceMetricLogs.scrapedAt, toDate));
    }

    const whereCondition = conditions.length > 0 ? and(...conditions) : undefined;

    const baseQuery = db
      .select()
      .from(deviceMetricLogs);

    const filteredQuery = whereCondition
      ? baseQuery.where(whereCondition)
      : baseQuery;

    const orderByClause = orderDirection === 'asc'
      ? asc(deviceMetricLogs.scrapedAt)
      : desc(deviceMetricLogs.scrapedAt);

    const rows = await filteredQuery
      .orderBy(orderByClause)
      .limit(limit)
      .offset(offset);

    const totalResult = await (
      whereCondition
        ? db.select({ total: count() }).from(deviceMetricLogs).where(whereCondition)
        : db.select({ total: count() }).from(deviceMetricLogs)
    );

    const total = Number(totalResult[0]?.total ?? 0);

    res.json({
      success: true,
      data: rows,
      count: rows.length,
      total,
      limit,
      offset,
      order: orderDirection,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('메트릭 로그 조회 오류:', error);
    res.status(500).json({
      error: '서버 오류가 발생했습니다',
      message: 'Internal server error',
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
    console.log(`🚨 읽지 않은 에러 로그 API: http://localhost:${PORT}/api/error-logs/unread`);
    console.log(`✅ 에러 로그 읽음 처리 API: http://localhost:${PORT}/api/error-logs/:id/mark-read`);
    console.log(`✅ 모든 에러 로그 읽음 처리 API: http://localhost:${PORT}/api/error-logs/mark-all-read`);
    console.log(`📝 메트릭 로그 조회 API: http://localhost:${PORT}/api/logs`);
    console.log(`❤️ 헬스 체크: http://localhost:${PORT}/health`);
  });

  return server;
}

export default app;






