import type { ActionLogEntry, InferenceLogEntry, RuntimeReadModel, SpectatorSession } from '@nullcity-dashboard/shared';

export interface ActivitySnapshot {
  onlineLabel: string;
  statusText: string;
  positionLabel: string;
  actionLabel: string;
  actionAgeLabel: string;
  actionDetail: string;
  inferenceLabel: string;
  inferenceAgeLabel: string;
  moveLabel: string;
  moveDetail: string;
  goalLabel: string;
  stale: boolean;
}

const STALE_ACTION_MS = 120_000;

export function buildActivitySnapshot(runtime: RuntimeReadModel | undefined, session: SpectatorSession | undefined, now = Date.now()): ActivitySnapshot {
  const latestAction = runtime?.logs.actions.at(-1);
  const latestInference = runtime?.thinking.latestInference || runtime?.logs.inference.at(-1);
  const actionAgeMs = ageMs(latestAction?.t, now);
  const inferenceAgeMs = ageMs(latestInference?.t, now);
  const online = runtime?.online === true;
  const stale = online && (!latestAction || actionAgeMs === undefined || actionAgeMs > STALE_ACTION_MS);

  return {
    onlineLabel: online ? 'online' : runtime?.available ? 'offline' : 'unknown',
    statusText: statusText(online, stale, actionAgeMs),
    positionLabel: formatPosition(session?.position),
    actionLabel: formatAction(latestAction),
    actionAgeLabel: formatAge(actionAgeMs),
    actionDetail: formatActionDetail(latestAction),
    inferenceLabel: formatInference(latestInference),
    inferenceAgeLabel: formatAge(inferenceAgeMs),
    ...formatActiveMove(runtime),
    goalLabel: formatGoal(runtime),
    stale,
  };
}

function statusText(online: boolean, stale: boolean, actionAgeMs: number | undefined): string {
  if (!online) return 'Resident is not online.';
  if (stale) return `No visible action for ${formatDuration(actionAgeMs)}.`;
  return 'Recent action visible.';
}

function formatAction(entry: ActionLogEntry | undefined): string {
  if (!entry) return 'no action logged';
  const action = asRecord(entry.action);
  const kind = stringField(action, 'kind') || stringField(action, 'type') || 'action';
  if (kind === 'interact') {
    const option = stringField(entry, 'option') || stringField(action, 'option') || 'interact';
    const target = asRecord(action.target);
    const objectId = target.objectId;
    if (typeof objectId === 'number' || typeof objectId === 'string') return `${option} object ${objectId}`;
    return option;
  }
  if (kind === 'say') {
    const text = stringField(action, 'text');
    return text ? `say "${truncate(text, 54)}"` : 'say';
  }
  if (kind === 'walk' || kind === 'move_to') {
    return `${kind === 'move_to' ? 'move' : 'walk'} to ${formatPosition(asPosition(action.position) || asPosition(action.target))}`;
  }
  if (kind === 'use_item_on_item') {
    const itemSlot = numberOrString(action.itemSlot);
    const targetSlot = numberOrString(action.targetSlot);
    if (itemSlot !== undefined && targetSlot !== undefined) return `use item slot ${itemSlot} on slot ${targetSlot}`;
  }
  if (kind === 'take_item') {
    const itemId = numberOrString(action.itemId);
    return itemId !== undefined ? `take item ${itemId}` : 'take item';
  }
  if (kind === 'attack') {
    const target = asRecord(action.target);
    const npcId = numberOrString(target.npcId || target.id);
    return npcId !== undefined ? `attack npc ${npcId}` : 'attack';
  }
  return kind.replaceAll('_', ' ');
}

function formatActionDetail(entry: ActionLogEntry | undefined): string {
  if (!entry) return '-';
  const action = asRecord(entry.action);
  const parts = [
    stringField(entry, 'cause') || stringField(action, 'cause'),
    resultLabel(entry.result),
    entry.source ? `source ${entry.source}` : '',
    typeof entry.tick === 'number' ? `tick ${entry.tick}` : '',
  ].filter(Boolean);
  return parts.join(' | ') || '-';
}

function formatInference(entry: InferenceLogEntry | undefined): string {
  if (!entry) return 'no inference logged';
  const cause = stringField(entry, 'cause') || stringField(entry, 'status') || 'inference';
  const emitted = asRecord(entry).actions_emitted;
  const suffix = emitted === 0 || asRecord(entry).nooped === true ? ', no action' : emitted ? `, ${emitted} action${emitted === 1 ? '' : 's'}` : '';
  return `${cause}${suffix}`;
}

function formatGoal(runtime: RuntimeReadModel | undefined): string {
  const state = asRecord(runtime?.state);
  const cognition = asRecord(state.cognition);
  const activeGoal = asRecord(cognition.activeGoal);
  return stringField(activeGoal, 'description') || stringField(activeGoal, 'id') || '-';
}

function formatActiveMove(runtime: RuntimeReadModel | undefined): { moveLabel: string; moveDetail: string } {
  const state = asRecord(runtime?.state);
  const cognition = asRecord(state.cognition);
  const activeMove = asRecord(cognition.activeMove);
  const target = asPosition(activeMove.target);
  if (!target) return { moveLabel: '-', moveDetail: '-' };

  const details = [
    stringField(activeMove, 'cause'),
    numberOrString(activeMove.range) !== undefined ? `range ${numberOrString(activeMove.range)}` : '',
    numberOrString(activeMove.stationaryCount) !== undefined ? `still ${numberOrString(activeMove.stationaryCount)}` : '',
  ].filter(Boolean);
  return {
    moveLabel: `move to ${formatPosition(target)}`,
    moveDetail: details.join(' | ') || '-',
  };
}

function formatPosition(position: unknown): string {
  const parsed = asPosition(position);
  return parsed ? `${parsed.x}, ${parsed.y}, ${parsed.level}` : '-';
}

function asPosition(value: unknown): { x: number; y: number; level: number } | undefined {
  const record = asRecord(value);
  if (typeof record.x !== 'number' || typeof record.y !== 'number') return undefined;
  return { x: record.x, y: record.y, level: typeof record.level === 'number' ? record.level : 0 };
}

function formatAge(age: number | undefined): string {
  if (age === undefined) return '-';
  return `${formatDuration(age)} ago`;
}

function formatDuration(age: number | undefined): string {
  if (age === undefined) return 'unknown';
  const seconds = Math.max(0, Math.round(age / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.round(minutes / 60)}h`;
}

function ageMs(value: string | undefined, now: number): number | undefined {
  if (!value) return undefined;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? Math.max(0, now - time) : undefined;
}

function resultLabel(value: unknown): string {
  const record = asRecord(value);
  if (typeof record.ok === 'boolean') return record.ok ? 'ok' : 'failed';
  return stringField(record, 'status') || stringField(record, 'kind') || '';
}

function stringField(value: unknown, key: string): string | undefined {
  const field = asRecord(value)[key];
  return typeof field === 'string' ? field : undefined;
}

function numberOrString(value: unknown): number | string | undefined {
  return typeof value === 'number' || typeof value === 'string' ? value : undefined;
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}...` : value;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}
