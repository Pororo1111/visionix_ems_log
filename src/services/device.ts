import dotenv from "dotenv";
import { db } from "../db";
import { deviceInfos } from "../db/schema";
import { PrometheusService } from "./prometheus";

dotenv.config();

const DEFAULT_TARGET_PORT = Number(process.env.PROMETHEUS_TARGET_PORT || 5000);

export interface DeviceSnapshot {
  ip: string;
  instance: string;
  isOnline: boolean;
  cameraValue: number | null;
  cpuUsage: number | null;
  memoryUsage: number | null;
  statusMessage: string;
  timestamp: string; // ISO string
}

export class DeviceService {
  private prometheus: PrometheusService;

  constructor() {
    this.prometheus = new PrometheusService();
  }

  private buildInstances(ips: string[], port?: number): string[] {
    const p = port ?? DEFAULT_TARGET_PORT;
    return ips.map((ip) => `${ip}:${p}`);
  }

  private statusMessage(value: number | null): string {
    if (value === null || value === undefined) return "UNKNOWN";
    const map: Record<number, string> = {
      0: "NORMAL",
      1: "STOPPED",
      2: "ALARM",
      3: "SIGNAL_ISSUE",
      4: "OTHER_ANOMALY",
    };
    return map[value] ?? `UNDEFINED (${value})`;
  }

  // --- Fetch by IPs (build instance list as ip:port) ---
  async fetchCameraValuesByIps(ips: string[], port?: number): Promise<DeviceSnapshot[]> {
    if (!ips || ips.length === 0) return [];

    const instances = this.buildInstances(ips, port);

    // Build anchored regex union and escape for PromQL string
    const escRegex = (s: string) => s.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
    const regexUnion = instances.map((i) => `^${escRegex(i)}$`).join("|");
    const promQlPattern = regexUnion.replace(/\\/g, "\\\\");

    const qCamera = `camera_value{instance=~\"${promQlPattern}\"}`;
    const qUp = `up{instance=~\"${promQlPattern}\"}`;
    const qCpu = `system_cpu_percent{instance=~\"${promQlPattern}\"}`;
    const qMem = `system_memory_percent{instance=~\"${promQlPattern}\"}`;

    try {
      const [cameraRes, upRes, cpuRes, memRes] = await Promise.all([
        this.prometheus.queryMetric(qCamera),
        this.prometheus.queryMetric(qUp),
        this.prometheus.queryMetric(qCpu),
        this.prometheus.queryMetric(qMem),
      ]);

      const now = new Date().toISOString();

      const camByInst = new Map<string, number>();
      for (const r of cameraRes) {
        const inst = r.metric.instance || "unknown";
        const val = Number.parseInt(r.value?.[1]);
        if (!Number.isNaN(val)) camByInst.set(inst, val);
      }

      const upByInst = new Map<string, boolean>();
      for (const r of upRes) {
        const inst = r.metric.instance || "unknown";
        const val = Number.parseInt(r.value?.[1]);
        upByInst.set(inst, val === 1);
      }

      const cpuByInst = new Map<string, number>();
      for (const r of cpuRes) {
        const inst = r.metric.instance || "unknown";
        const val = Number.parseFloat(r.value?.[1]);
        if (!Number.isNaN(val)) cpuByInst.set(inst, val);
      }

      const memByInst = new Map<string, number>();
      for (const r of memRes) {
        const inst = r.metric.instance || "unknown";
        const val = Number.parseFloat(r.value?.[1]);
        if (!Number.isNaN(val)) memByInst.set(inst, val);
      }

      const statuses: DeviceSnapshot[] = instances.map((inst, idx) => {
        const ip = ips[idx];
        const cameraValue = camByInst.has(inst) ? (camByInst.get(inst) as number) : null;
        const isOnline = upByInst.get(inst) ?? false;
        const cpuUsage = cpuByInst.has(inst) ? (cpuByInst.get(inst) as number) : null;
        const memoryUsage = memByInst.has(inst) ? (memByInst.get(inst) as number) : null;
        return {
          ip,
          instance: inst,
          isOnline,
          cameraValue,
          cpuUsage,
          memoryUsage,
          statusMessage: this.statusMessage(cameraValue),
          timestamp: now,
        };
      });

      return statuses;
    } catch (err) {
      console.error("Fetch by IPs failed:", err);
      const now = new Date().toISOString();
      return this.buildInstances(ips, port).map((inst, idx) => ({
        ip: ips[idx],
        instance: inst,
        isOnline: false,
        cameraValue: null,
        cpuUsage: null,
        memoryUsage: null,
        statusMessage: this.statusMessage(null),
        timestamp: now,
      }));
    }
  }

  private parseIpFromInstance(instance: string): string {
    const idx = instance.lastIndexOf(":");
    return idx >= 0 ? instance.slice(0, idx) : instance;
  }

  // --- Discover instances from Prometheus ---
  async discoverInstances(): Promise<string[]> {
    try {
      const [upRes, camRes] = await Promise.all([
        this.prometheus.queryMetric("up"),
        this.prometheus.queryMetric("camera_value"),
      ]);
      const set = new Set<string>();
      for (const r of upRes) if (r?.metric?.instance) set.add(r.metric.instance);
      for (const r of camRes) if (r?.metric?.instance) set.add(r.metric.instance);
      return Array.from(set);
    } catch (err) {
      console.error("Discover instances failed:", err);
      return [];
    }
  }

