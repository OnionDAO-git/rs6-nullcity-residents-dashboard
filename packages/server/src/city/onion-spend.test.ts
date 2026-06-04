import { describe, expect, test } from 'bun:test';
import crypto from 'node:crypto';
import { InMemoryCityStore } from './memory-store';
import { initiateOnionAttentionGrant, settleOnionAttentionGrant } from './attention-grant';
import { verifyOnionCallbackSignature, type OnionApiClient } from './landing-onions';
import type { NullCityControlClient } from './nullcity-control';
import type { LandingSessionUser } from './types';

const landingUser: LandingSessionUser = {
  id: 'landing-1', email: 'a@b.c', name: 'Alice', handle: 'alice', avatarUrl: null, isAdmin: false, profileClaimed: true,
};

async function seed(): Promise<{ store: InMemoryCityStore; cityUserId: string }> {
  const store = new InMemoryCityStore();
  const cityUser = await store.upsertUserFromLanding(landingUser);
  return { store, cityUserId: cityUser.id };
}

function fakeOnionApi(spy: { burns: unknown[] }, requestId = 'req-1'): OnionApiClient {
  return {
    createBurnRequest: async input => {
      spy.burns.push(input);
      return { id: requestId, status: 'pending' };
    },
    getRequestStatus: async id => ({ id, requestType: 'burn', status: 'pending', amount: 0, currencyMode: 'points', solanaSignature: null, error: null }),
  };
}

function fakeControl(spy: { credits: Array<{ resident: string; body: Record<string, unknown> }> }): Pick<NullCityControlClient, 'creditAttention'> {
  return {
    creditAttention: async (resident, body) => {
      spy.credits.push({ resident, body: body as unknown as Record<string, unknown> });
      return { ok: true as const, resident, attentionBefore: 0, attentionAfter: body.amount, creditedAmount: body.amount };
    },
  };
}

describe('initiateOnionAttentionGrant (real consent-spend)', () => {
  test('creates a burn request + awaiting_approval intent, does NOT credit City', async () => {
    const { store, cityUserId } = await seed();
    const onSpy = { burns: [] as unknown[] };
    const result = await initiateOnionAttentionGrant(
      { store, onionApi: fakeOnionApi(onSpy), callbackUrl: 'https://city.test/api/city/onion-callback', callbackSecret: 's', requester: 'nullcity' },
      { cityUserId, username: 'alice', residentId: 'res:fern', amount: 300, idempotencyKey: 'g1' },
    );
    expect(result.status).toBe('pending_approval');
    expect(result.onionRequestId).toBe('req-1');
    expect(result.intent.state).toBe('awaiting_approval');
    expect(result.intent.onionRequestId).toBe('req-1');
    expect(onSpy.burns).toHaveLength(1);
    expect(onSpy.burns[0]).toMatchObject({ username: 'alice', amount: 300, requester: 'nullcity', externalId: 'g1', callbackUrl: 'https://city.test/api/city/onion-callback' });
  });

  test('replay does not create a second burn request', async () => {
    const { store, cityUserId } = await seed();
    const onSpy = { burns: [] as unknown[] };
    const deps = { store, onionApi: fakeOnionApi(onSpy), callbackUrl: 'https://city.test/cb', requester: 'nullcity' };
    const input = { cityUserId, username: 'alice', residentId: 'res:fern', amount: 300, idempotencyKey: 'g1' };
    await initiateOnionAttentionGrant(deps, input);
    await initiateOnionAttentionGrant(deps, input);
    expect(onSpy.burns).toHaveLength(1);
  });
});

describe('settleOnionAttentionGrant (callback)', () => {
  async function initiated() {
    const { store, cityUserId } = await seed();
    const onSpy = { burns: [] as unknown[] };
    await initiateOnionAttentionGrant(
      { store, onionApi: fakeOnionApi(onSpy), callbackUrl: 'https://city.test/cb', requester: 'nullcity' },
      { cityUserId, username: 'alice', residentId: 'res:fern', amount: 300, idempotencyKey: 'g1' },
    );
    return { store, cityUserId };
  }

  test('completed → credits City (with personId/patronHandle) and settles', async () => {
    const { store } = await initiated();
    const spy = { credits: [] as Array<{ resident: string; body: Record<string, unknown> }> };
    const res = await settleOnionAttentionGrant({ store, control: fakeControl(spy) }, { onionRequestId: 'req-1', status: 'completed' });
    expect(res.settled).toBe(true);
    expect(res.state).toBe('settled');
    expect(spy.credits).toHaveLength(1);
    expect(spy.credits[0]).toMatchObject({ resident: 'res:fern', body: { amount: 300, idempotencyKey: 'g1', personId: 'landing-1', patronHandle: 'alice' } });
  });

  test('completed callback is idempotent — re-delivery does not double-credit', async () => {
    const { store } = await initiated();
    const spy = { credits: [] as Array<{ resident: string; body: Record<string, unknown> }> };
    await settleOnionAttentionGrant({ store, control: fakeControl(spy) }, { onionRequestId: 'req-1', status: 'completed' });
    await settleOnionAttentionGrant({ store, control: fakeControl(spy) }, { onionRequestId: 'req-1', status: 'completed' });
    expect(spy.credits).toHaveLength(1);
  });

  test('denied → denied state, no credit', async () => {
    const { store } = await initiated();
    const spy = { credits: [] as Array<{ resident: string; body: Record<string, unknown> }> };
    const res = await settleOnionAttentionGrant({ store, control: fakeControl(spy) }, { onionRequestId: 'req-1', status: 'denied' });
    expect(res.state).toBe('denied');
    expect(spy.credits).toHaveLength(0);
  });

  test('unknown request id → settled:false, no throw', async () => {
    const { store } = await seed();
    const spy = { credits: [] as Array<{ resident: string; body: Record<string, unknown> }> };
    const res = await settleOnionAttentionGrant({ store, control: fakeControl(spy) }, { onionRequestId: 'nope', status: 'completed' });
    expect(res).toMatchObject({ settled: false, state: 'unknown' });
  });
});

describe('verifyOnionCallbackSignature', () => {
  test('accepts a valid HMAC and rejects a bad one', () => {
    const secret = 'shh';
    const body = JSON.stringify({ id: 'req-1', status: 'completed' });
    const sig = crypto.createHmac('sha256', secret).update(body).digest('hex');
    expect(verifyOnionCallbackSignature(body, sig, secret)).toBe(true);
    expect(verifyOnionCallbackSignature(body, 'deadbeef', secret)).toBe(false);
    expect(verifyOnionCallbackSignature(body, null, secret)).toBe(false);
  });
});
