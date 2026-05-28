import { requestJson } from '../http';
import type { BridgeHeartbeatPayload, CityJobStatusUpdate, CityPrintQueueClient, PrintBridgeJob } from '../types';

export interface HttpCityPrintQueueClientOptions {
  baseUrl: string;
  token?: string | undefined;
  claimPath?: string;
  statusPath?: string;
  heartbeatPath?: string;
}

export class HttpCityPrintQueueClient implements CityPrintQueueClient {
  private readonly baseUrl: string;
  private readonly token: string | undefined;
  private readonly claimPath: string;
  private readonly statusPath: string;
  private readonly heartbeatPath: string;

  constructor(options: HttpCityPrintQueueClientOptions) {
    this.baseUrl = options.baseUrl;
    this.token = options.token;
    this.claimPath = options.claimPath || '/api/admin/print-queue/claim';
    this.statusPath = options.statusPath || '/api/admin/print-queue/status';
    this.heartbeatPath = options.heartbeatPath || '/api/admin/print-bridge/heartbeat';
  }

  async claimNextJob(input: { bridgeId: string; printerIds: string[] }): Promise<PrintBridgeJob | undefined> {
    const payload = await requestJson<{ job?: PrintBridgeJob }>(this.baseUrl, this.claimPath, {
      method: 'POST',
      token: this.token,
      body: input,
    });
    return payload.job;
  }

  async updateJobStatus(update: CityJobStatusUpdate): Promise<void> {
    await requestJson<unknown>(this.baseUrl, this.statusPath, { method: 'POST', token: this.token, body: update });
  }

  async heartbeat(payload: BridgeHeartbeatPayload): Promise<void> {
    await requestJson<unknown>(this.baseUrl, this.heartbeatPath, { method: 'POST', token: this.token, body: payload });
  }
}
