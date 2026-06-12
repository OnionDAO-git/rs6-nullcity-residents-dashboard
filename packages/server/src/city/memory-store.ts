import type {
  CityProfile,
  CityUser,
  HumanFeedback,
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
} from './types';
import {
  CityStoreError,
  type AttentionGrantIntent,
  type AttentionGrantIntentCreateInput,
  type AttentionGrantIntentPatch,
  type AttentionGrantIntentState,
  type CityStore,
  type FeedbackCreateInput,
  type LedgerAppendInput,
  type PrintBridgeJob,
  type PrintQueueClaimInput,
  type PrintQueueEnqueueInput,
  type PrinterUpsertInput,
  type PrintRequestCreateInput,
  type ResidentTradeCreateInput,
  type SoulContributionInput,
  type SoulProposalCreateInput,
} from './store';

interface InMemoryCityStoreOptions {
  now?: () => string;
  id?: () => string;
}

interface AccountState {
  balance: number;
  updatedAt: string;
}

export class InMemoryCityStore implements CityStore {
  readonly mode = 'memory';

  private readonly now: () => string;
  private readonly id: () => string;
  private readonly usersByLandingId = new Map<string, CityUser>();
  private readonly usersById = new Map<string, CityUser>();
  private readonly profiles = new Map<string, CityProfile>();
  private readonly accounts = new Map<string, AccountState>();
  private readonly ledgers: PointLedgerEntry[] = [];
  private readonly ledgerSourceIndex = new Map<string, PointLedgerEntry>();
  private readonly soulProposals = new Map<string, SoulProposal>();
  private readonly soulContributions = new Map<string, SoulContribution>();
  private readonly soulContributionIdempotency = new Map<string, string>();
  private readonly printRequests = new Map<string, PrintRequest>();
  private readonly printers = new Map<string, Printer>();
  private readonly printQueue = new Map<string, PrintQueueEntry>();
  private readonly residents = new Map<string, ResidentReadModel>();
  private readonly residentPosts = new Map<string, ResidentPost[]>();
  private readonly residentTrades = new Map<string, ResidentTrade>();
  private readonly inboxThreads = new Map<string, InboxThread>();
  private readonly inboxMessages = new Map<string, InboxMessage[]>();
  private readonly librarySoulLives = new Map<string, LibrarySoulLife>();
  private readonly feedbackEntries = new Map<string, HumanFeedback>();
  private readonly identityAliases = new Map<string, string>(); // personId -> patronHandle
  private readonly attentionGrantIntents = new Map<string, AttentionGrantIntent>();
  private readonly attentionGrantIntentIdempotency = new Map<string, string>(); // `${cityUserId}:${idempotencyKey}` -> intent id

  constructor(options: InMemoryCityStoreOptions = {}) {
    this.now = options.now || (() => new Date().toISOString());
    this.id = options.id || (() => crypto.randomUUID());
  }

  async upsertUserFromLanding(user: LandingSessionUser): Promise<CityUser> {
    const existing = this.usersByLandingId.get(user.id);
    const now = this.now();
    const cityUser: CityUser = {
      id: existing?.id || this.id(),
      landingUserId: user.id,
      emailSnapshot: user.email,
      nameSnapshot: user.name || user.email,
      handleSnapshot: user.handle,
      avatarUrlSnapshot: user.avatarUrl,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };
    this.usersByLandingId.set(user.id, cityUser);
    this.usersById.set(cityUser.id, cityUser);

    const profile = this.profiles.get(cityUser.id);
    if (!profile) {
      this.profiles.set(cityUser.id, {
        cityUserId: cityUser.id,
        displayName: cityUser.nameSnapshot,
        handle: cityUser.handleSnapshot,
        avatarUrl: cityUser.avatarUrlSnapshot,
        bio: '',
        metadata: {},
        updatedAt: now,
      });
    }

    this.ensureAccount(cityUser.id, 'AP');
    this.ensureAccount(cityUser.id, 'GP');

    // T0.ID: keep the personId (=== landingUserId) -> patronHandle alias current
    // so the settled-support seam can address letters by the canonical identity.
    if (user.handle) {
      this.identityAliases.set(user.id, user.handle);
    }
    return clone(cityUser);
  }

