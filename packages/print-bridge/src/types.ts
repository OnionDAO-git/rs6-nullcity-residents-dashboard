export type PrinterAdapterKind =
  | 'dry-run'
  | 'fdm-monster'
  | 'moonraker'
  | 'snapmaker-u1'
  | 'bambu-lan';

export type PrinterState = 'unknown' | 'idle' | 'printing' | 'paused' | 'offline' | 'error';

export interface PrinterStatus {
  printerId: string;
  state: PrinterState;
  message?: string | undefined;
  progress?: number | undefined;
  currentJobId?: string | undefined;
  updatedAt: string;
  raw?: unknown | undefined;
}

export interface PrintBridgeJob {
  id: string;
  printRequestId: string;
  title: string;
  printerId?: string | undefined;
  sourceFilePath?: string | undefined;
  sourceUrl?: string | undefined;
  slicerProfile?: string | undefined;
  requestedMaterial?: string | undefined;
  requestedColor?: string | undefined;
  quantity: number;
  metadata?: Record<string, unknown> | undefined;
}

export interface UploadJobInput {
  job: PrintBridgeJob;
  artifactPath: string;
  fileName?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
}

export interface UploadedPrintJob {
  adapterJobId: string;
  remoteFileRef: string;
  raw?: unknown | undefined;
}

export interface PrinterCommandResult {
  ok: boolean;
  adapterJobId?: string | undefined;
  message?: string | undefined;
  raw?: unknown | undefined;
}

export interface PrinterAdapter {
  readonly id: string;
  readonly kind: PrinterAdapterKind;
  getStatus(): Promise<PrinterStatus>;
  uploadJob(input: UploadJobInput): Promise<UploadedPrintJob>;
  startJob(job: UploadedPrintJob): Promise<PrinterCommandResult>;
  pauseJob(jobId?: string): Promise<PrinterCommandResult>;
  resumeJob(jobId?: string): Promise<PrinterCommandResult>;
  cancelJob(jobId?: string): Promise<PrinterCommandResult>;
}

export interface BridgeHeartbeatPayload {
  bridgeId: string;
  at: string;
  currentJobId?: string | undefined;
  printers: PrinterStatus[];
}

export type PrintBridgeJobStatus =
  | 'claimed'
  | 'slicing'
  | 'queued'
  | 'printing'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface CityJobStatusUpdate {
  jobId: string;
  status: PrintBridgeJobStatus;
  bridgeId: string;
  printerId?: string | undefined;
  adapterJobId?: string | undefined;
  remoteFileRef?: string | undefined;
  message?: string | undefined;
  error?: string | undefined;
  estimate?: SlicedArtifactEstimate | undefined;
  raw?: unknown | undefined;
}

export interface CityPrintQueueClient {
  claimNextJob(input: { bridgeId: string; printerIds: string[] }): Promise<PrintBridgeJob | undefined>;
  updateJobStatus(update: CityJobStatusUpdate): Promise<void>;
  heartbeat(payload: BridgeHeartbeatPayload): Promise<void>;
}

export interface SlicedArtifactEstimate {
  filamentGrams?: number | undefined;
  printTimeSeconds?: number | undefined;
  materialCostGp?: number | undefined;
  machineCostGp?: number | undefined;
  setupCostGp?: number | undefined;
  totalGp?: number | undefined;
}

export interface SlicedArtifact {
  path: string;
  fileName: string;
  estimate?: SlicedArtifactEstimate | undefined;
  raw?: unknown | undefined;
}

export interface SliceJobInput {
  job: PrintBridgeJob;
  sourcePath: string;
  outputDir: string;
}

export interface SlicerRunner {
  readonly id: string;
  slice(input: SliceJobInput): Promise<SlicedArtifact>;
}

export class PrinterAdapterError extends Error {
  constructor(
    message: string,
    readonly code = 'printer_adapter_error',
    readonly raw?: unknown,
  ) {
    super(message);
    this.name = 'PrinterAdapterError';
  }
}
