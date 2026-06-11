import type {
  CityProfile,
  CityUser,
  InboxMessage,
  InboxThread,
  LandingSessionUser,
  LibrarySoulLife,
  PointBalance,
  PointLedgerEntry,
  PointResource,
  PrintQueueEntry,
  Printer,
  PrintRequest,
  ResidentPost,
  ResidentReadModel,
  ResidentTrade,
  SoulContribution,
  SoulProposal,
  SoulQuote,
} from './types';

export class CityStoreError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = 'CityStoreError';
  }
}

export interface LedgerAppendInput {
  cityUserId: string;
  resource: PointResource;
  delta: number;
  sourceType: string;
  sourceId: string;
  memo?: string;
  metadata?: Record<string, unknown>;
  createdByCityUserId?: string;
}

export interface SoulProposalCreateInput {
  proposerCityUserId: string;
  residentName?: string;
  displayName: string;
  goal: string;
  personality: string;
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
  quote: SoulQuote;
}

export interface SoulContributionInput {
  proposalId: string;
  cityUserId: string;
  apAmount: number;
  idempotencyKey?: string;
}

export interface PrintRequestCreateInput {
  cityUserId: string;
  title: string;
  description?: string;
  requestedMaterial?: string;
  requestedColor?: string;
  quantity?: number;
  userNotes?: string;
}

export interface PrinterUpsertInput {
  id?: string;
  name: string;
  kind: Printer['kind'];
  adapter: Printer['adapter'];
  bridgeId?: string;
  enabled?: boolean;
  adminNotes?: string;
  capabilities?: Record<string, unknown>;
}

export interface PrintQueueEnqueueInput {
  printRequestId: string;
  printerId?: string;
  priority?: number;
  queuePosition?: number;
}

export interface PrintQueueClaimInput {
  bridgeId?: string;
  printerIds: string[];
}

export interface PrintBridgeJob {
  id: string;
  printRequestId: string;
  title: string;
  printerId?: string;
  sourceFilePath?: string;
  sourceUrl?: string;
  slicerProfile?: string;
  requestedMaterial?: string;
  requestedColor?: string;
  quantity: number;
  metadata?: Record<string, unknown>;
}

export interface CityStore {
  readonly mode: string;

  upsertUserFromLanding(user: LandingSessionUser): Promise<CityUser>;
  getProfile(cityUserId: string): Promise<CityProfile>;
  updateProfile(cityUserId: string, patch: Partial<Pick<CityProfile, 'displayName' | 'handle' | 'avatarUrl' | 'bio' | 'metadata'>>): Promise<CityProfile>;

  getPointBalances(cityUserId: string): Promise<PointBalance[]>;
  listPointLedger(cityUserId: string, resource?: PointResource): Promise<PointLedgerEntry[]>;
  appendPointLedger(input: LedgerAppendInput): Promise<PointLedgerEntry>;

  listSoulProposals(): Promise<SoulProposal[]>;
  getSoulProposal(id: string): Promise<SoulProposal | undefined>;
  createSoulProposal(input: SoulProposalCreateInput): Promise<SoulProposal>;
  contributeToSoulProposal(input: SoulContributionInput): Promise<{ proposal: SoulProposal; contribution: SoulContribution; ledger: PointLedgerEntry }>;

  listPrintRequests(cityUserId?: string): Promise<PrintRequest[]>;
  getPrintRequest(id: string): Promise<PrintRequest | undefined>;
  createPrintRequest(input: PrintRequestCreateInput): Promise<PrintRequest>;
  updatePrintQuote(id: string, quoteGp: number, adminNotes?: string): Promise<PrintRequest>;
  confirmPrintGp(id: string, cityUserId: string, idempotencyKey?: string): Promise<{ request: PrintRequest; ledger: PointLedgerEntry }>;
  listPrinters(): Promise<Printer[]>;
  upsertPrinter(input: PrinterUpsertInput): Promise<Printer>;
  listPrintQueue(): Promise<PrintQueueEntry[]>;
  enqueuePrintRequest(input: PrintQueueEnqueueInput): Promise<PrintQueueEntry>;
  claimNextPrintQueueJob(input: PrintQueueClaimInput): Promise<PrintBridgeJob | undefined>;

