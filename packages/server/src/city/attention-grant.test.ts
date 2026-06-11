import { describe, expect, test } from 'bun:test';
import { InMemoryCityStore } from './memory-store';
import { runAttentionGrant, settleOnionAttentionGrant } from './attention-grant';
import { cityMigrations } from './migrations/schema';
import type { NullCityControlClient } from './nullcity-control';
import type { LandingSessionUser } from './types';

const landingUser: LandingSessionUser = {
  id: 'landing-1',
  email: 'a@b.c',
  name: 'A',
  handle: 'a',
  avatarUrl: null,
  isAdmin: false,
  profileClaimed: true,
};

async function seededStore(): Promise<{ store: InMemoryCityStore; cityUserId: string }> {
  const store = new InMemoryCityStore();
  const cityUser = await store.upsertUserFromLanding(landingUser);
  await store.appendPointLedger({ cityUserId: cityUser.id, resource: 'AP', delta: 750, sourceType: 'seed', sourceId: 's1' });
  return { store, cityUserId: cityUser.id };
}

function fakeControl(spy: { calls: Array<{ resident: string; body: Record<string, unknown> }> }): Pick<NullCityControlClient, 'creditAttention'> {
  return {
    creditAttention: async (resident, body) => {
      spy.calls.push({ resident, body: body as unknown as Record<string, unknown> });
      return { ok: true as const, resident, attentionBefore: 0, attentionAfter: body.amount, creditedAmount: body.amount };
    },
  };
}

async function apBalance(store: InMemoryCityStore, cityUserId: string): Promise<number> {
  const balances = await store.getPointBalances(cityUserId);
  return balances.find(b => b.resource === 'AP')?.balance ?? 0;
}

describe('runAttentionGrant', () => {
  test('approved support: intent + stand-in debit + creditAttention + settled (no mock flag)', async () => {
    const { store, cityUserId } = await seededStore();
    const spy = { calls: [] as Array<{ resident: string; body: Record<string, unknown> }> };

    const result = await runAttentionGrant(
      { store, control: fakeControl(spy) },
      { cityUserId, residentId: 'res:fern', apAmount: 125, idempotencyKey: 'att-1' },
    );

    expect((result as unknown as Record<string, unknown>).mocked).toBeUndefined();
    expect(result.intent.state).toBe('settled');
    expect(result.intent.standinLedgerEntryId).toBeDefined();
    expect(result.ledger.delta).toBe(-125);
    expect(result.ledger.metadata).toMatchObject({ standin: true, nonProduction: true });
    expect(await apBalance(store, cityUserId)).toBe(625);
    expect(spy.calls).toHaveLength(1);
    expect(spy.calls[0]).toMatchObject({
      resident: 'res:fern',
      body: { amount: 125, idempotencyKey: 'att-1', cityUserId, personId: 'landing-1', patronHandle: 'a' },
    });
  });

  test('idempotent under repeated key: debit once, one intent, one city call', async () => {
    const { store, cityUserId } = await seededStore();
    const spy = { calls: [] as Array<{ resident: string; body: Record<string, unknown> }> };
    const args = { cityUserId, residentId: 'res:fern', apAmount: 125, idempotencyKey: 'att-1' };

    await runAttentionGrant({ store, control: fakeControl(spy) }, args);
    const replay = await runAttentionGrant({ store, control: fakeControl(spy) }, args);

    expect(await apBalance(store, cityUserId)).toBe(625); // debited once
    expect(spy.calls).toHaveLength(1); // City credited once
    expect(replay.intent.state).toBe('settled');
  });

  test('rejects non-positive amounts', async () => {
    const { store, cityUserId } = await seededStore();
    const spy = { calls: [] as Array<{ resident: string; body: Record<string, unknown> }> };
    await expect(
      runAttentionGrant({ store, control: fakeControl(spy) }, { cityUserId, residentId: 'res:fern', apAmount: 0, idempotencyKey: 'bad' }),
    ).rejects.toMatchObject({ status: 400 });
  });

  test('marks intent failed when the City call throws — and does NOT strand AP (debit-after-credit)', async () => {
    const { store, cityUserId } = await seededStore();
    const control: Pick<NullCityControlClient, 'creditAttention'> = {
      creditAttention: async () => {
        throw new Error('controller_unreachable');
      },
    };
    await expect(
      runAttentionGrant({ store, control }, { cityUserId, residentId: 'res:fern', apAmount: 50, idempotencyKey: 'fail-1' }),
    ).rejects.toThrow('controller_unreachable');
    const intent = await store.getAttentionGrantIntent(cityUserId, 'fail-1');
    expect(intent?.state).toBe('failed');
    expect(intent?.failureReason).toContain('controller_unreachable');
    // The whole point of debit-after-credit: a failed City call leaves AP untouched.
    expect(await apBalance(store, cityUserId)).toBe(750);
  });

  test('debit-fails-after-credit marks the intent failed (not stuck in sent_to_city)', async () => {
    const { store, cityUserId } = await seededStore();
    const spy = { calls: [] as Array<{ resident: string; body: Record<string, unknown> }> };
    // Wrap the store so the stand-in debit throws AFTER the (idempotent) City credit.
    const failingStore = new Proxy(store, {
      get(target, prop, receiver) {
        if (prop === 'appendPointLedger') {
          return async (input: { sourceType: string }) => {
            if (input.sourceType === 'attention_grant_standin') throw new Error('debit_blew_up');
            return (target as InMemoryCityStore).appendPointLedger(input as never);
          };
        }
        return Reflect.get(target, prop, receiver);
      },
    }) as InMemoryCityStore;

    await expect(
      runAttentionGrant({ store: failingStore, control: fakeControl(spy) }, { cityUserId, residentId: 'res:fern', apAmount: 50, idempotencyKey: 'debitfail-1' }),
    ).rejects.toThrow('debit_blew_up');

    expect(spy.calls).toHaveLength(1); // City WAS credited
    const intent = await store.getAttentionGrantIntent(cityUserId, 'debitfail-1');
    expect(intent?.state).toBe('failed'); // not stuck in sent_to_city
    expect(intent?.failureReason).toContain('city_credited_debit_failed');
  });

  test('rejects insufficient funds (409) before crediting City or debiting', async () => {
    const store = new InMemoryCityStore();
    const cityUser = await store.upsertUserFromLanding(landingUser);
    await store.appendPointLedger({ cityUserId: cityUser.id, resource: 'AP', delta: 30, sourceType: 'seed', sourceId: 's1' });
    const spy = { calls: [] as Array<{ resident: string; body: Record<string, unknown> }> };

    await expect(
      runAttentionGrant({ store, control: fakeControl(spy) }, { cityUserId: cityUser.id, residentId: 'res:fern', apAmount: 125, idempotencyKey: 'poor-1' }),
    ).rejects.toMatchObject({ status: 409 });

    expect(spy.calls).toHaveLength(0); // City never credited
    expect(await apBalance(store, cityUser.id)).toBe(30); // nothing debited
    const intent = await store.getAttentionGrantIntent(cityUser.id, 'poor-1');
    expect(intent?.state).toBe('failed');
  });
});

