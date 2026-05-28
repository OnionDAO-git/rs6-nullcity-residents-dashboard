import path from 'node:path';
import { numberValue, record, requestForm, requestJson, stringValue } from '../http';
import type {
  PrinterAdapter,
  PrinterCommandResult,
  PrinterState,
  PrinterStatus,
  UploadedPrintJob,
  UploadJobInput,
} from '../types';

export interface FdmMonsterAdapterOptions {
  id: string;
  baseUrl: string;
  apiKey?: string | undefined;
  printerId: string;
}

export class FdmMonsterAdapter implements PrinterAdapter {
  readonly kind = 'fdm-monster' as const;
  readonly id: string;
  private readonly baseUrl: string;
  private readonly apiKey: string | undefined;
  private readonly printerId: string;

  constructor(options: FdmMonsterAdapterOptions) {
    this.id = options.id;
    this.baseUrl = options.baseUrl;
    this.apiKey = options.apiKey;
    this.printerId = options.printerId;
  }

  async getStatus(): Promise<PrinterStatus> {
    const raw = await requestJson<unknown>(this.baseUrl, `/api/v2/printer/${encodeURIComponent(this.printerId)}`, { token: this.apiKey });
    const printer = record(raw);
    return {
      printerId: this.id,
      state: fdmMonsterState(printer.state ?? printer.status ?? printer.printerState),
      message: stringValue(printer.message) || stringValue(printer.statusText),
      progress: normalizedProgress(printer.progress ?? record(printer.currentJob).progress),
      currentJobId: stringValue(record(printer.currentJob).id) || stringValue(record(printer.printJob).id),
      updatedAt: new Date().toISOString(),
      raw,
    };
  }

  async uploadJob(input: UploadJobInput): Promise<UploadedPrintJob> {
    const fileName = input.fileName || path.basename(input.artifactPath);
    const form = new FormData();
    form.set('printerId', this.printerId);
    form.set('file', Bun.file(input.artifactPath), fileName);
    const raw = await requestForm<unknown>(this.baseUrl, '/api/v2/file', form, this.apiKey);
    const response = record(raw);
    const fileId = stringValue(response.id) || stringValue(response.fileId) || stringValue(record(response.file).id) || fileName;
    return {
      adapterJobId: stringValue(response.printJobId) || `fdm-monster:${fileId}`,
      remoteFileRef: fileId,
      raw,
    };
  }

  async startJob(job: UploadedPrintJob): Promise<PrinterCommandResult> {
    return this.command('/api/v2/print-job', { printerId: this.printerId, fileId: job.remoteFileRef, action: 'start' }, job.adapterJobId);
  }

  async pauseJob(jobId?: string): Promise<PrinterCommandResult> {
    return this.command(`/api/v2/printer/${encodeURIComponent(this.printerId)}/command`, { command: 'pause', jobId }, jobId);
  }

  async resumeJob(jobId?: string): Promise<PrinterCommandResult> {
    return this.command(`/api/v2/printer/${encodeURIComponent(this.printerId)}/command`, { command: 'resume', jobId }, jobId);
  }

  async cancelJob(jobId?: string): Promise<PrinterCommandResult> {
    return this.command(`/api/v2/printer/${encodeURIComponent(this.printerId)}/command`, { command: 'cancel', jobId }, jobId);
  }

  private async command(pathname: string, body: Record<string, unknown>, adapterJobId?: string): Promise<PrinterCommandResult> {
    const raw = await requestJson<unknown>(this.baseUrl, pathname, { method: 'POST', token: this.apiKey, body });
    return { ok: true, adapterJobId, raw };
  }
}

export function fdmMonsterState(value: unknown): PrinterState {
  const state = String(value || '').toLowerCase();
  if (!state) return 'unknown';
  if (state.includes('print')) return 'printing';
  if (state.includes('pause')) return 'paused';
  if (state.includes('idle') || state.includes('operational') || state.includes('ready')) return 'idle';
  if (state.includes('offline') || state.includes('disconnect')) return 'offline';
  if (state.includes('error') || state.includes('fail')) return 'error';
  return 'unknown';
}

function normalizedProgress(value: unknown): number | undefined {
  const progress = numberValue(value);
  if (progress === undefined) return undefined;
  return progress > 1 ? Math.max(0, Math.min(1, progress / 100)) : Math.max(0, Math.min(1, progress));
}
