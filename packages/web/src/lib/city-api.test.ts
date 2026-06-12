import { afterEach, describe, expect, test } from 'bun:test';
import { CityApiError, cityApi, optionalCityRead, residentTradeSummary, residentTradeTone, setCityCsrfToken } from './city-api';

const originalFetch = globalThis.fetch;
const originalEventSource = globalThis.EventSource;

afterEach(() => {
  globalThis.fetch = originalFetch;
  globalThis.EventSource = originalEventSource;
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

  test('treats missing optional city read models as absent instead of fatal', async () => {
    await expect(optionalCityRead(Promise.reject(new CityApiError(404, 'not_found')))).resolves.toBeUndefined();
    await expect(optionalCityRead(Promise.resolve({ resident: { id: 'resident-1' } }))).resolves.toEqual({
      resident: { id: 'resident-1' },
    });
    await expect(optionalCityRead(Promise.reject(new CityApiError(500, 'bridge_down')))).rejects.toMatchObject({
      status: 500,
      message: 'bridge_down',
    });
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

  test('posts OnionDAO-backed resident attention grants', async () => {
    const calls: Array<{ path: string; method: string; body: unknown; csrf: string | null }> = [];
    globalThis.fetch = (async (input, init) => {
      calls.push({
        path: String(input),
        method: init?.method || 'GET',
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
        csrf: new Headers(init?.headers).get('x-csrf-token'),
      });
      return new Response(JSON.stringify({
        status: 'settled',
        residentId: 'res:fern',
        onionRequest: { id: 'req-1', status: 'completed', amount: 25 },
      }), {
        status: 202,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;

    setCityCsrfToken('csrf-123');
    await cityApi.grantResidentOnionAttention('res:fern', {
      onionAmount: 25,
      memo: 'Focus Fern',
      idempotencyKey: 'onion-1',
    });

    expect(calls).toEqual([{
      path: '/api/city/residents/res%3Afern/onion-attention-grants',
      method: 'POST',
      body: { onionAmount: 25, memo: 'Focus Fern', idempotencyKey: 'onion-1' },
      csrf: 'csrf-123',
    }]);
  });

  test('posts human feedback with CSRF and page context', async () => {
    const calls: Array<{ path: string; method: string; body: unknown; csrf: string | null }> = [];
    globalThis.fetch = (async (input, init) => {
      calls.push({
        path: String(input),
        method: init?.method || 'GET',
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
        csrf: new Headers(init?.headers).get('x-csrf-token'),
      });
      return new Response(JSON.stringify({
        feedback: {
          id: 'feedback-1',
          createdAt: '2026-06-12T12:00:00.000Z',
        },
      }), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;

    setCityCsrfToken('csrf-123');
    await cityApi.submitFeedback({
      feeling: 'confused',
      tryingToDo: 'Give attention',
      message: 'I do not know what to do next.',
      route: '/residents/hans',
      mode: 'simple',
      allowFollowUp: false,
    });

    expect(calls).toEqual([{
      path: '/api/feedback',
      method: 'POST',
      body: {
        feeling: 'confused',
        tryingToDo: 'Give attention',
        message: 'I do not know what to do next.',
        route: '/residents/hans',
        mode: 'simple',
        allowFollowUp: false,
      },
      csrf: 'csrf-123',
    }]);
  });

  test('calls the admin human feedback endpoint with a limit', async () => {
    const calls: Array<{ path: string; method: string }> = [];
    globalThis.fetch = (async (input, init) => {
      calls.push({
        path: String(input),
        method: init?.method || 'GET',
      });
      return new Response(JSON.stringify({ feedback: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;

    await cityApi.adminFeedback({ limit: 25 });

    expect(calls).toEqual([
      { path: '/api/admin/feedback?limit=25', method: 'GET' },
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

  test('calls the admin NCRI print queue endpoint with status filter', async () => {
    const calls: Array<{ path: string; method: string }> = [];
    globalThis.fetch = (async (input, init) => {
      calls.push({
        path: String(input),
        method: init?.method || 'GET',
      });
      return new Response(JSON.stringify({ available: true, asOf: '2026-05-30T19:40:00.000Z', items: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;

    await cityApi.adminNullcityNcriPrintQueue({ status: 'awaiting_redemption' });

    expect(calls).toEqual([
      { path: '/api/admin/nullcity/ncri/print-queue?status=awaiting_redemption', method: 'GET' },
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

  test('calls the public Null City economy heartbeat endpoint', async () => {
    const calls: string[] = [];
    globalThis.fetch = (async input => {
      calls.push(String(input));
      return new Response(JSON.stringify({ available: true, heartbeat: { residentCount: 25 } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;

    await cityApi.nullcityEconomyHeartbeat();

    expect(calls).toEqual(['/api/nullcity/economy/heartbeat']);
  });

  test('opens the public Null City economy stream endpoint with query params', () => {
    class FakeEventSource {
      constructor(readonly url: string) {}
      close() {}
      addEventListener() {}
      removeEventListener() {}
      dispatchEvent() { return true; }
      onerror = null;
      onmessage = null;
      onopen = null;
      readyState = 0;
      withCredentials = false;
      readonly CONNECTING = 0;
      readonly OPEN = 1;
      readonly CLOSED = 2;
    }
    globalThis.EventSource = FakeEventSource as unknown as typeof EventSource;

    const stream = cityApi.nullcityEconomyStream({ limit: 5, residentLimit: 3, intervalMs: 1500 });

    expect((stream as unknown as { url: string }).url).toBe('/api/nullcity/economy/stream?limit=5&residentLimit=3&intervalMs=1500');
  });

  test('calls the admin Null City economy listings endpoint', async () => {
    const calls: Array<{ path: string; method: string }> = [];
    globalThis.fetch = (async (input, init) => {
      calls.push({
        path: String(input),
        method: init?.method || 'GET',
      });
      return new Response(JSON.stringify({ available: true, asOf: '2026-05-30T18:52:00.000Z', listings: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;

    await cityApi.adminNullcityEconomyListings();

    expect(calls).toEqual([
      { path: '/api/admin/nullcity/economy/listings', method: 'GET' },
    ]);
  });

  test('calls the admin AP-for-GP exchange endpoint', async () => {
    const calls: Array<{ path: string; method: string; body: unknown; csrf: string | null }> = [];
    globalThis.fetch = (async (input, init) => {
      calls.push({
        path: String(input),
        method: init?.method || 'GET',
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
        csrf: new Headers(init?.headers).get('x-csrf-token'),
      });
      return new Response(JSON.stringify({ available: true, exchange: { status: 'complete' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;

    setCityCsrfToken('csrf-123');
    await cityApi.exchangeNullcityApForGp('res:angler', {
      idempotencyKey: 'exchange-1',
      apAmount: 50,
      gpAmount: 25,
      cityUserId: 'city-user:operator',
    });

    expect(calls).toEqual([
      {
        path: '/api/admin/nullcity/residents/res%3Aangler/ap-gp-exchanges',
        method: 'POST',
        body: {
          idempotencyKey: 'exchange-1',
          apAmount: 50,
          gpAmount: 25,
          cityUserId: 'city-user:operator',
        },
        csrf: 'csrf-123',
      },
    ]);
  });
});
