import { describe, expect, test } from 'bun:test';
import { InMemoryCityStore } from './memory-store';
import { runAttentionGrant } from './attention-grant';
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

  test('marks intent failed when the City call throws (and rethrows)', async () => {
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
  });
});

describe('attention_grant_intents migration', () => {
  test('003 migration creates the table with the saga state CHECK', () => {
    const m = cityMigrations.find(x => x.id === '003_attention_grant_intents');
    expect(m).toBeDefined();
    expect(m!.sql).toContain('CREATE TABLE IF NOT EXISTS attention_grant_intents');
    expect(m!.sql).toContain("state IN ('created', 'debited', 'sent_to_city', 'settled', 'failed')");
    expect(m!.sql).toContain('UNIQUE (city_user_id, idempotency_key)');
  });
});
