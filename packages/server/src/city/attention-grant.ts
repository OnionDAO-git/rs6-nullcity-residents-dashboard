import { CityStoreError, type AttentionGrantIntent, type CityStore } from './store';
import type { NullCityControlClient } from './nullcity-control';
import type { PointLedgerEntry } from './types';

/**
 * T0.0a — Support skeleton saga. Replaces the old mocked grantResidentAttention:
 * records an intent, debits a LABELLED NON-PRODUCTION stand-in ledger (swap the
 * one block below for Dev's real consent-spend API), then calls the real City
 * creditAttention. Idempotent on the caller's idempotencyKey end-to-end.
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

  // 2. Debit the LABELLED NON-PRODUCTION stand-in (BFF point_accounts projection).
  //    >>> SWAP THIS BLOCK for Dev's real user-consent spend API when available. <<<
  //    Idempotent on (cityUserId, resource, sourceType, sourceId): replay returns the same entry.
  const ledger = await deps.store.appendPointLedger({
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

  // Replay short-circuit: already settled → return without re-crediting City.
  if (intent.state === 'settled') {
    return { intent, ledger, cityResponse: intent.cityResponse };
  }

  intent = await deps.store.updateAttentionGrantIntent(intent.id, { state: 'debited', standinLedgerEntryId: ledger.id });

  if (!deps.control?.creditAttention) {
    throw new CityStoreError('attention_credit_unconfigured', 503);
  }

  // 3. Resolve canonical identity so City can route standing/letters by it (T0.ID).
  //    personId === landing users.id; patronHandle is the display alias when set.
  const personId = await deps.store.resolveOnionId(input.cityUserId);
  const patronHandle = await deps.store.resolvePatronHandle(personId);

  // 4. Credit City attention (idempotent server-side via the same key).
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

  // 4. Settle.
  intent = await deps.store.updateAttentionGrantIntent(intent.id, { state: 'settled', cityResponse });
  return { intent, ledger, cityResponse };
}
