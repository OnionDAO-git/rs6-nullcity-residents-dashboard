export type PointResource = 'AP' | 'GP';

export interface CitySessionUser {
  id: string;
  landingUserId: string;
  email: string;
  name: string;
  handle?: string | null;
  avatarUrl?: string | null;
  profileClaimed: boolean;
  isAdmin: boolean;
  roles: Array<'attendee' | 'admin'>;
}

export interface PointBalance {
  resource: PointResource;
  balance: number;
  updatedAt: string;
}

export interface PointLedgerEntry {
  id: string;
  cityUserId: string;
  resource: PointResource;
  delta: number;
  balanceAfter: number;
  sourceType: string;
  sourceId: string;
  memo?: string;
  metadata: Record<string, unknown>;
  createdByCityUserId?: string;
  createdAt: string;
}

export interface CitySessionResponse {
  authenticated: boolean;
  loginUrl: string;
  logoutUrl?: string;
  csrfToken?: string;
  user?: CitySessionUser;
  points?: PointBalance[];
  auth?: Record<string, unknown>;
  store?: Record<string, unknown>;
}

export interface CityProfile {
  id: string;
  landingUserId: string;
  displayName: string;
  handle?: string | null;
  avatarUrl?: string | null;
  points: PointBalance[];
  recentLedger: PointLedgerEntry[];
}

export interface SoulQuote {
  threshold: number;
  breakdown: {
    base: number;
    levels: number;
    equipment: number;
    inventory: number;
    complexity: number;
  };
}

export type SoulProposalStatus =
  | 'draft'
  | 'submitted'
  | 'funding'
  | 'ready_to_birth'
  | 'birthing'
  | 'born'
  | 'rejected'
  | 'expired';

export interface SoulProposal {
  id: string;
  proposerCityUserId: string;
  status: SoulProposalStatus;
  residentName?: string;
  displayName: string;
  goal: string;
  personality: string;
  vices: string;
  virtues: string;
  fears: string;
  voice: string;
  firstMemory: string;
  secret: string;
  appearance: Record<string, unknown>;
  startingLevels: Record<string, number>;
  startingEquipment: unknown[];
  startingInventory: unknown[];
  attentionThreshold: number;
  contributedAttention: number;
  quote: SoulQuote;
  bornResidentId?: string;
  moderationNotes?: string;
  createdAt: string;
  updatedAt: string;
  submittedAt?: string;
  bornAt?: string;
}

export interface SoulContribution {
  id: string;
  proposalId: string;
  cityUserId: string;
  apAmount: number;
  ledgerEntryId: string;
  idempotencyKey?: string;
  createdAt: string;
}

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

export interface NullCityProposalBridgeResponse {
  available: boolean;
  proposals: NullCitySoulProposal[];
  error?: string;
}

export interface SoulProposalInput {
  residentName?: string;
  displayName: string;
  goal: string;
  personality?: string;
  vices?: string;
  virtues?: string;
  fears?: string;
  voice?: string;
  firstMemory?: string;
  secret?: string;
  appearance?: Record<string, unknown>;
  startingLevels?: Record<string, number>;
  startingEquipment?: unknown[];
  startingInventory?: unknown[];
}

export type PrintRequestStatus =
  | 'draft'
  | 'uploaded'
  | 'quoted'
  | 'awaiting_gp_confirmation'
  | 'paid'
  | 'approved'
  | 'slicing'
  | 'queued'
  | 'printing'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'refunded';

