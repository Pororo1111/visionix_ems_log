import axios, { AxiosResponse } from "axios";
import dotenv from "dotenv";

dotenv.config();

const PROMETHEUS_BASE_URL = process.env.PROMETHEUS_URL || "http://localhost:9090";

interface PrometheusQueryResult {
  status: string;
  data: {
    resultType: string;
    result: Array<{
      metric: Record<string, string>;
      value: [number, string];
    }>;
  };
}

interface DeviceMetricData {
  deviceName: string;
  isOnline: boolean;
  cpuUsage?: number | null;
  memoryUsage?: number | null;
  temperature?: number;
}

export class PrometheusService {
  private baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl || PROMETHEUS_BASE_URL;
  }

  async queryMetric(metric: string): Promise<any> {
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

  async getCameraValue(): Promise<{ value: number; instance: string } | null> {
    try {
      const result = await this.queryMetric("camera_value");
      
      if (result.length === 0) {
        console.warn("camera_value 메트릭을 찾을 수 없습니다");
        return null;
      }

      const value = parseInt(result[0].value[1]);
      const instance = result[0].metric.instance || 'unknown';
      
      return { value, instance };
    } catch (error) {
      console.error("camera_value 조회 실패:", error);
      return null;
    }
  }

  // 기존 호환성을 위한 메서드 (deprecated)
  async getCameraValueOnly(): Promise<number | null> {
    try {
      const result = await this.getCameraValue();
      return result ? result.value : null;
    } catch (error) {
      console.error("camera_value 조회 실패:", error);
      return null;
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
    // instance 형태: localhost:5000, 192.168.0.34:5000 등
    if (instance.includes('192.168.0.34:5000') || instance.includes('localhost:5000') || instance.includes('5000')) {
      return 'flask-device-5000';
    }
    if (instance.includes('localhost:8080') || instance.includes('8080')) {
      return 'flask-device-8080';
    }
    
    // 기본적으로 instance 자체를 device_name으로 사용
    return instance.replace(':', '-').replace('.', '-');
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