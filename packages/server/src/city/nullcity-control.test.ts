import { afterEach, describe, expect, test } from 'bun:test';
import { createNullCityControlClient } from './nullcity-control';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('createNullCityControlClient', () => {
  test('lists controller Soul proposals with bearer auth', async () => {
    const calls: Array<{ url: string; method: string; authorization: string | null; signal: boolean }> = [];
    globalThis.fetch = (async (input, init) => {
      calls.push({
        url: String(input),
        method: init?.method || 'GET',
        authorization: new Headers(init?.headers).get('authorization'),
        signal: init?.signal instanceof AbortSignal,
      });
      return new Response(
        JSON.stringify([
          {
            schemaVersion: 1,
            id: 'proposal-1',
            residentName: 'res:lantern',
            soulMarkdown: '---\nname: res:lantern\n---\n',
            goalText: 'Keep the square lit.',
            apThreshold: 100,
            apFunded: 40,
            proposerCityUserId: 'city-user-1',
            status: 'funding',
            createdAt: '2026-05-30T07:00:00.000Z',
            updatedAt: '2026-05-30T07:01:00.000Z',
          },
        ]),
        { headers: { 'content-type': 'application/json' } },
      );
    }) as typeof fetch;

    const client = createNullCityControlClient({
      baseUrl: 'http://controller.test/api/nullcity/',
      token: 'city-token',
    });

    const proposals = await client.listProposals();

    expect(calls).toEqual([
      {
        url: 'http://controller.test/api/nullcity/proposals',
        method: 'GET',
        authorization: 'Bearer city-token',
        signal: true,
      },
    ]);
    expect(proposals[0]).toMatchObject({ id: 'proposal-1', residentName: 'res:lantern', status: 'funding' });
  });

  test('posts approve, reject, and birth operations to the controller proposal routes', async () => {
    const calls: Array<{ url: string; body: unknown }> = [];
    globalThis.fetch = (async (input, init) => {
      calls.push({ url: String(input), body: init?.body ? JSON.parse(String(init.body)) : undefined });
      return new Response(JSON.stringify({ ok: true, id: 'proposal-1', status: 'approved' }), {
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;

    const client = createNullCityControlClient({
      baseUrl: 'http://controller.test/api/nullcity',
      token: 'city-token',
    });

    await client.approveProposal('proposal-1', 'ready');
    await client.rejectProposal('proposal-2', 'duplicate');
    await client.birthProposal('proposal-3');

    expect(calls).toEqual([
      { url: 'http://controller.test/api/nullcity/proposals/proposal-1/approve', body: { adminNotes: 'ready' } },
      { url: 'http://controller.test/api/nullcity/proposals/proposal-2/reject', body: { adminNotes: 'duplicate' } },
      { url: 'http://controller.test/api/nullcity/proposals/proposal-3/birth', body: {} },
    ]);
  });

  test('lists controller NCRI records with bearer auth', async () => {
    const calls: Array<{ url: string; method: string; authorization: string | null }> = [];
    globalThis.fetch = (async (input, init) => {
      calls.push({
        url: String(input),
        method: init?.method || 'GET',
        authorization: new Headers(init?.headers).get('authorization'),
      });
      return new Response(
        JSON.stringify([
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
        ]),
        { headers: { 'content-type': 'application/json' } },
      );
    }) as typeof fetch;

    const client = createNullCityControlClient({
      baseUrl: 'http://controller.test/api/nullcity',
      token: 'city-token',
    });

    const records = await client.listNcri();

    expect(calls).toEqual([
      {
        url: 'http://controller.test/api/nullcity/ncri',
        method: 'GET',
        authorization: 'Bearer city-token',
      },
    ]);
    expect(records[0]).toMatchObject({
      id: 'ncri-1',
      displayName: 'Abyssal Whip of the City',
      approvalStatus: 'approved',
      redemptionStatus: 'available',
    });
  });

  test('fetches the controller live economy snapshot with bounded query params', async () => {
    const calls: string[] = [];
    globalThis.fetch = (async input => {
      calls.push(String(input));
      return new Response(
        JSON.stringify({
          asOf: '2026-05-30T17:47:00.000Z',
          window: { since: '2026-05-30T17:32:00.000Z', windowMs: 900000 },
          city: { residentCount: 23, activeResidentCount: 4, attentionTotal: 12500, attentionDelta: 250, gpNetDelta: -40 },
          countsByKind: { ap_topup: 2, gp_traded: 1 },
          topResidentsByAttention: [{ residentName: 'res:hans', attentionBalance: 5000, gpNetDelta: 0, eventCount: 1, windowEventCount: 1, activeInWindow: true, online: true }],
          residents: [],
          recentEvents: [{ id: 'evt-1', ts: '2026-05-30T17:45:00.000Z', kind: 'ap_topup', residentName: 'res:hans', cityUserId: '<patron #1>', apDelta: 50 }],
          pendingProposals: [{ proposalId: 'proposal-1', residentName: 'res:lantern', goalText: 'Keep the square lit.', apFunded: 80, apThreshold: 100, status: 'funding' }],
        }),
        { headers: { 'content-type': 'application/json' } },
      );
    }) as typeof fetch;

    const client = createNullCityControlClient({
      baseUrl: 'http://controller.test/api/nullcity',
      token: 'city-token',
    });

    const snapshot = await client.liveEconomy!({ limit: 5, residentLimit: 3 });

    expect(calls).toEqual(['http://controller.test/api/nullcity/economy/live?limit=5&residentLimit=3']);
    expect(snapshot.city).toMatchObject({ residentCount: 23, activeResidentCount: 4, attentionDelta: 250 });
    expect(snapshot.recentEvents[0]).toMatchObject({ cityUserId: '<patron #1>', residentName: 'res:hans' });
    expect(snapshot.pendingProposals[0]).toMatchObject({ residentName: 'res:lantern', apFunded: 80 });
  });

  test('fetches the controller economy heartbeat with bearer auth', async () => {
    const calls: Array<{ url: string; authorization: string | null }> = [];
    globalThis.fetch = (async (input, init) => {
      calls.push({
        url: String(input),
        authorization: new Headers(init?.headers).get('authorization'),
      });
      return new Response(
        JSON.stringify({
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
        { headers: { 'content-type': 'application/json' } },
      );
    }) as typeof fetch;

    const client = createNullCityControlClient({
      baseUrl: 'http://controller.test/api/nullcity',
      token: 'city-token',
    });

    const heartbeat = await client.economyHeartbeat!();

    expect(calls).toEqual([
      {
        url: 'http://controller.test/api/nullcity/economy/heartbeat',
        authorization: 'Bearer city-token',
      },
    ]);
    expect(heartbeat).toMatchObject({
      residentCount: 25,
      activeResidentCount: 23,
      economyEventCount: 28,
      degradedFlags: [],
    });
  });

  test('fetches the controller NCRI economy listings with bearer auth', async () => {
    const calls: Array<{ url: string; authorization: string | null }> = [];
    globalThis.fetch = (async (input, init) => {
      calls.push({
        url: String(input),
        authorization: new Headers(init?.headers).get('authorization'),
      });
      return new Response(
        JSON.stringify({
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
        { headers: { 'content-type': 'application/json' } },
      );
    }) as typeof fetch;

    const client = createNullCityControlClient({
      baseUrl: 'http://controller.test/api/nullcity',
      token: 'city-token',
    });

    const response = await client.economyListings!();

    expect(calls).toEqual([
      {
        url: 'http://controller.test/api/nullcity/economy/listings',
        authorization: 'Bearer city-token',
      },
    ]);
    expect(response.listings[0]).toMatchObject({
      ncriId: 'ncri-1',
      displayName: 'Abyssal Whip of the City',
      sourceResidentName: 'res:hans',
      listed: true,
    });
  });

  test('fetches the controller NCRI print queue with status query and bearer auth', async () => {
    const calls: Array<{ url: string; authorization: string | null }> = [];
    globalThis.fetch = (async (input, init) => {
      calls.push({
        url: String(input),
        authorization: new Headers(init?.headers).get('authorization'),
      });
      return new Response(
        JSON.stringify({
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
        }),
        { headers: { 'content-type': 'application/json' } },
      );
    }) as typeof fetch;

    const client = createNullCityControlClient({
      baseUrl: 'http://controller.test/api/nullcity',
      token: 'city-token',
    });

    const response = await client.ncriPrintQueue!({ status: 'awaiting_redemption' });

    expect(calls).toEqual([
      {
        url: 'http://controller.test/api/nullcity/ncri/print-queue?status=awaiting_redemption',
        authorization: 'Bearer city-token',
      },
    ]);
    expect(response.items[0]).toMatchObject({
      ncriId: 'ncri-1',
      displayName: 'Tinderbox of the Flame',
      cityUserId: 'city-user:alice',
      status: 'awaiting_redemption',
      gpRedemptionCost: 500,
      printable: true,
    });
  });

  test('posts AP-for-GP exchanges to the controller resident route', async () => {
    const calls: Array<{ url: string; method: string; authorization: string | null; body: unknown }> = [];
    globalThis.fetch = (async (input, init) => {
      calls.push({
        url: String(input),
        method: init?.method || 'GET',
        authorization: new Headers(init?.headers).get('authorization'),
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      });
      return new Response(
        JSON.stringify({
          schemaVersion: 1,
          exchangeId: 'apgp:res:angler:exchange-1',
          idempotencyKey: 'exchange-1',
          resident: 'res:angler',
          apAmount: 50,
          gpAmount: 25,
          status: 'complete',
          apEvidence: { creditedAmount: 50, attentionBefore: 24953, attentionAfter: 25003 },
          gpEvidence: { itemId: 995, burnedAmount: 25, remainingAmount: 250 },
          createdAt: '2026-05-30T18:24:03.201Z',
          completedAt: '2026-05-30T18:24:03.202Z',
        }),
        { headers: { 'content-type': 'application/json' } },
      );
    }) as typeof fetch;

    const client = createNullCityControlClient({
      baseUrl: 'http://controller.test/api/nullcity',
      token: 'city-token',
    });

    const exchange = await client.exchangeApForGp!('res:angler', {
      idempotencyKey: 'exchange-1',
      apAmount: 50,
      gpAmount: 25,
      cityUserId: 'city-user:operator',
      sourceType: 'dashboard_operator',
      sourceId: 'dashboard-1',
    });

    expect(calls).toEqual([
      {
        url: 'http://controller.test/api/nullcity/residents/res%3Aangler/ap-gp-exchanges',
        method: 'POST',
        authorization: 'Bearer city-token',
        body: {
          idempotencyKey: 'exchange-1',
          apAmount: 50,
          gpAmount: 25,
          cityUserId: 'city-user:operator',
          sourceType: 'dashboard_operator',
          sourceId: 'dashboard-1',
        },
      },
    ]);
    expect(exchange).toMatchObject({
      exchangeId: 'apgp:res:angler:exchange-1',
      resident: 'res:angler',
      status: 'complete',
      apEvidence: { attentionAfter: 25003 },
      gpEvidence: { remainingAmount: 250 },
    });
  });

  test('preserves failed AP-for-GP exchange evidence from controller conflicts', async () => {
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          schemaVersion: 1,
          exchangeId: 'apgp:res:angler:exchange-2',
          idempotencyKey: 'exchange-2',
          resident: 'res:angler',
          apAmount: 50,
          gpAmount: 5000,
          status: 'failed_gp',
          failureReason: 'resident lacks enough GP item 995',
          gpEvidence: { itemId: 995, burnedAmount: 0, remainingAmount: 250 },
          createdAt: '2026-05-30T18:25:03.201Z',
        }),
        { status: 409, headers: { 'content-type': 'application/json' } },
      )) as unknown as typeof fetch;

    const client = createNullCityControlClient({
      baseUrl: 'http://controller.test/api/nullcity',
      token: 'city-token',
    });

    const exchange = await client.exchangeApForGp!('res:angler', {
      idempotencyKey: 'exchange-2',
      apAmount: 50,
      gpAmount: 5000,
    });

    expect(exchange).toMatchObject({
      exchangeId: 'apgp:res:angler:exchange-2',
      resident: 'res:angler',
      status: 'failed_gp',
      failureReason: 'resident lacks enough GP item 995',
      gpEvidence: { burnedAmount: 0, remainingAmount: 250 },
    });
  });

  test('rejects malformed proposal lists before the UI can render them', async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ proposals: [{ id: 'proposal-1' }] }), {
        headers: { 'content-type': 'application/json' },
      })) as unknown as typeof fetch;

    const client = createNullCityControlClient({
      baseUrl: 'http://controller.test/api/nullcity',
      token: 'city-token',
    });

    await expect(client.listProposals()).rejects.toMatchObject({
      name: 'NullCityControlError',
      status: 502,
      message: 'invalid_proposal_list',
    });
  });

  test('rejects malformed NCRI lists before the UI can render them', async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ ncri: [{ id: 'ncri-1' }] }), {
        headers: { 'content-type': 'application/json' },
      })) as unknown as typeof fetch;

    const client = createNullCityControlClient({
      baseUrl: 'http://controller.test/api/nullcity',
      token: 'city-token',
    });

    await expect(client.listNcri()).rejects.toMatchObject({
      name: 'NullCityControlError',
      status: 502,
      message: 'invalid_ncri_list',
    });
  });

  test('rejects malformed live economy snapshots before the UI can render them', async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ city: { residentCount: 'many' } }), {
        headers: { 'content-type': 'application/json' },
      })) as unknown as typeof fetch;

    const client = createNullCityControlClient({
      baseUrl: 'http://controller.test/api/nullcity',
      token: 'city-token',
    });

    await expect(client.liveEconomy!()).rejects.toMatchObject({
      name: 'NullCityControlError',
      status: 502,
      message: 'invalid_live_economy',
    });
  });

  test('rejects malformed economy heartbeat payloads before the UI can render them', async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ residentCount: 'many' }), {
        headers: { 'content-type': 'application/json' },
      })) as unknown as typeof fetch;

    const client = createNullCityControlClient({
      baseUrl: 'http://controller.test/api/nullcity',
      token: 'city-token',
    });

    await expect(client.economyHeartbeat!()).rejects.toMatchObject({
      name: 'NullCityControlError',
      status: 502,
      message: 'invalid_economy_heartbeat',
    });
  });

  test('rejects malformed economy listing payloads before the UI can render them', async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ listings: [{ ncriId: 'ncri-1' }] }), {
        headers: { 'content-type': 'application/json' },
      })) as unknown as typeof fetch;

    const client = createNullCityControlClient({
      baseUrl: 'http://controller.test/api/nullcity',
      token: 'city-token',
    });

    await expect(client.economyListings!()).rejects.toMatchObject({
      name: 'NullCityControlError',
      status: 502,
      message: 'invalid_economy_listings',
    });
  });

  test('turns controller timeout failures into a bounded bridge error', async () => {
    globalThis.fetch = (async () => {
      throw new DOMException('The operation timed out.', 'TimeoutError');
    }) as unknown as typeof fetch;

    const client = createNullCityControlClient({
      baseUrl: 'http://controller.test/api/nullcity',
      token: 'city-token',
      timeoutMs: 5,
    });

    await expect(client.listProposals()).rejects.toMatchObject({
      name: 'NullCityControlError',
      status: 504,
      message: 'controller_timeout',
    });
  });
});
