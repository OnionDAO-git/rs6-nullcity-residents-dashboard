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

  test('ledger entries reconstruct the current AP balance', async () => {
    const services = testServices(adminUser);
    await route(jsonRequest('/api/admin/points/grant', { resource: 'AP', amount: 750, sourceId: 'seed-ap' }), services);
    await route(jsonRequest('/api/city/residents/res:fern/attention-grants', { apAmount: 125, idempotencyKey: 'attention-1' }), services);
    await route(jsonRequest('/api/city/residents/res:fern/attention-grants', { apAmount: 125, idempotencyKey: 'attention-1' }), services);

    const points = await route(authedRequest('/api/profile/points'), services);
    const ledger = await route(authedRequest('/api/profile/ledger?resource=AP'), services);
    const entries = (await ledger.json() as { entries: Array<{ delta: number }> }).entries;
    const reconstructed = entries.reduce((sum, entry) => sum + entry.delta, 0);

    expect(reconstructed).toBe(625);
    expect(balanceOf(await points.json(), 'AP')).toBe(reconstructed);
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
  options: { csrfEnabled?: boolean; landingCheckins?: LandingCheckinReader; nullcityControl?: CityServices['nullcityControl'] } = {},
): CityServices {
  const config = cityConfigFromEnv({
    LANDING_AUTH_BASE_URL: 'https://oniondao.dev',
    LANDING_DATABASE_URL: 'postgres://readonly@example.test/landing',
    CITY_DATABASE_URL: 'postgres://city@example.test/city',
    NODE_ENV: options.csrfEnabled ? 'production' : 'test',
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

function authHeaders(csrfToken?: string): Record<string, string> {
  return { cookie: csrfToken ? `session=test-token; city_csrf=${csrfToken}` : 'session=test-token' };
}

async function route(request: Request, services: CityServices): Promise<Response> {
  const response = await routeCityApi(request, new URL(request.url), services);
  if (!response) throw new Error(`No route for ${request.url}`);
  return response;
}
