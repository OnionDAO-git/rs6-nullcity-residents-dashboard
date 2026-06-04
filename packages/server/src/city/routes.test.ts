import { describe, expect, test } from 'bun:test';
import { cityConfigFromEnv } from './config';
import type { LandingCheckinReader } from './checkins';
import { cityMigrations } from './migrations/schema';
import { createLandingSessionAuthenticator } from './landing-session';
import { InMemoryCityStore } from './memory-store';
import { routeCityApi } from './routes';
import type { CityServices } from './services';
import type { LandingSessionUser } from './types';

const adminUser: LandingSessionUser = {
  id: 'landing-user-1',
  email: 'alice@example.com',
  name: 'Alice',
  handle: 'alice',
  avatarUrl: 'https://example.com/alice.png',
  isAdmin: true,
  profileClaimed: true,
};

describe('routeCityApi session', () => {
  test('degrades cleanly when landing auth is not configured', async () => {
    const services: CityServices = {
      config: cityConfigFromEnv({ LANDING_AUTH_BASE_URL: 'https://oniondao.dev' }),
      auth: createLandingSessionAuthenticator(cityConfigFromEnv({ LANDING_AUTH_BASE_URL: 'https://oniondao.dev' }), undefined),
      store: new InMemoryCityStore(),
    };

    const response = await route(new Request('http://city.test/api/session'), services);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      authenticated: false,
      auth: { mode: 'disabled', reason: 'not_configured' },
      store: { mode: 'memory', cityDatabaseConfigured: false, landingDatabaseConfigured: false },
    });
  });

  test('validates the landing session cookie and mirrors the city user', async () => {
    let tokenSeen = '';
    const services = testServices(adminUser, token => {
      tokenSeen = token;
      return adminUser;
    });

    const response = await route(new Request('http://city.test/api/session', { headers: { cookie: 'other=1; session=abc123' } }), services);
    const payload = await response.json() as { authenticated: boolean; user: { landingUserId: string; roles: string[] } };

    expect(response.status).toBe(200);
    expect(tokenSeen).toBe('abc123');
    expect(payload.authenticated).toBe(true);
    expect(payload.user).toMatchObject({ landingUserId: 'landing-user-1', roles: ['attendee', 'admin'] });

    const profile = await route(authedRequest('/api/profile'), services);
    expect(await profile.json()).toMatchObject({
      profile: { displayName: 'Alice', handle: 'alice' },
    });
  });

  test('includes the OnionDAO wallet readout when the integration is configured', async () => {
    const profileLookups: string[] = [];
    const services = testServices(adminUser, undefined, {
      oniondao: {
        async profile(identifier: string) {
          profileLookups.push(identifier);
          return {
            name: 'Alice',
            handle: 'alice',
            avatarUrl: 'https://example.com/alice.png',
            onionId: null,
            solanaWalletAddress: null,
            balanceType: 'points',
            currentOnionPoints: 1200,
            currentOnionTokens: null,
            currentBalance: 1200,
          };
        },
        async createRequest() {
          throw new Error('not called');
        },
        async approveRequest() {
          throw new Error('not called');
        },
        async requestStatus() {
          throw new Error('not called');
        },
      },
    });

    const response = await route(new Request('http://city.test/api/session', { headers: authHeaders() }), services);
    const payload = await response.json() as { onionWallet?: { balanceType: string; currentOnionPoints: number; currentBalance: number } };

    expect(response.status).toBe(200);
    expect(profileLookups).toEqual(['alice']);
    expect(payload.onionWallet).toMatchObject({
      balanceType: 'points',
      currentOnionPoints: 1200,
      currentBalance: 1200,
    });
  });
});

