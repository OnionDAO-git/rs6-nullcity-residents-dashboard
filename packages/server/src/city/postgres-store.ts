import { SQL } from 'bun';
import { cityMigrations } from './migrations/schema';
import type { LandingCheckinAwardSource } from './checkins';
import {
  CityStoreError,
  type AttentionGrantIntent,
  type AttentionGrantIntentCreateInput,
  type AttentionGrantIntentPatch,
  type AttentionGrantIntentState,
  type CityStore,
  type LedgerAppendInput,
  type PrintBridgeJob,
  type PrintQueueClaimInput,
  type PrintQueueEnqueueInput,
  type PrinterUpsertInput,
  type PrintRequestCreateInput,
  type ResidentAttentionGrantInput,
  type ResidentTradeCreateInput,
  type SoulContributionInput,
  type SoulProposalCreateInput,
} from './store';
import type {
  CityProfile,
  CityUser,
  InboxMessage,
  InboxThread,
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

type BunSql = {
  (strings: TemplateStringsArray, ...values: unknown[]): Promise<Array<Record<string, unknown>>>;
  unsafe(query: string, values?: unknown[]): Promise<Array<Record<string, unknown>>>;
};

export class PostgresCityStore implements CityStore {
  readonly mode = 'postgres';
  private readonly sql: BunSql;
  private migrationsStarted: Promise<void> | undefined;

  constructor(databaseUrl: string, sql?: BunSql) {
    const SqlConstructor = SQL as unknown as new (url: string) => BunSql;
    this.sql = sql || new SqlConstructor(databaseUrl);
  }

  runMigrations(): Promise<void> {
    this.migrationsStarted ||= runCityMigrations(this.sql);
    return this.migrationsStarted;
  }

  async upsertUserFromLanding(user: { id: string; email: string; name: string; handle?: string | null; avatarUrl?: string | null }): Promise<CityUser> {
    const id = `usr_${crypto.randomUUID()}`;
    const rows = await this.sql`
      INSERT INTO city_users (id, landing_user_id, email_snapshot, name_snapshot, handle_snapshot, avatar_url_snapshot)
      VALUES (${id}, ${user.id}, ${user.email}, ${user.name || user.handle || user.email}, ${user.handle || null}, ${user.avatarUrl || null})
      ON CONFLICT (landing_user_id) DO UPDATE SET
        email_snapshot = EXCLUDED.email_snapshot,
        name_snapshot = EXCLUDED.name_snapshot,
        handle_snapshot = EXCLUDED.handle_snapshot,
        avatar_url_snapshot = EXCLUDED.avatar_url_snapshot,
        updated_at = now()
      RETURNING *
    `;
    const cityUser = mapCityUser(one(rows));
    await this.ensureProfile(cityUser);
    await this.ensureAccount(cityUser.id, 'AP');
    await this.ensureAccount(cityUser.id, 'GP');
    return cityUser;
  }

  async getProfile(cityUserId: string): Promise<CityProfile> {
    const user = await this.requireUser(cityUserId);
    return this.ensureProfile(user);
  }

  async updateProfile(cityUserId: string, patch: Partial<Pick<CityProfile, 'displayName' | 'handle' | 'avatarUrl' | 'bio' | 'metadata'>>): Promise<CityProfile> {
    await this.requireUser(cityUserId);
    const current = await this.getProfile(cityUserId);
    const rows = await this.sql`
      UPDATE city_profiles
      SET
        display_name = ${cleanString(patch.displayName) || current.displayName},
        handle = ${patch.handle === undefined ? current.handle || null : nullableCleanString(patch.handle)},
        avatar_url = ${patch.avatarUrl === undefined ? current.avatarUrl || null : nullableCleanString(patch.avatarUrl)},
        bio = ${patch.bio === undefined ? current.bio : String(patch.bio || '')},
        metadata = ${json(patch.metadata && typeof patch.metadata === 'object' ? patch.metadata : current.metadata)}::jsonb,
        updated_at = now()
      WHERE city_user_id = ${cityUserId}
      RETURNING *
    `;
    return mapProfile(one(rows));
  }

  async getPointBalances(cityUserId: string): Promise<PointBalance[]> {
    await this.requireUser(cityUserId);
    await this.ensureAccount(cityUserId, 'AP');
    await this.ensureAccount(cityUserId, 'GP');
    const rows = await this.sql`
      SELECT * FROM point_accounts
      WHERE city_user_id = ${cityUserId}
      ORDER BY CASE resource WHEN 'AP' THEN 1 ELSE 2 END
    `;
    return rows.map(mapPointBalance);
  }

  async listPointLedger(cityUserId: string, resource?: PointResource): Promise<PointLedgerEntry[]> {
    await this.requireUser(cityUserId);
    const rows = resource
      ? await this.sql`
          SELECT * FROM point_ledger_entries
          WHERE city_user_id = ${cityUserId} AND resource = ${resource}
          ORDER BY created_at DESC
        `
      : await this.sql`
          SELECT * FROM point_ledger_entries
          WHERE city_user_id = ${cityUserId}
          ORDER BY created_at DESC
        `;
    return rows.map(mapLedger);
  }

  async appendPointLedger(input: LedgerAppendInput): Promise<PointLedgerEntry> {
    await this.requireUser(input.cityUserId);
    const delta = Number(input.delta);
    if (!Number.isInteger(delta) || delta === 0) throw new CityStoreError('Point ledger delta must be a non-zero integer');
    if (input.resource !== 'AP' && input.resource !== 'GP') throw new CityStoreError('Point resource must be AP or GP');

    const entryId = `ledger_${crypto.randomUUID()}`;
    const rows = await this.sql`
      WITH existing AS (
        SELECT * FROM point_ledger_entries
        WHERE city_user_id = ${input.cityUserId}
          AND resource = ${input.resource}
          AND source_type = ${input.sourceType}
          AND source_id = ${input.sourceId}
      ),
      ensured AS (
        INSERT INTO point_accounts (city_user_id, resource, balance)
        VALUES (${input.cityUserId}, ${input.resource}, 0)
        ON CONFLICT (city_user_id, resource) DO NOTHING
      ),
      updated AS (
        UPDATE point_accounts
        SET balance = balance + ${delta}, updated_at = now()
        WHERE city_user_id = ${input.cityUserId}
          AND resource = ${input.resource}
          AND NOT EXISTS (SELECT 1 FROM existing)
          AND balance + ${delta} >= 0
        RETURNING balance AS balance_after
      ),
      inserted AS (
        INSERT INTO point_ledger_entries (
          id, city_user_id, resource, delta, balance_after, source_type, source_id, memo, metadata, created_by_city_user_id
        )
        SELECT
          ${entryId}, ${input.cityUserId}, ${input.resource}, ${delta}, updated.balance_after,
          ${input.sourceType}, ${input.sourceId}, ${input.memo || null}, ${json(input.metadata || {})}::jsonb,
          ${input.createdByCityUserId || null}
        FROM updated
        ON CONFLICT (city_user_id, resource, source_type, source_id) DO NOTHING
        RETURNING *
      )
      SELECT * FROM inserted
      UNION ALL
      SELECT * FROM existing
      LIMIT 1
    `;
    if (!rows[0]) throw new CityStoreError(`Insufficient ${input.resource} balance`, 409);
    return mapLedger(rows[0]);
  }

  async recordCheckinAwardSource(
    source: LandingCheckinAwardSource,
    cityUser: CityUser,
    ledger: PointLedgerEntry,
    apAmount: number,
  ): Promise<void> {
    await this.sql`
      INSERT INTO checkin_award_sources (
        id, landing_source_type, landing_source_id, landing_user_id, city_user_id,
        ap_amount, ledger_entry_id, occurred_at, metadata
      )
      VALUES (
        ${`checkin_${crypto.randomUUID()}`}, ${source.kind}, ${source.sourceId}, ${cityUser.landingUserId}, ${cityUser.id},
        ${apAmount}, ${ledger.id}, ${source.occurredAt || null}, ${json({ eventId: source.eventId, eventName: source.eventName })}::jsonb
      )
      ON CONFLICT (landing_source_type, landing_source_id) DO NOTHING
    `;
  }

  async listSoulProposals(): Promise<SoulProposal[]> {
    const rows = await this.sql`SELECT * FROM soul_proposals ORDER BY created_at DESC`;
    return rows.map(mapSoulProposal);
  }

  async getSoulProposal(id: string): Promise<SoulProposal | undefined> {
    const rows = await this.sql`SELECT * FROM soul_proposals WHERE id = ${id}`;
    return rows[0] ? mapSoulProposal(rows[0]) : undefined;
  }

  async createSoulProposal(input: SoulProposalCreateInput): Promise<SoulProposal> {
    await this.requireUser(input.proposerCityUserId);
    const displayName = cleanString(input.displayName);
    const goal = cleanString(input.goal);
    const personality = cleanString(input.personality);
    if (!displayName || !goal || !personality) throw new CityStoreError('displayName, goal, and personality are required');
    const id = `proposal_${crypto.randomUUID()}`;
    const rows = await this.sql`
      INSERT INTO soul_proposals (
        id, proposer_city_user_id, status, resident_name, display_name, goal, personality,
        vices, virtues, fears, voice, first_memory, secret, appearance, starting_levels,
        starting_equipment, starting_inventory, attention_threshold, contributed_attention, quote, submitted_at
      )
      VALUES (
        ${id}, ${input.proposerCityUserId}, 'funding', ${input.residentName || null}, ${displayName}, ${goal}, ${personality},
        ${input.vices || ''}, ${input.virtues || ''}, ${input.fears || ''}, ${input.voice || ''}, ${input.firstMemory || ''},
        ${input.secret || ''}, ${json(input.appearance || {})}::jsonb, ${json(input.startingLevels || {})}::jsonb,
        ${json(input.startingEquipment || [])}::jsonb, ${json(input.startingInventory || [])}::jsonb,
        ${input.quote.threshold}, 0, ${json(input.quote)}::jsonb, now()
      )
      RETURNING *
    `;
    return mapSoulProposal(one(rows));
  }

  async contributeToSoulProposal(input: SoulContributionInput): Promise<{ proposal: SoulProposal; contribution: SoulContribution; ledger: PointLedgerEntry }> {
    const proposal = await this.getSoulProposal(input.proposalId);
    if (!proposal) throw new CityStoreError('Soul proposal not found', 404);
    await this.requireUser(input.cityUserId);
    const apAmount = Number(input.apAmount);
    if (!Number.isInteger(apAmount) || apAmount <= 0) throw new CityStoreError('AP contribution must be a positive integer');
    if (!['funding', 'ready_to_birth'].includes(proposal.status)) throw new CityStoreError('Soul proposal is not accepting contributions', 409);

    if (input.idempotencyKey) {
      const existingRows = await this.sql`
        SELECT c.*, l.id AS ledger_id
        FROM soul_contributions c
        JOIN point_ledger_entries l ON l.id = c.ledger_entry_id
        WHERE c.proposal_id = ${input.proposalId}
          AND c.city_user_id = ${input.cityUserId}
          AND c.idempotency_key = ${input.idempotencyKey}
        LIMIT 1
      `;
      if (existingRows[0]) {
        const contribution = mapSoulContribution(existingRows[0]);
        const ledgerRows = await this.sql`SELECT * FROM point_ledger_entries WHERE id = ${contribution.ledgerEntryId}`;
        return { proposal, contribution, ledger: mapLedger(one(ledgerRows)) };
      }
    }

    const contributionId = `contrib_${crypto.randomUUID()}`;
    const ledger = await this.appendPointLedger({
      cityUserId: input.cityUserId,
      resource: 'AP',
      delta: -apAmount,
      sourceType: 'soul_contribution',
      sourceId: input.idempotencyKey || contributionId,
      memo: `Soul proposal contribution: ${proposal.displayName}`,
      metadata: { proposalId: proposal.id, contributionId },
    });
    const contributionRows = await this.sql`
      INSERT INTO soul_contributions (id, proposal_id, city_user_id, ap_amount, ledger_entry_id, idempotency_key)
      VALUES (${contributionId}, ${proposal.id}, ${input.cityUserId}, ${apAmount}, ${ledger.id}, ${input.idempotencyKey || null})
      ON CONFLICT (proposal_id, city_user_id, idempotency_key) DO UPDATE SET idempotency_key = EXCLUDED.idempotency_key
      RETURNING *
    `;
    const updatedRows = await this.sql`
      UPDATE soul_proposals
      SET
        contributed_attention = contributed_attention + ${apAmount},
        status = CASE WHEN contributed_attention + ${apAmount} >= attention_threshold AND status = 'funding' THEN 'ready_to_birth' ELSE status END,
        updated_at = now()
      WHERE id = ${proposal.id}
      RETURNING *
    `;
    return { proposal: mapSoulProposal(one(updatedRows)), contribution: mapSoulContribution(one(contributionRows)), ledger };
  }

  async listPrintRequests(cityUserId?: string): Promise<PrintRequest[]> {
    const rows = cityUserId
      ? await this.sql`SELECT * FROM print_requests WHERE city_user_id = ${cityUserId} ORDER BY created_at DESC`
      : await this.sql`SELECT * FROM print_requests ORDER BY created_at DESC`;
    return rows.map(mapPrintRequest);
  }

  async getPrintRequest(id: string): Promise<PrintRequest | undefined> {
    const rows = await this.sql`SELECT * FROM print_requests WHERE id = ${id}`;
    return rows[0] ? mapPrintRequest(rows[0]) : undefined;
  }

  async createPrintRequest(input: PrintRequestCreateInput): Promise<PrintRequest> {
    await this.requireUser(input.cityUserId);
    const title = cleanString(input.title);
    if (!title) throw new CityStoreError('Print request title is required');
    const id = `print_${crypto.randomUUID()}`;
    const rows = await this.sql`
      INSERT INTO print_requests (id, city_user_id, title, description, requested_material, requested_color, quantity, user_notes)
      VALUES (${id}, ${input.cityUserId}, ${title}, ${input.description || null}, ${input.requestedMaterial || null}, ${input.requestedColor || null}, ${Math.max(1, Math.floor(Number(input.quantity || 1)))}, ${input.userNotes || null})
      RETURNING *
    `;
    return mapPrintRequest(one(rows));
  }

  async updatePrintQuote(id: string, quoteGp: number, adminNotes?: string): Promise<PrintRequest> {
    const quote = Number(quoteGp);
    if (!Number.isInteger(quote) || quote <= 0) throw new CityStoreError('quoteGp must be a positive integer');
    const rows = await this.sql`
      UPDATE print_requests
      SET quote_gp = ${quote}, status = 'quoted', admin_notes = ${adminNotes || null}, updated_at = now()
      WHERE id = ${id}
      RETURNING *
    `;
    if (!rows[0]) throw new CityStoreError('Print request not found', 404);
    return mapPrintRequest(rows[0]);
  }

  async confirmPrintGp(id: string, cityUserId: string, idempotencyKey?: string): Promise<{ request: PrintRequest; ledger: PointLedgerEntry }> {
    const request = await this.getPrintRequest(id);
    if (!request) throw new CityStoreError('Print request not found', 404);
    if (request.cityUserId !== cityUserId) throw new CityStoreError('Print request does not belong to this user', 403);
    if (!request.quoteGp || request.quoteGp <= 0) throw new CityStoreError('Print request has not been quoted', 409);
    if (request.gpLedgerEntryId) {
      const ledgerRows = await this.sql`SELECT * FROM point_ledger_entries WHERE id = ${request.gpLedgerEntryId}`;
      if (ledgerRows[0]) return { request, ledger: mapLedger(ledgerRows[0]) };
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
    const rows = await this.sql`
      UPDATE print_requests
      SET gp_ledger_entry_id = ${ledger.id}, status = 'paid', updated_at = now()
      WHERE id = ${request.id}
      RETURNING *
    `;
    return { request: mapPrintRequest(one(rows)), ledger };
  }

  async listPrinters(): Promise<Printer[]> {
    const rows = await this.sql`SELECT * FROM printers ORDER BY name ASC`;
    return rows.map(mapPrinter);
  }

  async upsertPrinter(input: PrinterUpsertInput): Promise<Printer> {
    const id = input.id || `printer_${crypto.randomUUID()}`;
    const rows = await this.sql`
      INSERT INTO printers (id, name, kind, adapter, bridge_id, enabled, admin_notes, capabilities)
      VALUES (${id}, ${cleanString(input.name) || 'Printer'}, ${input.kind}, ${input.adapter}, ${input.bridgeId || null}, ${input.enabled ?? true}, ${input.adminNotes || null}, ${json(input.capabilities || {})}::jsonb)
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        kind = EXCLUDED.kind,
        adapter = EXCLUDED.adapter,
        bridge_id = EXCLUDED.bridge_id,
        enabled = EXCLUDED.enabled,
        admin_notes = EXCLUDED.admin_notes,
        capabilities = EXCLUDED.capabilities,
        updated_at = now()
      RETURNING *
    `;
    return mapPrinter(one(rows));
  }

  async listPrintQueue(): Promise<PrintQueueEntry[]> {
    const rows = await this.sql`SELECT * FROM print_queue ORDER BY priority ASC, created_at ASC`;
    return rows.map(mapPrintQueueEntry);
  }

  async enqueuePrintRequest(input: PrintQueueEnqueueInput): Promise<PrintQueueEntry> {
    const request = await this.getPrintRequest(input.printRequestId);
    if (!request) throw new CityStoreError('Print request not found', 404);
    const id = `queue_${crypto.randomUUID()}`;
    const priority = Number.isInteger(input.priority) ? Math.max(0, Number(input.priority)) : 100;
    const rows = await this.sql`
      INSERT INTO print_queue (id, print_request_id, printer_id, status, priority, queue_position)
      VALUES (${id}, ${request.id}, ${input.printerId || null}, 'queued', ${priority}, ${input.queuePosition ?? null})
      RETURNING *
    `;
    await this.sql`
      UPDATE print_requests
      SET status = 'queued',
        assigned_printer_id = COALESCE(${input.printerId || null}, assigned_printer_id),
        updated_at = now()
      WHERE id = ${request.id}
    `;
    return mapPrintQueueEntry(one(rows));
  }

  async claimNextPrintQueueJob(input: PrintQueueClaimInput): Promise<PrintBridgeJob | undefined> {
    const printerIds = input.printerIds.map(id => id.trim()).filter(Boolean);
    if (!printerIds.length) return undefined;
    const rows = await this.sql.unsafe(`
      WITH candidate AS (
        SELECT pq.id, COALESCE(pq.printer_id, p.id) AS selected_printer_id
        FROM print_queue pq
        JOIN printers p ON (
          (pq.printer_id IS NOT NULL AND p.id = pq.printer_id)
          OR (pq.printer_id IS NULL AND p.id = ANY($2::text[]))
        )
        WHERE pq.status = 'queued'
          AND p.enabled = true
          AND p.id = ANY($2::text[])
          AND ($1::text IS NULL OR p.bridge_id IS NULL OR p.bridge_id = $1::text)
        ORDER BY pq.priority ASC, pq.created_at ASC, p.name ASC
        LIMIT 1
        FOR UPDATE OF pq SKIP LOCKED
      )
      UPDATE print_queue pq
      SET status = 'claimed',
        printer_id = candidate.selected_printer_id,
        started_at = COALESCE(pq.started_at, now()),
        updated_at = now()
      FROM candidate
      WHERE pq.id = candidate.id
      RETURNING pq.*
    `, [input.bridgeId || null, printerIds]);
    const entry = rows[0] ? mapPrintQueueEntry(rows[0]) : undefined;
    if (!entry) return undefined;
    await this.sql`
      UPDATE print_requests
      SET assigned_printer_id = ${entry.printerId || null}, updated_at = now()
      WHERE id = ${entry.printRequestId}
    `;
    const request = await this.getPrintRequest(entry.printRequestId);
    return request ? printBridgeJob(entry, request) : undefined;
  }

  async listResidents(): Promise<ResidentReadModel[]> {
    const rows = await this.sql`SELECT * FROM residents ORDER BY display_name ASC`;
    return rows.map(mapResident);
  }

  async getResident(id: string): Promise<ResidentReadModel | undefined> {
    const rows = await this.sql`
      SELECT * FROM residents
      WHERE id = ${id} OR nullcity_resident_id = ${id}
      LIMIT 1
    `;
    return rows[0] ? mapResident(rows[0]) : undefined;
  }

  async listResidentPosts(residentId: string): Promise<ResidentPost[]> {
    const rows = await this.sql`
      SELECT * FROM resident_posts
      WHERE resident_id = ${residentId} AND visibility = 'public'
      ORDER BY created_at DESC
    `;
    return rows.map(mapResidentPost);
  }

  async grantResidentAttention(input: ResidentAttentionGrantInput): Promise<{ ledger: PointLedgerEntry; status: string; residentId: string; mocked: boolean }> {
    const apAmount = Number(input.apAmount);
    if (!Number.isInteger(apAmount) || apAmount <= 0) throw new CityStoreError('AP attention grant must be a positive integer');
    const ledger = await this.appendPointLedger({
      cityUserId: input.cityUserId,
      resource: 'AP',
      delta: -apAmount,
      sourceType: 'resident_attention_grant',
      sourceId: input.idempotencyKey || `${input.residentId}:${apAmount}`,
      memo: input.memo || `Resident attention grant: ${input.residentId}`,
      metadata: { residentId: input.residentId, mocked: true },
    });
    return { ledger, status: 'pending_nullcity', residentId: input.residentId, mocked: true };
  }

  async listResidentTrades(cityUserId: string): Promise<ResidentTrade[]> {
    await this.requireUser(cityUserId);
    const rows = await this.sql`SELECT * FROM resident_trades WHERE city_user_id = ${cityUserId} ORDER BY created_at DESC`;
    return rows.map(mapResidentTrade);
  }

  async createResidentTrade(input: ResidentTradeCreateInput): Promise<{ trade: ResidentTrade; ledger: PointLedgerEntry; mocked: boolean }> {
    if (input.offeredResource !== 'AP' && input.offeredResource !== 'GP') throw new CityStoreError('Point resource must be AP or GP');
    const offeredAmount = Number(input.offeredAmount);
    if (!Number.isInteger(offeredAmount) || offeredAmount <= 0) throw new CityStoreError('Trade amount must be a positive integer');
    if (input.idempotencyKey) {
      const existing = await this.sql`
        SELECT * FROM resident_trades
        WHERE city_user_id = ${input.cityUserId} AND idempotency_key = ${input.idempotencyKey}
        LIMIT 1
      `;
      if (existing[0]) {
        const trade = mapResidentTrade(existing[0]);
        const ledgerRows = await this.sql`SELECT * FROM point_ledger_entries WHERE id = ${trade.pointLedgerEntryId}`;
        return { trade, ledger: mapLedger(one(ledgerRows)), mocked: true };
      }
    }
    const tradeId = `trade_${crypto.randomUUID()}`;
    const ledger = await this.appendPointLedger({
      cityUserId: input.cityUserId,
      resource: input.offeredResource,
      delta: -offeredAmount,
      sourceType: 'resident_trade',
      sourceId: input.idempotencyKey || tradeId,
      memo: `Resident trade: ${input.residentId}`,
      metadata: { residentId: input.residentId, tradeId, mocked: true },
    });
    const rows = await this.sql`
      INSERT INTO resident_trades (
        id, city_user_id, resident_id, offered_resource, offered_amount, requested_item,
        idempotency_key, point_ledger_entry_id, metadata
      )
      VALUES (
        ${tradeId}, ${input.cityUserId}, ${input.residentId}, ${input.offeredResource}, ${offeredAmount},
        ${input.requestedItem || null}, ${input.idempotencyKey || null}, ${ledger.id}, ${json(input.metadata || {})}::jsonb
      )
      ON CONFLICT (city_user_id, idempotency_key) DO UPDATE SET updated_at = resident_trades.updated_at
      RETURNING *
    `;
    return { trade: mapResidentTrade(one(rows)), ledger, mocked: true };
  }

  async listInboxThreads(cityUserId: string): Promise<InboxThread[]> {
    await this.requireUser(cityUserId);
    const rows = await this.sql`SELECT * FROM inbox_threads WHERE city_user_id = ${cityUserId} ORDER BY updated_at DESC`;
    const threads = rows.map(mapInboxThread);
    for (const thread of threads) {
      const messages = await this.sql`SELECT * FROM inbox_messages WHERE thread_id = ${thread.id} ORDER BY created_at DESC LIMIT 1`;
      if (messages[0]) thread.latestMessage = mapInboxMessage(messages[0]);
    }
    return threads;
  }

  async getInboxThread(cityUserId: string, threadId: string): Promise<{ thread: InboxThread; messages: InboxMessage[] } | undefined> {
    await this.requireUser(cityUserId);
    const threadRows = await this.sql`SELECT * FROM inbox_threads WHERE id = ${threadId} AND city_user_id = ${cityUserId}`;
    if (!threadRows[0]) return undefined;
    const messageRows = await this.sql`SELECT * FROM inbox_messages WHERE thread_id = ${threadId} ORDER BY created_at ASC`;
    return { thread: mapInboxThread(threadRows[0]), messages: messageRows.map(mapInboxMessage) };
  }

  async listLibrarySoulLives(): Promise<LibrarySoulLife[]> {
    const rows = await this.sql`SELECT * FROM library_soul_lives ORDER BY COALESCE(died_at, created_at) DESC`;
    return rows.map(mapLibrarySoulLife);
  }

  private async requireUser(cityUserId: string): Promise<CityUser> {
    const rows = await this.sql`SELECT * FROM city_users WHERE id = ${cityUserId}`;
    if (!rows[0]) throw new CityStoreError('City user not found', 404);
    return mapCityUser(rows[0]);
  }

  private async ensureProfile(user: CityUser): Promise<CityProfile> {
    await this.sql`
      INSERT INTO city_profiles (city_user_id, display_name, handle, avatar_url)
      VALUES (${user.id}, ${user.nameSnapshot}, ${user.handleSnapshot || null}, ${user.avatarUrlSnapshot || null})
      ON CONFLICT (city_user_id) DO NOTHING
    `;
    const rows = await this.sql`SELECT * FROM city_profiles WHERE city_user_id = ${user.id}`;
    return mapProfile(one(rows));
  }

  private async ensureAccount(cityUserId: string, resource: PointResource): Promise<void> {
    await this.sql`
      INSERT INTO point_accounts (city_user_id, resource, balance)
      VALUES (${cityUserId}, ${resource}, 0)
      ON CONFLICT (city_user_id, resource) DO NOTHING
    `;
  }

  async resolveOnionId(cityUserId: string): Promise<string> {
    const rows = await this.sql`SELECT landing_user_id FROM city_users WHERE id = ${cityUserId}`;
    if (!rows[0]) throw new CityStoreError('City user not found', 404);
    return stringField(rows[0], 'landing_user_id');
  }

  async setIdentityAlias(personId: string, patronHandle: string): Promise<void> {
    await this.sql`
      INSERT INTO city_identity_aliases (person_id, patron_handle)
      VALUES (${personId}, ${patronHandle})
      ON CONFLICT (person_id) DO UPDATE SET patron_handle = EXCLUDED.patron_handle, updated_at = now()
    `;
  }

  async resolvePatronHandle(personId: string): Promise<string | undefined> {
    const rows = await this.sql`SELECT patron_handle FROM city_identity_aliases WHERE person_id = ${personId}`;
    return rows[0] ? stringField(rows[0], 'patron_handle') : undefined;
  }

  async createAttentionGrantIntent(input: AttentionGrantIntentCreateInput): Promise<AttentionGrantIntent> {
    const id = `agi_${crypto.randomUUID()}`;
    await this.sql`
      INSERT INTO attention_grant_intents (id, city_user_id, resident_id, ap_amount, idempotency_key, state)
      VALUES (${id}, ${input.cityUserId}, ${input.residentId}, ${input.apAmount}, ${input.idempotencyKey}, 'created')
      ON CONFLICT (city_user_id, idempotency_key) DO NOTHING
    `;
    const rows = await this.sql`
      SELECT * FROM attention_grant_intents WHERE city_user_id = ${input.cityUserId} AND idempotency_key = ${input.idempotencyKey}
    `;
    return mapAttentionGrantIntent(one(rows));
  }

  async getAttentionGrantIntent(cityUserId: string, idempotencyKey: string): Promise<AttentionGrantIntent | undefined> {
    const rows = await this.sql`
      SELECT * FROM attention_grant_intents WHERE city_user_id = ${cityUserId} AND idempotency_key = ${idempotencyKey}
    `;
    return rows[0] ? mapAttentionGrantIntent(rows[0]) : undefined;
  }

  async updateAttentionGrantIntent(id: string, patch: AttentionGrantIntentPatch): Promise<AttentionGrantIntent> {
    const rows = await this.sql`
      UPDATE attention_grant_intents SET
        state = COALESCE(${patch.state ?? null}, state),
        standin_ledger_entry_id = COALESCE(${patch.standinLedgerEntryId ?? null}, standin_ledger_entry_id),
        city_response = COALESCE(${patch.cityResponse ? json(patch.cityResponse) : null}::jsonb, city_response),
        failure_reason = COALESCE(${patch.failureReason ?? null}, failure_reason),
        updated_at = now()
      WHERE id = ${id}
      RETURNING *
    `;
    return mapAttentionGrantIntent(one(rows));
  }
}

export async function runCityMigrations(sql: BunSql): Promise<void> {
  await sql.unsafe('CREATE TABLE IF NOT EXISTS city_migrations (id TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())');
  for (const migration of cityMigrations) {
    const rows = await sql`SELECT id FROM city_migrations WHERE id = ${migration.id}`;
    if (rows[0]) continue;
    await sql.unsafe(migration.sql);
    await sql`INSERT INTO city_migrations (id) VALUES (${migration.id}) ON CONFLICT (id) DO NOTHING`;
  }
}

function one(rows: Array<Record<string, unknown>>): Record<string, unknown> {
  const row = rows[0];
  if (!row) throw new CityStoreError('Database row not found', 404);
  return row;
}

function json(value: unknown): string {
  return JSON.stringify(value ?? null);
}

function cleanString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function nullableCleanString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function stringField(row: Record<string, unknown>, key: string): string {
  return String(row[key] || '');
}

function nullableString(row: Record<string, unknown>, key: string): string | undefined {
  return typeof row[key] === 'string' && row[key] ? String(row[key]) : undefined;
}

function numberField(row: Record<string, unknown>, key: string): number {
  return Number(row[key] || 0);
}

function dateField(row: Record<string, unknown>, key: string): string {
  const value = row[key];
  return value instanceof Date ? value.toISOString() : String(value || new Date(0).toISOString());
}

function jsonField<T>(row: Record<string, unknown>, key: string, fallback: T): T {
  const value = row[key];
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return value as T;
}

function mapCityUser(row: Record<string, unknown>): CityUser {
  return {
    id: stringField(row, 'id'),
    landingUserId: stringField(row, 'landing_user_id'),
    emailSnapshot: stringField(row, 'email_snapshot'),
    nameSnapshot: stringField(row, 'name_snapshot'),
    handleSnapshot: nullableString(row, 'handle_snapshot'),
    avatarUrlSnapshot: nullableString(row, 'avatar_url_snapshot'),
    createdAt: dateField(row, 'created_at'),
    updatedAt: dateField(row, 'updated_at'),
  };
}

function mapAttentionGrantIntent(row: Record<string, unknown>): AttentionGrantIntent {
  const standin = nullableString(row, 'standin_ledger_entry_id');
  const failure = nullableString(row, 'failure_reason');
  const cityResponse = row.city_response;
  return {
    id: stringField(row, 'id'),
    cityUserId: stringField(row, 'city_user_id'),
    residentId: stringField(row, 'resident_id'),
    apAmount: Number(row.ap_amount),
    idempotencyKey: stringField(row, 'idempotency_key'),
    state: stringField(row, 'state') as AttentionGrantIntentState,
    ...(standin ? { standinLedgerEntryId: standin } : {}),
    ...(cityResponse && typeof cityResponse === 'object' ? { cityResponse: cityResponse as Record<string, unknown> } : {}),
    ...(failure ? { failureReason: failure } : {}),
    createdAt: dateField(row, 'created_at'),
    updatedAt: dateField(row, 'updated_at'),
  };
}

function mapProfile(row: Record<string, unknown>): CityProfile {
  return {
    cityUserId: stringField(row, 'city_user_id'),
    displayName: stringField(row, 'display_name'),
    handle: nullableString(row, 'handle'),
    avatarUrl: nullableString(row, 'avatar_url'),
    bio: stringField(row, 'bio'),
    metadata: jsonField(row, 'metadata', {}),
    updatedAt: dateField(row, 'updated_at'),
  };
}

function mapPointBalance(row: Record<string, unknown>): PointBalance {
  return {
    resource: stringField(row, 'resource') as PointResource,
    balance: numberField(row, 'balance'),
    updatedAt: dateField(row, 'updated_at'),
  };
}

function mapLedger(row: Record<string, unknown>): PointLedgerEntry {
  return {
    id: stringField(row, 'id'),
    cityUserId: stringField(row, 'city_user_id'),
    resource: stringField(row, 'resource') as PointResource,
    delta: numberField(row, 'delta'),
    balanceAfter: numberField(row, 'balance_after'),
    sourceType: stringField(row, 'source_type'),
    sourceId: stringField(row, 'source_id'),
    memo: nullableString(row, 'memo'),
    metadata: jsonField(row, 'metadata', {}),
    createdByCityUserId: nullableString(row, 'created_by_city_user_id'),
    createdAt: dateField(row, 'created_at'),
  };
}

function mapSoulProposal(row: Record<string, unknown>): SoulProposal {
  return {
    id: stringField(row, 'id'),
    proposerCityUserId: stringField(row, 'proposer_city_user_id'),
    status: stringField(row, 'status') as SoulProposal['status'],
    residentName: nullableString(row, 'resident_name'),
    displayName: stringField(row, 'display_name'),
    goal: stringField(row, 'goal'),
    personality: stringField(row, 'personality'),
    vices: stringField(row, 'vices'),
    virtues: stringField(row, 'virtues'),
    fears: stringField(row, 'fears'),
    voice: stringField(row, 'voice'),
    firstMemory: stringField(row, 'first_memory'),
    secret: stringField(row, 'secret'),
    appearance: jsonField(row, 'appearance', {}),
    startingLevels: jsonField(row, 'starting_levels', {}),
    startingEquipment: jsonField(row, 'starting_equipment', []),
    startingInventory: jsonField(row, 'starting_inventory', []),
    attentionThreshold: numberField(row, 'attention_threshold'),
    contributedAttention: numberField(row, 'contributed_attention'),
    quote: jsonField(row, 'quote', { threshold: 0, breakdown: { base: 0, levels: 0, equipment: 0, inventory: 0, complexity: 0 } }),
    bornResidentId: nullableString(row, 'born_resident_id'),
    moderationNotes: nullableString(row, 'moderation_notes'),
    createdAt: dateField(row, 'created_at'),
    updatedAt: dateField(row, 'updated_at'),
    submittedAt: nullableString(row, 'submitted_at') || undefined,
    bornAt: nullableString(row, 'born_at') || undefined,
  };
}

function mapSoulContribution(row: Record<string, unknown>): SoulContribution {
  return {
    id: stringField(row, 'id'),
    proposalId: stringField(row, 'proposal_id'),
    cityUserId: stringField(row, 'city_user_id'),
    apAmount: numberField(row, 'ap_amount'),
    ledgerEntryId: stringField(row, 'ledger_entry_id'),
    idempotencyKey: nullableString(row, 'idempotency_key'),
    createdAt: dateField(row, 'created_at'),
  };
}

function mapPrintRequest(row: Record<string, unknown>): PrintRequest {
  return {
    id: stringField(row, 'id'),
    cityUserId: stringField(row, 'city_user_id'),
    status: stringField(row, 'status') as PrintRequest['status'],
    title: stringField(row, 'title'),
    description: nullableString(row, 'description'),
    requestedMaterial: nullableString(row, 'requested_material'),
    requestedColor: nullableString(row, 'requested_color'),
    quantity: numberField(row, 'quantity'),
    quoteGp: row.quote_gp === null || row.quote_gp === undefined ? undefined : numberField(row, 'quote_gp'),
    gpLedgerEntryId: nullableString(row, 'gp_ledger_entry_id'),
    assignedPrinterId: nullableString(row, 'assigned_printer_id'),
    adminNotes: nullableString(row, 'admin_notes'),
    userNotes: nullableString(row, 'user_notes'),
    createdAt: dateField(row, 'created_at'),
    updatedAt: dateField(row, 'updated_at'),
  };
}

function mapPrinter(row: Record<string, unknown>): Printer {
  return {
    id: stringField(row, 'id'),
    name: stringField(row, 'name'),
    kind: stringField(row, 'kind') as Printer['kind'],
    adapter: stringField(row, 'adapter') as Printer['adapter'],
    bridgeId: nullableString(row, 'bridge_id'),
    enabled: row.enabled === true,
    adminNotes: nullableString(row, 'admin_notes'),
    capabilities: jsonField(row, 'capabilities', {}),
    createdAt: dateField(row, 'created_at'),
    updatedAt: dateField(row, 'updated_at'),
  };
}

function mapPrintQueueEntry(row: Record<string, unknown>): PrintQueueEntry {
  return {
    id: stringField(row, 'id'),
    printRequestId: stringField(row, 'print_request_id'),
    printerId: nullableString(row, 'printer_id'),
    status: stringField(row, 'status'),
    priority: numberField(row, 'priority'),
    queuePosition: row.queue_position === null || row.queue_position === undefined ? undefined : numberField(row, 'queue_position'),
    startedAt: nullableString(row, 'started_at'),
    completedAt: nullableString(row, 'completed_at'),
    error: nullableString(row, 'error'),
    createdAt: dateField(row, 'created_at'),
    updatedAt: dateField(row, 'updated_at'),
  };
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

function mapResident(row: Record<string, unknown>): ResidentReadModel {
  return {
    id: stringField(row, 'id'),
    nullcityResidentId: stringField(row, 'nullcity_resident_id'),
    displayName: stringField(row, 'display_name'),
    status: stringField(row, 'status') as ResidentReadModel['status'],
    bornAt: nullableString(row, 'born_at'),
    diedAt: nullableString(row, 'died_at'),
    deathCause: nullableString(row, 'death_cause'),
    currentAttention: row.current_attention === null || row.current_attention === undefined ? undefined : numberField(row, 'current_attention'),
    goal: nullableString(row, 'goal'),
    latestThought: nullableString(row, 'latest_thought'),
    latestStatusPostId: nullableString(row, 'latest_status_post_id'),
    latestSeenAt: nullableString(row, 'latest_seen_at'),
    sourceProposalId: nullableString(row, 'source_proposal_id'),
    metadata: jsonField(row, 'metadata', {}),
    updatedAt: dateField(row, 'updated_at'),
  };
}

function mapResidentPost(row: Record<string, unknown>): ResidentPost {
  return {
    id: stringField(row, 'id'),
    residentId: stringField(row, 'resident_id'),
    visibility: stringField(row, 'visibility') as ResidentPost['visibility'],
    body: stringField(row, 'body'),
    source: stringField(row, 'source') as ResidentPost['source'],
    sourceEventId: nullableString(row, 'source_event_id'),
    createdAt: dateField(row, 'created_at'),
  };
}

function mapResidentTrade(row: Record<string, unknown>): ResidentTrade {
  return {
    id: stringField(row, 'id'),
    cityUserId: stringField(row, 'city_user_id'),
    residentId: stringField(row, 'resident_id'),
    status: stringField(row, 'status') as ResidentTrade['status'],
    offeredResource: stringField(row, 'offered_resource') as PointResource,
    offeredAmount: numberField(row, 'offered_amount'),
    requestedItem: nullableString(row, 'requested_item'),
    idempotencyKey: nullableString(row, 'idempotency_key'),
    pointLedgerEntryId: stringField(row, 'point_ledger_entry_id'),
    nullcityTradeId: nullableString(row, 'nullcity_trade_id'),
    metadata: jsonField(row, 'metadata', {}),
    createdAt: dateField(row, 'created_at'),
    updatedAt: dateField(row, 'updated_at'),
  };
}

function mapInboxThread(row: Record<string, unknown>): InboxThread {
  return {
    id: stringField(row, 'id'),
    cityUserId: stringField(row, 'city_user_id'),
    residentId: stringField(row, 'resident_id'),
    status: stringField(row, 'status'),
    createdAt: dateField(row, 'created_at'),
    updatedAt: dateField(row, 'updated_at'),
  };
}

function mapInboxMessage(row: Record<string, unknown>): InboxMessage {
  return {
    id: stringField(row, 'id'),
    threadId: stringField(row, 'thread_id'),
    senderType: stringField(row, 'sender_type') as InboxMessage['senderType'],
    senderCityUserId: nullableString(row, 'sender_city_user_id'),
    senderResidentId: nullableString(row, 'sender_resident_id'),
    body: stringField(row, 'body'),
    messageType: stringField(row, 'message_type'),
    metadata: jsonField(row, 'metadata', {}),
    readAt: nullableString(row, 'read_at'),
    deliveredToNullcityAt: nullableString(row, 'delivered_to_nullcity_at'),
    createdAt: dateField(row, 'created_at'),
  };
}

function mapLibrarySoulLife(row: Record<string, unknown>): LibrarySoulLife {
  return {
    id: stringField(row, 'id'),
    residentId: nullableString(row, 'resident_id'),
    nullcityResidentId: stringField(row, 'nullcity_resident_id'),
    sourceProposalId: nullableString(row, 'source_proposal_id'),
    bornAt: nullableString(row, 'born_at'),
    diedAt: nullableString(row, 'died_at'),
    deathCause: nullableString(row, 'death_cause'),
    accomplishedGoal: typeof row.accomplished_goal === 'boolean' ? row.accomplished_goal : undefined,
    goalSummary: nullableString(row, 'goal_summary'),
    meaningfulEvents: jsonField(row, 'meaningful_events', []),
    epitaph: nullableString(row, 'epitaph'),
    createdAt: dateField(row, 'created_at'),
    updatedAt: dateField(row, 'updated_at'),
  };
}
