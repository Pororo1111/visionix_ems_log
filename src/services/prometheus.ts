import axios, { AxiosResponse } from "axios";
import dotenv from "dotenv";

dotenv.config();

const PROMETHEUS_BASE_URL = process.env.PROMETHEUS_URL || "http://localhost:9090";

interface PrometheusQueryResult {
  status: string;
  data: {
    resultType: string;
    result: PrometheusVectorSample[];
  };
}

type PrometheusVectorSample = {
  metric: Record<string, string>;
  value: [number, string];
};

interface DeviceMetricData {
  deviceName: string;
  isOnline: boolean;
  cpuUsage?: number | null;
  memoryUsage?: number | null;
  temperature?: number;
}

export interface InstanceMetricSnapshot {
  value: number | null;
  timestamp: Date | null;
}

export class PrometheusService {
  private baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl || PROMETHEUS_BASE_URL;
  }

  async queryMetric(metric: string): Promise<PrometheusVectorSample[]> {
    try {
      const response: AxiosResponse<PrometheusQueryResult> = await axios.get(
        `${this.baseUrl}/api/v1/query`,
        {
          params: {
            query: metric,
          },
        }
      );

      if (response.data.status !== "success") {
        throw new Error(`Prometheus query failed: ${response.data.status}`);
      }

      return response.data.data.result;
    } catch (error) {
      console.error(`Prometheus 메트릭 조회 실패 [${metric}]:`, error);
      throw error;
    }
  }

  private parseSampleValue(sample: PrometheusVectorSample): number | null {
    const rawValue = sample?.value?.[1];
    if (typeof rawValue !== "string") {
      return null;
    }

    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed)) {
      return null;
    }

    return parsed;
  }

  private escapePrometheusRegex(value: string): string {
    return value.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
  }

  private buildInstanceRegex(instances: string[]): string | null {
    const trimmed = instances.map((instance) => instance.trim()).filter(Boolean);
    if (trimmed.length === 0) {
      return null;
    }

    const anchored = trimmed.map((instance) => `^${this.escapePrometheusRegex(instance)}$`);
    const pattern = anchored.join("|");

    return pattern.replace(/\\/g, "\\\\");
  }

  async fetchMetricsForInstances(instances: string[], metricNames: string[]): Promise<Map<string, Map<string, InstanceMetricSnapshot>>> {
    const result = new Map<string, Map<string, InstanceMetricSnapshot>>();

    if (!Array.isArray(instances) || instances.length === 0) {
      return result;
    }

    if (!Array.isArray(metricNames) || metricNames.length === 0) {
      return result;
    }

    const instanceRegex = this.buildInstanceRegex(instances);

    const metricQueries = metricNames.map(async (metricName) => {
      const promQuery = instanceRegex
        ? `${metricName}{instance=~\"${instanceRegex}\"}`
        : metricName;

      const samples = await this.queryMetric(promQuery);

      for (const sample of samples) {
        const instance = sample.metric.instance || "unknown";
        const parsedValue = this.parseSampleValue(sample);
        const timestampSeconds = sample.value?.[0];
        const snapshot: InstanceMetricSnapshot = {
          value: parsedValue,
          timestamp: typeof timestampSeconds === "number" ? new Date(timestampSeconds * 1000) : null,
        };

        const entry = result.get(instance) ?? new Map<string, InstanceMetricSnapshot>();
        entry.set(metricName, snapshot);
        result.set(instance, entry);
      }
    });

    await Promise.all(metricQueries);

    return result;
  }

  async getCameraStatusSummary(): Promise<{
    normalCount: number;
    abnormalCount: number;
    abnormalDevices: Array<{ instance: string; value: number }>;
  }> {
    try {
      const series = await this.queryMetric("camera_value");

      return series.reduce(
        (acc, sample) => {
          const value = this.parseSampleValue(sample);
          if (value === null) {
            return acc;
          }

          const instance = sample.metric.instance || "unknown";
          if (value === 0) {
            acc.normalCount += 1;
          } else {
            acc.abnormalCount += 1;
            acc.abnormalDevices.push({ instance, value });
          }

          return acc;
        },
        {
          normalCount: 0,
          abnormalCount: 0,
          abnormalDevices: [] as Array<{ instance: string; value: number }>,
        }
      );
    } catch (error) {
      console.error("camera_value 상태 집계 실패:", error);
      return { normalCount: 0, abnormalCount: 0, abnormalDevices: [] };
    }
  }

  // Prometheus up{job="devices"} 메트릭으로 장비 상태 확인 (웹서버와 동일한 쿼리)
  async getDeviceOnlineStatusFromUp(): Promise<DeviceMetricData[]> {
    try {
      // 웹서버와 동일한 쿼리 사용: up{job="devices"}
      const upMetrics = await this.queryMetric('up{job="devices"}');
      
      const devices: DeviceMetricData[] = [];
      
      if (upMetrics.length > 0) {
        for (const metric of upMetrics) {
          // instance 라벨에서 장비 정보 추출
          const instance = metric.metric.instance || 'unknown';
          const job = metric.metric.job || 'unknown';
          const isOnline = parseInt(metric.value[1]) === 1;
          
          // device_name은 instance 또는 job을 기준으로 매핑
          const deviceName = this.mapInstanceToDeviceName(instance);
          
          devices.push({
            deviceName,
            isOnline,
          });
          
          console.log(`📡 Device: ${deviceName} (${instance}) - ${isOnline ? 'UP' : 'DOWN'}`);
        }
      } else {
        console.warn("⚠️ up{job=\"devices\"} 메트릭에서 장비를 찾을 수 없습니다");
      }
      
      console.log(`📡 Prometheus up{job="devices"}에서 ${devices.length}개 장비 상태 확인`);
      return devices;
    } catch (error) {
      console.error("Prometheus up{job=\"devices\"} 메트릭 조회 실패:", error);
      return [];
    }
  }

  // instance 라벨을 device_name으로 매핑하는 헬퍼 메서드
  private mapInstanceToDeviceName(instance: string): string {
    if (!instance) {
      return 'unknown-instance';
    }

    const sanitized = instance.trim();
    return sanitized.replace(/[:.]/g, '-');
  }

  // 장비들의 CPU 사용률 조회 (job="devices" 필터 적용)
  async getDeviceCpuUsage(): Promise<Record<string, number>> {
    try {
      // job="devices"로 필터링된 system_cpu_percent 메트릭 사용
      const cpuMetrics = await this.queryMetric('system_cpu_percent{job="devices"}');
      
      const cpuUsage: Record<string, number> = {};
      
      for (const metric of cpuMetrics) {
        const instance = metric.metric.instance || 'unknown';
        const deviceName = this.mapInstanceToDeviceName(instance);
        const usage = parseFloat(metric.value[1]);
        cpuUsage[deviceName] = usage;
        
        console.log(`💻 ${deviceName} CPU: ${usage.toFixed(2)}%`);
      }
      
      return cpuUsage;
    } catch (error) {
      console.error("CPU 사용률 조회 실패:", error);
      return {};
    }
  }

  // 장비들의 메모리 사용률 조회 (job="devices" 필터 적용)
  async getDeviceMemoryUsage(): Promise<Record<string, number>> {
    try {
      // job="devices"로 필터링된 system_memory_percent 메트릭 사용
      const memoryMetrics = await this.queryMetric('system_memory_percent{job="devices"}');
      
      const memoryUsage: Record<string, number> = {};
      
      for (const metric of memoryMetrics) {
        const instance = metric.metric.instance || 'unknown';
        const deviceName = this.mapInstanceToDeviceName(instance);
        const usage = parseFloat(metric.value[1]);
        memoryUsage[deviceName] = usage;
        
        console.log(`🧠 ${deviceName} Memory: ${usage.toFixed(1)}%`);
      }
      
      return memoryUsage;
    } catch (error) {
      console.error("메모리 사용률 조회 실패:", error);
      return {};
    }
  }

  // 장비들의 전체 메트릭 수집 (UP 메트릭 기반)
  async getAllDeviceMetrics(): Promise<DeviceMetricData[]> {
    try {
      const [onlineStatus, cpuUsage, memoryUsage] = await Promise.all([
        this.getDeviceOnlineStatusFromUp(),
        this.getDeviceCpuUsage(),
        this.getDeviceMemoryUsage(),
      ]);

      // UP 상태를 기준으로 다른 메트릭들을 병합
      const deviceMetrics = onlineStatus.map(device => ({
        ...device,
        cpuUsage: cpuUsage[device.deviceName] || null,
        memoryUsage: memoryUsage[device.deviceName] || null,
      }));

      console.log(`📊 ${deviceMetrics.length}개 장비 메트릭 수집 완료`);
      return deviceMetrics;
    } catch (error) {
      console.error("전체 장비 메트릭 수집 실패:", error);
      return [];
    }
  }
}