  listResidents(): Promise<ResidentReadModel[]>;
  getResident(id: string): Promise<ResidentReadModel | undefined>;
  listResidentPosts(residentId: string): Promise<ResidentPost[]>;
  listResidentTrades(cityUserId: string): Promise<ResidentTrade[]>;
  createResidentTrade(input: ResidentTradeCreateInput): Promise<{ trade: ResidentTrade; ledger: PointLedgerEntry; mocked: boolean }>;
  listInboxThreads(cityUserId: string): Promise<InboxThread[]>;
  getInboxThread(cityUserId: string, threadId: string): Promise<{ thread: InboxThread; messages: InboxMessage[] } | undefined>;
  listLibrarySoulLives(): Promise<LibrarySoulLife[]>;

  // Identity (personId === landing users.id === city_users.landing_user_id)
  resolveOnionId(cityUserId: string): Promise<string>;
  setIdentityAlias(personId: string, patronHandle: string): Promise<void>;
  resolvePatronHandle(personId: string): Promise<string | undefined>;

  // Attention-grant saga (T0.0a)
  createAttentionGrantIntent(input: AttentionGrantIntentCreateInput): Promise<AttentionGrantIntent>;
  getAttentionGrantIntent(cityUserId: string, idempotencyKey: string): Promise<AttentionGrantIntent | undefined>;
  getAttentionGrantIntentByOnionRequestId(onionRequestId: string): Promise<AttentionGrantIntent | undefined>;
  claimAttentionGrantIntent(id: string, fromStates: AttentionGrantIntentState[], toState: AttentionGrantIntentState): Promise<AttentionGrantIntent | undefined>;
  updateAttentionGrantIntent(id: string, patch: AttentionGrantIntentPatch): Promise<AttentionGrantIntent>;
}

// 'standin' synchronous path: created -> debited -> sent_to_city -> settled | failed.
// 'real' async consent path: created -> awaiting_approval -> settling -> settled | denied | failed.
export type AttentionGrantIntentState =
  | 'created'
  | 'debited'
  | 'sent_to_city'
  | 'awaiting_approval'
  | 'settling'
  | 'settled'
  | 'denied'
  | 'failed';