describe('routeCityApi points and souls', () => {
  test('city migration SQL covers the backend slice tables and idempotent indexes', () => {
    const sql = cityMigrations.map(migration => migration.sql).join('\n');
    for (const table of [
      'city_users',
      'city_profiles',
      'point_accounts',
      'point_ledger_entries',
      'checkin_award_sources',
      'soul_proposals',
      'soul_contributions',
      'residents',
      'resident_posts',
      'inbox_threads',
      'inbox_messages',
      'resident_trades',
      'library_soul_lives',
      'print_requests',
      'printers',
      'print_queue',
      'city_events',
    ]) {
      expect(sql).toContain(`CREATE TABLE IF NOT EXISTS ${table}`);
    }
    expect(sql).toContain('UNIQUE (city_user_id, resource, source_type, source_id)');
    expect(sql).toContain('CREATE INDEX IF NOT EXISTS');
  });

  test('keeps AP grants idempotent and ledger-backed', async () => {
    const services = testServices(adminUser);

    const first = await route(jsonRequest('/api/admin/points/grant', { resource: 'AP', amount: 750, sourceId: 'seed-ap' }), services);
    const second = await route(jsonRequest('/api/admin/points/grant', { resource: 'AP', amount: 750, sourceId: 'seed-ap' }), services);
    const points = await route(authedRequest('/api/profile/points'), services);
    const ledger = await route(authedRequest('/api/profile/ledger?resource=AP'), services);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(balanceOf(await points.json(), 'AP')).toBe(750);
    expect((await ledger.json() as { entries: unknown[] }).entries).toHaveLength(1);
  });

  test('debits AP for idempotent soul contributions and marks funded proposals ready', async () => {
    const services = testServices(adminUser);
    await route(jsonRequest('/api/admin/points/grant', { resource: 'AP', amount: 750, sourceId: 'seed-ap' }), services);

    const proposalResponse = await route(
      jsonRequest('/api/soul-proposals', {
        displayName: 'Lantern Keeper',
        goal: 'Keep the square lit.',
        personality: 'Patient and observant.',
      }),
      services,
    );
    const proposal = (await proposalResponse.json() as { proposal: { id: string } }).proposal;

    const contributionBody = { apAmount: 500, idempotencyKey: 'contribution-1' };
    const first = await route(jsonRequest(`/api/soul-proposals/${proposal.id}/contributions`, contributionBody), services);
    const second = await route(jsonRequest(`/api/soul-proposals/${proposal.id}/contributions`, contributionBody), services);
    const points = await route(authedRequest('/api/profile/points'), services);

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(await first.json()).toMatchObject({ proposal: { status: 'ready_to_birth', contributedAttention: 500 } });
    expect(balanceOf(await points.json(), 'AP')).toBe(250);
  });

  test('syncs landing daily and event check-ins idempotently into AP ledger', async () => {
    const services = testServices(adminUser, undefined, {
      landingCheckins: {
        async listAwardableCheckins(landingUserId: string) {
          return [
            { kind: 'daily_checkin', sourceId: 'daily-1', landingUserId, occurredAt: '2026-05-27T14:00:00.000Z' },
            { kind: 'event_checkin', sourceId: 'event-reg-1', landingUserId, occurredAt: '2026-05-27T18:00:00.000Z', eventId: 'event-1', eventName: 'Null City' },
          ];
        },
      },
    });

    const first = await route(jsonRequest('/api/points/sync-checkins', {}), services);
    const second = await route(jsonRequest('/api/points/sync-checkins', {}), services);
    const points = await route(authedRequest('/api/profile/points'), services);
    const ledger = await route(authedRequest('/api/profile/ledger?resource=AP'), services);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(balanceOf(await points.json(), 'AP')).toBe(600);
    expect((await ledger.json() as { entries: unknown[] }).entries).toHaveLength(2);
  });

  test('rejects point spending when balance is insufficient', async () => {
    const services = testServices(adminUser);

    const proposalResponse = await route(
      jsonRequest('/api/soul-proposals', {
        displayName: 'Lantern Keeper',
        goal: 'Keep the square lit.',
        personality: 'Patient and observant.',
      }),
      services,
    );
    const proposal = (await proposalResponse.json() as { proposal: { id: string } }).proposal;
    const contribution = await route(jsonRequest(`/api/soul-proposals/${proposal.id}/contributions`, { apAmount: 1 }), services);

    expect(contribution.status).toBe(409);
    expect(await contribution.json()).toEqual({ error: 'Insufficient AP balance' });
  });

  test('ledger entries reconstruct the current AP balance (attention-grant saga, idempotent)', async () => {
    const creditCalls: Array<{ resident: string; amount: number }> = [];
    const services = testServices(adminUser, undefined, {
      nullcityControl: {
        creditAttention: async (resident: string, body: { amount: number }) => {
          creditCalls.push({ resident, amount: body.amount });
          return { ok: true as const, resident, attentionBefore: 0, attentionAfter: body.amount, creditedAmount: body.amount };
        },
      } as never,
    });
    await route(jsonRequest('/api/admin/points/grant', { resource: 'AP', amount: 750, sourceId: 'seed-ap' }), services);
    const first = await route(jsonRequest('/api/city/residents/res:fern/attention-grants', { apAmount: 125, idempotencyKey: 'attention-1' }), services);
    await route(jsonRequest('/api/city/residents/res:fern/attention-grants', { apAmount: 125, idempotencyKey: 'attention-1' }), services);

    const firstBody = await first.json() as { mocked?: boolean; intent?: { state: string } };
    expect(firstBody.mocked).toBeUndefined();
    expect(firstBody.intent?.state).toBe('settled');
    expect(creditCalls).toHaveLength(1); // idempotent: City credited once

    const points = await route(authedRequest('/api/profile/points'), services);
    const ledger = await route(authedRequest('/api/profile/ledger?resource=AP'), services);
    const entries = (await ledger.json() as { entries: Array<{ delta: number }> }).entries;
    const reconstructed = entries.reduce((sum, entry) => sum + entry.delta, 0);

    expect(reconstructed).toBe(625);
    expect(balanceOf(await points.json(), 'AP')).toBe(reconstructed);
  });

  test('spends OnionDAO onions before crediting resident attention', async () => {
    const createdRequests: Array<{ username: string; amount: number; callbackUrl: string; externalId?: string }> = [];
    const approvedRequests: Array<{ id: string; sessionToken: string }> = [];
    const statusSequence = ['pending', 'completed'];
    const creditCalls: Array<{ resident: string; body: Record<string, unknown> }> = [];
    const services = testServices(adminUser, undefined, {
      oniondao: {
        async profile() {
          return {
            name: 'Alice',
            handle: 'alice',
            avatarUrl: null,
            onionId: null,
            solanaWalletAddress: null,
            balanceType: 'points',
            currentOnionPoints: 1175,
            currentOnionTokens: null,
            currentBalance: 1175,
          };
        },
        async createRequest(input) {
          createdRequests.push({
            username: input.username,
            amount: input.amount,
            callbackUrl: input.callbackUrl,
            externalId: input.externalId,
          });
          return { id: 'onion-req-1', status: 'pending' };
        },
        async approveRequest(id: string, sessionToken: string) {
          approvedRequests.push({ id, sessionToken });
        },
        async requestStatus(id: string) {
          return {
            id,
            requestType: 'burn',
            status: statusSequence.shift() || 'completed',
            amount: 25,
            currencyMode: 'points',
            solanaSignature: null,
            error: null,
            createdAt: '2026-06-04T12:00:00.000Z',
            updatedAt: '2026-06-04T12:00:01.000Z',
            reviewedAt: '2026-06-04T12:00:01.000Z',
          };
        },
      },
      nullcityControl: {
        creditAttention: async (resident: string, body: Record<string, unknown>) => {
          creditCalls.push({ resident, body });
          return { ok: true as const, resident, attentionBefore: 10, attentionAfter: 35, creditedAmount: 25 };
        },
      } as never,
    });

    const response = await route(jsonRequest('/api/city/residents/res:fern/onion-attention-grants', {
      onionAmount: 25,
      idempotencyKey: 'onion-attn-1',
      memo: 'Focus Fern',
    }), services);
    const payload = await response.json() as {
      onionRequest: { id: string; status: string };
      city: { creditedAmount: number };
      onionWallet?: { currentBalance: number };
    };

    expect(response.status).toBe(202);
    expect(createdRequests).toEqual([{
      username: 'alice',
      amount: 25,
      callbackUrl: 'http://localhost:8787/api/onions/callback',
      externalId: expect.stringContaining('onion-attn-1') as unknown as string,
    }]);
    expect(approvedRequests).toEqual([{ id: 'onion-req-1', sessionToken: 'test-token' }]);
    expect(creditCalls).toEqual([{
      resident: 'res:fern',
      body: {
        idempotencyKey: 'onion-attn-1',
        amount: 25,
        cityUserId: expect.any(String) as unknown as string,
        personId: 'landing-user-1',
        patronHandle: 'alice',
        sourceType: 'oniondao_attention_spend',
        sourceId: 'onion-req-1',
        note: 'Focus Fern',
      },
    }]);
    expect(payload.onionRequest).toMatchObject({ id: 'onion-req-1', status: 'completed' });
    expect(payload.city).toMatchObject({ creditedAmount: 25 });
    expect(payload.onionWallet).toMatchObject({ currentBalance: 1175 });
  });

  test('creates resident trade saga entries with idempotent point debits while Null City is mocked', async () => {
    const services = testServices(adminUser);
    await route(jsonRequest('/api/admin/points/grant', { resource: 'GP', amount: 100, sourceId: 'seed-gp' }), services);

    const body = {
      residentId: 'res:fern',
      offeredResource: 'GP',
      offeredAmount: 25,
      requestedItem: 'story-token',
      idempotencyKey: 'trade-1',
    };
    const first = await route(jsonRequest('/api/city/trades', body), services);
    const second = await route(jsonRequest('/api/city/trades', body), services);
    const points = await route(authedRequest('/api/profile/points'), services);
    const trades = await route(authedRequest('/api/city/trades'), services);

    expect(first.status).toBe(202);
    expect(second.status).toBe(202);
    expect(await first.json()).toMatchObject({ mocked: true, trade: { status: 'pending_nullcity' }, ledger: { delta: -25 } });
    expect(balanceOf(await points.json(), 'GP')).toBe(75);
    expect((await trades.json() as { trades: unknown[] }).trades).toHaveLength(1);
  });

  test('admin can inspect controller-backed Soul proposals when the Null City control bridge is configured', async () => {
    const services = testServices(adminUser, undefined, {
      nullcityControl: {
        listProposals: async () => [
          {
            schemaVersion: 1,
            id: 'proposal-1',
            residentName: 'res:lantern',
            soulMarkdown: '---\nname: res:lantern\n---\n',
            goalText: 'Keep the square lit.',
            apThreshold: 100,
            apFunded: 100,
            proposerCityUserId: 'city-user-1',
            status: 'threshold_crossed',
            createdAt: '2026-05-30T07:00:00.000Z',
            updatedAt: '2026-05-30T07:01:00.000Z',
          },
        ],
        listNcri: async () => [],
        approveProposal: async () => {
          throw new Error('not called');
        },
        rejectProposal: async () => {
          throw new Error('not called');
        },
        birthProposal: async () => {
          throw new Error('not called');
        },
      },
    });

    const response = await route(authedRequest('/api/admin/nullcity/proposals'), services);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      available: true,
      proposals: [{ id: 'proposal-1', residentName: 'res:lantern', status: 'threshold_crossed' }],
    });
  });

  test('admin proposal operations proxy approve/reject/birth to the Null City controller', async () => {
    const calls: string[] = [];
    const services = testServices(adminUser, undefined, {
      nullcityControl: {
        listProposals: async () => [],
        listNcri: async () => [],
        approveProposal: async (id, adminNotes) => {
          calls.push(`approve:${id}:${adminNotes}`);
          return { id, status: 'approved' };
        },
        rejectProposal: async (id, adminNotes) => {
          calls.push(`reject:${id}:${adminNotes}`);
          return { id, status: 'rejected' };
        },
        birthProposal: async id => {
          calls.push(`birth:${id}`);
          return { ok: true, proposalId: id, resident: 'res:lantern', fundedAttention: 100 };
        },
      },
    });

    const approve = await route(jsonRequest('/api/admin/nullcity/proposals/proposal-1/approve', { adminNotes: 'ready' }), services);
    const reject = await route(jsonRequest('/api/admin/nullcity/proposals/proposal-2/reject', { adminNotes: 'duplicate' }), services);
    const birth = await route(jsonRequest('/api/admin/nullcity/proposals/proposal-1/birth', {}), services);

    expect(approve.status).toBe(200);
    expect(reject.status).toBe(200);
    expect(birth.status).toBe(200);
    expect(calls).toEqual(['approve:proposal-1:ready', 'reject:proposal-2:duplicate', 'birth:proposal-1']);
    expect(await birth.json()).toMatchObject({ ok: true, proposalId: 'proposal-1', resident: 'res:lantern' });
  });

  test('non-admin users cannot post controller-backed Soul proposal operations', async () => {
    const services = testServices({ ...adminUser, isAdmin: false }, undefined, {
      nullcityControl: {
        listProposals: async () => [],
        listNcri: async () => [],
        approveProposal: async () => ({ ok: true }),
        rejectProposal: async () => ({ ok: true }),
        birthProposal: async () => ({ ok: true }),
      },
    });

    const response = await route(jsonRequest('/api/admin/nullcity/proposals/proposal-1/approve', { adminNotes: 'ready' }), services);

    expect(response.status).toBe(403);
  });

  test('configured admin proposal operations still require csrf in production mode', async () => {
    const services = testServices(adminUser, undefined, {
      csrfEnabled: true,
      nullcityControl: {
        listProposals: async () => [],
        listNcri: async () => [],
        approveProposal: async () => ({ ok: true }),
        rejectProposal: async () => ({ ok: true }),
        birthProposal: async () => ({ ok: true }),
      },
    });

    const response = await route(jsonRequest('/api/admin/nullcity/proposals/proposal-1/approve', { adminNotes: 'ready' }), services);

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'csrf_required' });
  });

  test('controller-backed Soul proposal operations fail closed when the bridge is not configured', async () => {
    const services = testServices(adminUser);

    const response = await route(jsonRequest('/api/admin/nullcity/proposals/proposal-1/birth', {}), services);

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'not_configured' });
  });

  test('non-admin users cannot use controller-backed Soul proposal operations', async () => {
    const services = testServices({ ...adminUser, isAdmin: false }, undefined, {
      nullcityControl: {
        listProposals: async () => [],
        listNcri: async () => [],
        approveProposal: async () => ({}),
        rejectProposal: async () => ({}),
        birthProposal: async () => ({}),
      },
    });

    const response = await route(authedRequest('/api/admin/nullcity/proposals'), services);

    expect(response.status).toBe(403);
  });

  test('controller-backed Soul proposal list degrades when the control bridge is not configured', async () => {
    const services = testServices(adminUser);

    const response = await route(authedRequest('/api/admin/nullcity/proposals'), services);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ available: false, proposals: [], error: 'not_configured' });
  });

  test('admin can inspect controller-backed NCRI records when the Null City control bridge is configured', async () => {
    const services = testServices(adminUser, undefined, {
      nullcityControl: {
        listProposals: async () => [],
        listNcri: async () => [
          {
            schemaVersion: 1,
            id: 'ncri-1',
            itemId: 4151,
            displayName: 'Abyssal Whip of the City',
            lore: 'Forged for the weekend sprint.',
            owner: 'user:alice',
            approvalStatus: 'approved',
            redemptionStatus: 'available',
            createdAt: '2026-05-30T07:00:00.000Z',
            updatedAt: '2026-05-30T07:01:00.000Z',
          },
        ],
        approveProposal: async () => {
          throw new Error('not called');
        },
        rejectProposal: async () => {
          throw new Error('not called');
        },
        birthProposal: async () => {
          throw new Error('not called');
        },
      },
    });

    const response = await route(authedRequest('/api/admin/nullcity/ncri'), services);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      available: true,
      records: [{ id: 'ncri-1', itemId: 4151, displayName: 'Abyssal Whip of the City' }],
    });
  });

  test('controller-backed NCRI list degrades when the control bridge is not configured', async () => {
    const services = testServices(adminUser);

    const response = await route(authedRequest('/api/admin/nullcity/ncri'), services);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ available: false, records: [], error: 'not_configured' });
  });

  test('admin can inspect the controller NCRI print queue with a status filter', async () => {
    const calls: unknown[] = [];
    const services = testServices(adminUser, undefined, {
      nullcityControl: {
        listProposals: async () => [],
        listNcri: async () => [],
        ncriPrintQueue: async query => {
          calls.push(query);
          return {
            asOf: '2026-05-30T19:40:00.000Z',
            items: [
              {
                ncriId: 'ncri-1',
                itemId: 590,
                displayName: 'Tinderbox of the Flame',
                cityUserId: 'city-user:alice',
                owner: 'city-user:alice',
                sourceResidentName: 'res:duke',
                status: 'awaiting_redemption',
                gpRedemptionCost: 500,
                printable: true,
                printAssetRef: 'prints/tinderbox.glb',
                createdAt: '2026-05-30T19:20:00.000Z',
                updatedAt: '2026-05-30T19:39:00.000Z',
              },
            ],
          };
        },
        approveProposal: async () => ({}),
        rejectProposal: async () => ({}),
        birthProposal: async () => ({}),
      },
    });

    const response = await route(authedRequest('/api/admin/nullcity/ncri/print-queue?status=awaiting_redemption'), services);

    expect(response.status).toBe(200);
    expect(calls).toEqual([{ status: 'awaiting_redemption' }]);
    expect(await response.json()).toMatchObject({
      available: true,
      asOf: '2026-05-30T19:40:00.000Z',
      items: [
        {
          ncriId: 'ncri-1',
          cityUserId: 'city-user:alice',
          status: 'awaiting_redemption',
          gpRedemptionCost: 500,
        },
      ],
    });
  });

  test('controller-backed NCRI print queue degrades when the control bridge is not configured', async () => {
    const services = testServices(adminUser);

    const response = await route(authedRequest('/api/admin/nullcity/ncri/print-queue'), services);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ available: false, items: [], error: 'not_configured' });
  });

  test('public live economy route proxies the redacted Null City economy snapshot', async () => {
    const services = testServices(null, undefined, {
      nullcityControl: {
        listProposals: async () => [],
        listNcri: async () => [],
        liveEconomy: async options => ({
          asOf: '2026-05-30T17:47:00.000Z',
          window: { since: '2026-05-30T17:32:00.000Z', windowMs: 900000 },
          city: { residentCount: 23, activeResidentCount: 5, attentionTotal: 50000, attentionDelta: 125, gpNetDelta: -20 },
          countsByKind: { ap_topup: 2, gp_traded: 1 },
          topResidentsByAttention: [
            { residentName: 'res:hans', attentionBalance: 5000, gpNetDelta: 0, eventCount: 1, windowEventCount: 1, activeInWindow: true, online: true },
          ],
          residents: [],
          recentEvents: [
            { id: 'evt-1', ts: '2026-05-30T17:45:00.000Z', kind: 'ap_topup', residentName: 'res:hans', cityUserId: '<patron #1>', apDelta: 50 },
          ],
          pendingProposals: [
            { proposalId: 'proposal-1', residentName: 'res:lantern', goalText: 'Keep the square lit.', apFunded: 80, apThreshold: 100, status: 'funding' },
          ],
          querySeen: options,
        }),
        approveProposal: async () => ({}),
        rejectProposal: async () => ({}),
        birthProposal: async () => ({}),
      },
    });

    const response = await route(new Request('http://city.test/api/nullcity/economy/live?limit=5&residentLimit=3'), services);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      available: true,
      snapshot: {
        city: { residentCount: 23, activeResidentCount: 5 },
        recentEvents: [{ cityUserId: '<patron #1>', residentName: 'res:hans' }],
        querySeen: { limit: 5, residentLimit: 3 },
      },
    });
  });

  test('public live economy route degrades when the control bridge is not configured', async () => {
    const services = testServices(null);

    const response = await route(new Request('http://city.test/api/nullcity/economy/live'), services);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ available: false, error: 'not_configured' });
  });

  test('public economy heartbeat route proxies the controller liveness payload', async () => {
    const services = testServices(null, undefined, {
      nullcityControl: {
        listProposals: async () => [],
        listNcri: async () => [],
        liveEconomy: async () => {
          throw new Error('not called');
        },
        economyHeartbeat: async () => ({
          asOf: '2026-05-30T18:52:00.000Z',
          controllerUptimeSec: 372,
          residentCount: 25,
          activeResidentCount: 23,
          economyEventCount: 28,
          lastEconomyEventTs: '2026-05-30T18:51:10.000Z',
          lastEconomyEventKind: 'ap_gp_exchange',
          lastDigestBuiltAt: '2026-05-30T18:50:00.000Z',
          degradedFlags: [],
        }),
        approveProposal: async () => ({}),
        rejectProposal: async () => ({}),
        birthProposal: async () => ({}),
      },
    });

    const response = await route(new Request('http://city.test/api/nullcity/economy/heartbeat'), services);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      available: true,
      heartbeat: {
        residentCount: 25,
        activeResidentCount: 23,
        economyEventCount: 28,
        degradedFlags: [],
      },
    });
  });

  test('public economy heartbeat route degrades when the control bridge is not configured', async () => {
    const services = testServices(null);

    const response = await route(new Request('http://city.test/api/nullcity/economy/heartbeat'), services);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ available: false, error: 'not_configured' });
  });

  test('public economy stream route proxies the controller SSE feed', async () => {
    const calls: unknown[] = [];
    const services = testServices(null, undefined, {
      nullcityControl: {
        listProposals: async () => [],
        listNcri: async () => [],
        economyStream: async query => {
          calls.push(query);
          return new Response('retry: 1500\n\nevent: economy_snapshot\ndata: {"asOf":"2026-05-30T18:52:00.000Z"}\n\n', {
            headers: {
              'content-type': 'text/event-stream; charset=utf-8',
              'cache-control': 'no-cache, no-transform',
            },
          });
        },
        approveProposal: async () => ({}),
        rejectProposal: async () => ({}),
        birthProposal: async () => ({}),
      },
    });

    const response = await route(new Request('http://city.test/api/nullcity/economy/stream?limit=5&residentLimit=3&intervalMs=1500&once=1'), services);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/event-stream');
    expect(await response.text()).toContain('economy_snapshot');
    expect(calls).toEqual([{ limit: 5, residentLimit: 3, intervalMs: 1500, once: true }]);
  });

  test('public economy stream route returns 404 when the stream bridge is unavailable', async () => {
    const services = testServices(null);

    const response = await route(new Request('http://city.test/api/nullcity/economy/stream?once=1'), services);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ available: false, error: 'not_configured' });
  });

  test('admin economy listings route proxies controller NCRI listings', async () => {
    const services = testServices(adminUser, undefined, {
      nullcityControl: {
        listProposals: async () => [],
        listNcri: async () => [],
        liveEconomy: async () => {
          throw new Error('not called');
        },
        economyListings: async () => ({
          asOf: '2026-05-30T18:52:00.000Z',
          listings: [
            {
              ncriId: 'ncri-1',
              itemId: 4151,
              displayName: 'Abyssal Whip of the City',
              owner: 'user:buyer',
              sourceResidentName: 'res:hans',
              approvalStatus: 'approved',
              redemptionStatus: 'available',
              createdAt: '2026-05-30T18:40:00.000Z',
              updatedAt: '2026-05-30T18:45:00.000Z',
              listed: true,
            },
          ],
        }),
        approveProposal: async () => ({}),
        rejectProposal: async () => ({}),
        birthProposal: async () => ({}),
      },
    });

    const response = await route(authedRequest('/api/admin/nullcity/economy/listings'), services);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      available: true,
      asOf: '2026-05-30T18:52:00.000Z',
      listings: [
        {
          ncriId: 'ncri-1',
          owner: 'user:buyer',
          sourceResidentName: 'res:hans',
          listed: true,
        },
      ],
    });
  });

  test('admin economy listings route requires admin auth before exposing owners', async () => {
    const services = testServices(null, undefined, {
      nullcityControl: {
        listProposals: async () => [],
        listNcri: async () => [],
        economyListings: async () => {
          throw new Error('not called');
        },
        approveProposal: async () => ({}),
        rejectProposal: async () => ({}),
        birthProposal: async () => ({}),
      },
    });

    const response = await route(new Request('http://city.test/api/admin/nullcity/economy/listings'), services);

    expect(response.status).toBe(401);
  });

  test('admin AP-for-GP exchange route proxies to the Null City controller', async () => {
    const calls: Array<{ resident: string; body: unknown }> = [];
    const services = testServices(adminUser, undefined, {
      nullcityControl: {
        listProposals: async () => [],
        listNcri: async () => [],
        liveEconomy: async () => {
          throw new Error('not called');
        },
        exchangeApForGp: async (resident, body) => {
          calls.push({ resident, body });
          return {
            schemaVersion: 1,
            exchangeId: 'apgp:res:angler:exchange-1',
            idempotencyKey: 'exchange-1',
            resident,
            apAmount: 50,
            gpAmount: 25,
            status: 'complete',
            apEvidence: { creditedAmount: 50, attentionBefore: 24953, attentionAfter: 25003 },
            gpEvidence: { itemId: 995, burnedAmount: 25, remainingAmount: 250 },
            createdAt: '2026-05-30T18:24:03.201Z',
            completedAt: '2026-05-30T18:24:03.202Z',
          };
        },
        approveProposal: async () => ({}),
        rejectProposal: async () => ({}),
        birthProposal: async () => ({}),
      },
    });

    const response = await route(jsonRequest('/api/admin/nullcity/residents/res%3Aangler/ap-gp-exchanges', {
      idempotencyKey: 'exchange-1',
      apAmount: 50,
      gpAmount: 25,
      cityUserId: 'city-user:operator',
    }), services);

    expect(response.status).toBe(200);
    expect(calls).toEqual([
      {
        resident: 'res:angler',
        body: {
          idempotencyKey: 'exchange-1',
          apAmount: 50,
          gpAmount: 25,
          cityUserId: 'city-user:operator',
        },
      },
    ]);
    expect(await response.json()).toMatchObject({
      available: true,
      exchange: {
        exchangeId: 'apgp:res:angler:exchange-1',
        resident: 'res:angler',
        status: 'complete',
        gpEvidence: { remainingAmount: 250 },
      },
    });
  });

  test('non-admin users cannot post AP-for-GP exchange operations', async () => {
    const services = testServices({ ...adminUser, isAdmin: false }, undefined, {
      nullcityControl: {
        listProposals: async () => [],
        listNcri: async () => [],
        exchangeApForGp: async resident => ({
          schemaVersion: 1,
          exchangeId: 'apgp:test',
          idempotencyKey: 'exchange-test',
          resident,
          apAmount: 1,
          gpAmount: 1,
          status: 'complete',
          createdAt: '2026-05-30T18:24:03.201Z',
        }),
        approveProposal: async () => ({}),
        rejectProposal: async () => ({}),
        birthProposal: async () => ({}),
      },
    });

    const response = await route(jsonRequest('/api/admin/nullcity/residents/res%3Aangler/ap-gp-exchanges', { apAmount: 1, gpAmount: 1 }), services);

    expect(response.status).toBe(403);
  });

  test('admin AP-for-GP exchange route preserves failed GP records for operators', async () => {
    const services = testServices(adminUser, undefined, {
      nullcityControl: {
        listProposals: async () => [],
        listNcri: async () => [],
        exchangeApForGp: async resident => ({
          schemaVersion: 1,
          exchangeId: 'apgp:res:angler:exchange-2',
          idempotencyKey: 'exchange-2',
          resident,
          apAmount: 50,
          gpAmount: 5000,
          status: 'failed_gp',
          failureReason: 'resident lacks enough GP item 995',
          gpEvidence: { itemId: 995, burnedAmount: 0, remainingAmount: 250 },
          createdAt: '2026-05-30T18:25:03.201Z',
        }),
        approveProposal: async () => ({}),
        rejectProposal: async () => ({}),
        birthProposal: async () => ({}),
      },
    });

    const response = await route(jsonRequest('/api/admin/nullcity/residents/res%3Aangler/ap-gp-exchanges', {
      idempotencyKey: 'exchange-2',
      apAmount: 50,
      gpAmount: 5000,
    }), services);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      available: true,
      exchange: {
        resident: 'res:angler',
        status: 'failed_gp',
        failureReason: 'resident lacks enough GP item 995',
        gpEvidence: { remainingAmount: 250 },
      },
    });
  });

  test('configured AP-for-GP exchange operations still require csrf in production mode', async () => {
    const services = testServices(adminUser, undefined, {
      csrfEnabled: true,
      nullcityControl: {
        listProposals: async () => [],
        listNcri: async () => [],
        exchangeApForGp: async resident => ({
          schemaVersion: 1,
          exchangeId: 'apgp:test',
          idempotencyKey: 'exchange-test',
          resident,
          apAmount: 1,
          gpAmount: 1,
          status: 'complete',
          createdAt: '2026-05-30T18:24:03.201Z',
        }),
        approveProposal: async () => ({}),
        rejectProposal: async () => ({}),
        birthProposal: async () => ({}),
      },
    });

    const response = await route(jsonRequest('/api/admin/nullcity/residents/res%3Aangler/ap-gp-exchanges', { apAmount: 1, gpAmount: 1 }), services);

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'csrf_required' });
  });

  test('non-admin users cannot access controller-backed NCRI list', async () => {
    const services = testServices({ ...adminUser, isAdmin: false }, undefined, {
      nullcityControl: {
        listProposals: async () => [],
        listNcri: async () => [],
        approveProposal: async () => ({}),
        rejectProposal: async () => ({}),
        birthProposal: async () => ({}),
      },
    });

    const response = await route(authedRequest('/api/admin/nullcity/ncri'), services);

    expect(response.status).toBe(403);
  });
});

