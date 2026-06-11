import type { CityConfig } from './config';

export type OnionBalanceType = 'points' | 'tokens';
export type OnionRequestType = 'burn' | 'transfer';

export interface OnionWallet {
  name: string;
  handle?: string | null;
  avatarUrl?: string | null;
  onionId?: number | null;
  solanaWalletAddress?: string | null;
  balanceType: OnionBalanceType | string;
  currentOnionPoints: number | null;
  currentOnionTokens: number | null;
  currentBalance: number;
}

export interface OnionCreateRequestInput {
  type: OnionRequestType;
  username: string;
  recipientUsername?: string;
  amount: number;
  callbackUrl: string;
  callbackSecret?: string;
  requester?: string;
  externalId?: string;
  note?: string;
  metadata?: Record<string, unknown>;
}

export interface OnionCreateRequestResult {
  id: string;
  status: string;
}

export interface OnionExternalRequestStatus {
  id: string;
  requestType: string;
  status: string;
  amount: number;
  currencyMode?: string | null;
  solanaSignature?: string | null;
  error?: string | null;
  createdAt?: string;
  updatedAt?: string;
  reviewedAt?: string | null;
}

export interface OnionDaoClient {
  profile(identifier: string): Promise<OnionWallet>;
  createRequest(input: OnionCreateRequestInput): Promise<OnionCreateRequestResult>;
  /**
   * Approve a pending request on the user's behalf.
   * EXPLICIT CONSENT (maintainer decision 2026-06-11): the dashboard must NOT
   * call this on the support/spend path — the attendee approves the burn on
   * landing's /portal/onions surface themselves. Kept only for tooling.
   */
  approveRequest(id: string, sessionToken: string): Promise<void>;
  requestStatus(id: string): Promise<OnionExternalRequestStatus>;
}

export class OnionDaoClientError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: string, status = 502, details?: unknown) {
    super(code);
    this.name = 'OnionDaoClientError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export class HttpOnionDaoClient implements OnionDaoClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly authCookieName: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: {
    baseUrl: string;
    apiKey: string;
    authCookieName: string;
    fetchImpl?: typeof fetch;
  }) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.apiKey = options.apiKey;
    this.authCookieName = options.authCookieName;
    this.fetchImpl = options.fetchImpl || fetch;
  }

  async profile(identifier: string): Promise<OnionWallet> {
    const payload = await this.requestJson<Record<string, unknown>>(
      `/api/public/profile/${encodeURIComponent(identifier)}`,
      { method: 'GET' },
      false,
    );
    return normalizeWallet(payload);
  }

  async createRequest(input: OnionCreateRequestInput): Promise<OnionCreateRequestResult> {
    const payload = await this.requestJson<Record<string, unknown>>('/api/public/onions/requests', {
      method: 'POST',
      headers: { authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify(input),
    });
    return {
      id: stringField(payload, 'id'),
      status: stringField(payload, 'status') || 'pending',
    };
  }

  async approveRequest(id: string, sessionToken: string): Promise<void> {
    await this.requestJson<Record<string, unknown>>(
      `/api/portal/onion-approvals/${encodeURIComponent(id)}`,
      {
        method: 'POST',
        headers: { cookie: `${this.authCookieName}=${encodeURIComponent(sessionToken)}` },
        body: JSON.stringify({ action: 'approve' }),
      },
      false,
      errorStatus,
    );
  }

  async requestStatus(id: string): Promise<OnionExternalRequestStatus> {
    const payload = await this.requestJson<Record<string, unknown>>(`/api/public/onions/requests/${encodeURIComponent(id)}`, {
      method: 'GET',
      headers: { authorization: `Bearer ${this.apiKey}` },
    });
    return normalizeRequestStatus(payload);
  }

  private async requestJson<T>(
    path: string,
    init: RequestInit,
    defaultJsonHeaders = true,
    statusForError: (response: Response, errorCode: string) => number = errorStatus,
  ): Promise<T> {
    const headers = new Headers(init.headers);
    if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
    try {
      const response = await this.fetchImpl(new URL(path, this.baseUrl), { ...init, headers });
      const payload = await readResponseJson(response);
      if (!response.ok) {
        const code = errorCode(payload) || `oniondao_http_${response.status}`;
        throw new OnionDaoClientError(code, statusForError(response, code), payload);
      }
      return payload as T;
    } catch (error) {
      if (error instanceof OnionDaoClientError) throw error;
      throw new OnionDaoClientError('oniondao_unreachable', 502, error instanceof Error ? error.message : String(error));
    }
  }
}

export function createOnionDaoClientFromConfig(config: CityConfig): OnionDaoClient | undefined {
  if (!config.onionExternalApiKey) return undefined;
  return new HttpOnionDaoClient({
    baseUrl: config.onionApiBaseUrl || config.landingAuthBaseUrl,
    apiKey: config.onionExternalApiKey,
    authCookieName: config.authCookieName,
  });
}

export function normalizeWallet(payload: Record<string, unknown>): OnionWallet {
  const balanceType = stringField(payload, 'balanceType') || 'points';
  const currentOnionPoints = nullableNumber(payload.currentOnionPoints);
  const currentOnionTokens = nullableNumber(payload.currentOnionTokens);
  return {
    name: stringField(payload, 'name'),
    handle: nullableString(payload.handle),
    avatarUrl: nullableString(payload.avatarUrl),
    onionId: nullableNumber(payload.onionId),
    solanaWalletAddress: nullableString(payload.solanaWalletAddress),
    balanceType,
    currentOnionPoints,
    currentOnionTokens,
    currentBalance: balanceType === 'tokens' ? currentOnionTokens ?? 0 : currentOnionPoints ?? 0,
  };
}

function normalizeRequestStatus(payload: Record<string, unknown>): OnionExternalRequestStatus {
  return {
    id: stringField(payload, 'id'),
    requestType: stringField(payload, 'requestType') || stringField(payload, 'request_type'),
    status: stringField(payload, 'status'),
    amount: numberField(payload, 'amount'),
    currencyMode: nullableString(payload.currencyMode ?? payload.currency_mode),
    solanaSignature: nullableString(payload.solanaSignature ?? payload.solana_signature),
    error: nullableString(payload.error),
    createdAt: nullableString(payload.createdAt ?? payload.created_at) || undefined,
    updatedAt: nullableString(payload.updatedAt ?? payload.updated_at) || undefined,
    reviewedAt: nullableString(payload.reviewedAt ?? payload.reviewed_at),
  };
}

async function readResponseJson(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  if (!text) return {};
  try {
    const parsed = JSON.parse(text);
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return { error: text };
  }
}

function errorStatus(response: Response, errorCode: string): number {
  if (errorCode === 'insufficient_funds') return 409;
  if (response.status >= 400 && response.status < 600) return response.status;
  return 502;
}

function errorCode(payload: Record<string, unknown>): string | undefined {
  return nullableString(payload.error) || nullableString(payload.reason) || undefined;
}

function stringField(payload: Record<string, unknown>, key: string): string {
  const value = payload[key];
  return typeof value === 'string' ? value : value === undefined || value === null ? '' : String(value);
}

function numberField(payload: Record<string, unknown>, key: string): number {
  const value = Number(payload[key]);
  return Number.isFinite(value) ? Math.floor(value) : 0;
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}

function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.floor(parsed) : null;
}
