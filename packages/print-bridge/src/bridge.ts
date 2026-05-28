import fs from 'node:fs/promises';
import path from 'node:path';
import type {
  CityJobStatusUpdate,
  CityPrintQueueClient,
  PrintBridgeJob,
  PrinterAdapter,
  PrinterStatus,
  SlicedArtifact,
  SlicerRunner,
  UploadedPrintJob,
} from './types';

export interface PrintBridgeClientOptions {
  bridgeId: string;
  city: CityPrintQueueClient;
  adapters: PrinterAdapter[];
  slicer: SlicerRunner;
  workDir: string;
  pollMs?: number;
  heartbeatMs?: number;
  now?: () => Date;
  fetch?: typeof fetch;
}

interface ActiveJob {
  job: PrintBridgeJob;
  adapter: PrinterAdapter;
  uploaded: UploadedPrintJob;
  artifact: SlicedArtifact;
}

export class PrintBridgeClient {
  private readonly bridgeId: string;
  private readonly city: CityPrintQueueClient;
  private readonly adapters: PrinterAdapter[];
  private readonly slicer: SlicerRunner;
  private readonly workDir: string;
  private readonly pollMs: number;
  private readonly heartbeatMs: number;
  private readonly now: () => Date;
  private readonly fetchFn: typeof fetch;
  private active: ActiveJob | undefined;
  private pollTimer: ReturnType<typeof setInterval> | undefined;
  private heartbeatTimer: ReturnType<typeof setInterval> | undefined;

  constructor(options: PrintBridgeClientOptions) {
    this.bridgeId = options.bridgeId;
    this.city = options.city;
    this.adapters = options.adapters;
    this.slicer = options.slicer;
    this.workDir = options.workDir;
    this.pollMs = options.pollMs || 10_000;
    this.heartbeatMs = options.heartbeatMs || 30_000;
    this.now = options.now || (() => new Date());
    this.fetchFn = options.fetch || fetch;
  }

  start(): void {
    if (this.pollTimer) return;
    this.pollTimer = setInterval(() => void this.tick(), this.pollMs);
    this.heartbeatTimer = setInterval(() => void this.sendHeartbeat(), this.heartbeatMs);
    void this.tick();
  }

  stop(): void {
    if (this.pollTimer) clearInterval(this.pollTimer);
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.pollTimer = undefined;
    this.heartbeatTimer = undefined;
  }

  async tick(): Promise<void> {
    await this.sendHeartbeat();
    if (this.active) {
      await this.refreshActiveJob();
      return;
    }
    const job = await this.city.claimNextJob({ bridgeId: this.bridgeId, printerIds: this.adapters.map(adapter => adapter.id) });
    if (!job) return;
    await this.processJob(job);
  }

  async pause(jobId?: string): Promise<void> {
    if (!this.active) return;
    const result = await this.active.adapter.pauseJob(jobId || this.active.uploaded.adapterJobId);
    await this.update({
      jobId: this.active.job.id,
      status: result.ok ? 'paused' : 'failed',
      adapterJobId: this.active.uploaded.adapterJobId,
      message: result.message,
    });
  }

  async resume(jobId?: string): Promise<void> {
    if (!this.active) return;
    const result = await this.active.adapter.resumeJob(jobId || this.active.uploaded.adapterJobId);
    await this.update({
      jobId: this.active.job.id,
      status: result.ok ? 'printing' : 'failed',
      adapterJobId: this.active.uploaded.adapterJobId,
      message: result.message,
    });
  }

  async cancel(jobId?: string): Promise<void> {
    if (!this.active) return;
    const result = await this.active.adapter.cancelJob(jobId || this.active.uploaded.adapterJobId);
    await this.update({
      jobId: this.active.job.id,
      status: result.ok ? 'cancelled' : 'failed',
      adapterJobId: this.active.uploaded.adapterJobId,
      message: result.message,
    });
    if (result.ok) this.active = undefined;
  }