export interface PrintRequest {
  id: string;
  cityUserId: string;
  status: PrintRequestStatus;
  title: string;
  description?: string;
  requestedMaterial?: string;
  requestedColor?: string;
  quantity: number;
  quoteGp?: number;
  gpLedgerEntryId?: string;
  assignedPrinterId?: string;
  adminNotes?: string;
  userNotes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Printer {
  id: string;
  name: string;
  kind: 'bambu-p2s' | 'snapmaker-u1' | 'generic';
  adapter: 'fdm-monster' | 'bambu-lan' | 'moonraker' | 'snapmaker-u1' | 'manual';
  bridgeId?: string;
  enabled: boolean;
  adminNotes?: string;
  capabilities: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface PrintQueueEntry {
  id: string;
  printRequestId: string;
  printerId?: string;
  status: string;
  priority: number;
  queuePosition?: number;
  startedAt?: string;
  completedAt?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ResidentReadModel {
  id: string;
  nullcityResidentId: string;
  displayName: string;
  status: 'alive' | 'deceased' | 'unknown';
  bornAt?: string;
  diedAt?: string;
  deathCause?: string;
  currentAttention?: number;
  goal?: string;
  latestThought?: string;
  latestStatusPostId?: string;
  latestSeenAt?: string;
  sourceProposalId?: string;
  metadata: Record<string, unknown>;
  updatedAt: string;
}

export interface ResidentPost {
  id: string;
  residentId: string;
  visibility: 'public' | 'hidden';
  body: string;
  source: 'resident' | 'overseer' | 'admin';
  sourceEventId?: string;
  createdAt: string;
}

export type ResidentTradeStatus =
  | 'pending_nullcity'
  | 'accepted'
  | 'rejected'
  | 'cancelled'
  | 'failed';

export interface ResidentTrade {
  id: string;
  cityUserId: string;
  residentId: string;
  status: ResidentTradeStatus;
  offeredResource: PointResource;
  offeredAmount: number;
  requestedItem?: string;
  idempotencyKey?: string;
  pointLedgerEntryId: string;
  nullcityTradeId?: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface ResidentTradeSummary {
  title: string;
  detail: string;
}

export interface InboxThread {
  id: string;
  cityUserId: string;
  residentId: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  latestMessage?: InboxMessage;
}

export interface InboxMessage {
  id: string;
  threadId: string;
  senderType: 'attendee' | 'resident' | 'system' | 'admin';
  senderCityUserId?: string;
  senderResidentId?: string;
  body: string;
  messageType: string;
  metadata: Record<string, unknown>;
  readAt?: string;
  deliveredToNullcityAt?: string;
  createdAt: string;
}

export interface InboxThreadDetail extends InboxThread {
  messages: InboxMessage[];
}

export interface LibrarySoulLife {
  id: string;
  residentId?: string;
  nullcityResidentId: string;
  sourceProposalId?: string;
  bornAt?: string;
  diedAt?: string;
  deathCause?: string;
  accomplishedGoal?: boolean;
  goalSummary?: string;
  meaningfulEvents: unknown[];
  epitaph?: string;
  createdAt: string;
  updatedAt: string;
}

export class CityApiError extends Error {
  readonly status: number;
  readonly loginUrl?: string;

  constructor(status: number, message: string, loginUrl?: string) {
    super(message);
    this.name = 'CityApiError';
    this.status = status;
    if (loginUrl) this.loginUrl = loginUrl;
  }
}

let csrfToken = '';

export function setCityCsrfToken(token: string | undefined): void {
  csrfToken = token || '';
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('accept', 'application/json');
  if (init.body !== undefined && !headers.has('content-type')) headers.set('content-type', 'application/json');
  if (csrfToken && isUnsafeMethod(init.method)) headers.set('x-csrf-token', csrfToken);

  const response = await fetch(path, {
    credentials: 'same-origin',
    ...init,
    headers,
  });
  const payload = await readPayload(response);
  if (!response.ok) {
    const record = asRecord(payload);
    const message = stringField(record, 'error') || stringField(record, 'message') || `${response.status} ${response.statusText}`;
    throw new CityApiError(response.status, message, stringField(record, 'loginUrl'));
  }
  return payload as T;
}

function isUnsafeMethod(method: string | undefined): boolean {
  const normalized = (method || 'GET').toUpperCase();
  return !['GET', 'HEAD', 'OPTIONS'].includes(normalized);
}

async function readPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

function jsonBody(body: unknown): string {
  return JSON.stringify(body);
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringField(value: Record<string, unknown>, key: string): string | undefined {
  const field = value[key];
  return typeof field === 'string' && field ? field : undefined;
}

export function residentTradeTone(status: ResidentTradeStatus): 'ok' | 'warn' | 'fail' {
  if (status === 'accepted') return 'ok';
  if (status === 'failed' || status === 'rejected' || status === 'cancelled') return 'fail';
  return 'warn';
}

export function residentTradeSummary(trade: ResidentTrade): ResidentTradeSummary {
  const request = trade.requestedItem?.trim() ? `Request: ${trade.requestedItem.trim()}` : 'No requested item recorded';
  const status = trade.status === 'pending_nullcity'
    ? 'pending with Null City'
    : trade.status.replace(/_/g, ' ');
  const settlement = trade.status === 'accepted' && trade.nullcityTradeId
    ? `settled in-game as ${trade.nullcityTradeId}`
    : 'settlement not yet proven in-game';
  return {
    title: `${trade.offeredAmount.toLocaleString()} ${trade.offeredResource} offered to ${trade.residentId}`,
    detail: `${request} · ${status} · ${settlement}`,
  };
}

export const cityApi = {
  session: () => request<CitySessionResponse>('/api/session'),
  profile: () => request<{ profile: CityProfile }>('/api/profile'),
  updateProfile: (body: Partial<Pick<CityProfile, 'displayName' | 'handle' | 'avatarUrl'>> & { bio?: string }) =>
    request<CityProfile>('/api/profile', { method: 'PATCH', body: jsonBody(body) }),
  points: () => request<{ balances: PointBalance[] }>('/api/profile/points'),
  ledger: (resource?: PointResource) => request<{ entries: PointLedgerEntry[] }>(`/api/profile/ledger${resource ? `?resource=${resource}` : ''}`),
  syncCheckins: () => request<{ ok: boolean; awarded: unknown[]; message?: string }>('/api/points/sync-checkins', { method: 'POST' }),

  quoteSoulProposal: (body: SoulProposalInput) => request<SoulQuote>('/api/embassy/quote', { method: 'POST', body: jsonBody(body) }),
  proposals: () => request<{ proposals: SoulProposal[] }>('/api/embassy/proposals'),
  createProposal: (body: SoulProposalInput) => request<{ proposal: SoulProposal }>('/api/embassy/proposals', { method: 'POST', body: jsonBody(body) }),
  proposal: (id: string) => request<{ proposal: SoulProposal }>(`/api/embassy/proposals/${encodeURIComponent(id)}`),
  contributeToProposal: (id: string, apAmount: number, idempotencyKey = crypto.randomUUID()) =>
    request<{ proposal: SoulProposal; contribution: SoulContribution; ledger: PointLedgerEntry }>(
      `/api/embassy/proposals/${encodeURIComponent(id)}/contributions`,
      { method: 'POST', body: jsonBody({ apAmount, idempotencyKey }) },
    ),

  adminNullcityProposals: () => request<NullCityProposalBridgeResponse>('/api/admin/nullcity/proposals'),
  approveNullcityProposal: (id: string, adminNotes?: string) =>
    request<unknown>(`/api/admin/nullcity/proposals/${encodeURIComponent(id)}/approve`, { method: 'POST', body: jsonBody({ adminNotes }) }),
  rejectNullcityProposal: (id: string, adminNotes?: string) =>
    request<unknown>(`/api/admin/nullcity/proposals/${encodeURIComponent(id)}/reject`, { method: 'POST', body: jsonBody({ adminNotes }) }),
  birthNullcityProposal: (id: string) =>
    request<unknown>(`/api/admin/nullcity/proposals/${encodeURIComponent(id)}/birth`, { method: 'POST', body: jsonBody({}) }),

  inbox: () => request<{ threads: InboxThread[] }>('/api/inbox'),
  inboxThread: (id: string) => request<InboxThreadDetail>(`/api/inbox/${encodeURIComponent(id)}`),
  residents: () => request<{ residents: ResidentReadModel[] }>('/api/city/residents'),
  resident: (id: string) => request<{ resident: ResidentReadModel }>(`/api/city/residents/${encodeURIComponent(id)}`),
  residentPosts: (id: string) => request<{ posts: ResidentPost[] }>(`/api/city/residents/${encodeURIComponent(id)}/posts`),
  library: () => request<{ lives: LibrarySoulLife[] }>('/api/city/library'),

  prints: () => request<{ requests: PrintRequest[] }>('/api/prints'),
  createPrint: (body: Pick<PrintRequest, 'title' | 'description' | 'requestedMaterial' | 'requestedColor' | 'quantity' | 'userNotes'>) =>
    request<{ request: PrintRequest }>('/api/prints', { method: 'POST', body: jsonBody(body) }),
  print: (id: string) => request<{ request: PrintRequest }>(`/api/prints/${encodeURIComponent(id)}`),
  uploadPrintMetadata: (id: string, body: { fileName: string; mime: string; sizeBytes: number }) =>
    request<{ status: string; file: unknown; message?: string }>(`/api/prints/${encodeURIComponent(id)}/files`, { method: 'POST', body: jsonBody(body) }),
  confirmPrintGp: (id: string, idempotencyKey = crypto.randomUUID()) =>
    request<{ request: PrintRequest; ledger: PointLedgerEntry }>(`/api/prints/${encodeURIComponent(id)}/confirm-gp`, { method: 'POST', body: jsonBody({ idempotencyKey }) }),

  adminPrinters: () => request<{ printers: Printer[] }>('/api/admin/printers'),
  upsertPrinter: (body: Partial<Printer> & Pick<Printer, 'name' | 'kind' | 'adapter'>) =>
    request<{ printer: Printer }>('/api/admin/printers', { method: 'POST', body: jsonBody(body) }),
  updatePrinter: (id: string, body: Partial<Printer>) =>
    request<{ printer: Printer }>(`/api/admin/printers/${encodeURIComponent(id)}`, { method: 'PATCH', body: jsonBody(body) }),
  testPrinter: (id: string) => request<{ printerId: string; ok: boolean; status: string }>(`/api/admin/printers/${encodeURIComponent(id)}/test`, { method: 'POST' }),
  adminPrintQueue: () => request<{ queue: PrintQueueEntry[] }>('/api/admin/print-queue'),
  quotePrint: (id: string, quoteGp: number, adminNotes?: string) =>
    request<{ request: PrintRequest }>(`/api/admin/prints/${encodeURIComponent(id)}/quote`, { method: 'POST', body: jsonBody({ quoteGp, adminNotes }) }),
  grantPoints: (body: { cityUserId?: string; resource: PointResource; amount: number; sourceId?: string; idempotencyKey?: string; memo: string }) =>
    request<PointLedgerEntry>('/api/admin/points/grant', { method: 'POST', body: jsonBody(body) }),
  adjustPoints: (body: { cityUserId?: string; resource: PointResource; amount: number; sourceId?: string; idempotencyKey?: string; memo: string }) =>
    request<PointLedgerEntry>('/api/admin/points/adjust', { method: 'POST', body: jsonBody(body) }),

  grantResidentAttention: (residentId: string, body: { apAmount: number; memo?: string; idempotencyKey?: string }) =>
    request<{ status: string; residentId: string; mocked: boolean; ledger: PointLedgerEntry }>(
      `/api/city/residents/${encodeURIComponent(residentId)}/attention-grants`,
      { method: 'POST', body: jsonBody(body) },
    ),
  trades: () => request<{ trades: ResidentTrade[] }>('/api/city/trades'),
  createTrade: (body: { residentId: string; offeredResource: PointResource; offeredAmount: number; requestedItem?: string; idempotencyKey?: string; metadata?: Record<string, unknown> }) =>
    request<{ trade: ResidentTrade; ledger: PointLedgerEntry; mocked: boolean }>('/api/city/trades', { method: 'POST', body: jsonBody(body) }),
};
