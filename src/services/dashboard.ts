import { db } from "../db/index";
import { dashboardSummary, deviceErrorLogs } from "../db/schema";
import { PrometheusService } from "./prometheus";
import { and, desc, eq } from "drizzle-orm";

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

      // 1. Prometheus에서 camera_value 전체 시계열을 조회해 상태 집계
      const {
        normalCount,
        abnormalCount,
        abnormalDevices,
      } = await this.prometheus.getCameraStatusSummary();

      if (normalCount + abnormalCount === 0) {
        console.warn("⚠️ camera_value 메트릭을 찾을 수 없어 상태 집계를 0으로 설정");
      }

      for (const device of abnormalDevices) {
        const statusMessage = this.getErrorMessage('camera', device.value);
        console.log(
          `🚨 비정상 camera_value 감지 - instance: ${device.instance}, value: ${device.value} (${statusMessage})`
        );

        // 에러 상태일 때마다 UPSERT로 최종 발생 시간 업데이트
        await this.logDeviceErrorWithIp(device.instance, device.value);
      }

      // 2. Prometheus에서 장비 상태 조회 (up 메트릭)
      const deviceStats = await this.prometheus.getDeviceOnlineStatusFromUp();
      const totalDevices = deviceStats.length;
      const activeDevices = deviceStats.filter(d => d.isOnline).length;
      const inactiveDevices = deviceStats.filter(d => !d.isOnline).length;

      // 3. Prometheus에서 CPU, 메모리 사용률 조회
      const [cpuUsageData, memoryUsageData, hdmiMap, acMap, dcMap] = await Promise.all([
        this.prometheus.getDeviceCpuUsage(),
        this.prometheus.getDeviceMemoryUsage(),
        this.fetchMetricMap('hdmi_value'),
        this.fetchMetricMap('ac_value'),
        this.fetchMetricMap('dc_value'),
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

      // hdmi/ac/dc 정상/비정상 집계 (OCR 제외)
      let normalHdmiStatus = 0;
      let abnormalHdmiStatus = 0;
      for (const v of hdmiMap.values()) {
        if (v === 0) normalHdmiStatus++; else abnormalHdmiStatus++;
      }
      let normalAcStatus = 0;
      let abnormalAcStatus = 0;
      for (const v of acMap.values()) {
        if (v === 0) normalAcStatus++; else abnormalAcStatus++;
      }
      let normalDcStatus = 0;
      let abnormalDcStatus = 0;
      for (const v of dcMap.values()) {
        if (v === 0) normalDcStatus++; else abnormalDcStatus++;
      }

      // 4. dashboard_summary 테이블 업데이트 (UPSERT)
      await db
        .insert(dashboardSummary)
        .values({
          id: 1,
          totalDevices,
          activeDevices,
          inactiveDevices,
          normalCameraStatus: normalCount,
          abnormalCameraStatus: abnormalCount,
          normalHdmiStatus,
          abnormalHdmiStatus,
          normalAcStatus,
          abnormalAcStatus,
          normalDcStatus,
          abnormalDcStatus,
          avgCpuUsage,
          avgMemoryUsage,
          lastUpdated: new Date(),
        })
        .onConflictDoUpdate({
          target: [dashboardSummary.id],
          set: {
            totalDevices,
            activeDevices,
            inactiveDevices,
            normalCameraStatus: normalCount,
            abnormalCameraStatus: abnormalCount,
            normalHdmiStatus,
            abnormalHdmiStatus,
            normalAcStatus,
            abnormalAcStatus,
            normalDcStatus,
            abnormalDcStatus,
            avgCpuUsage,
            avgMemoryUsage,
            lastUpdated: new Date(),
          },
        });

      console.log("✅ 대시보드 요약 데이터 업데이트 완료");
      console.log(`   - 총 장비: ${totalDevices}개 (활성: ${activeDevices}, 비활성: ${inactiveDevices})`);
      console.log(`   - 정상 상태: ${normalCount}, 비정상 상태: ${abnormalCount}`);
      console.log(`   - 평균 CPU: ${avgCpuUsage.toFixed(1)}%, 평균 메모리: ${avgMemoryUsage.toFixed(1)}%`);

      // 5. hdmi/ac/dc 비정상 감지 시 device_error_logs 업데이트
      for (const [instance, value] of hdmiMap.entries()) {
        if (value !== 0) {
          await this.upsertDeviceError(instance, 'hdmi', value, { hdmiValue: value });
        }
      }
      for (const [instance, value] of acMap.entries()) {
        if (value === 1) {
          await this.upsertDeviceError(instance, 'ac', value, { acValue: value });
        }
      }
      for (const [instance, value] of dcMap.entries()) {
        if (value === 1) {
          await this.upsertDeviceError(instance, 'dc', value, { dcValue: value });
        }
      }

    } catch (error) {
      console.error("❌ 대시보드 요약 데이터 업데이트 실패:", error);
    }
  }

  /**
   * 카테고리별 에러 코드 메시지 매핑
   */
  private getErrorMessage(category: 'camera' | 'hdmi' | 'ac' | 'dc', code: number): string {
    const maps: Record<string, Record<number, string>> = {
      camera: {
        0: '정상',
        1: '시계멈춤',
        2: '신호없음',
        3: '패널손상',
        4: '기타 이상감지',
      },
      hdmi: {
        0: '정상',
        1: '시계멈춤',
        2: '신호없음',
        3: '기타 이상현상',
      },
      ac: {
        0: '정상',
        1: '비정상',
      },
      dc: {
        0: '정상',
        1: '비정상',
      },
    };

    const map = maps[category] || {};
    return map[code] || `알 수 없는 상태 (${code})`;
  }

  /** Prometheus에서 단일 메트릭을 조회하여 instance->value 매핑으로 반환 */
  private async fetchMetricMap(metricName: string): Promise<Map<string, number>> {
    const samples = await this.prometheus.queryMetric(`${metricName}`);
    const map = new Map<string, number>();
    for (const s of samples) {
      const instance = s.metric.instance || 'unknown';
      const raw = s?.value?.[1];
      const parsed = raw !== undefined ? Number(raw) : NaN;
      if (Number.isFinite(parsed)) {
        map.set(instance, parsed);
      }
    }
    return map;
  }


  /**
   * 장비 IP로 에러 로그를 UPSERT 방식으로 저장/업데이트
   */
  private async logDeviceErrorWithIp(deviceIp: string, errorCode: number): Promise<void> {
    try {
      const errorMessage = this.getErrorMessage('camera', errorCode);
      const currentTime = new Date();
      const category = "camera" as const;
      
      // 기존 레코드 찾기
      const existingLog = await db
        .select()
        .from(deviceErrorLogs)
        .where(and(eq(deviceErrorLogs.deviceIp, deviceIp), eq(deviceErrorLogs.errorCategory, category)))
        .limit(1);

      if (existingLog.length > 0) {
        // 기존 레코드가 있으면 업데이트
        await db
          .update(deviceErrorLogs)
          .set({
            errorCode,
            errorMessage,
            lastOccurredAt: currentTime,
            isRead: false, // 새로운 에러 발생으로 읽지 않음 상태로 변경
            cameraValue: errorCode,
          })
          .where(and(eq(deviceErrorLogs.deviceIp, deviceIp), eq(deviceErrorLogs.errorCategory, category)));
        
      } else {
        // 새 레코드 생성
        await db.insert(deviceErrorLogs).values({
          deviceIp,
          errorCategory: category,
          errorCode,
          errorMessage,
          occurredAt: currentTime,
          lastOccurredAt: currentTime,
          isRead: false,
          cameraValue: errorCode
        });
        
      }
    } catch (error) {
      console.error("❌ 에러 로그 UPSERT 실패:", error);
    }
  }

  /** 범용 에러 로그 UPSERT (카테고리별) */
  private async upsertDeviceError(
    deviceIp: string,
    category: 'camera' | 'hdmi' | 'ac' | 'dc',
    code: number,
    context?: {
      cameraValue?: number;
      ocrValueSeconds?: number;
      hdmiValue?: number;
      acValue?: number;
      dcValue?: number;
    }
  ): Promise<void> {
    const currentTime = new Date();
    const errorMessage = this.getErrorMessage(category, code);
    try {
      const existing = await db
        .select()
        .from(deviceErrorLogs)
        .where(and(eq(deviceErrorLogs.deviceIp, deviceIp), eq(deviceErrorLogs.errorCategory, category)))
        .limit(1);

      if (existing.length > 0) {
        await db
          .update(deviceErrorLogs)
          .set({
            errorCode: code,
            errorMessage,
            lastOccurredAt: currentTime,
            isRead: false,
            cameraValue: context?.cameraValue,
            ocrValueSeconds: context?.ocrValueSeconds,
            hdmiValue: context?.hdmiValue,
            acValue: context?.acValue,
            dcValue: context?.dcValue,
          })
          .where(and(eq(deviceErrorLogs.deviceIp, deviceIp), eq(deviceErrorLogs.errorCategory, category)));
      } else {
        await db.insert(deviceErrorLogs).values({
          deviceIp,
          errorCategory: category,
          errorCode: code,
          errorMessage,
          occurredAt: currentTime,
          lastOccurredAt: currentTime,
          isRead: false,
          cameraValue: context?.cameraValue,
          ocrValueSeconds: context?.ocrValueSeconds,
          hdmiValue: context?.hdmiValue,
          acValue: context?.acValue,
          dcValue: context?.dcValue,
        });
      }
    } catch (error) {
      console.error('❌ 범용 에러 로그 UPSERT 실패:', error);
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
        .where(eq(deviceErrorLogs.isRead, false))
        .orderBy(desc(deviceErrorLogs.occurredAt));
      
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
        .where(eq(deviceErrorLogs.id, logId));
      
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
        .where(eq(deviceErrorLogs.isRead, false));
      
      console.log(`✅ 모든 에러 로그 읽음 처리 완료`);
    } catch (error) {
      console.error('❌ 모든 에러 로그 읽음 처리 오류:', error);
      throw error;
    }
  }
}

export const dashboardService = new DashboardService();