  async getProfile(cityUserId: string): Promise<CityProfile> {
    const profile = this.profiles.get(cityUserId);
    if (profile) return clone(profile);
    const user = this.requireUser(cityUserId);
    const created: CityProfile = {
      cityUserId,
      displayName: user.nameSnapshot,
      handle: user.handleSnapshot,
      avatarUrl: user.avatarUrlSnapshot,
      bio: '',
      metadata: {},
      updatedAt: this.now(),
    };
    this.profiles.set(cityUserId, created);
    return clone(created);
  }

  async updateProfile(
    cityUserId: string,
    patch: Partial<Pick<CityProfile, 'displayName' | 'handle' | 'avatarUrl' | 'bio' | 'metadata'>>,
  ): Promise<CityProfile> {
    const current = await this.getProfile(cityUserId);
    const updated: CityProfile = {
      ...current,
      displayName: cleanString(patch.displayName) || current.displayName,
      handle: patch.handle === undefined ? current.handle : nullableCleanString(patch.handle),
      avatarUrl: patch.avatarUrl === undefined ? current.avatarUrl : nullableCleanString(patch.avatarUrl),
      bio: patch.bio === undefined ? current.bio : String(patch.bio || ''),
      metadata: patch.metadata && typeof patch.metadata === 'object' ? { ...patch.metadata } : current.metadata,
      updatedAt: this.now(),
    };
    this.profiles.set(cityUserId, updated);
    return clone(updated);
  }

  async getPointBalances(cityUserId: string): Promise<PointBalance[]> {
    this.requireUser(cityUserId);
    return (['AP', 'GP'] as const).map(resource => {
      const account = this.ensureAccount(cityUserId, resource);
      return { resource, balance: account.balance, updatedAt: account.updatedAt };
    });
  }

  async listPointLedger(cityUserId: string, resource?: PointResource): Promise<PointLedgerEntry[]> {
    this.requireUser(cityUserId);
    return clone(
      this.ledgers
        .filter(entry => entry.cityUserId === cityUserId && (!resource || entry.resource === resource))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    );
  }

  async appendPointLedger(input: LedgerAppendInput): Promise<PointLedgerEntry> {
    this.requireUser(input.cityUserId);
    const delta = Number(input.delta);
    if (!Number.isInteger(delta) || delta === 0) throw new CityStoreError('Point ledger delta must be a non-zero integer');
    if (input.resource !== 'AP' && input.resource !== 'GP') throw new CityStoreError('Point resource must be AP or GP');
    const sourceKey = ledgerSourceKey(input.cityUserId, input.resource, input.sourceType, input.sourceId);
    const existing = this.ledgerSourceIndex.get(sourceKey);
    if (existing) return clone(existing);

    const account = this.ensureAccount(input.cityUserId, input.resource);
    const balanceAfter = account.balance + delta;
    if (balanceAfter < 0) throw new CityStoreError(`Insufficient ${input.resource} balance`, 409);

    const now = this.now();
    account.balance = balanceAfter;
    account.updatedAt = now;
    const entry: PointLedgerEntry = {
      id: this.id(),
      cityUserId: input.cityUserId,
      resource: input.resource,
      delta,
      balanceAfter,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      memo: input.memo,
      metadata: input.metadata || {},
      createdByCityUserId: input.createdByCityUserId,
      createdAt: now,
    };
    this.ledgers.push(entry);
    this.ledgerSourceIndex.set(sourceKey, entry);
    return clone(entry);
  }

