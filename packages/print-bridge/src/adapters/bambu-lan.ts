import path from 'node:path';
import { numberValue, record, stringValue } from '../http';
import type { PrinterAdapter, PrinterCommandResult, PrinterState, PrinterStatus, UploadedPrintJob, UploadJobInput } from '../types';
import { PrinterAdapterError } from '../types';

export interface BambuLanAdapterOptions {
  id: string;
  host?: string | undefined;
  accessCode?: string | undefined;
  serial?: string | undefined;
  mqttPort?: number | undefined;
  ftpPort?: number | undefined;
  uploadDirectory?: string | undefined;
  timeoutMs?: number | undefined;
  mqtt?: BambuMqttTransportFactory | undefined;
  ftp?: BambuFtpTransportFactory | undefined;
  sequence?: () => string;
}

export interface BambuMqttTransport {
  connect(): Promise<void>;
  publishJson(topic: string, payload: unknown, options?: { qos?: 0 | 1 }): Promise<void>;
  requestReport(reportTopic: string, requestTopic: string, payload: unknown, timeoutMs: number): Promise<unknown>;
  close(): Promise<void> | void;
}

export interface BambuFtpTransport {
  uploadFile(localPath: string, remotePath: string): Promise<unknown>;
  close?(): Promise<void> | void;
}

export type BambuMqttTransportFactory = () => BambuMqttTransport | Promise<BambuMqttTransport>;
export type BambuFtpTransportFactory = () => BambuFtpTransport | Promise<BambuFtpTransport>;

const BAMBU_USER = 'bblp';
const DEFAULT_MQTT_PORT = 8883;
const DEFAULT_FTP_PORT = 990;
const DEFAULT_UPLOAD_DIRECTORY = 'cache';
const DEFAULT_TIMEOUT_MS = 15_000;

export class BambuLanAdapter implements PrinterAdapter {
  readonly kind = 'bambu-lan' as const;
  readonly id: string;
  private readonly host?: string;
  private readonly accessCode?: string;
  private readonly serial?: string;
  private readonly mqttPort: number;
  private readonly ftpPort: number;
  private readonly uploadDirectory: string;
  private readonly timeoutMs: number;
  private readonly mqttFactory: BambuMqttTransportFactory;
  private readonly ftpFactory: BambuFtpTransportFactory;
  private readonly sequence: () => string;

  constructor(options: BambuLanAdapterOptions) {
    this.id = options.id;
    this.host = options.host;
    this.accessCode = options.accessCode;
    this.serial = options.serial;
    this.mqttPort = options.mqttPort ?? DEFAULT_MQTT_PORT;
    this.ftpPort = options.ftpPort ?? DEFAULT_FTP_PORT;
    this.uploadDirectory = normalizeRemotePath(options.uploadDirectory || DEFAULT_UPLOAD_DIRECTORY);
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.mqttFactory = options.mqtt || (() => this.createDefaultMqttTransport());
    this.ftpFactory = options.ftp || (() => this.createDefaultFtpTransport());
    this.sequence = options.sequence || (() => `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`);
  }

  async getStatus(): Promise<PrinterStatus> {
    if (!this.configured()) return this.unconfiguredStatus();
    const report = await this.withMqtt(transport =>
      transport.requestReport(this.reportTopic(), this.requestTopic(), this.pushAllPayload(), this.timeoutMs),
    );
    const print = record(record(report).print);
    return {
      printerId: this.id,
      state: bambuLanState(print.gcode_state ?? print.print_status ?? print.stg_cur),
      message: stringValue(print.gcode_state) || stringValue(print.print_error) || stringValue(print.msg),
      progress: normalizedProgress(print.mc_percent ?? print.progress),
      currentJobId: stringValue(print.subtask_name) || stringValue(print.gcode_file) || stringValue(print.project_file),
      updatedAt: new Date().toISOString(),
      raw: report,
    };
  }