  // --- Fetch by instance label list ---
  async fetchByInstances(instances: string[]): Promise<DeviceSnapshot[]> {
    if (!instances || instances.length === 0) return [];

    const escRegex = (s: string) => s.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
    const regexUnion = instances.map((i) => `^${escRegex(i)}$`).join("|");
    const promQlPattern = regexUnion.replace(/\\/g, "\\\\");

    const qCamera = `camera_value{instance=~\"${promQlPattern}\"}`;
    const qUp = `up{instance=~\"${promQlPattern}\"}`;
    const qCpu = `system_cpu_percent{instance=~\"${promQlPattern}\"}`;
    const qMem = `system_memory_percent{instance=~\"${promQlPattern}\"}`;

    try {
      const [cameraRes, upRes, cpuRes, memRes] = await Promise.all([
        this.prometheus.queryMetric(qCamera),
        this.prometheus.queryMetric(qUp),
        this.prometheus.queryMetric(qCpu),
        this.prometheus.queryMetric(qMem),
      ]);

      const now = new Date().toISOString();

      const camByInst = new Map<string, number>();
      for (const r of cameraRes) {
        const inst = r.metric.instance || "unknown";
        const val = Number.parseInt(r.value?.[1]);
        if (!Number.isNaN(val)) camByInst.set(inst, val);
      }

      const upByInst = new Map<string, boolean>();
      for (const r of upRes) {
        const inst = r.metric.instance || "unknown";
        const val = Number.parseInt(r.value?.[1]);
        upByInst.set(inst, val === 1);
      }

      const cpuByInst = new Map<string, number>();
      for (const r of cpuRes) {
        const inst = r.metric.instance || "unknown";
        const val = Number.parseFloat(r.value?.[1]);
        if (!Number.isNaN(val)) cpuByInst.set(inst, val);
      }

      const memByInst = new Map<string, number>();
      for (const r of memRes) {
        const inst = r.metric.instance || "unknown";
        const val = Number.parseFloat(r.value?.[1]);
        if (!Number.isNaN(val)) memByInst.set(inst, val);
      }

      const snapshots: DeviceSnapshot[] = instances.map((inst) => {
        const ip = this.parseIpFromInstance(inst);
        const cameraValue = camByInst.has(inst) ? (camByInst.get(inst) as number) : null;
        const isOnline = upByInst.get(inst) ?? false;
        const cpuUsage = cpuByInst.has(inst) ? (cpuByInst.get(inst) as number) : null;
        const memoryUsage = memByInst.has(inst) ? (memByInst.get(inst) as number) : null;
        return {
          ip,
          instance: inst,
          isOnline,
          cameraValue,
          cpuUsage,
          memoryUsage,
          statusMessage: this.statusMessage(cameraValue),
          timestamp: now,
        };
      });

      return snapshots;
    } catch (err) {
      console.error("Fetch by instances failed:", err);
      const now = new Date().toISOString();
      return instances.map((inst) => ({
        ip: this.parseIpFromInstance(inst),
        instance: inst,
        isOnline: false,
        cameraValue: null,
        cpuUsage: null,
        memoryUsage: null,
        statusMessage: this.statusMessage(null),
        timestamp: now,
      }));
    }
  }

  async upsertStatuses(statuses: DeviceSnapshot[]): Promise<void> {
    if (!statuses || statuses.length === 0) return;
    for (const s of statuses) {
      await db
        .insert(deviceInfos)
        .values({
          deviceIp: s.ip,
          instance: s.instance,
          isOnline: s.isOnline,
          cameraValue: s.cameraValue ?? null,
          cpuUsage: s.cpuUsage ?? null,
          memoryUsage: s.memoryUsage ?? null,
          lastScraped: new Date(s.timestamp),
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [deviceInfos.deviceIp],
          set: {
            instance: s.instance,
            isOnline: s.isOnline,
            cameraValue: s.cameraValue ?? null,
            cpuUsage: s.cpuUsage ?? null,
            memoryUsage: s.memoryUsage ?? null,
            lastScraped: new Date(s.timestamp),
            updatedAt: new Date(),
          },
        });
    }
  }

  async getAndStoreStatuses(ips: string[], port?: number): Promise<DeviceSnapshot[]> {
    const statuses = await this.fetchCameraValuesByIps(ips, port);
    await this.upsertStatuses(statuses);
    return statuses;
  }

  startScheduledCollection(intervalMs: number = 5000, port?: number): NodeJS.Timeout | null {
    const raw = process.env.DEVICE_IPS?.trim();
    if (!raw) {
      console.log("DEVICE_IPS empty; skipping scheduled device collection.");
      return null;
    }
    const ips = raw.split(",").map((s) => s.trim()).filter(Boolean);
    if (ips.length === 0) {
      console.log("DEVICE_IPS has no valid IPs.");
      return null;
    }

    console.log(`Start device status collection (${intervalMs}ms): ${ips.join(", ")}`);

    this.getAndStoreStatuses(ips, port).catch((err) => console.error("Initial device collect failed:", err));

    return setInterval(() => {
      this.getAndStoreStatuses(ips, port).catch((err) => console.error("Scheduled device collect failed:", err));
    }, intervalMs);
  }

  startAutoDiscoveryCollection(intervalMs: number = 5000): NodeJS.Timeout {
    console.log(`Start auto-discovery device collection (${intervalMs}ms)`);

    const tick = async () => {
      const instances = await this.discoverInstances();
      if (!instances || instances.length === 0) {
        console.warn("No instances discovered; retry next tick.");
        return;
      }
      const snapshots = await this.fetchByInstances(instances);
      await this.upsertStatuses(snapshots);
      console.log(`device_infos updated: ${snapshots.length} instances`);
    };

    tick().catch((err) => console.error("Initial auto-collect failed:", err));

    return setInterval(() => {
      tick().catch((err) => console.error("Periodic auto-collect failed:", err));
    }, intervalMs);
  }
}
