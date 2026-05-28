import path from 'node:path';
import { numberValue, record, requestForm, requestJson, stringValue } from '../http';
import type {
  PrinterAdapter,
  PrinterAdapterKind,
  PrinterCommandResult,
  PrinterState,
  PrinterStatus,
  UploadedPrintJob,
  UploadJobInput,
} from '../types';

export interface MoonrakerAdapterOptions {
  id: string;
  baseUrl: string;
  apiKey?: string | undefined;
  kind?: Extract<PrinterAdapterKind, 'moonraker' | 'snapmaker-u1'>;
}

export class MoonrakerAdapter implements PrinterAdapter {
  readonly kind: Extract<PrinterAdapterKind, 'moonraker' | 'snapmaker-u1'>;
  readonly id: string;
  private readonly baseUrl: string;
  private readonly apiKey: string | undefined;

  constructor(options: MoonrakerAdapterOptions) {
    this.id = options.id;
    this.baseUrl = options.baseUrl;
    this.apiKey = options.apiKey;
    this.kind = options.kind || 'moonraker';
  }

  async getStatus(): Promise<PrinterStatus> {
    const raw = await requestJson<unknown>(
      this.baseUrl,
      '/printer/objects/query?print_stats&display_status&webhooks',
      { token: this.apiKey },
    );
    const status = record(record(raw).result).status || record(raw).status || {};
    const printStats = record(record(status).print_stats);
    const displayStatus = record(record(status).display_status);
    const webhooks = record(record(status).webhooks);
    return {
      printerId: this.id,
      state: moonrakerState(printStats.state ?? webhooks.state),
      message: stringValue(printStats.message) || stringValue(webhooks.state_message),
      progress: normalizedProgress(displayStatus.progress),
      currentJobId: stringValue(printStats.filename),
      updatedAt: new Date().toISOString(),
      raw,
    };
  }

  async uploadJob(input: UploadJobInput): Promise<UploadedPrintJob> {
    const fileName = input.fileName || path.basename(input.artifactPath);
    const form = new FormData();
    form.set('root', 'gcodes');
    form.set('file', Bun.file(input.artifactPath), fileName);
    const raw = await requestForm<unknown>(this.baseUrl, '/server/files/upload', form, this.apiKey);
    const item = record(record(raw).item);
    const pathRef = stringValue(item.path) || stringValue(record(raw).path) || fileName;
    return {
      adapterJobId: `moonraker:${pathRef}`,
      remoteFileRef: pathRef,
      raw,
    };
  }

  async startJob(job: UploadedPrintJob): Promise<PrinterCommandResult> {
    const raw = await requestJson<unknown>(this.baseUrl, '/printer/print/start', {
      method: 'POST',
      token: this.apiKey,
      body: { filename: job.remoteFileRef },
    });
    return { ok: true, adapterJobId: job.adapterJobId, raw };
  }

  async pauseJob(jobId?: string): Promise<PrinterCommandResult> {
    return this.printCommand('/printer/print/pause', jobId);
  }

  async resumeJob(jobId?: string): Promise<PrinterCommandResult> {
    return this.printCommand('/printer/print/resume', jobId);
  }

  async cancelJob(jobId?: string): Promise<PrinterCommandResult> {
    return this.printCommand('/printer/print/cancel', jobId);
  }

  private async printCommand(pathname: string, adapterJobId?: string): Promise<PrinterCommandResult> {
    const raw = await requestJson<unknown>(this.baseUrl, pathname, { method: 'POST', token: this.apiKey, body: {} });
    return { ok: true, adapterJobId, raw };
  }
}

export function moonrakerState(value: unknown): PrinterState {
  const state = String(value || '').toLowerCase();
  if (!state) return 'unknown';
  if (state === 'printing') return 'printing';
  if (state === 'paused' || state === 'pausing') return 'paused';
  if (state === 'standby' || state === 'complete' || state === 'ready') return 'idle';
  if (state === 'shutdown' || state === 'startup' || state === 'disconnected') return 'offline';
  if (state === 'error') return 'error';
  return 'unknown';
}

function normalizedProgress(value: unknown): number | undefined {
  const progress = numberValue(value);
  return progress === undefined ? undefined : Math.max(0, Math.min(1, progress));
}
