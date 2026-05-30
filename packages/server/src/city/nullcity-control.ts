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

export type NullCityNcriApprovalStatus = 'pending' | 'approved';
export type NullCityNcriRedemptionStatus = 'available' | 'redeemed';

export interface NullCityNcriRecord {
  schemaVersion: 1;
  id: string;
  itemId: number;
  displayName: string;
  lore: string;
  propertyTags?: string[];
  printable?: boolean;
  printAssetRef?: string;
  owner: string;
  approvalStatus: NullCityNcriApprovalStatus;
  redemptionStatus: NullCityNcriRedemptionStatus;
  adminNotes?: string;
  createdAt: string;
  updatedAt: string;
  redeemedAt?: string;
}

export interface NullCityLiveEconomyQuery {
  since?: string;
  limit?: number;
  residentLimit?: number;
}

export interface NullCityLiveEconomyEvent {
  id: string;
  ts: string;
  kind: string;
  residentName?: string;
  cityUserId?: string;
  apDelta?: number;
  gpDelta?: number;
  ncriId?: string;
  refId?: string;
  note?: string;
}

export interface NullCityLiveEconomyResident {
  residentName: string;
  attentionBalance: number;
  gpNetDelta: number;
  eventCount: number;
  windowEventCount: number;
  activeInWindow: boolean;
  online: boolean;
  lastEventTs?: string;
}

export interface NullCityLiveEconomyProposal {
  proposalId: string;
  residentName: string;
  goalText: string;
  apFunded: number;
  apThreshold: number;
  status: string;
}

export interface NullCityLiveEconomySnapshot {
  asOf: string;
  window: { since: string; windowMs: number };
  city: {
    residentCount: number;
    activeResidentCount: number;
    attentionTotal: number;
    attentionDelta: number;
    gpNetDelta: number;
  };
  countsByKind: Record<string, number>;
  topResidentsByAttention: NullCityLiveEconomyResident[];
  residents: NullCityLiveEconomyResident[];
  recentEvents: NullCityLiveEconomyEvent[];
  pendingProposals: NullCityLiveEconomyProposal[];
}

export interface NullCityControlClient {
  listProposals(): Promise<NullCitySoulProposal[]>;
  listNcri(): Promise<NullCityNcriRecord[]>;
  liveEconomy?(query?: NullCityLiveEconomyQuery): Promise<NullCityLiveEconomySnapshot>;
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
    listNcri: async () => parseNcriList(await request<unknown>('/ncri')),
    liveEconomy: async query => parseLiveEconomy(await request<unknown>(`/economy/live${queryString(query)}`)),
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

function parseNcriList(payload: unknown): NullCityNcriRecord[] {
  const records = Array.isArray(payload) ? payload : asNcriEnvelope(payload);
  if (!Array.isArray(records) || !records.every(isNcriRecord)) {
    throw new NullCityControlError('invalid_ncri_list', 502);
  }
  return records;
}

function parseLiveEconomy(payload: unknown): NullCityLiveEconomySnapshot {
  if (!isLiveEconomySnapshot(payload)) {
    throw new NullCityControlError('invalid_live_economy', 502);
  }
  return payload;
}

function asProposalEnvelope(payload: unknown): unknown[] | undefined {
  const record = asRecord(payload);
  return Array.isArray(record.proposals) ? record.proposals : undefined;
}

function asNcriEnvelope(payload: unknown): unknown[] | undefined {
  const record = asRecord(payload);
  return Array.isArray(record.records) ? record.records : undefined;
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

function isNcriRecord(value: unknown): value is NullCityNcriRecord {
  const record = asRecord(value);
  return record.schemaVersion === 1 &&
    typeof record.id === 'string' &&
    typeof record.itemId === 'number' &&
    Number.isFinite(record.itemId) &&
    typeof record.displayName === 'string' &&
    typeof record.lore === 'string' &&
    typeof record.owner === 'string' &&
    isNcriApprovalStatus(record.approvalStatus) &&
    isNcriRedemptionStatus(record.redemptionStatus) &&
    typeof record.createdAt === 'string' &&
    typeof record.updatedAt === 'string';
}

function isLiveEconomySnapshot(value: unknown): value is NullCityLiveEconomySnapshot {
  const record = asRecord(value);
  const city = asRecord(record.city);
  const window = asRecord(record.window);
  return typeof record.asOf === 'string' &&
    typeof window.since === 'string' &&
    typeof window.windowMs === 'number' &&
    typeof city.residentCount === 'number' &&
    typeof city.activeResidentCount === 'number' &&
    typeof city.attentionTotal === 'number' &&
    typeof city.attentionDelta === 'number' &&
    typeof city.gpNetDelta === 'number' &&
    isStringNumberRecord(record.countsByKind) &&
    Array.isArray(record.topResidentsByAttention) &&
    record.topResidentsByAttention.every(isLiveEconomyResident) &&
    Array.isArray(record.residents) &&
    record.residents.every(isLiveEconomyResident) &&
    Array.isArray(record.recentEvents) &&
    record.recentEvents.every(isLiveEconomyEvent) &&
    Array.isArray(record.pendingProposals) &&
    record.pendingProposals.every(isLiveEconomyProposal);
}

function isLiveEconomyResident(value: unknown): value is NullCityLiveEconomyResident {
  const record = asRecord(value);
  return typeof record.residentName === 'string' &&
    typeof record.attentionBalance === 'number' &&
    typeof record.gpNetDelta === 'number' &&
    typeof record.eventCount === 'number' &&
    typeof record.windowEventCount === 'number' &&
    typeof record.activeInWindow === 'boolean' &&
    typeof record.online === 'boolean';
}

function isLiveEconomyEvent(value: unknown): value is NullCityLiveEconomyEvent {
  const record = asRecord(value);
  return typeof record.id === 'string' &&
    typeof record.ts === 'string' &&
    typeof record.kind === 'string';
}

function isLiveEconomyProposal(value: unknown): value is NullCityLiveEconomyProposal {
  const record = asRecord(value);
  return typeof record.proposalId === 'string' &&
    typeof record.residentName === 'string' &&
    typeof record.goalText === 'string' &&
    typeof record.apFunded === 'number' &&
    typeof record.apThreshold === 'number' &&
    typeof record.status === 'string';
}

function isStringNumberRecord(value: unknown): value is Record<string, number> {
  const record = asRecord(value);
  return Object.values(record).every(entry => typeof entry === 'number');
}

function isProposalStatus(value: unknown): value is NullCityProposalStatus {
  return value === 'proposed' ||
    value === 'funding' ||
    value === 'threshold_crossed' ||
    value === 'approved' ||
    value === 'rejected' ||
    value === 'born';
}

function isNcriApprovalStatus(value: unknown): value is NullCityNcriApprovalStatus {
  return value === 'pending' || value === 'approved';
}

function isNcriRedemptionStatus(value: unknown): value is NullCityNcriRedemptionStatus {
  return value === 'available' || value === 'redeemed';
}

function queryString(query: NullCityLiveEconomyQuery | undefined): string {
  const params = new URLSearchParams();
  if (query?.since) params.set('since', query.since);
  if (typeof query?.limit === 'number') params.set('limit', String(query.limit));
  if (typeof query?.residentLimit === 'number') params.set('residentLimit', String(query.residentLimit));
  const serialized = params.toString();
  return serialized ? `?${serialized}` : '';
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