  async uploadJob(input: UploadJobInput): Promise<UploadedPrintJob> {
    this.requireConfigured();
    const fileName = safeRemoteFileName(input.fileName || path.basename(input.artifactPath));
    const remoteFileRef = normalizeRemotePath(path.posix.join(this.uploadDirectory, fileName));
    const raw = await this.withFtp(transport => transport.uploadFile(input.artifactPath, remoteFileRef));
    return {
      adapterJobId: `bambu-lan:${remoteFileRef}`,
      remoteFileRef,
      raw: {
        upload: raw,
        remoteFileRef,
        metadata: input.metadata || {},
        fileName,
      },
    };
  }

  async startJob(job: UploadedPrintJob): Promise<PrinterCommandResult> {
    const payload = this.startPayload(job);
    await this.publishPrintCommand(payload);
    return {
      ok: true,
      adapterJobId: job.adapterJobId,
      message: `Bambu LAN start command published for ${job.remoteFileRef}`,
      raw: payload,
    };
  }

  async pauseJob(jobId?: string): Promise<PrinterCommandResult> {
    return this.publishSimplePrintCommand('pause', jobId);
  }

  async resumeJob(jobId?: string): Promise<PrinterCommandResult> {
    return this.publishSimplePrintCommand('resume', jobId);
  }

  async cancelJob(jobId?: string): Promise<PrinterCommandResult> {
    return this.publishSimplePrintCommand('stop', jobId);
  }

  private startPayload(job: UploadedPrintJob): Record<string, unknown> {
    const metadata = bambuMetadata(job);
    const extension = job.remoteFileRef.toLowerCase();
    if (extension.endsWith('.3mf')) {
      return {
        print: {
          sequence_id: this.sequence(),
          command: 'project_file',
          url: stringValue(metadata.url) || `file:///sdcard/${job.remoteFileRef}`,
          param: stringValue(metadata.param) || 'Metadata/plate_1.gcode',
          subtask_name: stringValue(metadata.subtaskName) || stringValue(metadata.subtask_name) || path.posix.basename(job.remoteFileRef),
          task_name: stringValue(metadata.taskName) || stringValue(metadata.task_name) || path.posix.basename(job.remoteFileRef),
          md5: stringValue(metadata.md5) || '',
          bed_type: stringValue(metadata.bedType) || stringValue(metadata.bed_type) || 'auto',
          timelapse: booleanValue(metadata.timelapse, false),
          flow_cali: booleanValue(metadata.flowCali ?? metadata.flow_cali, false),
          vibration_cali: booleanValue(metadata.vibrationCali ?? metadata.vibration_cali, false),
          layer_inspect: booleanValue(metadata.layerInspect ?? metadata.layer_inspect, false),
          use_ams: booleanValue(metadata.useAms ?? metadata.use_ams, false),
          ams_mapping: Array.isArray(metadata.amsMapping) ? metadata.amsMapping : Array.isArray(metadata.ams_mapping) ? metadata.ams_mapping : [],
        },
      };
    }

    return {
      print: {
        sequence_id: this.sequence(),
        command: 'gcode_file',
        param: job.remoteFileRef,
      },
    };
  }

  private async publishSimplePrintCommand(command: 'pause' | 'resume' | 'stop', adapterJobId?: string): Promise<PrinterCommandResult> {
    const payload = {
      print: {
        sequence_id: this.sequence(),
        command,
        param: '',
      },
    };
    await this.publishPrintCommand(payload);
    return { ok: true, adapterJobId, raw: payload };
  }

  private async publishPrintCommand(payload: Record<string, unknown>): Promise<void> {
    this.requireConfigured();
    await this.withMqtt(transport => transport.publishJson(this.requestTopic(), payload, { qos: 1 }));
  }

  private pushAllPayload(): Record<string, unknown> {
    return {
      pushing: {
        sequence_id: this.sequence(),
        command: 'pushall',
      },
    };
  }

  private requestTopic(): string {
    return `device/${this.serial}/request`;
  }

  private reportTopic(): string {
    return `device/${this.serial}/report`;
  }