describe('routeCityApi csrf protection', () => {
  test('rejects state-changing browser routes without csrf token when enabled', async () => {
    const services = testServices(adminUser, undefined, { csrfEnabled: true });
    const response = await route(jsonRequest('/api/admin/points/grant', { resource: 'AP', amount: 1, sourceId: 'csrf' }), services);
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'csrf_required' });
  });

  test('accepts state-changing browser routes with matching csrf header and cookie', async () => {
    const services = testServices(adminUser, undefined, { csrfEnabled: true });
    const session = await route(new Request('http://city.test/api/session', { headers: authHeaders() }), services);
    const token = ((await session.json()) as { csrfToken: string }).csrfToken;
    const response = await route(jsonRequest('/api/admin/points/grant', { resource: 'AP', amount: 1, sourceId: 'csrf' }, { csrfToken: token }), services);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ delta: 1, sourceId: 'csrf' });
  });
});

describe('routeCityApi print and read model skeletons', () => {
  test('supports print request creation, admin quoting, and GP confirmation', async () => {
    const services = testServices(adminUser);
    await route(jsonRequest('/api/admin/points/grant', { resource: 'GP', amount: 100, sourceId: 'seed-gp' }), services);

    const create = await route(jsonRequest('/api/prints', { title: 'Resident miniature', requestedMaterial: 'PLA' }), services);
    const requestModel = (await create.json() as { request: { id: string } }).request;
    const quote = await route(jsonRequest(`/api/admin/prints/${requestModel.id}/quote`, { quoteGp: 40 }), services);
    const confirm = await route(new Request(`http://city.test/api/prints/${requestModel.id}/confirm-gp`, { method: 'POST', headers: authHeaders() }), services);
    const points = await route(authedRequest('/api/profile/points'), services);

    expect(create.status).toBe(201);
    expect(await quote.json()).toMatchObject({ request: { status: 'quoted', quoteGp: 40 } });
    expect(await confirm.json()).toMatchObject({ request: { status: 'paid' }, ledger: { delta: -40, resource: 'GP' } });
    expect(await points.json()).toMatchObject({ balances: [{ resource: 'AP', balance: 0 }, { resource: 'GP', balance: 60 }] });
  });

  test('print bridge claims the next eligible queued job and marks it claimed', async () => {
    const services = testServices(adminUser, undefined, { printBridgeToken: 'bridge-token' });
    const printer = await services.store.upsertPrinter({
      id: 'printer-east',
      name: 'Printer East',
      kind: 'bambu-p2s',
      adapter: 'bambu-lan',
      bridgeId: 'bridge-east',
    });
    const print = await route(jsonRequest('/api/prints', {
      title: 'Resident miniature',
      requestedMaterial: 'PLA',
      requestedColor: 'Onion purple',
      quantity: 2,
    }), services);
    const requestModel = (await print.json() as { request: { id: string } }).request;
    const queueEntry = await services.store.enqueuePrintRequest({
      printRequestId: requestModel.id,
      printerId: printer.id,
      priority: 5,
    });

    const claim = await route(bridgeRequest('/api/admin/print-queue/claim', {
      bridgeId: 'bridge-east',
      printerIds: ['printer-east'],
    }, 'bridge-token'), services);
    const secondClaim = await route(bridgeRequest('/api/admin/print-queue/claim', {
      bridgeId: 'bridge-east',
      printerIds: ['printer-east'],
    }, 'bridge-token'), services);
    const queue = await route(authedRequest('/api/admin/print-queue'), services);

    expect(claim.status).toBe(200);
    expect(await claim.json()).toEqual({
      job: {
        id: queueEntry.id,
        printRequestId: requestModel.id,
        title: 'Resident miniature',
        printerId: 'printer-east',
        requestedMaterial: 'PLA',
        requestedColor: 'Onion purple',
        quantity: 2,
        metadata: {
          printRequestStatus: 'queued',
          priority: 5,
          queuePosition: 1,
        },
      },
    });
    expect(await secondClaim.json()).toEqual({});
    expect(await queue.json()).toMatchObject({
      queue: [{ id: queueEntry.id, printerId: 'printer-east', status: 'claimed' }],
    });
  });

  test('print bridge claim is token-gated and rejects malformed claim bodies', async () => {
    const withoutTokenConfig = await route(bridgeRequest('/api/admin/print-queue/claim', {
      bridgeId: 'bridge-east',
      printerIds: ['printer-east'],
    }, 'bridge-token'), testServices(adminUser));
    const services = testServices(adminUser, undefined, { printBridgeToken: 'bridge-token' });
    const badToken = await route(bridgeRequest('/api/admin/print-queue/claim', {
      bridgeId: 'bridge-east',
      printerIds: ['printer-east'],
    }, 'wrong-token'), services);
    const missingBridge = await route(bridgeRequest('/api/admin/print-queue/claim', {
      printerIds: ['printer-east'],
    }, 'bridge-token'), services);
    const malformed = await route(bridgeRequest('/api/admin/print-queue/claim', {
      bridgeId: 'bridge-east',
      printerIds: [],
    }, 'bridge-token'), services);

    expect(withoutTokenConfig.status).toBe(503);
    expect(await withoutTokenConfig.json()).toEqual({ error: 'print_bridge_token_not_configured' });
    expect(badToken.status).toBe(401);
    expect(await badToken.json()).toEqual({ error: 'unauthorized_print_bridge' });
    expect(missingBridge.status).toBe(400);
    expect(await missingBridge.json()).toEqual({ error: 'bridge_id_required' });
    expect(malformed.status).toBe(400);
    expect(await malformed.json()).toEqual({ error: 'printer_ids_required' });
  });

  test('exposes empty resident and library read models without requiring auth', async () => {
    const services = testServices(null);

    const residents = await route(new Request('http://city.test/api/city/residents'), services);
    const library = await route(new Request('http://city.test/api/city/library'), services);

    expect(await residents.json()).toEqual({ residents: [] });
    expect(await library.json()).toEqual({ lives: [] });
  });
});

