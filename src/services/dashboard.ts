import { db } from "../db/index";
import { dashboardSummary, deviceErrorLogs } from "../db/schema";
import { PrometheusService } from "./prometheus";
import { sql } from "drizzle-orm";

export class DashboardService {
  private prometheus: PrometheusService;

  constructor() {
    this.prometheus = new PrometheusService();
  }

  /**
   * 현재 대시보드 요약정보를 조회합니다
   */
  async getDashboardSummary() {
    try {
      const result = await db.select().from(dashboardSummary).limit(1);
      return result[0] || null;
    } catch (error) {
      console.error('❌ 대시보드 요약정보 조회 오류:', error);
      throw error;
    }
  }

  /**
   * Prometheus에서 데이터를 수집하여 dashboard_summary 업데이트
   */
  async updateDashboardSummary(): Promise<void> {
    try {
      console.log("📊 대시보드 요약 데이터 업데이트 시작...");

      // 1. Prometheus에서 camera_value와 instance 조회
      const cameraResult = await this.prometheus.getCameraValue();
      let normalCount = 0;
      let abnormalCount = 0;
      
      if (cameraResult !== null) {
        const { value: cameraValue, instance } = cameraResult;
        
        if (cameraValue === 0) {
          normalCount = 1;
          abnormalCount = 0;
        } else {
          normalCount = 0;
          abnormalCount = 1;
          
          // 에러 상태일 때마다 UPSERT로 최종 발생 시간 업데이트
          await this.logDeviceErrorWithIp(instance, cameraValue);
        }
        
        // 에러 상태별 메시지
        const statusMessage = this.getStatusMessage(cameraValue);
        console.log(`📊 현재 camera_value: ${cameraValue} (${statusMessage}) - instance: ${instance}`);
      } else {
        console.warn("⚠️ camera_value 메트릭을 찾을 수 없어 상태 집계를 0으로 설정");
        // camera_value가 null이면 정상/비정상 모두 0으로 설정
        normalCount = 0;
        abnormalCount = 0;
      }

      // 2. Prometheus에서 장비 상태 조회 (up 메트릭)
      const deviceStats = await this.prometheus.getDeviceOnlineStatusFromUp();
      const totalDevices = deviceStats.length;
      const activeDevices = deviceStats.filter(d => d.isOnline).length;
      const inactiveDevices = deviceStats.filter(d => !d.isOnline).length;

      // 3. Prometheus에서 CPU, 메모리 사용률 조회
      const [cpuUsageData, memoryUsageData] = await Promise.all([
        this.prometheus.getDeviceCpuUsage(),
        this.prometheus.getDeviceMemoryUsage()
      ]);

      // CPU/메모리 평균값 계산
      const cpuValues = Object.values(cpuUsageData);
      const memoryValues = Object.values(memoryUsageData);
      
      const avgCpuUsage = cpuValues.length > 0 
        ? cpuValues.reduce((sum, val) => sum + val, 0) / cpuValues.length 
        : 0;
        
      const avgMemoryUsage = memoryValues.length > 0 
        ? memoryValues.reduce((sum, val) => sum + val, 0) / memoryValues.length 
        : 0;

      // 4. dashboard_summary 테이블 업데이트 (UPSERT)
      await db.execute(sql`
        INSERT INTO dashboard_summary (
          id, 
          total_devices, 
          active_devices, 
          inactive_devices, 
          normal_camera_status, 
          abnormal_camera_status, 
          avg_cpu_usage, 
          avg_memory_usage, 
          last_updated
        ) VALUES (
          1, 
          ${totalDevices}, 
          ${activeDevices}, 
          ${inactiveDevices}, 
          ${normalCount}, 
          ${abnormalCount}, 
          ${avgCpuUsage}, 
          ${avgMemoryUsage}, 
          NOW()
        )
        ON CONFLICT (id) DO UPDATE SET
          total_devices = EXCLUDED.total_devices,
          active_devices = EXCLUDED.active_devices,
          inactive_devices = EXCLUDED.inactive_devices,
          normal_camera_status = EXCLUDED.normal_camera_status,
          abnormal_camera_status = EXCLUDED.abnormal_camera_status,
          avg_cpu_usage = EXCLUDED.avg_cpu_usage,
          avg_memory_usage = EXCLUDED.avg_memory_usage,
          last_updated = EXCLUDED.last_updated
      `);

      console.log("✅ 대시보드 요약 데이터 업데이트 완료");
      console.log(`   - 총 장비: ${totalDevices}개 (활성: ${activeDevices}, 비활성: ${inactiveDevices})`);
      console.log(`   - 정상 상태: ${normalCount}, 비정상 상태: ${abnormalCount}`);
      console.log(`   - 평균 CPU: ${avgCpuUsage.toFixed(1)}%, 평균 메모리: ${avgMemoryUsage.toFixed(1)}%`);

    } catch (error) {
      console.error("❌ 대시보드 요약 데이터 업데이트 실패:", error);
    }
  }

