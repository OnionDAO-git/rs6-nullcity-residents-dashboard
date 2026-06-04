import crypto from 'node:crypto';

/**
 * Client for Dev's onion consent-spend API on landing (see landing-2026/API.md).
 * The "spend" is an attendee-approved BURN request (async): we create it, the
 * attendee approves in /portal/onions (or via badge), then landing calls our
 * callback (or we poll) with `completed` — at which point we credit City.
 */
export interface OnionBurnRequestInput {
  username: string;        // attendee handle/name/email (landing resolves to users.id)
  amount: number;          // positive whole onions
  callbackUrl: string;     // our webhook; landing POSTs status here
  callbackSecret?: string; // HMAC secret for the callback signature
  requester: string;       // app id, e.g. 'nullcity'
  externalId: string;      // idempotency key (unique per requester)
  note?: string;
  metadata?: Record<string, unknown>;
}

export interface OnionRequestCreated {
  id: string;
  status: string; // 'pending'
}

export type OnionRequestStatus =
  | 'pending'
  | 'awaiting_badge_signature'
  | 'processing'
  | 'completed'
  | 'denied'
  | 'failed';

export interface OnionRequestRecord {
  id: string;
  requestType: 'burn' | 'transfer';
  status: OnionRequestStatus;
  amount: number;
  currencyMode: 'points' | 'tokens' | null;
  solanaSignature: string | null;
  error: string | null;
}

export interface OnionApiClient {
  createBurnRequest(input: OnionBurnRequestInput): Promise<OnionRequestCreated>;
  getRequestStatus(id: string): Promise<OnionRequestRecord>;
}

export class OnionApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'OnionApiError';
  }
}

export interface OnionApiClientOptions {
  baseUrl: string;
  apiKey?: string;
  fetchImpl?: typeof fetch;
}

export function createOnionApiClient(options: OnionApiClientOptions): OnionApiClient {
  const baseUrl = options.baseUrl.replace(/\/+$/, '');
  const fetchImpl = options.fetchImpl ?? fetch;

  async function call<T>(path: string, init: RequestInit): Promise<T> {
    let response: Response;
    try {
      response = await fetchImpl(`${baseUrl}${path}`, {
        ...init,
        headers: {
          'content-type': 'application/json',
          ...(options.apiKey ? { authorization: `Bearer ${options.apiKey}` } : {}),
          ...(init.headers ?? {}),
        },
      });
    } catch {
      throw new OnionApiError('onion_api_unreachable', 502);
    }
    const text = await response.text();
    const payload = text ? JSON.parse(text) : {};
    if (!response.ok) {
      throw new OnionApiError(typeof payload?.error === 'string' ? payload.error : 'onion_api_error', response.status);
    }
    return payload as T;
  }

  return {
    async createBurnRequest(input) {
      const created = await call<OnionRequestCreated>('/api/public/onions/requests', {
        method: 'POST',
        body: JSON.stringify({ type: 'burn', ...input }),
      });
      if (!created || typeof created.id !== 'string') {
        throw new OnionApiError('invalid_onion_request_response', 502);
      }
      return created;
    },
    async getRequestStatus(id) {
      const record = await call<OnionRequestRecord>(`/api/public/onions/requests/${encodeURIComponent(id)}`, { method: 'GET' });
      if (!record || typeof record.status !== 'string') {
        throw new OnionApiError('invalid_onion_request_status', 502);
      }
      return record;
    },
  };
}

/**
 * Verify the `X-Onion-Signature` HMAC on a landing callback.
 * signature = hex(hmac_sha256(callbackSecret, raw_request_body)).
 */
export function verifyOnionCallbackSignature(rawBody: string, signatureHex: string | null, secret: string): boolean {
  if (!signatureHex) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(signatureHex, 'hex');
  const b = Buffer.from(expected, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
