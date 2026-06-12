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
  (fn as unknown as { unsafe: (q: string, values?: unknown[]) => Promise<Rows> }).unsafe = async (q, values = []) =>
    Promise.resolve(handler(q, values));
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

const feedbackRow = {
  id: 'feedback_1',
  city_user_id: 'cu1',
  landing_user_id: 'landing-1',
  display_name: 'Alice',
  handle: 'alice',
  email: 'alice@example.com',
  feeling: 'confused',
  trying_to_do: 'Give attention',
  message: 'I could not find the button.',
  route: '/residents/hans',
  page_url: 'http://localhost:5174/residents/hans',
  mode: 'simple',
  resident_id: 'res:hans',
  allow_follow_up: true,
  user_agent: 'test browser',
  metadata: {},
  created_at: new Date('2026-06-12T12:00:00.000Z'),
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

  test('claimAttentionGrantIntent state-guards the transition and maps the returned row', async () => {
    let seenQuery = '';
    let seenValues: unknown[] = [];
    const store = new PostgresCityStore('postgres://fake', makeSql((query, values) => {
      seenQuery = query;
      seenValues = values;
      return [{ ...intentRow, state: 'settling' }];
    }));

    const intent = await store.claimAttentionGrantIntent('agi_1', ['awaiting_approval'], 'settling');

    expect(seenQuery).toContain('UPDATE attention_grant_intents');
    expect(seenQuery).toContain('state = ANY');
    expect(seenValues).toEqual(['settling', 'agi_1', ['awaiting_approval']]);
    expect(intent?.state).toBe('settling');
  });

  test('setIdentityAlias issues an upsert without throwing', async () => {
    let called = false;
    const store = new PostgresCityStore('postgres://fake', makeSql(query => { if (query.includes('city_identity_aliases')) called = true; return []; }));
    await store.setIdentityAlias('person-1', 'alice');
    expect(called).toBe(true);
  });

  test('createFeedback maps the RETURNING row and stores bounded public context', async () => {
    let seenQuery = '';
    let seenValues: unknown[] = [];
    const store = new PostgresCityStore('postgres://fake', makeSql((query, values) => {
      seenQuery = query;
      seenValues = values;
      return [feedbackRow];
    }));

    const feedback = await store.createFeedback({
      cityUserId: 'cu1',
      landingUserId: 'landing-1',
      displayName: 'Alice',
      handle: 'alice',
      email: 'alice@example.com',
      feeling: 'confused',
      tryingToDo: 'Give attention',
      message: 'I could not find the button.',
      route: '/residents/hans',
      pageUrl: 'http://localhost:5174/residents/hans',
      mode: 'simple',
      residentId: 'res:hans',
      allowFollowUp: true,
      userAgent: 'test browser',
      metadata: {},
    });

    expect(seenQuery).toContain('INSERT INTO feedback_entries');
    expect(seenValues).toContain('cu1');
    expect(seenValues).toContain('confused');
    expect(feedback).toMatchObject({
      id: 'feedback_1',
      cityUserId: 'cu1',
      landingUserId: 'landing-1',
      displayName: 'Alice',
      handle: 'alice',
      email: 'alice@example.com',
      feeling: 'confused',
      tryingToDo: 'Give attention',
      message: 'I could not find the button.',
      route: '/residents/hans',
      pageUrl: 'http://localhost:5174/residents/hans',
      mode: 'simple',
      residentId: 'res:hans',
      allowFollowUp: true,
      metadata: {},
    });
    expect(typeof feedback.createdAt).toBe('string');
  });

  test('listFeedback reads newest feedback through the unsafe limit query and maps rows', async () => {
    let seenQuery = '';
    let seenValues: unknown[] = [];
    const store = new PostgresCityStore('postgres://fake', makeSql((query, values) => {
      seenQuery = query;
      seenValues = values;
      return [feedbackRow];
    }));

    const feedback = await store.listFeedback(10);

    expect(seenQuery).toContain('SELECT * FROM feedback_entries ORDER BY created_at DESC LIMIT $1');
    expect(seenValues).toEqual([10]);
    expect(feedback).toHaveLength(1);
    expect(feedback[0]).toMatchObject({
      id: 'feedback_1',
      feeling: 'confused',
      message: 'I could not find the button.',
      allowFollowUp: true,
    });
  });
});
