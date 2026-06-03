import { describe, expect, test } from 'bun:test';
import { PostgresCityStore } from './postgres-store';

/**
 * Mock-SQL unit tests for PostgresCityStore. These do NOT run a real Postgres —
 * they inject a fake tagged-template `sql` that routes by query text and returns
 * canned snake_case rows. Their value: they catch the highest-risk class of bug
 * in the untested Postgres path — column-name drift in the row mappers (the
 * snake_case -> camelCase mapping) and method query construction.
 *
 * A real Postgres integration suite (running runCityMigrations + the same
 * behavioural assertions as the in-memory store) is still QUEUED — see the run
 * log. These tests are a floor, not a substitute.
 */
type Rows = Array<Record<string, unknown>>;
type Handler = (query: string, values: unknown[]) => Rows;

function makeSql(handler: Handler): never {
  const fn = (strings: TemplateStringsArray, ...values: unknown[]): Promise<Rows> =>
    Promise.resolve(handler(strings.join(' ? '), values));
  (fn as unknown as { unsafe: (q: string) => Promise<Rows> }).unsafe = async () => [];
  return fn as never;
}

const intentRow = {
  id: 'agi_1',
  city_user_id: 'cu1',
  resident_id: 'res:fern',
  ap_amount: 125,
  idempotency_key: 'k1',
  state: 'settled',
  standin_ledger_entry_id: 'led1',
  city_response: { ok: true, creditedAmount: 125 },
  failure_reason: null,
  created_at: new Date('2026-06-03T00:00:00.000Z'),
  updated_at: new Date('2026-06-03T00:00:00.000Z'),
};

describe('PostgresCityStore (mock-sql; catches mapper column drift)', () => {
  test('resolveOnionId reads landing_user_id', async () => {
    const store = new PostgresCityStore('postgres://fake', makeSql(() => [{ landing_user_id: 'landing-person-1' }]));
    expect(await store.resolveOnionId('cu1')).toBe('landing-person-1');
  });

  test('resolveOnionId throws 404 when the row is missing', async () => {
    const store = new PostgresCityStore('postgres://fake', makeSql(() => []));
    await expect(store.resolveOnionId('missing')).rejects.toMatchObject({ status: 404 });
  });

  test('resolvePatronHandle reads patron_handle / undefined', async () => {
    const withRow = new PostgresCityStore('postgres://fake', makeSql(() => [{ patron_handle: 'alice' }]));
    expect(await withRow.resolvePatronHandle('p1')).toBe('alice');
    const empty = new PostgresCityStore('postgres://fake', makeSql(() => []));
    expect(await empty.resolvePatronHandle('p1')).toBeUndefined();
  });

  test('createAttentionGrantIntent maps every snake_case column to camelCase', async () => {
    const store = new PostgresCityStore('postgres://fake', makeSql(query => (query.includes('INSERT') ? [] : [intentRow])));
    const intent = await store.createAttentionGrantIntent({ cityUserId: 'cu1', residentId: 'res:fern', apAmount: 125, idempotencyKey: 'k1' });
    expect(intent).toMatchObject({
      id: 'agi_1',
      cityUserId: 'cu1',
      residentId: 'res:fern',
      apAmount: 125,
      idempotencyKey: 'k1',
      state: 'settled',
      standinLedgerEntryId: 'led1',
      cityResponse: { ok: true, creditedAmount: 125 },
    });
    expect(intent.failureReason).toBeUndefined(); // null column -> omitted
    expect(typeof intent.createdAt).toBe('string');
  });

  test('updateAttentionGrantIntent maps the RETURNING row (incl. jsonb city_response)', async () => {
    const store = new PostgresCityStore('postgres://fake', makeSql(() => [intentRow]));
    const intent = await store.updateAttentionGrantIntent('agi_1', { state: 'settled', cityResponse: { ok: true } });
    expect(intent.state).toBe('settled');
    expect(intent.cityResponse).toMatchObject({ ok: true });
    expect(intent.standinLedgerEntryId).toBe('led1');
  });

  test('setIdentityAlias issues an upsert without throwing', async () => {
    let called = false;
    const store = new PostgresCityStore('postgres://fake', makeSql(query => { if (query.includes('city_identity_aliases')) called = true; return []; }));
    await store.setIdentityAlias('person-1', 'alice');
    expect(called).toBe(true);
  });
});