  async listSoulProposals(): Promise<SoulProposal[]> {
    return clone([...this.soulProposals.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  }

  async getSoulProposal(id: string): Promise<SoulProposal | undefined> {
    const proposal = this.soulProposals.get(id);
    return proposal ? clone(proposal) : undefined;
  }

  async createSoulProposal(input: SoulProposalCreateInput): Promise<SoulProposal> {
    this.requireUser(input.proposerCityUserId);
    const displayName = cleanString(input.displayName);
    const goal = cleanString(input.goal);
    const personality = cleanString(input.personality);
    if (!displayName || !goal || !personality) {
      throw new CityStoreError('displayName, goal, and personality are required');
    }
    const now = this.now();
    const proposal: SoulProposal = {
      id: this.id(),
      proposerCityUserId: input.proposerCityUserId,
      status: 'funding',
      residentName: cleanString(input.residentName),
      displayName,
      goal,
      personality,
      vices: input.vices || '',
      virtues: input.virtues || '',
      fears: input.fears || '',
      voice: input.voice || '',
      firstMemory: input.firstMemory || '',
      secret: input.secret || '',
      appearance: input.appearance || {},
      startingLevels: normalizeLevels(input.startingLevels),
      startingEquipment: Array.isArray(input.startingEquipment) ? input.startingEquipment : [],
      startingInventory: Array.isArray(input.startingInventory) ? input.startingInventory : [],
      attentionThreshold: input.quote.threshold,
      contributedAttention: 0,
      quote: input.quote,
      createdAt: now,
      updatedAt: now,
      submittedAt: now,
    };
    this.soulProposals.set(proposal.id, proposal);
    return clone(proposal);
  }

  async contributeToSoulProposal(input: SoulContributionInput): Promise<{ proposal: SoulProposal; contribution: SoulContribution; ledger: PointLedgerEntry }> {
    const proposal = this.soulProposals.get(input.proposalId);
    if (!proposal) throw new CityStoreError('Soul proposal not found', 404);
    this.requireUser(input.cityUserId);
    const apAmount = Number(input.apAmount);
    if (!Number.isInteger(apAmount) || apAmount <= 0) throw new CityStoreError('AP contribution must be a positive integer');
    if (!['funding', 'ready_to_birth'].includes(proposal.status)) throw new CityStoreError('Soul proposal is not accepting contributions', 409);

    const contributionKey = input.idempotencyKey ? `${input.proposalId}:${input.cityUserId}:${input.idempotencyKey}` : undefined;
    const existingContributionId = contributionKey ? this.soulContributionIdempotency.get(contributionKey) : undefined;
    if (existingContributionId) {
      const contribution = this.soulContributions.get(existingContributionId);
      const ledger = contribution ? this.ledgerSourceIndex.get(ledgerSourceKey(input.cityUserId, 'AP', 'soul_contribution', contribution.idempotencyKey || contribution.id)) : undefined;
      if (contribution && ledger) return { proposal: clone(proposal), contribution: clone(contribution), ledger: clone(ledger) };
    }

    const contributionId = this.id();
    const ledger = await this.appendPointLedger({
      cityUserId: input.cityUserId,
      resource: 'AP',
      delta: -apAmount,
      sourceType: 'soul_contribution',
      sourceId: input.idempotencyKey || contributionId,
      memo: `Soul proposal contribution: ${proposal.displayName}`,
      metadata: { proposalId: proposal.id, contributionId },
    });
    const now = this.now();
    const contribution: SoulContribution = {
      id: contributionId,
      proposalId: proposal.id,
      cityUserId: input.cityUserId,
      apAmount,
      ledgerEntryId: ledger.id,
      idempotencyKey: input.idempotencyKey,
      createdAt: now,
    };
    proposal.contributedAttention += apAmount;
    proposal.updatedAt = now;
    if (proposal.contributedAttention >= proposal.attentionThreshold && proposal.status === 'funding') proposal.status = 'ready_to_birth';
    this.soulContributions.set(contribution.id, contribution);
    if (contributionKey) this.soulContributionIdempotency.set(contributionKey, contribution.id);
    return { proposal: clone(proposal), contribution: clone(contribution), ledger };
  }

  async listPrintRequests(cityUserId?: string): Promise<PrintRequest[]> {
    return clone(
      [...this.printRequests.values()]
        .filter(request => !cityUserId || request.cityUserId === cityUserId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    );
  }

  async getPrintRequest(id: string): Promise<PrintRequest | undefined> {
    const request = this.printRequests.get(id);
    return request ? clone(request) : undefined;
  }

  async createPrintRequest(input: PrintRequestCreateInput): Promise<PrintRequest> {
    this.requireUser(input.cityUserId);
    const title = cleanString(input.title);
    if (!title) throw new CityStoreError('Print request title is required');
    const now = this.now();
    const request: PrintRequest = {
      id: this.id(),
      cityUserId: input.cityUserId,
      status: 'draft',
      title,
      description: input.description,
      requestedMaterial: input.requestedMaterial,
      requestedColor: input.requestedColor,
      quantity: Math.max(1, Math.floor(Number(input.quantity || 1))),
      userNotes: input.userNotes,
      createdAt: now,
      updatedAt: now,
    };
    this.printRequests.set(request.id, request);
    return clone(request);
  }

  async updatePrintQuote(id: string, quoteGp: number, adminNotes?: string): Promise<PrintRequest> {
    const request = this.printRequests.get(id);
    if (!request) throw new CityStoreError('Print request not found', 404);
    const quote = Number(quoteGp);
    if (!Number.isInteger(quote) || quote <= 0) throw new CityStoreError('quoteGp must be a positive integer');
    request.quoteGp = quote;
    request.status = 'quoted';
    request.adminNotes = adminNotes ?? request.adminNotes;
    request.updatedAt = this.now();
    return clone(request);
  }

  async confirmPrintGp(id: string, cityUserId: string, idempotencyKey?: string): Promise<{ request: PrintRequest; ledger: PointLedgerEntry }> {
    const request = this.printRequests.get(id);
    if (!request) throw new CityStoreError('Print request not found', 404);
    if (request.cityUserId !== cityUserId) throw new CityStoreError('Print request does not belong to this user', 403);
    if (!request.quoteGp || request.quoteGp <= 0) throw new CityStoreError('Print request has not been quoted', 409);
    if (request.gpLedgerEntryId) {
      const ledger = this.ledgers.find(entry => entry.id === request.gpLedgerEntryId);
      if (ledger) return { request: clone(request), ledger: clone(ledger) };
    }
    const ledger = await this.appendPointLedger({
      cityUserId,
      resource: 'GP',
      delta: -request.quoteGp,
      sourceType: 'print_request',
      sourceId: idempotencyKey || request.id,
      memo: `3D print request: ${request.title}`,
      metadata: { printRequestId: request.id },
    });
    request.gpLedgerEntryId = ledger.id;
    request.status = 'paid';
    request.updatedAt = this.now();
    return { request: clone(request), ledger };
  }

  async listPrinters(): Promise<Printer[]> {
    return clone([...this.printers.values()].sort((a, b) => a.name.localeCompare(b.name)));
  }

  async upsertPrinter(input: PrinterUpsertInput): Promise<Printer> {
    const existing = input.id ? this.printers.get(input.id) : undefined;
    const now = this.now();
    const printer: Printer = {
      id: existing?.id || input.id || this.id(),
      name: cleanString(input.name) || existing?.name || 'Printer',
      kind: input.kind,
      adapter: input.adapter,
      bridgeId: input.bridgeId ?? existing?.bridgeId,
      enabled: input.enabled ?? existing?.enabled ?? true,
      adminNotes: input.adminNotes ?? existing?.adminNotes,
      capabilities: input.capabilities || existing?.capabilities || {},
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };
    this.printers.set(printer.id, printer);
    return clone(printer);
  }

  async listPrintQueue(): Promise<PrintQueueEntry[]> {
    return clone([...this.printQueue.values()].sort((a, b) => a.priority - b.priority || a.createdAt.localeCompare(b.createdAt)));
  }

  async enqueuePrintRequest(input: PrintQueueEnqueueInput): Promise<PrintQueueEntry> {
    const request = this.printRequests.get(input.printRequestId);
    if (!request) throw new CityStoreError('Print request not found', 404);
    const now = this.now();
    const entry: PrintQueueEntry = {
      id: `queue_${this.id()}`,
      printRequestId: request.id,
      printerId: input.printerId,
      status: 'queued',
      priority: Number.isInteger(input.priority) ? Math.max(0, Number(input.priority)) : 100,
      queuePosition: Number.isInteger(input.queuePosition) ? Math.max(0, Number(input.queuePosition)) : this.printQueue.size + 1,
      createdAt: now,
      updatedAt: now,
    };
    request.status = 'queued';
    request.assignedPrinterId = input.printerId ?? request.assignedPrinterId;
    request.updatedAt = now;
    this.printQueue.set(entry.id, entry);
    return clone(entry);
  }

  async claimNextPrintQueueJob(input: PrintQueueClaimInput): Promise<PrintBridgeJob | undefined> {
    const availablePrinterIds = new Set(input.printerIds.filter(Boolean));
    const entries = [...this.printQueue.values()].sort((a, b) => a.priority - b.priority || a.createdAt.localeCompare(b.createdAt));
    for (const entry of entries) {
      if (entry.status !== 'queued') continue;
      const request = this.printRequests.get(entry.printRequestId);
      if (!request) continue;
      const printer = this.eligiblePrinter(entry.printerId, availablePrinterIds, input.bridgeId);
      if (!printer) continue;
      const now = this.now();
      entry.status = 'claimed';
      entry.printerId = printer.id;
      entry.startedAt = entry.startedAt || now;
      entry.updatedAt = now;
      request.assignedPrinterId = printer.id;
      request.updatedAt = now;
      return printBridgeJob(entry, request);
    }
    return undefined;
  }

  async listResidents(): Promise<ResidentReadModel[]> {
    return clone([...this.residents.values()].sort((a, b) => a.displayName.localeCompare(b.displayName)));
  }

  async getResident(id: string): Promise<ResidentReadModel | undefined> {
    const key = residentKey(id);
    const resident = [...this.residents.values()].find(row => row.id === id || row.nullcityResidentId === id || residentKey(row.nullcityResidentId) === key);
    return resident ? clone(resident) : undefined;
  }

  async listResidentPosts(residentId: string): Promise<ResidentPost[]> {
    return clone((this.residentPosts.get(residentId) || []).filter(post => post.visibility === 'public').sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  }

  async listResidentTrades(cityUserId: string): Promise<ResidentTrade[]> {
    this.requireUser(cityUserId);
    return clone([...this.residentTrades.values()].filter(trade => trade.cityUserId === cityUserId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  }

  async createResidentTrade(input: ResidentTradeCreateInput): Promise<{ trade: ResidentTrade; ledger: PointLedgerEntry; mocked: boolean }> {
    this.requireUser(input.cityUserId);
    if (input.offeredResource !== 'AP' && input.offeredResource !== 'GP') throw new CityStoreError('Point resource must be AP or GP');
    const offeredAmount = Number(input.offeredAmount);
    if (!Number.isInteger(offeredAmount) || offeredAmount <= 0) throw new CityStoreError('Trade amount must be a positive integer');

    const existing = input.idempotencyKey
      ? [...this.residentTrades.values()].find(trade => trade.cityUserId === input.cityUserId && trade.idempotencyKey === input.idempotencyKey)
      : undefined;
    if (existing) {
      const ledger = this.ledgers.find(entry => entry.id === existing.pointLedgerEntryId);
      if (ledger) return { trade: clone(existing), ledger: clone(ledger), mocked: true };
    }

    const tradeId = this.id();
    const ledger = await this.appendPointLedger({
      cityUserId: input.cityUserId,
      resource: input.offeredResource,
      delta: -offeredAmount,
      sourceType: 'resident_trade',
      sourceId: input.idempotencyKey || tradeId,
      memo: `Resident trade: ${input.residentId}`,
      metadata: { residentId: input.residentId, tradeId, mocked: true },
    });
    const now = this.now();
    const trade: ResidentTrade = {
      id: tradeId,
      cityUserId: input.cityUserId,
      residentId: input.residentId,
      status: 'pending_nullcity',
      offeredResource: input.offeredResource,
      offeredAmount,
      requestedItem: cleanString(input.requestedItem),
      idempotencyKey: input.idempotencyKey,
      pointLedgerEntryId: ledger.id,
      metadata: input.metadata || {},
      createdAt: now,
      updatedAt: now,
    };
    this.residentTrades.set(trade.id, trade);
    return { trade: clone(trade), ledger, mocked: true };
  }

  async listInboxThreads(cityUserId: string): Promise<InboxThread[]> {
    this.requireUser(cityUserId);
    return clone([...this.inboxThreads.values()].filter(thread => thread.cityUserId === cityUserId).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
  }

  async getInboxThread(cityUserId: string, threadId: string): Promise<{ thread: InboxThread; messages: InboxMessage[] } | undefined> {
    this.requireUser(cityUserId);
    const thread = this.inboxThreads.get(threadId);
    if (!thread || thread.cityUserId !== cityUserId) return undefined;
    return {
      thread: clone(thread),
      messages: clone(this.inboxMessages.get(thread.id) || []),
    };
  }

  async listLibrarySoulLives(): Promise<LibrarySoulLife[]> {
    return clone([...this.librarySoulLives.values()].sort((a, b) => (b.diedAt || b.createdAt).localeCompare(a.diedAt || a.createdAt)));
  }

  async createFeedback(input: FeedbackCreateInput): Promise<HumanFeedback> {
    const message = cleanString(input.message);
    if (!message) throw new CityStoreError('feedback_message_required', 400);
    const feedback: HumanFeedback = {
      id: `feedback_${this.id()}`,
      cityUserId: input.cityUserId,
      landingUserId: input.landingUserId,
      displayName: input.displayName,
      handle: input.handle,
      email: input.email,
      feeling: input.feeling,
      tryingToDo: cleanString(input.tryingToDo),
      message,
      route: cleanString(input.route),
      pageUrl: cleanString(input.pageUrl),
      mode: input.mode,
      residentId: cleanString(input.residentId),
      allowFollowUp: input.allowFollowUp === true,
      userAgent: cleanString(input.userAgent),
      metadata: input.metadata || {},
      createdAt: this.now(),
    };
    this.feedbackEntries.set(feedback.id, feedback);
    return clone(feedback);
  }

  async listFeedback(limit = 50): Promise<HumanFeedback[]> {
    const count = Math.max(1, Math.min(100, Math.floor(limit)));
    return clone([...this.feedbackEntries.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, count));
  }

  async resolveOnionId(cityUserId: string): Promise<string> {
    return this.requireUser(cityUserId).landingUserId;
  }

  async setIdentityAlias(personId: string, patronHandle: string): Promise<void> {
    this.identityAliases.set(personId, patronHandle);
  }

  async resolvePatronHandle(personId: string): Promise<string | undefined> {
    return this.identityAliases.get(personId);
  }

  async createAttentionGrantIntent(input: AttentionGrantIntentCreateInput): Promise<AttentionGrantIntent> {
    this.requireUser(input.cityUserId);
    const key = `${input.cityUserId}:${input.idempotencyKey}`;
    const existingId = this.attentionGrantIntentIdempotency.get(key);
    if (existingId) return clone(this.attentionGrantIntents.get(existingId)!);
    const now = this.now();
    const intent: AttentionGrantIntent = {
      id: this.id(),
      cityUserId: input.cityUserId,
      residentId: input.residentId,
      apAmount: input.apAmount,
      idempotencyKey: input.idempotencyKey,
      state: 'created',
      createdAt: now,
      updatedAt: now,
    };
    this.attentionGrantIntents.set(intent.id, intent);
    this.attentionGrantIntentIdempotency.set(key, intent.id);
    return clone(intent);
  }

  async getAttentionGrantIntent(cityUserId: string, idempotencyKey: string): Promise<AttentionGrantIntent | undefined> {
    const id = this.attentionGrantIntentIdempotency.get(`${cityUserId}:${idempotencyKey}`);
    return id ? clone(this.attentionGrantIntents.get(id)!) : undefined;
  }

  async getAttentionGrantIntentByOnionRequestId(onionRequestId: string): Promise<AttentionGrantIntent | undefined> {
    for (const intent of this.attentionGrantIntents.values()) {
      if (intent.onionRequestId === onionRequestId) return clone(intent);
    }
    return undefined;
  }

  async findPendingAttentionGrantIntent(cityUserId: string, residentId: string): Promise<AttentionGrantIntent | undefined> {
    let latest: AttentionGrantIntent | undefined;
    for (const intent of this.attentionGrantIntents.values()) {
      if (intent.cityUserId !== cityUserId || intent.residentId !== residentId) continue;
      if (intent.state !== 'awaiting_approval') continue;
      if (!latest || intent.createdAt > latest.createdAt) latest = intent;
    }
    return latest ? clone(latest) : undefined;
  }

  async claimAttentionGrantIntent(
    id: string,
    fromStates: AttentionGrantIntentState[],
    toState: AttentionGrantIntentState,
  ): Promise<AttentionGrantIntent | undefined> {
    const existing = this.attentionGrantIntents.get(id);
    if (!existing || !fromStates.includes(existing.state)) return undefined;
    const updated: AttentionGrantIntent = { ...existing, state: toState, updatedAt: this.now() };
    this.attentionGrantIntents.set(id, updated);
    return clone(updated);
  }

  async updateAttentionGrantIntent(id: string, patch: AttentionGrantIntentPatch): Promise<AttentionGrantIntent> {
    const existing = this.attentionGrantIntents.get(id);
    if (!existing) throw new CityStoreError('Attention grant intent not found', 404);
    const updated: AttentionGrantIntent = {
      ...existing,
      ...(patch.state !== undefined ? { state: patch.state } : {}),
      ...(patch.standinLedgerEntryId !== undefined ? { standinLedgerEntryId: patch.standinLedgerEntryId } : {}),
      ...(patch.onionRequestId !== undefined ? { onionRequestId: patch.onionRequestId } : {}),
      ...(patch.cityResponse !== undefined ? { cityResponse: patch.cityResponse } : {}),
      ...(patch.failureReason !== undefined ? { failureReason: patch.failureReason } : {}),
      updatedAt: this.now(),
    };
    this.attentionGrantIntents.set(id, updated);
    return clone(updated);
  }

  private ensureAccount(cityUserId: string, resource: PointResource): AccountState {
    const key = accountKey(cityUserId, resource);
    const existing = this.accounts.get(key);
    if (existing) return existing;
    const created = { balance: 0, updatedAt: this.now() };
    this.accounts.set(key, created);
    return created;
  }

  private requireUser(cityUserId: string): CityUser {
    const user = this.usersById.get(cityUserId);
    if (!user) throw new CityStoreError('City user not found', 404);
    return user;
  }

  private eligiblePrinter(assignedPrinterId: string | undefined, availablePrinterIds: Set<string>, bridgeId: string | undefined): Printer | undefined {
    const candidates = assignedPrinterId
      ? [...this.printers.values()].filter(printer => printer.id === assignedPrinterId)
      : [...this.printers.values()].filter(printer => availablePrinterIds.has(printer.id));
    return candidates.find(printer =>
      printer.enabled &&
      availablePrinterIds.has(printer.id) &&
      (!bridgeId || !printer.bridgeId || printer.bridgeId === bridgeId),
    );
  }
}

function accountKey(cityUserId: string, resource: PointResource): string {
  return `${cityUserId}:${resource}`;
}

function ledgerSourceKey(cityUserId: string, resource: PointResource, sourceType: string, sourceId: string): string {
  return `${cityUserId}:${resource}:${sourceType}:${sourceId}`;
}

function cleanString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function nullableCleanString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function normalizeLevels(value: Record<string, number> | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [skill, rawLevel] of Object.entries(value || {})) {
    const level = Number(rawLevel);
    if (skill && Number.isFinite(level)) out[skill] = Math.max(1, Math.floor(level));
  }
  return out;
}

function residentKey(value: string): string {
  return value.trim().toLowerCase().replace(/^res:/, '');
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

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