  private async withMqtt<T>(fn: (transport: BambuMqttTransport) => Promise<T>): Promise<T> {
    const transport = await this.mqttFactory();
    try {
      await transport.connect();
      return await fn(transport);
    } finally {
      await transport.close();
    }
  }

  private async withFtp<T>(fn: (transport: BambuFtpTransport) => Promise<T>): Promise<T> {
    const transport = await this.ftpFactory();
    try {
      return await fn(transport);
    } finally {
      await transport.close?.();
    }
  }

  private configured(): boolean {
    return Boolean(this.host && this.accessCode && this.serial);
  }

  private requireConfigured(): void {
    if (this.configured()) return;
    throw new PrinterAdapterError('Bambu LAN host, serial, and access code are required', 'bambu_lan_not_configured');
  }

  private unconfiguredStatus(): PrinterStatus {
    return {
      printerId: this.id,
      state: 'offline',
      message: 'Bambu LAN credentials not configured',
      updatedAt: new Date().toISOString(),
    };
  }

  private createDefaultMqttTransport(): BambuMqttTransport {
    this.requireConfigured();
    return new DefaultBambuMqttTransport({
      host: this.host as string,
      port: this.mqttPort,
      serial: this.serial as string,
      accessCode: this.accessCode as string,
      timeoutMs: this.timeoutMs,
    });
  }

  private createDefaultFtpTransport(): BambuFtpTransport {
    this.requireConfigured();
    return new DefaultBambuFtpTransport({
      host: this.host as string,
      port: this.ftpPort,
      accessCode: this.accessCode as string,
      timeoutMs: this.timeoutMs,
    });
  }
}

interface DefaultBambuMqttOptions {
  host: string;
  port: number;
  serial: string;
  accessCode: string;
  timeoutMs: number;
}

class DefaultBambuMqttTransport implements BambuMqttTransport {
  private client: MqttClientLike | undefined;
  private connectPromise: Promise<void> | undefined;

  constructor(private readonly options: DefaultBambuMqttOptions) {}

  async connect(): Promise<void> {
    if (this.connectPromise) return this.connectPromise;
    const mqtt = await import('mqtt');
    const client = mqtt.connect(`mqtts://${this.options.host}:${this.options.port}`, {
      clientId: this.options.serial,
      username: BAMBU_USER,
      password: this.options.accessCode,
      rejectUnauthorized: false,
      protocolVersion: 4,
      connectTimeout: this.options.timeoutMs,
      reconnectPeriod: 0,
    }) as unknown as MqttClientLike;
    this.client = client;
    this.connectPromise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new PrinterAdapterError('Timed out connecting to Bambu LAN MQTT', 'bambu_lan_mqtt_timeout'));
      }, this.options.timeoutMs);
      const cleanup = () => {
        clearTimeout(timer);
        client.off?.('connect', onConnect);
        client.off?.('error', onError);
      };
      const onConnect = () => {
        cleanup();
        resolve();
      };
      const onError = (error: unknown) => {
        cleanup();
        reject(new PrinterAdapterError('Bambu LAN MQTT connection failed', 'bambu_lan_mqtt_error', error));
      };
      client.on('connect', onConnect);
      client.on('error', onError);
    });
    return this.connectPromise;
  }

  async publishJson(topic: string, payload: unknown, options: { qos?: 0 | 1 } = {}): Promise<void> {
    const client = this.requireClient();
    const body = JSON.stringify(payload);
    await new Promise<void>((resolve, reject) => {
      client.publish(topic, body, { qos: options.qos ?? 1 }, error => {
        if (error) reject(new PrinterAdapterError('Bambu LAN MQTT publish failed', 'bambu_lan_mqtt_publish_error', error));
        else resolve();
      });
    });
  }

  async requestReport(reportTopic: string, requestTopic: string, payload: unknown, timeoutMs: number): Promise<unknown> {
    const client = this.requireClient();
    await new Promise<void>((resolve, reject) => {
      client.subscribe(reportTopic, { qos: 0 }, error => {
        if (error) reject(new PrinterAdapterError('Bambu LAN MQTT subscribe failed', 'bambu_lan_mqtt_subscribe_error', error));
        else resolve();
      });
    });

    return await new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(new PrinterAdapterError('Timed out waiting for Bambu LAN MQTT report', 'bambu_lan_report_timeout'));
      }, timeoutMs);
      const cleanup = () => {
        clearTimeout(timer);
        client.off?.('message', onMessage);
      };
      const onMessage = (topic: string, payloadBuffer: Uint8Array | string) => {
        if (topic !== reportTopic) return;
        cleanup();
        try {
          resolve(JSON.parse(String(payloadBuffer)));
        } catch {
          resolve({ raw: String(payloadBuffer) });
        }
      };
      client.on('message', onMessage);
      void this.publishJson(requestTopic, payload, { qos: 1 }).catch(error => {
        cleanup();
        reject(error);
      });
    });
  }

  close(): void {
    this.client?.end(true);
    this.client = undefined;
    this.connectPromise = undefined;
  }

  private requireClient(): MqttClientLike {
    if (!this.client) throw new PrinterAdapterError('Bambu LAN MQTT client is not connected', 'bambu_lan_mqtt_not_connected');
    return this.client;
  }
}

