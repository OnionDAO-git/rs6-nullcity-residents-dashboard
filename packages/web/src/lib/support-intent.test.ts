import { describe, expect, test } from 'bun:test';
import {
  parsePendingSupportIntent,
  pendingSupportIntentFromGrant,
  pendingSupportStorageKey,
  safeApprovalUrl,
  serializePendingSupportIntent,
  supportSettlementState,
} from './support-intent';

const context = {
  residentId: 'res:hans',
  residentName: 'Hans',
  onionAmount: 75,
  idempotencyKey: 'key-123',
  memo: 'Keep going',
  now: '2026-06-11T10:00:00.000Z',
};

describe('supportSettlementState', () => {
  test('classifies the BFF grant and status payload states', () => {
    expect(supportSettlementState('settled')).toBe('settled');
    expect(supportSettlementState(undefined, 'completed')).toBe('settled');
    expect(supportSettlementState('pending_onion_settlement', 'pending')).toBe('pending');
    expect(supportSettlementState('awaiting_approval')).toBe('pending');
    expect(supportSettlementState(undefined, 'awaiting_approval')).toBe('pending');
    expect(supportSettlementState('onion_spend_denied', 'denied')).toBe('denied');
    expect(supportSettlementState('onion_spend_failed', 'failed')).toBe('failed');
    expect(supportSettlementState(undefined, 'expired')).toBe('failed');
    expect(supportSettlementState('something_else')).toBe('unknown');
    expect(supportSettlementState(undefined, undefined)).toBe('unknown');
  });

  test('treats settled as authoritative over a stale pending flag', () => {
    expect(supportSettlementState('pending_onion_settlement', 'completed')).toBe('settled');
  });

  test('treats explicit city failure as authoritative over a completed Onion request', () => {
    expect(supportSettlementState('onion_spend_failed', 'completed')).toBe('failed');
    expect(supportSettlementState('onion_spend_denied', 'completed')).toBe('denied');
  });
});

describe('pendingSupportIntentFromGrant', () => {
  test('captures the pending intent with the approval link from the grant response', () => {
    const intent = pendingSupportIntentFromGrant({
      status: 'pending_onion_settlement',
      approvalUrl: 'https://oniondao.example/requests/42',
      onionRequest: { status: 'pending' },
    }, context);

    expect(intent).toEqual({
      residentId: 'res:hans',
      residentName: 'Hans',
      onionAmount: 75,
      idempotencyKey: 'key-123',
      memo: 'Keep going',
      approvalUrl: 'https://oniondao.example/requests/42',
      createdAt: '2026-06-11T10:00:00.000Z',
    });
  });

  test('reads the approval link from the onion request when the top level lacks one', () => {
    const intent = pendingSupportIntentFromGrant({
      status: 'pending_onion_settlement',
      onionRequest: { status: 'pending', approvalUrl: 'https://oniondao.example/requests/43' },
    }, context);

    expect(intent?.approvalUrl).toBe('https://oniondao.example/requests/43');
  });

  test('polls with the BFF poll handle when the double-burn guard reuses an existing intent', () => {
    const intent = pendingSupportIntentFromGrant({
      status: 'pending_onion_settlement',
      idempotencyKey: 'existing-key-from-first-post',
      approvalUrl: 'https://oniondao.example/portal/onions',
      onionRequest: { status: 'pending' },
    }, context);

    expect(intent?.idempotencyKey).toBe('existing-key-from-first-post');
  });

  test('still creates a pending intent when no approval link is provided yet', () => {
    const intent = pendingSupportIntentFromGrant({ status: 'pending_onion_settlement', onionRequest: { status: 'pending' } }, context);

    expect(intent).toBeDefined();
    expect(intent?.approvalUrl).toBeUndefined();
  });

  test('returns undefined for settled, denied, and failed results', () => {
    expect(pendingSupportIntentFromGrant({ status: 'settled', onionRequest: { status: 'completed' } }, context)).toBeUndefined();
    expect(pendingSupportIntentFromGrant({ status: 'onion_spend_denied', onionRequest: { status: 'denied' } }, context)).toBeUndefined();
    expect(pendingSupportIntentFromGrant({ status: 'onion_spend_failed', onionRequest: { status: 'failed' } }, context)).toBeUndefined();
    expect(pendingSupportIntentFromGrant({ status: 'onion_spend_failed', onionRequest: { status: 'completed' } }, context)).toBeUndefined();
  });
});

describe('safeApprovalUrl', () => {
  test('accepts http(s) links and rejects anything else', () => {
    expect(safeApprovalUrl('https://oniondao.example/approve/1')).toBe('https://oniondao.example/approve/1');
    expect(safeApprovalUrl('http://localhost:43620/requests/9')).toBe('http://localhost:43620/requests/9');
    expect(safeApprovalUrl('javascript:alert(1)')).toBeUndefined();
    expect(safeApprovalUrl('not a url')).toBeUndefined();
    expect(safeApprovalUrl(undefined)).toBeUndefined();
  });
});

describe('pending support persistence', () => {
  test('round-trips an intent through serialization', () => {
    const intent = pendingSupportIntentFromGrant({
      status: 'pending_onion_settlement',
      approvalUrl: 'https://oniondao.example/requests/42',
      onionRequest: { status: 'pending' },
    }, context);

    expect(parsePendingSupportIntent(serializePendingSupportIntent(intent!))).toEqual(intent);
  });

  test('rejects malformed or incomplete stored payloads', () => {
    expect(parsePendingSupportIntent(null)).toBeUndefined();
    expect(parsePendingSupportIntent('')).toBeUndefined();
    expect(parsePendingSupportIntent('not json')).toBeUndefined();
    expect(parsePendingSupportIntent('[]')).toBeUndefined();
    expect(parsePendingSupportIntent(JSON.stringify({ residentId: 'res:hans' }))).toBeUndefined();
    expect(parsePendingSupportIntent(JSON.stringify({ residentId: 'res:hans', idempotencyKey: 'k', onionAmount: 0 }))).toBeUndefined();
  });

  test('drops unsafe approval links from stored payloads', () => {
    const parsed = parsePendingSupportIntent(JSON.stringify({
      residentId: 'res:hans',
      residentName: 'Hans',
      onionAmount: 10,
      idempotencyKey: 'k',
      approvalUrl: 'javascript:alert(1)',
    }));

    expect(parsed).toBeDefined();
    expect(parsed?.approvalUrl).toBeUndefined();
  });

  test('scopes the storage key by attendee identity', () => {
    expect(pendingSupportStorageKey('user@example.com')).toBe('nullcity.pendingSupport.user%40example.com');
  });
});