export interface AttentionGrantIntent {
  id: string;
  cityUserId: string;
  residentId: string;
  apAmount: number;
  idempotencyKey: string;
  state: AttentionGrantIntentState;
  standinLedgerEntryId?: string;
  onionRequestId?: string;
  cityResponse?: Record<string, unknown>;
  failureReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AttentionGrantIntentCreateInput {
  cityUserId: string;
  residentId: string;
  apAmount: number;
  idempotencyKey: string;
}

export interface AttentionGrantIntentPatch {
  state?: AttentionGrantIntentState;
  standinLedgerEntryId?: string;
  onionRequestId?: string;
  cityResponse?: Record<string, unknown>;
  failureReason?: string;
}

export interface ResidentTradeCreateInput {
  cityUserId: string;
  residentId: string;
  offeredResource: PointResource;
  offeredAmount: number;
  requestedItem?: string;
  idempotencyKey?: string;
  metadata?: Record<string, unknown>;
}

export async function grantPoints(
  store: CityStore,
  input: Omit<LedgerAppendInput, 'delta'> & { amount: number },
): Promise<PointLedgerEntry> {
  return store.appendPointLedger({ ...input, delta: Math.abs(Math.floor(input.amount)) });
}

export async function spendPoints(
  store: CityStore,
  input: Omit<LedgerAppendInput, 'delta'> & { amount: number },
): Promise<PointLedgerEntry> {
  return store.appendPointLedger({ ...input, delta: -Math.abs(Math.floor(input.amount)) });
}

export function createInMemoryCityStore(now: () => Date = () => new Date()): CityStore {
  const users = new Map<string, CityUser>();
  const usersByLandingId = new Map<string, string>();
  const profiles = new Map<string, CityProfile>();
  const balances = new Map<string, PointBalance>();
  const ledger: PointLedgerEntry[] = [];
  const soulProposals = new Map<string, SoulProposal>();
  const soulContributions: SoulContribution[] = [];
  const printRequests = new Map<string, PrintRequest>();
  const printers = new Map<string, Printer>();
  const printQueue: PrintQueueEntry[] = [];
  const residents = new Map<string, ResidentReadModel>();
  const residentPosts: ResidentPost[] = [];
  const residentTrades = new Map<string, ResidentTrade>();
  const inboxThreads = new Map<string, InboxThread>();
  const inboxMessages = new Map<string, InboxMessage[]>();
  const libraryLives: LibrarySoulLife[] = [];
  const identityAliases = new Map<string, string>(); // personId -> patronHandle
  const attentionGrantIntents = new Map<string, AttentionGrantIntent>();
  const attentionGrantIntentIdempotency = new Map<string, string>();

  function timestamp(): string {
    return now().toISOString();
  }

  function makeId(prefix: string): string {
    return `${prefix}_${crypto.randomUUID()}`;
  }

  function balanceKey(cityUserId: string, resource: PointResource): string {
    return `${cityUserId}:${resource}`;
  }

  function ensureBalance(cityUserId: string, resource: PointResource): PointBalance {
    const key = balanceKey(cityUserId, resource);
    let balance = balances.get(key);
    if (!balance) {
      balance = { resource, balance: 0, updatedAt: timestamp() };
      balances.set(key, balance);
    }
    return balance;
  }

  function ensureProfile(user: CityUser): CityProfile {
    let profile = profiles.get(user.id);
    if (!profile) {
      profile = {
        cityUserId: user.id,
        displayName: user.nameSnapshot || user.handleSnapshot || user.emailSnapshot,
        handle: user.handleSnapshot,
        avatarUrl: user.avatarUrlSnapshot,
        bio: '',
        metadata: {},
        updatedAt: timestamp(),
      };
      profiles.set(user.id, profile);
    }
    return profile;
  }

  function requireUser(cityUserId: string): CityUser {
    const user = users.get(cityUserId);
    if (!user) throw new CityStoreError('city_user_not_found', 404);
    return user;
  }

  function getLedgerDuplicate(input: LedgerAppendInput): PointLedgerEntry | undefined {
    return ledger.find(entry =>
      entry.cityUserId === input.cityUserId &&
      entry.resource === input.resource &&
      entry.sourceType === input.sourceType &&
      entry.sourceId === input.sourceId,
    );
  }

  const store: CityStore = {
    mode: 'memory',

    async upsertUserFromLanding(user) {
      const existingId = usersByLandingId.get(user.id);
      const existing = existingId ? users.get(existingId) : undefined;
      const at = timestamp();
      const cityUser: CityUser = existing
        ? {
            ...existing,
            emailSnapshot: user.email,
            nameSnapshot: user.name || user.handle || user.email,
            handleSnapshot: user.handle,
            avatarUrlSnapshot: user.avatarUrl,
            updatedAt: at,
          }
        : {
            id: makeId('usr'),
            landingUserId: user.id,
            emailSnapshot: user.email,
            nameSnapshot: user.name || user.handle || user.email,
            handleSnapshot: user.handle,
            avatarUrlSnapshot: user.avatarUrl,
            createdAt: at,
            updatedAt: at,
          };
      users.set(cityUser.id, cityUser);
      usersByLandingId.set(user.id, cityUser.id);
      ensureProfile(cityUser);
      ensureBalance(cityUser.id, 'AP');
      ensureBalance(cityUser.id, 'GP');
      if (user.handle) {
        identityAliases.set(user.id, user.handle); // T0.ID: personId -> patronHandle
      }
      return cityUser;
    },

    async getProfile(cityUserId) {
      return ensureProfile(requireUser(cityUserId));
    },

    async updateProfile(cityUserId, patch) {
      const current = await store.getProfile(cityUserId);
      const next: CityProfile = {
        ...current,
        ...definedPatch(patch),
        updatedAt: timestamp(),
      };
      profiles.set(cityUserId, next);
      return next;
    },

    async getPointBalances(cityUserId) {
      requireUser(cityUserId);
      return [ensureBalance(cityUserId, 'AP'), ensureBalance(cityUserId, 'GP')];
    },

    async listPointLedger(cityUserId, resource) {
      requireUser(cityUserId);
      return ledger
        .filter(entry => entry.cityUserId === cityUserId && (!resource || entry.resource === resource))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },

    async appendPointLedger(input) {
      requireUser(input.cityUserId);
      if (!Number.isInteger(input.delta) || input.delta === 0) throw new CityStoreError('point_delta_must_be_nonzero');
      const duplicate = getLedgerDuplicate(input);
      if (duplicate) return duplicate;
      const balance = ensureBalance(input.cityUserId, input.resource);
      const nextBalance = balance.balance + input.delta;
      if (nextBalance < 0) throw new CityStoreError('insufficient_points', 409);
      const entry: PointLedgerEntry = {
        id: makeId('led'),
        cityUserId: input.cityUserId,
        resource: input.resource,
        delta: input.delta,
        balanceAfter: nextBalance,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        memo: input.memo,
        metadata: input.metadata || {},
        createdByCityUserId: input.createdByCityUserId,
        createdAt: timestamp(),
      };
      balance.balance = nextBalance;
      balance.updatedAt = entry.createdAt;
      ledger.push(entry);
      return entry;
    },

    async listSoulProposals() {
      return [...soulProposals.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },

    async getSoulProposal(id) {
      return soulProposals.get(id);
    },

    async createSoulProposal(input) {
      requireUser(input.proposerCityUserId);
      const at = timestamp();
      const proposal: SoulProposal = {
        id: makeId('soul'),
        proposerCityUserId: input.proposerCityUserId,
        status: 'funding',
        residentName: input.residentName,
        displayName: input.displayName,
        goal: input.goal,
        personality: input.personality,
        vices: input.vices || '',
        virtues: input.virtues || '',
        fears: input.fears || '',
        voice: input.voice || '',
        firstMemory: input.firstMemory || '',
        secret: input.secret || '',
        appearance: input.appearance || {},
        startingLevels: input.startingLevels || {},
        startingEquipment: input.startingEquipment || [],
        startingInventory: input.startingInventory || [],
        attentionThreshold: input.quote.threshold,
        contributedAttention: 0,
        quote: input.quote,
        createdAt: at,
        updatedAt: at,
        submittedAt: at,
      };
      soulProposals.set(proposal.id, proposal);
      return proposal;
    },

    async contributeToSoulProposal(input) {
      const proposal = soulProposals.get(input.proposalId);
      if (!proposal) throw new CityStoreError('soul_proposal_not_found', 404);
      if (!Number.isInteger(input.apAmount) || input.apAmount <= 0) throw new CityStoreError('ap_amount_must_be_positive');
      if (!['funding', 'ready_to_birth'].includes(proposal.status)) throw new CityStoreError('soul_proposal_not_fundable', 409);
      const sourceId = input.idempotencyKey || `${input.proposalId}:${input.cityUserId}:${soulContributions.length + 1}`;
      const ledgerEntry = await store.appendPointLedger({
        cityUserId: input.cityUserId,
        resource: 'AP',
        delta: -input.apAmount,
        sourceType: 'soul_contribution',
        sourceId,
        memo: `Contribution to ${proposal.displayName}`,
        metadata: { proposalId: proposal.id },
      });
      const existingContribution = soulContributions.find(entry => entry.ledgerEntryId === ledgerEntry.id);
      if (existingContribution) return { proposal, contribution: existingContribution, ledger: ledgerEntry };
      const at = timestamp();
      const contribution: SoulContribution = {
        id: makeId('contrib'),
        proposalId: proposal.id,
        cityUserId: input.cityUserId,
        apAmount: input.apAmount,
        ledgerEntryId: ledgerEntry.id,
        idempotencyKey: input.idempotencyKey,
        createdAt: at,
      };
      proposal.contributedAttention += input.apAmount;
      proposal.status = proposal.contributedAttention >= proposal.attentionThreshold ? 'ready_to_birth' : 'funding';
      proposal.updatedAt = at;
      soulContributions.push(contribution);
      return { proposal, contribution, ledger: ledgerEntry };
    },

    async listPrintRequests(cityUserId) {
      return [...printRequests.values()]
        .filter(request => !cityUserId || request.cityUserId === cityUserId)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },

    async getPrintRequest(id) {
      return printRequests.get(id);
    },

    async createPrintRequest(input) {
      requireUser(input.cityUserId);
      const at = timestamp();
      const request: PrintRequest = {
        id: makeId('print'),
        cityUserId: input.cityUserId,
        status: 'draft',
        title: input.title,
        description: input.description,
        requestedMaterial: input.requestedMaterial,
        requestedColor: input.requestedColor,
        quantity: input.quantity && input.quantity > 0 ? Math.floor(input.quantity) : 1,
        userNotes: input.userNotes,
        createdAt: at,
        updatedAt: at,
      };
      printRequests.set(request.id, request);
      return request;
    },

    async updatePrintQuote(id, quoteGp, adminNotes) {
      const request = printRequests.get(id);
      if (!request) throw new CityStoreError('print_request_not_found', 404);
      if (!Number.isInteger(quoteGp) || quoteGp <= 0) throw new CityStoreError('quote_gp_must_be_positive');
      const next: PrintRequest = {
        ...request,
        status: 'quoted',
        quoteGp,
        adminNotes: adminNotes ?? request.adminNotes,
        updatedAt: timestamp(),
      };
      printRequests.set(id, next);
      return next;
    },

    async confirmPrintGp(id, cityUserId, idempotencyKey) {
      const request = printRequests.get(id);
      if (!request) throw new CityStoreError('print_request_not_found', 404);
      if (request.cityUserId !== cityUserId) throw new CityStoreError('print_request_forbidden', 403);
      if (!request.quoteGp) throw new CityStoreError('print_request_not_quoted', 409);
      const ledgerEntry = await store.appendPointLedger({
        cityUserId,
        resource: 'GP',
        delta: -request.quoteGp,
        sourceType: 'print_request',
        sourceId: idempotencyKey || request.id,
        memo: `3D print request: ${request.title}`,
        metadata: { printRequestId: request.id },
      });
      const next: PrintRequest = {
        ...request,
        status: 'paid',
        gpLedgerEntryId: ledgerEntry.id,
        updatedAt: timestamp(),
      };
      printRequests.set(id, next);
      return { request: next, ledger: ledgerEntry };
    },

    async listPrinters() {
      return [...printers.values()].sort((a, b) => a.name.localeCompare(b.name));
    },

    async upsertPrinter(input) {
      const existing = input.id ? printers.get(input.id) : undefined;
      const at = timestamp();
      const printer: Printer = {
        id: existing?.id || input.id || makeId('printer'),
        name: input.name,
        kind: input.kind,
        adapter: input.adapter,
        bridgeId: input.bridgeId ?? existing?.bridgeId,
        enabled: input.enabled ?? existing?.enabled ?? true,
        adminNotes: input.adminNotes ?? existing?.adminNotes,
        capabilities: input.capabilities || existing?.capabilities || {},
        createdAt: existing?.createdAt || at,
        updatedAt: at,
      };
      printers.set(printer.id, printer);
      return printer;
    },

    async listPrintQueue() {
      return [...printQueue].sort((a, b) => (a.queuePosition || 9999) - (b.queuePosition || 9999));
    },

    async enqueuePrintRequest(input) {
      const request = printRequests.get(input.printRequestId);
      if (!request) throw new CityStoreError('print_request_not_found', 404);
      const at = timestamp();
      const entry: PrintQueueEntry = {
        id: makeId('queue'),
        printRequestId: request.id,
        printerId: input.printerId,
        status: 'queued',
        priority: Number.isInteger(input.priority) ? Math.max(0, Number(input.priority)) : 100,
        queuePosition: Number.isInteger(input.queuePosition) ? Math.max(0, Number(input.queuePosition)) : printQueue.length + 1,
        createdAt: at,
        updatedAt: at,
      };
      request.status = 'queued';
      request.assignedPrinterId = input.printerId ?? request.assignedPrinterId;
      request.updatedAt = at;
      printQueue.push(entry);
      return entry;
    },

    async claimNextPrintQueueJob(input) {
      const availablePrinters = new Set(input.printerIds.filter(Boolean));
      const sorted = [...printQueue].sort((a, b) => a.priority - b.priority || a.createdAt.localeCompare(b.createdAt));
      for (const entry of sorted) {
        if (entry.status !== 'queued') continue;
        const request = printRequests.get(entry.printRequestId);
        if (!request) continue;
        const printer = eligiblePrinter(entry.printerId, availablePrinters, input.bridgeId, [...printers.values()]);
        if (!printer) continue;
        const at = timestamp();
        entry.status = 'claimed';
        entry.printerId = printer.id;
        entry.startedAt = at;
        entry.updatedAt = at;
        request.status = 'queued';
        request.assignedPrinterId = printer.id;
        request.updatedAt = at;
        return printBridgeJob(entry, request);
      }
      return undefined;
    },

    async listResidents() {
      return [...residents.values()].sort((a, b) => a.displayName.localeCompare(b.displayName));
    },

    async getResident(id) {
      return residents.get(id) || [...residents.values()].find(resident => resident.nullcityResidentId === id);
    },

    async listResidentPosts(residentId) {
      return residentPosts
        .filter(post => post.residentId === residentId && post.visibility === 'public')
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },

    async listResidentTrades(cityUserId) {
      requireUser(cityUserId);
      return [...residentTrades.values()]
        .filter(trade => trade.cityUserId === cityUserId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },

    async createResidentTrade(input) {
      const idempotencyKey = input.idempotencyKey;
      const existing = idempotencyKey
        ? [...residentTrades.values()].find(trade => trade.cityUserId === input.cityUserId && trade.idempotencyKey === idempotencyKey)
        : undefined;
      if (existing) {
        const existingLedger = ledger.find(entry => entry.id === existing.pointLedgerEntryId);
        if (existingLedger) return { trade: existing, ledger: existingLedger, mocked: true };
      }
      const amount = Math.max(1, Math.floor(Number(input.offeredAmount)));
      const tradeId = makeId('trade');
      const ledgerEntry = await store.appendPointLedger({
        cityUserId: input.cityUserId,
        resource: input.offeredResource,
        delta: -amount,
        sourceType: 'resident_trade',
        sourceId: idempotencyKey || tradeId,
        memo: `Resident trade: ${input.residentId}`,
        metadata: { residentId: input.residentId, tradeId, mocked: true },
      });
      const at = timestamp();
      const trade: ResidentTrade = {
        id: tradeId,
        cityUserId: input.cityUserId,
        residentId: input.residentId,
        status: 'pending_nullcity',
        offeredResource: input.offeredResource,
        offeredAmount: amount,
        requestedItem: input.requestedItem,
        idempotencyKey,
        pointLedgerEntryId: ledgerEntry.id,
        metadata: input.metadata || {},
        createdAt: at,
        updatedAt: at,
      };
      residentTrades.set(trade.id, trade);
      return { trade, ledger: ledgerEntry, mocked: true };
    },

    async listInboxThreads(cityUserId) {
      requireUser(cityUserId);
      return [...inboxThreads.values()]
        .filter(thread => thread.cityUserId === cityUserId)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },

    async getInboxThread(cityUserId, threadId) {
      const thread = inboxThreads.get(threadId);
      if (!thread || thread.cityUserId !== cityUserId) return undefined;
      return { thread, messages: inboxMessages.get(threadId) || [] };
    },

    async listLibrarySoulLives() {
      return [...libraryLives].sort((a, b) => (b.diedAt || b.updatedAt).localeCompare(a.diedAt || a.updatedAt));
    },

    async resolveOnionId(cityUserId) {
      return requireUser(cityUserId).landingUserId;
    },

    async setIdentityAlias(personId, patronHandle) {
      identityAliases.set(personId, patronHandle);
    },

    async resolvePatronHandle(personId) {
      return identityAliases.get(personId);
    },

    async createAttentionGrantIntent(input) {
      requireUser(input.cityUserId);
      const key = `${input.cityUserId}:${input.idempotencyKey}`;
      const existingId = attentionGrantIntentIdempotency.get(key);
      if (existingId) return { ...attentionGrantIntents.get(existingId)! };
      const ts = timestamp();
      const intent: AttentionGrantIntent = {
        id: makeId('agi'),
        cityUserId: input.cityUserId,
        residentId: input.residentId,
        apAmount: input.apAmount,
        idempotencyKey: input.idempotencyKey,
        state: 'created',
        createdAt: ts,
        updatedAt: ts,
      };
      attentionGrantIntents.set(intent.id, intent);
      attentionGrantIntentIdempotency.set(key, intent.id);
      return { ...intent };
    },

    async getAttentionGrantIntent(cityUserId, idempotencyKey) {
      const id = attentionGrantIntentIdempotency.get(`${cityUserId}:${idempotencyKey}`);
      return id ? { ...attentionGrantIntents.get(id)! } : undefined;
    },

    async getAttentionGrantIntentByOnionRequestId(onionRequestId) {
      for (const intent of attentionGrantIntents.values()) {
        if (intent.onionRequestId === onionRequestId) return { ...intent };
      }
      return undefined;
    },

    async claimAttentionGrantIntent(id, fromStates, toState) {
      const existing = attentionGrantIntents.get(id);
      if (!existing || !fromStates.includes(existing.state)) return undefined;
      const updated = { ...existing, state: toState, updatedAt: timestamp() };
      attentionGrantIntents.set(id, updated);
      return { ...updated };
    },

    async updateAttentionGrantIntent(id, patch) {
      const existing = attentionGrantIntents.get(id);
      if (!existing) throw new CityStoreError('attention_grant_intent_not_found', 404);
      const updated: AttentionGrantIntent = {
        ...existing,
        ...(patch.state !== undefined ? { state: patch.state } : {}),
        ...(patch.standinLedgerEntryId !== undefined ? { standinLedgerEntryId: patch.standinLedgerEntryId } : {}),
        ...(patch.onionRequestId !== undefined ? { onionRequestId: patch.onionRequestId } : {}),
        ...(patch.cityResponse !== undefined ? { cityResponse: patch.cityResponse } : {}),
        ...(patch.failureReason !== undefined ? { failureReason: patch.failureReason } : {}),
        updatedAt: timestamp(),
      };
      attentionGrantIntents.set(id, updated);
      return { ...updated };
    },
  };

  return store;
}

function definedPatch<T extends Record<string, unknown>>(patch: T): Partial<T> {
  return Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined)) as Partial<T>;
}

function eligiblePrinter(
  assignedPrinterId: string | undefined,
  availablePrinterIds: Set<string>,
  bridgeId: string | undefined,
  printers: Printer[],
): Printer | undefined {
  const candidates = assignedPrinterId
    ? printers.filter(printer => printer.id === assignedPrinterId)
    : printers.filter(printer => availablePrinterIds.has(printer.id));
  return candidates.find(printer =>
    printer.enabled &&
    availablePrinterIds.has(printer.id) &&
    (!bridgeId || !printer.bridgeId || printer.bridgeId === bridgeId),
  );
}

function printBridgeJob(entry: PrintQueueEntry, request: PrintRequest): PrintBridgeJob {
  return {
    id: entry.id,
    printRequestId: request.id,
    title: request.title,
    printerId: entry.printerId,
    requestedMaterial: request.requestedMaterial,
    requestedColor: request.requestedColor,
    quantity: request.quantity,
    metadata: {
      printRequestStatus: request.status,
      priority: entry.priority,
      queuePosition: entry.queuePosition,
    },
  };
}