interface MqttClientLike {
  on(event: string, handler: (...args: never[]) => void): unknown;
  off?(event: string, handler: (...args: never[]) => void): unknown;
  subscribe(topic: string, options: { qos: 0 | 1 }, callback: (error?: Error | null) => void): unknown;
  publish(topic: string, payload: string, options: { qos: 0 | 1 }, callback: (error?: Error | null) => void): unknown;
  end(force?: boolean): unknown;
}

interface DefaultBambuFtpOptions {
  host: string;
  port: number;
  accessCode: string;
  timeoutMs: number;
}

class DefaultBambuFtpTransport implements BambuFtpTransport {
  constructor(private readonly options: DefaultBambuFtpOptions) {}

  async uploadFile(localPath: string, remotePath: string): Promise<unknown> {
    const ftp = await import('basic-ftp');
    const client = new ftp.Client(this.options.timeoutMs);
    try {
      await client.access({
        host: this.options.host,
        port: this.options.port,
        user: BAMBU_USER,
        password: this.options.accessCode,
        secure: 'implicit',
        secureOptions: { rejectUnauthorized: false },
      });
      const normalized = normalizeRemotePath(remotePath);
      const directory = path.posix.dirname(normalized);
      if (directory && directory !== '.') await client.ensureDir(directory);
      await client.uploadFrom(localPath, path.posix.basename(normalized));
      return { remotePath: normalized };
    } finally {
      client.close();
    }
  }
}

export function bambuLanState(value: unknown): PrinterState {
  const state = String(value || '').toLowerCase();
  if (!state) return 'unknown';
  if (state.includes('pause')) return 'paused';
  if (state.includes('run') || state.includes('print') || state.includes('prepare') || state.includes('heat')) return 'printing';
  if (state.includes('finish') || state.includes('idle') || state.includes('complete')) return 'idle';
  if (state.includes('offline') || state.includes('disconnect')) return 'offline';
  if (state.includes('fail') || state.includes('error')) return 'error';
  return 'unknown';
}

function normalizedProgress(value: unknown): number | undefined {
  const progress = numberValue(value);
  if (progress === undefined) return undefined;
  return progress > 1 ? Math.max(0, Math.min(1, progress / 100)) : Math.max(0, Math.min(1, progress));
}

function bambuMetadata(job: UploadedPrintJob): Record<string, unknown> {
  const raw = record(job.raw);
  return {
    ...record(raw.metadata),
    ...record(record(raw.metadata).bambu),
    ...record(raw.bambu),
  };
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function safeRemoteFileName(fileName: string): string {
  return path.posix.basename(fileName).replace(/[^\w.\-()+[\] ]+/g, '_') || `print-${Date.now()}.gcode`;
}

function normalizeRemotePath(value: string): string {
  return value.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+/g, '/').replace(/\/$/, '');
}