describe('settleOnionAttentionGrant', () => {
  test('claims settlement before crediting City so concurrent callbacks do not double-credit', async () => {
    const { store, cityUserId } = await seededStore();
    const intent = await store.createAttentionGrantIntent({
      cityUserId,
      residentId: 'res:fern',
      apAmount: 40,
      idempotencyKey: 'onion-race-1',
    });
    await store.updateAttentionGrantIntent(intent.id, {
      state: 'awaiting_approval',
      onionRequestId: 'onion-request-race',
    });

    let releaseCredit!: () => void;
    const creditGate = new Promise<void>(resolve => {
      releaseCredit = resolve;
    });
    const spy = { calls: [] as Array<{ resident: string; body: Record<string, unknown> }> };
    const control: Pick<NullCityControlClient, 'creditAttention'> = {
      creditAttention: async (resident, body) => {
        spy.calls.push({ resident, body: body as unknown as Record<string, unknown> });
        await creditGate;
        return { ok: true as const, resident, attentionBefore: 5, attentionAfter: 45, creditedAmount: 40 };
      },
    };

    const first = settleOnionAttentionGrant(
      { store, control },
      { onionRequestId: 'onion-request-race', status: 'completed', success: true },
    );
    while (spy.calls.length === 0) await new Promise(resolve => setTimeout(resolve, 0));

    const second = await settleOnionAttentionGrant(
      { store, control },
      { onionRequestId: 'onion-request-race', status: 'completed', success: true },
    );
    releaseCredit();
    const firstResult = await first;

    expect(second).toMatchObject({ settled: false, state: 'settling' });
    expect(firstResult).toMatchObject({ settled: true, state: 'settled' });
    expect(spy.calls).toHaveLength(1);
  });
});

describe('attention_grant_intents migration', () => {
  test('003 migration creates the table with the saga state CHECK', () => {
    const m = cityMigrations.find(x => x.id === '003_attention_grant_intents');
    expect(m).toBeDefined();
    expect(m!.sql).toContain('CREATE TABLE IF NOT EXISTS attention_grant_intents');
    expect(m!.sql).toContain("state IN ('created', 'debited', 'sent_to_city', 'settling', 'settled', 'failed')");
    expect(m!.sql).toContain('UNIQUE (city_user_id, idempotency_key)');
  });

  test('004 migration allows real-spend states including settling', () => {
    const m = cityMigrations.find(x => x.id === '004_attention_grant_real_spend');
    expect(m).toBeDefined();
    expect(m!.sql).toContain("state IN ('created', 'debited', 'sent_to_city', 'awaiting_approval', 'settling', 'settled', 'denied', 'failed')");
  });
});