  private async processJob(job: PrintBridgeJob): Promise<void> {
    const adapter = this.selectAdapter(job);
    try {
      await this.update({ jobId: job.id, status: 'claimed', printerId: adapter.id });
      const sourcePath = await this.resolveSource(job);
      await this.update({ jobId: job.id, status: 'slicing', printerId: adapter.id });
      const artifact = await this.slicer.slice({ job, sourcePath, outputDir: path.join(this.workDir, 'sliced') });
      await this.update({ jobId: job.id, status: 'queued', printerId: adapter.id, estimate: artifact.estimate });
      const uploaded = await adapter.uploadJob({ job, artifactPath: artifact.path, fileName: artifact.fileName, metadata: job.metadata });
      await this.update({
        jobId: job.id,
        status: 'queued',
        printerId: adapter.id,
        adapterJobId: uploaded.adapterJobId,
        remoteFileRef: uploaded.remoteFileRef,
        estimate: artifact.estimate,
      });
      const started = await adapter.startJob(uploaded);
      await this.update({
        jobId: job.id,
        status: started.ok ? 'printing' : 'failed',
        printerId: adapter.id,
        adapterJobId: uploaded.adapterJobId,
        remoteFileRef: uploaded.remoteFileRef,
        message: started.message,
        raw: started.raw,
      });
      if (started.ok) this.active = { job, adapter, uploaded, artifact };
    } catch (error) {
      await this.update({
        jobId: job.id,
        status: 'failed',
        printerId: adapter.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async refreshActiveJob(): Promise<void> {
    if (!this.active) return;
    const status = await this.active.adapter.getStatus();
    if (status.state === 'idle') {
      await this.update({
        jobId: this.active.job.id,
        status: 'completed',
        printerId: this.active.adapter.id,
        adapterJobId: this.active.uploaded.adapterJobId,
        remoteFileRef: this.active.uploaded.remoteFileRef,
        estimate: this.active.artifact.estimate,
      });
      this.active = undefined;
      return;
    }
    if (status.state === 'paused' || status.state === 'printing' || status.state === 'error') {
      await this.update({
        jobId: this.active.job.id,
        status: status.state === 'error' ? 'failed' : status.state,
        printerId: this.active.adapter.id,
        adapterJobId: this.active.uploaded.adapterJobId,
        remoteFileRef: this.active.uploaded.remoteFileRef,
        message: status.message,
        raw: status.raw,
      });
      if (status.state === 'error') this.active = undefined;
    }
  }

  private async sendHeartbeat(): Promise<void> {
    const printers = await Promise.all(this.adapters.map(adapter => adapter.getStatus().catch(errorStatus(adapter.id))));
    await this.city.heartbeat({
      bridgeId: this.bridgeId,
      at: this.now().toISOString(),
      currentJobId: this.active?.job.id,
      printers,
    });
  }

  private async update(update: Omit<CityJobStatusUpdate, 'bridgeId'>): Promise<void> {
    await this.city.updateJobStatus({ ...update, bridgeId: this.bridgeId });
  }

  private selectAdapter(job: PrintBridgeJob): PrinterAdapter {
    if (job.printerId) {
      const adapter = this.adapters.find(candidate => candidate.id === job.printerId);
      if (adapter) return adapter;
    }
    const adapter = this.adapters[0];
    if (!adapter) throw new Error('print bridge has no configured printer adapters');
    return adapter;
  }

  private async resolveSource(job: PrintBridgeJob): Promise<string> {
    if (job.sourceFilePath) return job.sourceFilePath;
    if (!job.sourceUrl) {
      const placeholder = path.join(this.workDir, 'sources', `${job.id}.stl`);
      await fs.mkdir(path.dirname(placeholder), { recursive: true });
      await fs.writeFile(placeholder, `solid ${job.id}\nendsolid ${job.id}\n`, 'utf8');
      return placeholder;
    }
    const response = await this.fetchFn(job.sourceUrl);
    if (!response.ok) throw new Error(`failed to download print source: ${response.status} ${response.statusText}`);
    const fileName = path.basename(new URL(job.sourceUrl).pathname) || `${job.id}.stl`;
    const outputPath = path.join(this.workDir, 'sources', fileName);
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, Buffer.from(await response.arrayBuffer()));
    return outputPath;
  }
}

function errorStatus(printerId: string): (error: unknown) => PrinterStatus {
  return error => ({
    printerId,
    state: 'error',
    message: error instanceof Error ? error.message : String(error),
    updatedAt: new Date().toISOString(),
  });
}