  /**
   * camera_value 코드에 따른 상태 메시지 반환
   */
  private getStatusMessage(cameraValue: number): string {
    const statusMap: Record<number, string> = {
      0: '정상',
      1: '시계멈춤', 
      2: '신호없음',
      3: '패널손상',
      4: '기타 이상감지'
    };
    
    return statusMap[cameraValue] || `알 수 없는 상태 (${cameraValue})`;
  }


  /**
   * 장비 IP로 에러 로그를 UPSERT 방식으로 저장/업데이트
   */
  private async logDeviceErrorWithIp(deviceIp: string, errorCode: number): Promise<void> {
    try {
      const errorMessage = this.getStatusMessage(errorCode);
      const currentTime = new Date();
      
      // 기존 레코드 찾기
      const existingLog = await db
        .select()
        .from(deviceErrorLogs)
        .where(sql`device_ip = ${deviceIp}`)
        .limit(1);

      if (existingLog.length > 0) {
        // 기존 레코드가 있으면 업데이트
        await db
          .update(deviceErrorLogs)
          .set({
            errorCode,
            errorMessage,
            lastOccurredAt: currentTime,
            isRead: false // 새로운 에러 발생으로 읽지 않음 상태로 변경
          })
          .where(sql`device_ip = ${deviceIp}`);
        
        console.log(`🔄 에러 로그 업데이트 - IP: ${deviceIp}, 에러코드: ${errorCode} (${errorMessage})`);
      } else {
        // 새 레코드 생성
        await db.insert(deviceErrorLogs).values({
          deviceIp,
          errorCode,
          errorMessage,
          occurredAt: currentTime,
          lastOccurredAt: currentTime,
          isRead: false
        });
        
        console.log(`🚨 에러 로그 신규 생성 - IP: ${deviceIp}, 에러코드: ${errorCode} (${errorMessage})`);
      }
    } catch (error) {
      console.error("❌ 에러 로그 UPSERT 실패:", error);
    }
  }


  /**
   * 읽지 않은 에러 로그 조회
   */
  async getUnreadErrorLogs() {
    try {
      const unreadLogs = await db
        .select()
        .from(deviceErrorLogs)
        .where(sql`is_read = false`)
        .orderBy(sql`occurred_at DESC`);
      
      return unreadLogs;
    } catch (error) {
      console.error('❌ 읽지 않은 에러 로그 조회 오류:', error);
      throw error;
    }
  }

  /**
   * 에러 로그 읽음 처리
   */
  async markErrorLogAsRead(logId: number): Promise<void> {
    try {
      await db
        .update(deviceErrorLogs)
        .set({ 
          isRead: true, 
          readAt: new Date() 
        })
        .where(sql`id = ${logId}`);
      
      console.log(`✅ 에러 로그 읽음 처리 완료 - ID: ${logId}`);
    } catch (error) {
      console.error('❌ 에러 로그 읽음 처리 오류:', error);
      throw error;
    }
  }

  /**
   * 모든 에러 로그를 읽음 처리
   */
  async markAllErrorLogsAsRead(): Promise<void> {
    try {
      await db
        .update(deviceErrorLogs)
        .set({ 
          isRead: true, 
          readAt: new Date() 
        })
        .where(sql`is_read = false`);
      
      console.log(`✅ 모든 에러 로그 읽음 처리 완료`);
    } catch (error) {
      console.error('❌ 모든 에러 로그 읽음 처리 오류:', error);
      throw error;
    }
  }
}

export const dashboardService = new DashboardService();