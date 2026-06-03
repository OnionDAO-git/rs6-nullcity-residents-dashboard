import { CityStoreError, type AttentionGrantIntent, type CityStore } from './store';
import type { NullCityControlClient } from './nullcity-control';
import type { PointLedgerEntry, PointResource } from './types';

/**
 * T0.0a — Support skeleton saga. Replaces the old mocked grantResidentAttention.
 *
 * Ordering matters: we **pre-flight the balance**, then **credit City**, then
 * **debit the stand-in** — i.e. debit-after-confirm. That way a City failure
 * never strands the user's AP (no debit happened), and a retry can never grant
 * free attention (both the City credit and the stand-in debit are idempotent on
 * the caller's idempotencyKey). The stand-in is a LABELLED NON-PRODUCTION debit
 * of the BFF point_accounts projection — swap `debitStandIn` for Dev's real
 * user-consent spend API when it lands.
 */
export interface AttentionGrantDeps {
  store: CityStore;
  control?: Pick<NullCityControlClient, 'creditAttention'>;
}

export interface AttentionGrantInput {
  cityUserId: string;
  residentId: string;
  apAmount: number;
  idempotencyKey?: string;
  memo?: string;
}

export interface AttentionGrantResult {
  intent: AttentionGrantIntent;
  ledger: PointLedgerEntry;
  cityResponse?: Record<string, unknown>;
}

export async function runAttentionGrant(deps: AttentionGrantDeps, input: AttentionGrantInput): Promise<AttentionGrantResult> {
  const apAmount = Number(input.apAmount);
  if (!Number.isInteger(apAmount) || apAmount <= 0) {
    throw new CityStoreError('attention_grant_amount_invalid', 400);
  }
  const idempotencyKey = input.idempotencyKey || `${input.residentId}:${apAmount}`;

  // 1. Intent — idempotent on (cityUserId, idempotencyKey).
  let intent = await deps.store.createAttentionGrantIntent({
    cityUserId: input.cityUserId,
    residentId: input.residentId,
    apAmount,
    idempotencyKey,
  });

  // Replay short-circuit: an already-settled grant returns its cached result.
  // The stand-in debit is idempotent, so re-running it just re-fetches the entry.
  if (intent.state === 'settled') {
    const ledger = await debitStandIn(deps.store, input, apAmount, idempotencyKey);
    return { intent, ledger, cityResponse: intent.cityResponse };
  }

  if (!deps.control?.creditAttention) {
    throw new CityStoreError('attention_credit_unconfigured', 503);
  }

  // 2. Pre-flight: confirm the stand-in can cover the spend BEFORE crediting City,
  //    so we never credit a resident and then fail to debit. (The debit itself is
  //    still guarded by the ledger's balance>=0 check; this just fails fast + clean.)
  const balance = await apBalance(deps.store, input.cityUserId);
  if (balance < apAmount) {
    await deps.store.updateAttentionGrantIntent(intent.id, { state: 'failed', failureReason: 'insufficient_points' });
    throw new CityStoreError('insufficient_points', 409);
  }

  // 3. Resolve canonical identity so City routes standing/letters by it (T0.ID).
  const personId = await deps.store.resolveOnionId(input.cityUserId);
  const patronHandle = await deps.store.resolvePatronHandle(personId);

  // 4. Credit City attention FIRST (idempotent server-side on the same key).
  //    On failure: no debit has happened yet → the user's AP is untouched.
  intent = await deps.store.updateAttentionGrantIntent(intent.id, { state: 'sent_to_city' });
  let cityResponse: Record<string, unknown>;
  try {
    cityResponse = (await deps.control.creditAttention(input.residentId, {
      idempotencyKey,
      amount: apAmount,
      cityUserId: input.cityUserId,
      personId,
      ...(patronHandle ? { patronHandle } : {}),
      sourceType: 'resident_attention_grant',
      sourceId: idempotencyKey,
    })) as unknown as Record<string, unknown>;
  } catch (err) {
    await deps.store.updateAttentionGrantIntent(intent.id, {
      state: 'failed',
      failureReason: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }

  // 5. Debit the stand-in AFTER the credit is confirmed, then settle.
  let ledger: PointLedgerEntry;
  try {
    ledger = await debitStandIn(deps.store, input, apAmount, idempotencyKey);
  } catch (err) {
    // The City credit already landed (it's idempotent), but the stand-in debit
    // failed — e.g. a concurrent spend drained the balance between the pre-flight
    // check and here. Mark `failed` so the intent is NOT left stuck in
    // `sent_to_city`; a retry re-drives (credit replays idempotently, debit
    // retries) and self-heals once funds recover.
    // CAVEAT for the real consent-spend API: it must make credit+debit atomic —
    // this window over-credits the resident until a successful retry.
    await deps.store.updateAttentionGrantIntent(intent.id, {
      state: 'failed',
      failureReason: `city_credited_debit_failed: ${err instanceof Error ? err.message : String(err)}`,
    });
    throw err;
  }
  intent = await deps.store.updateAttentionGrantIntent(intent.id, {
    state: 'settled',
    standinLedgerEntryId: ledger.id,
    cityResponse,
  });
  return { intent, ledger, cityResponse };
}

async function apBalance(store: CityStore, cityUserId: string): Promise<number> {
  const balances = await store.getPointBalances(cityUserId);
  return balances.find((b: { resource: PointResource; balance: number }) => b.resource === 'AP')?.balance ?? 0;
}

/**
 * LABELLED NON-PRODUCTION stand-in debit of the BFF point_accounts projection.
 * >>> SWAP THIS for Dev's real user-consent spend API when available. <<<
 * Idempotent on (cityUserId, resource, sourceType, sourceId): replay returns the
 * same entry without moving the balance.
 */
async function debitStandIn(store: CityStore, input: AttentionGrantInput, apAmount: number, idempotencyKey: string): Promise<PointLedgerEntry> {
  return store.appendPointLedger({
    cityUserId: input.cityUserId,
    resource: 'AP',
    delta: -apAmount,
    sourceType: 'attention_grant_standin',
    sourceId: idempotencyKey,
    memo: input.memo || `Attention grant stand-in: ${input.residentId}`,
    metadata: {
      residentId: input.residentId,
      standin: true,
      nonProduction: true,
      note: 'NON-PRODUCTION stand-in for Dev consent-spend API',
    },
  });
}
