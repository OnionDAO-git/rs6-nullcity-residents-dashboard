import { afterEach, describe, expect, test } from 'bun:test';
import { CityApiError, cityApi, residentTradeSummary, residentTradeTone, setCityCsrfToken } from './city-api';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  setCityCsrfToken(undefined);
});

describe('cityApi', () => {
  test('sends CSRF only on mutating requests', async () => {
    const calls: Array<{ path: string; headers: Headers; method: string }> = [];
    globalThis.fetch = (async (input, init) => {
      calls.push({
        path: String(input),
        headers: new Headers(init?.headers),
        method: init?.method || 'GET',
      });
      return new Response(JSON.stringify(input === '/api/session' ? { authenticated: false, loginUrl: '/login' } : { ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;

    setCityCsrfToken('csrf-123');
    await cityApi.session();
    await cityApi.syncCheckins();

    expect(calls[0]?.path).toBe('/api/session');
    expect(calls[0]?.headers.get('x-csrf-token')).toBeNull();
    expect(calls[1]?.path).toBe('/api/points/sync-checkins');
    expect(calls[1]?.method).toBe('POST');
    expect(calls[1]?.headers.get('x-csrf-token')).toBe('csrf-123');
  });

  test('turns unauthenticated responses into login-aware errors', async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ error: 'unauthenticated', loginUrl: '/login?returnTo=%2Fprofile' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      })) as unknown as typeof fetch;

    await expect(cityApi.profile()).rejects.toMatchObject({
      name: 'CityApiError',
      status: 401,
      message: 'unauthenticated',
      loginUrl: '/login?returnTo=%2Fprofile',
    } satisfies Partial<CityApiError>);
  });

  test('summarizes resident trades without claiming in-game coin settlement', () => {
    const summary = residentTradeSummary({
      id: 'trade-1',
      cityUserId: 'city-user-1',
      residentId: 'res:hans',
      status: 'pending_nullcity',
      offeredResource: 'AP',
      offeredAmount: 25,
      requestedItem: 'coin-995 GP',
      pointLedgerEntryId: 'ledger-1',
      metadata: { mocked: true },
      createdAt: '2026-05-30T04:00:00.000Z',
      updatedAt: '2026-05-30T04:00:00.000Z',
    });

    expect(summary.title).toBe('25 AP offered to res:hans');
    expect(summary.detail).toBe('Request: coin-995 GP · pending with Null City · settlement not yet proven in-game');
    expect(residentTradeTone('pending_nullcity')).toBe('warn');
    expect(residentTradeTone('accepted')).toBe('ok');
    expect(residentTradeTone('failed')).toBe('fail');
  });

  test('calls controller-backed Soul proposal admin endpoints', async () => {
    const calls: Array<{ path: string; method: string; body: unknown }> = [];
    globalThis.fetch = (async (input, init) => {
      calls.push({
        path: String(input),
        method: init?.method || 'GET',
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      });
      return new Response(JSON.stringify({ available: true, proposals: [], ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;

    setCityCsrfToken('csrf-123');

    await cityApi.adminNullcityProposals();
    await cityApi.approveNullcityProposal('proposal-1', 'ready');
    await cityApi.rejectNullcityProposal('proposal-2', 'duplicate');
    await cityApi.birthNullcityProposal('proposal-3');

    expect(calls).toEqual([
      { path: '/api/admin/nullcity/proposals', method: 'GET', body: undefined },
      { path: '/api/admin/nullcity/proposals/proposal-1/approve', method: 'POST', body: { adminNotes: 'ready' } },
      { path: '/api/admin/nullcity/proposals/proposal-2/reject', method: 'POST', body: { adminNotes: 'duplicate' } },
      { path: '/api/admin/nullcity/proposals/proposal-3/birth', method: 'POST', body: {} },
    ]);
  });

  test('calls controller-backed NCRI admin endpoint', async () => {
    const calls: Array<{ path: string; method: string; body: unknown }> = [];
    globalThis.fetch = (async (input, init) => {
      calls.push({
        path: String(input),
        method: init?.method || 'GET',
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      });
      return new Response(JSON.stringify({ available: true, records: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;

    await cityApi.adminNullcityNcri();

    expect(calls).toEqual([
      { path: '/api/admin/nullcity/ncri', method: 'GET', body: undefined },
    ]);
  });

  test('calls the public Null City live economy endpoint', async () => {
    const calls: string[] = [];
    globalThis.fetch = (async input => {
      calls.push(String(input));
      return new Response(JSON.stringify({ available: true, snapshot: { city: { residentCount: 23 } } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;

    await cityApi.nullcityEconomyLive({ limit: 5, residentLimit: 3 });

    expect(calls).toEqual(['/api/nullcity/economy/live?limit=5&residentLimit=3']);
  });
});
