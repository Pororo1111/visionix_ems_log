import { db, schema } from "../db";
import { PrometheusService } from "./prometheus";
import { eq, and, gte, sql, count, avg } from "drizzle-orm";

export class DashboardService {
  private prometheus: PrometheusService;

  constructor() {
    this.prometheus = new PrometheusService();
  }

  // 장비 메트릭 저장 (기존 device 테이블의 장비들만)
  async saveDeviceMetrics(deviceMetrics: any[]): Promise<void> {
    try {
      if (deviceMetrics.length === 0) {
        console.log("저장할 장비 메트릭이 없습니다");
        return;
      }

      // 메트릭 저장
      const metrics = deviceMetrics.map(metric => ({
        deviceName: metric.deviceName,
        isOnline: metric.isOnline,
        cpuUsage: metric.cpuUsage || null,
        memoryUsage: metric.memoryUsage || null,
        temperature: metric.temperature || null,
      }));

      await db.insert(schema.deviceMetrics).values(metrics);
      console.log(`✅ ${metrics.length}개 장비 메트릭 저장 완료`);
    } catch (error) {
      console.error("장비 메트릭 저장 실패:", error);
    }
  }

  // 대시보드 요약 데이터 업데이트 (단일 레코드)
  async updateDashboardSummary(): Promise<void> {
    try {
      console.log("📊 대시보드 요약 데이터 업데이트 시작...");

      const now = new Date();
      const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);

      // 1. Prometheus up{job="devices"} 메트릭으로 장비 상태 집계
      const deviceStats = await this.calculateDeviceStats();

      // 2. Prometheus app_status 상태 집계
      const appLogStats = await this.calculateAppLogStats(fiveMinutesAgo, now);

      // 3. 리소스 사용률 평균 계산 (최근 5분)
      const resourceStats = await this.calculateResourceStats(fiveMinutesAgo, now);

      // 4. 대시보드 요약 데이터 업데이트 (UPSERT)
      await db
        .insert(schema.dashboardSummary)
        .values({
          id: 1, // 고정 ID
          totalDevices: deviceStats.totalDevices,
          activeDevices: deviceStats.activeDevices,
          inactiveDevices: deviceStats.inactiveDevices,
          normalAppStatus: appLogStats.normalCount,
          abnormalAppStatus: appLogStats.abnormalCount,
          avgCpuUsage: resourceStats.avgCpuUsage,
          avgMemoryUsage: resourceStats.avgMemoryUsage,
          lastUpdated: now,
        })
        .onConflictDoUpdate({
          target: schema.dashboardSummary.id,
          set: {
            totalDevices: deviceStats.totalDevices,
            activeDevices: deviceStats.activeDevices,
            inactiveDevices: deviceStats.inactiveDevices,
            normalAppStatus: appLogStats.normalCount,
            abnormalAppStatus: appLogStats.abnormalCount,
            avgCpuUsage: resourceStats.avgCpuUsage,
            avgMemoryUsage: resourceStats.avgMemoryUsage,
            lastUpdated: now,
          },
        });

      console.log("✅ 대시보드 요약 데이터 업데이트 완료");
      console.log(`   - 총 장비: ${deviceStats.totalDevices}개 (활성: ${deviceStats.activeDevices}, 비활성: ${deviceStats.inactiveDevices})`);
      console.log(`   - 정상 로그: ${appLogStats.normalCount}개, 비정상 로그: ${appLogStats.abnormalCount}개`);
      console.log(`   - 평균 CPU: ${resourceStats.avgCpuUsage?.toFixed(1)}%, 평균 메모리: ${resourceStats.avgMemoryUsage?.toFixed(1)}%`);

    } catch (error) {
      console.error("대시보드 요약 데이터 업데이트 실패:", error);
    }
  }

  // Prometheus up{job="devices"} 메트릭 기반 장비 상태 집계
  private async calculateDeviceStats(): Promise<{
    totalDevices: number;
    activeDevices: number;
    inactiveDevices: number;
  }> {
    try {
      // Prometheus에서 up{job="devices"} 메트릭으로 장비 상태 조회
      const deviceStatus = await this.prometheus.getDeviceOnlineStatusFromUp();
      
      if (deviceStatus.length === 0) {
        console.warn("⚠️ Prometheus up{job=\"devices\"}에서 장비를 찾을 수 없습니다");
        return { totalDevices: 0, activeDevices: 0, inactiveDevices: 0 };
      }

      // UP/DOWN 상태별 집계
      const activeDevices = deviceStatus.filter(device => device.isOnline).length;
      const inactiveDevices = deviceStatus.filter(device => !device.isOnline).length;
      const totalDevices = deviceStatus.length;

      console.log("🔍 Prometheus up{job=\"devices\"} 장비 상태:");
      deviceStatus.forEach((device) => {
        console.log(`   - ${device.deviceName}: ${device.isOnline ? 'UP' : 'DOWN'}`);
      });
      
      const result = {
        totalDevices,
        activeDevices,
        inactiveDevices,
      };

      console.log(`📋 Prometheus up 메트릭 집계: 총 ${result.totalDevices}개 (활성: ${result.activeDevices}, 비활성: ${result.inactiveDevices})`);
      return result;
    } catch (error) {
      console.error("Prometheus up 메트릭 장비 상태 집계 실패:", error);
      return { totalDevices: 0, activeDevices: 0, inactiveDevices: 0 };
    }
  }


  // Prometheus app_status 기반 상태 통계 계산
  private async calculateAppLogStats(periodStart: Date, periodEnd: Date): Promise<{
    normalCount: number;
    abnormalCount: number;
  }> {
    try {
      // Prometheus에서 현재 app_status 값 조회
      const appStatus = await this.prometheus.getAppStatus();
      
      if (appStatus === null) {
        console.warn("⚠️ Prometheus app_status 값을 가져올 수 없습니다");
        return { normalCount: 0, abnormalCount: 0 };
      }

      // app_status 값에 따라 정상/비정상 판단 (1은 정상, 2 이상은 에러)
      const isNormal = appStatus === 1;
      
      console.log(`📊 현재 app_status: ${appStatus} (${isNormal ? '정상' : '비정상'})`);
      
      return {
        normalCount: isNormal ? 1 : 0,
        abnormalCount: isNormal ? 0 : 1,
      };
    } catch (error) {
      console.error("Prometheus app_status 통계 계산 실패:", error);
      return { normalCount: 0, abnormalCount: 0 };
    }
  }

  // 리소스 사용률 평균 계산 (최근 5분)
  private async calculateResourceStats(periodStart: Date, periodEnd: Date): Promise<{
    avgCpuUsage: number | null;
    avgMemoryUsage: number | null;
  }> {
    try {
      const result = await db
        .select({
          avgCpuUsage: avg(schema.deviceMetrics.cpuUsage),
          avgMemoryUsage: avg(schema.deviceMetrics.memoryUsage),
        })
        .from(schema.deviceMetrics)
        .where(
          and(
            gte(schema.deviceMetrics.createdAt, periodStart),
            sql`${schema.deviceMetrics.createdAt} <= ${periodEnd}`,
            sql`${schema.deviceMetrics.cpuUsage} IS NOT NULL OR ${schema.deviceMetrics.memoryUsage} IS NOT NULL`
          )
        );

      const avgCpuUsage = result[0]?.avgCpuUsage ? Number(result[0].avgCpuUsage) : null;
      const avgMemoryUsage = result[0]?.avgMemoryUsage ? Number(result[0].avgMemoryUsage) : null;

      return { avgCpuUsage, avgMemoryUsage };
    } catch (error) {
      console.error("리소스 사용률 평균 계산 실패:", error);
      return { avgCpuUsage: null, avgMemoryUsage: null };
    }
  }

  // 전체 데이터 수집 및 업데이트 프로세스
  async collectAndAggregate(): Promise<void> {
    try {
      console.log("🔄 대시보드 데이터 수집 및 업데이트 시작...");

      // 1. Prometheus에서 장비 메트릭 수집 (UP 메트릭으로 헬스체크 포함)
      const deviceMetrics = await this.prometheus.getAllDeviceMetrics();
      
      // UP/DOWN 상태 로깅
      console.log("📡 장비 상태:", deviceMetrics.map(d => 
        `${d.deviceName}: ${d.isOnline ? 'UP' : 'DOWN'} (CPU: ${d.cpuUsage?.toFixed(1) || 'N/A'}%, MEM: ${d.memoryUsage?.toFixed(1) || 'N/A'}%)`
      ).join(', '));

      // 2. 수집된 메트릭 저장
      await this.saveDeviceMetrics(deviceMetrics);

      // 3. 대시보드 요약 데이터 업데이트
      await this.updateDashboardSummary();

      console.log("✅ 대시보드 데이터 수집 및 업데이트 완료");
    } catch (error) {
      console.error("대시보드 데이터 수집 및 업데이트 실패:", error);
    }
  }
}