function balanceOf(payload: unknown, resource: 'AP' | 'GP'): number | undefined {
  const balances = (payload as { balances?: Array<{ resource: string; balance: number }> }).balances || [];
  return balances.find(balance => balance.resource === resource)?.balance;
}

function testServices(
  user: LandingSessionUser | null,
  onToken?: (token: string) => LandingSessionUser | null,
  options: {
    csrfEnabled?: boolean;
    landingCheckins?: LandingCheckinReader;
    nullcityControl?: CityServices['nullcityControl'];
    oniondao?: CityServices['oniondao'];
    printBridgeToken?: string;
  } = {},
): CityServices {
  const config = cityConfigFromEnv({
    LANDING_AUTH_BASE_URL: 'https://oniondao.dev',
    LANDING_DATABASE_URL: 'postgres://readonly@example.test/landing',
    CITY_DATABASE_URL: 'postgres://city@example.test/city',
    NODE_ENV: options.csrfEnabled ? 'production' : 'test',
    CITY_PRINT_BRIDGE_TOKEN: options.printBridgeToken,
  });
  return {
    config,
    auth: createLandingSessionAuthenticator(config, {
      async findUserBySessionToken(token: string) {
        return onToken ? onToken(token) : user;
      },
    }),
    store: new InMemoryCityStore({
      now: (() => {
        let tick = 0;
        return () => new Date(Date.UTC(2026, 4, 27, 12, 0, tick++)).toISOString();
      })(),
    }),
    landingCheckins: options.landingCheckins,
    nullcityControl: options.nullcityControl,
    oniondao: options.oniondao,
  };
}

function authedRequest(path: string): Request {
  return new Request(`http://city.test${path}`, { headers: authHeaders() });
}

function jsonRequest(path: string, body: unknown, options: { csrfToken?: string } = {}): Request {
  return new Request(`http://city.test${path}`, {
    method: 'POST',
    headers: {
      ...authHeaders(options.csrfToken),
      'content-type': 'application/json',
      ...(options.csrfToken ? { 'x-csrf-token': options.csrfToken } : {}),
    },
    body: JSON.stringify(body),
  });
}

function bridgeRequest(path: string, body: unknown, token: string): Request {
  return new Request(`http://city.test${path}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

function authHeaders(csrfToken?: string): Record<string, string> {
  return { cookie: csrfToken ? `session=test-token; city_csrf=${csrfToken}` : 'session=test-token' };
}

async function route(request: Request, services: CityServices): Promise<Response> {
  const response = await routeCityApi(request, new URL(request.url), services);
  if (!response) throw new Error(`No route for ${request.url}`);
  return response;
}
