import path from 'node:path';
import type {
  PrinterAdapter,
  PrinterCommandResult,
  PrinterState,
  PrinterStatus,
  UploadedPrintJob,
  UploadJobInput,
} from '../types';

export interface DryRunPrinterAdapterOptions {
  id: string;
  now?: () => number;
  completeAfterMs?: number;
}

export class DryRunPrinterAdapter implements PrinterAdapter {
  readonly kind = 'dry-run' as const;
  readonly id: string;
  private readonly now: () => number;
  private readonly completeAfterMs: number;
  private state: PrinterState = 'idle';
  private currentJob: UploadedPrintJob | undefined;
  private startedAt = 0;

  constructor(options: DryRunPrinterAdapterOptions) {
    this.id = options.id;
    this.now = options.now || Date.now;
    this.completeAfterMs = options.completeAfterMs ?? 30_000;
  }

  async getStatus(): Promise<PrinterStatus> {
    if (this.state === 'printing' && this.startedAt > 0 && this.now() - this.startedAt >= this.completeAfterMs) {
      this.state = 'idle';
      this.currentJob = undefined;
      this.startedAt = 0;
    }
    return {
      printerId: this.id,
      state: this.state,
      currentJobId: this.currentJob?.adapterJobId,
      progress: this.state === 'printing' && this.startedAt > 0
        ? Math.min(1, (this.now() - this.startedAt) / Math.max(1, this.completeAfterMs))
        : undefined,
      updatedAt: new Date(this.now()).toISOString(),
    };
  }

  async uploadJob(input: UploadJobInput): Promise<UploadedPrintJob> {
    const fileName = input.fileName || path.basename(input.artifactPath);
    const uploaded: UploadedPrintJob = {
      adapterJobId: `dry-run:${input.job.id}`,
      remoteFileRef: `dry-run://${this.id}/${encodeURIComponent(fileName)}`,
      raw: { fileName, artifactPath: input.artifactPath },
    };
    this.currentJob = uploaded;
    return uploaded;
  }

  async startJob(job: UploadedPrintJob): Promise<PrinterCommandResult> {
    this.currentJob = job;
    this.state = 'printing';
    this.startedAt = this.now();
    return { ok: true, adapterJobId: job.adapterJobId, message: 'dry-run print started' };
  }

  async pauseJob(jobId?: string): Promise<PrinterCommandResult> {
    if (this.currentJob && (!jobId || jobId === this.currentJob.adapterJobId)) {
      this.state = 'paused';
      return { ok: true, adapterJobId: this.currentJob.adapterJobId, message: 'dry-run print paused' };
    }
    return { ok: false, message: 'no matching dry-run job' };
  }

  async resumeJob(jobId?: string): Promise<PrinterCommandResult> {
    if (this.currentJob && (!jobId || jobId === this.currentJob.adapterJobId)) {
      this.state = 'printing';
      this.startedAt = this.now();
      return { ok: true, adapterJobId: this.currentJob.adapterJobId, message: 'dry-run print resumed' };
    }
    return { ok: false, message: 'no matching dry-run job' };
  }

  async cancelJob(jobId?: string): Promise<PrinterCommandResult> {
    if (this.currentJob && (!jobId || jobId === this.currentJob.adapterJobId)) {
      const adapterJobId = this.currentJob.adapterJobId;
      this.currentJob = undefined;
      this.state = 'idle';
      this.startedAt = 0;
      return { ok: true, adapterJobId, message: 'dry-run print cancelled' };
    }
    return { ok: false, message: 'no matching dry-run job' };
  }
}
