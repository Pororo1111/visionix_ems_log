import { db } from "../db";
import { deviceMetricLogs, NewDeviceMetricLog } from "../db/schema";
import { PrometheusService, InstanceMetricSnapshot } from "./prometheus";

const DEFAULT_METRIC_LIST = ["camera_value"];

export class DeviceMetricLogIngestor {
  private prometheus: PrometheusService;
  private metricNames: string[];

  constructor(metricNames?: string[]) {
    this.prometheus = new PrometheusService();
    this.metricNames = Array.isArray(metricNames) && metricNames.length > 0
      ? metricNames
      : DEFAULT_METRIC_LIST;
  }

  private parseDeviceIp(instance: string): string {
    const idx = instance.lastIndexOf(":");
    return idx >= 0 ? instance.slice(0, idx) : instance;
  }

  private async discoverInstances(): Promise<string[]> {
    try {
      const samples = await this.prometheus.queryMetric("up");
      const instances = new Set<string>();
      for (const sample of samples) {
        const instance = sample.metric.instance;
        const value = Number(sample.value?.[1]);
        if (!instance) continue;
        if (Number.isFinite(value) && value === 1) {
          instances.add(instance);
        }
      }
      return Array.from(instances);
    } catch (error) {
      console.error("up 메트릭 기반 인스턴스 탐색 실패:", error);
      return [];
    }
  }

  private buildLogRows(metrics: Map<string, Map<string, InstanceMetricSnapshot>>): NewDeviceMetricLog[] {
    const rows: NewDeviceMetricLog[] = [];

    for (const [instance, metricMap] of metrics.entries()) {
      const deviceIp = this.parseDeviceIp(instance);

      for (const metricName of this.metricNames) {
        const snapshot = metricMap.get(metricName);
        if (!snapshot) continue;

        rows.push({
          deviceIp,
          instance,
          metricName,
          metricValue: snapshot.value,
          scrapedAt: snapshot.timestamp ?? new Date(),
        });
      }
    }

    return rows;
  }

  private async insertLogs(rows: NewDeviceMetricLog[]): Promise<number> {
    if (rows.length === 0) {
      return 0;
    }

    await db.insert(deviceMetricLogs).values(rows);
    return rows.length;
  }

  async collect(): Promise<number> {
    if (this.metricNames.length === 0) {
      console.warn("수집 대상 메트릭이 비어있습니다.");
      return 0;
    }

    const instances = await this.discoverInstances();
    if (instances.length === 0) {
      console.warn("up 메트릭에서 활성 인스턴스를 찾지 못했습니다.");
      return 0;
    }

    const metrics = await this.prometheus.fetchMetricsForInstances(instances, this.metricNames);
    const rows = this.buildLogRows(metrics);

    if (rows.length === 0) {
      console.log("저장할 메트릭 샘플이 없습니다.");
      return 0;
    }

    const inserted = await this.insertLogs(rows);
    console.log(`📥 device_metric_logs에 ${inserted}건 저장 (instances=${instances.length})`);
    return inserted;
  }
}
