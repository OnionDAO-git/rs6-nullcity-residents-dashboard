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
