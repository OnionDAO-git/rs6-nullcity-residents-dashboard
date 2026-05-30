import type { CityConfig } from './config';

export type NullCityProposalStatus = 'proposed' | 'funding' | 'threshold_crossed' | 'approved' | 'rejected' | 'born';

export interface NullCitySoulProposal {
  schemaVersion: 1;
  id: string;
  residentName: string;
  soulMarkdown: string;
  goalText: string;
  binaryCompletionCondition?: string;
  apThreshold: number;
  apFunded: number;
  proposerCityUserId: string;
  proposerDisplayName?: string;
  status: NullCityProposalStatus;
  adminNotes?: string;
  createdAt: string;
  updatedAt: string;
  bornAt?: string;
}

export interface NullCityControlClient {
  listProposals(): Promise<NullCitySoulProposal[]>;
  approveProposal(id: string, adminNotes?: string): Promise<unknown>;
  rejectProposal(id: string, adminNotes?: string): Promise<unknown>;
  birthProposal(id: string): Promise<unknown>;
}

export interface NullCityControlClientOptions {
  baseUrl: string;
  token: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export class NullCityControlError extends Error {
  constructor(
    message: string,
    readonly status = 502,
  ) {
    super(message);
    this.name = 'NullCityControlError';
  }
}

export function createNullCityControlClientFromConfig(config: CityConfig): NullCityControlClient | undefined {
  if (!config.nullcityControlBaseUrl || !config.nullcityControlToken) return undefined;
  return createNullCityControlClient({
    baseUrl: config.nullcityControlBaseUrl,
    token: config.nullcityControlToken,
  });
}

export function createNullCityControlClient(options: NullCityControlClientOptions): NullCityControlClient {
  const baseUrl = options.baseUrl.replace(/\/+$/, '');
  const fetchImpl = options.fetchImpl || fetch;
  const timeoutMs = options.timeoutMs ?? 5000;

  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const timeoutSignal = createTimeoutSignal(timeoutMs);
    let response: Response;
    try {
      response = await fetchImpl(`${baseUrl}${path}`, {
        ...init,
        signal: init.signal || timeoutSignal,
        headers: {
          accept: 'application/json',
          authorization: `Bearer ${options.token}`,
          ...(init.body === undefined ? {} : { 'content-type': 'application/json' }),
          ...init.headers,
        },
      });
    } catch (error) {
      if (isAbortError(error)) throw new NullCityControlError('controller_timeout', 504);
      throw new NullCityControlError('controller_unreachable', 502);
    }
    const payload = await readPayload(response);
    if (!response.ok) {
      const record = asRecord(payload);
      const message = typeof record.error === 'string' ? record.error : `${response.status} ${response.statusText}`;
      throw new NullCityControlError(message, response.status);
    }
    return payload as T;
  }

  return {
    listProposals: async () => parseProposalList(await request<unknown>('/proposals')),
    approveProposal: (id, adminNotes) =>
      request(`/proposals/${encodeURIComponent(id)}/approve`, {
        method: 'POST',
        body: JSON.stringify({ adminNotes }),
      }),
    rejectProposal: (id, adminNotes) =>
      request(`/proposals/${encodeURIComponent(id)}/reject`, {
        method: 'POST',
        body: JSON.stringify({ adminNotes }),
      }),
    birthProposal: id =>
      request(`/proposals/${encodeURIComponent(id)}/birth`, {
        method: 'POST',
        body: JSON.stringify({}),
      }),
  };
}

function createTimeoutSignal(timeoutMs: number): AbortSignal | undefined {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return undefined;
  if (typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal) {
    return AbortSignal.timeout(timeoutMs);
  }
  return undefined;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && (error.name === 'AbortError' || error.name === 'TimeoutError');
}

function parseProposalList(payload: unknown): NullCitySoulProposal[] {
  const proposals = Array.isArray(payload) ? payload : asProposalEnvelope(payload);
  if (!Array.isArray(proposals) || !proposals.every(isSoulProposal)) {
    throw new NullCityControlError('invalid_proposal_list', 502);
  }
  return proposals;
}

function asProposalEnvelope(payload: unknown): unknown[] | undefined {
  const record = asRecord(payload);
  return Array.isArray(record.proposals) ? record.proposals : undefined;
}

function isSoulProposal(value: unknown): value is NullCitySoulProposal {
  const record = asRecord(value);
  return record.schemaVersion === 1 &&
    typeof record.id === 'string' &&
    typeof record.residentName === 'string' &&
    typeof record.soulMarkdown === 'string' &&
    typeof record.goalText === 'string' &&
    typeof record.apThreshold === 'number' &&
    typeof record.apFunded === 'number' &&
    typeof record.proposerCityUserId === 'string' &&
    isProposalStatus(record.status) &&
    typeof record.createdAt === 'string' &&
    typeof record.updatedAt === 'string';
}

function isProposalStatus(value: unknown): value is NullCityProposalStatus {
  return value === 'proposed' ||
    value === 'funding' ||
    value === 'threshold_crossed' ||
    value === 'approved' ||
    value === 'rejected' ||
    value === 'born';
}

async function readPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { error: text };
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
