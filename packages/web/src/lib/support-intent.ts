/**
 * Pending Onion-spend consent flow.
 *
 * Maintainer decision: spends use explicit consent. The dashboard creates an
 * Onion spend request, the human approves it on OnionDAO (landing), and the
 * dashboard shows a pending card until the spend settles. These helpers keep
 * that state machine pure and testable: deriving a pending intent from the
 * grant response, classifying settlement status payloads, and serializing the
 * intent so a page refresh restores the pending card.
 */

export interface PendingSupportIntent {
  residentId: string;
  residentName: string;
  onionAmount: number;
  idempotencyKey: string;
  memo: string;
  approvalUrl?: string;
  createdAt: string;
}

export interface PendingSupportContext {
  residentId: string;
  residentName: string;
  onionAmount: number;
  idempotencyKey: string;
  memo?: string;
  now?: string;
}

export type SupportSettlementState = 'pending' | 'settled' | 'denied' | 'failed' | 'unknown';

const PENDING_SUPPORT_STORAGE_PREFIX = 'nullcity.pendingSupport';

export function supportSettlementState(status: string | undefined, onionRequestStatus?: string): SupportSettlementState {
  if (status === 'settled' || onionRequestStatus === 'completed') return 'settled';
  if (status === 'onion_spend_denied' || onionRequestStatus === 'denied') return 'denied';
  if (status === 'onion_spend_failed' || onionRequestStatus === 'failed' || onionRequestStatus === 'expired') return 'failed';
  if (
    status === 'pending_onion_settlement' ||
    status === 'awaiting_approval' ||
    onionRequestStatus === 'pending' ||
    onionRequestStatus === 'awaiting_approval'
  ) return 'pending';
  return 'unknown';
}

export interface GrantResultLike {
  status?: string;
  approvalUrl?: string;
  onionRequest?: { status?: string; approvalUrl?: string };
}

export function pendingSupportIntentFromGrant(result: GrantResultLike, context: PendingSupportContext): PendingSupportIntent | undefined {
  if (supportSettlementState(result.status, result.onionRequest?.status) !== 'pending') return undefined;
  const approvalUrl = safeApprovalUrl(result.approvalUrl || result.onionRequest?.approvalUrl);
  const intent: PendingSupportIntent = {
    residentId: context.residentId,
    residentName: context.residentName,
    onionAmount: Math.max(0, Math.floor(context.onionAmount)),
    idempotencyKey: context.idempotencyKey,
    memo: context.memo || '',
    createdAt: context.now || new Date().toISOString(),
  };
  if (approvalUrl) intent.approvalUrl = approvalUrl;
  return intent;
}

export function safeApprovalUrl(value: string | undefined): string | undefined {
  if (!value || typeof value !== 'string') return undefined;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

export function pendingSupportStorageKey(identity: string): string {
  return `${PENDING_SUPPORT_STORAGE_PREFIX}.${encodeURIComponent(identity)}`;
}

export function serializePendingSupportIntent(intent: PendingSupportIntent): string {
  return JSON.stringify(intent);
}

export function parsePendingSupportIntent(raw: string | null | undefined): PendingSupportIntent | undefined {
  if (!raw) return undefined;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const residentId = stringValue(record.residentId);
  const residentName = stringValue(record.residentName);
  const idempotencyKey = stringValue(record.idempotencyKey);
  const onionAmount = typeof record.onionAmount === 'number' && Number.isFinite(record.onionAmount)
    ? Math.max(0, Math.floor(record.onionAmount))
    : 0;
  if (!residentId || !idempotencyKey || onionAmount <= 0) return undefined;
  const intent: PendingSupportIntent = {
    residentId,
    residentName: residentName || residentId,
    onionAmount,
    idempotencyKey,
    memo: stringValue(record.memo) || '',
    createdAt: stringValue(record.createdAt) || '',
  };
  const approvalUrl = safeApprovalUrl(stringValue(record.approvalUrl));
  if (approvalUrl) intent.approvalUrl = approvalUrl;
  return intent;
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}
