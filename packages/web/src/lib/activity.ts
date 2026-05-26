import type { ActionLogEntry, InferenceLogEntry, RuntimeReadModel, SpectatorSession } from '@nullcity-dashboard/shared';

export interface ActivitySnapshot {
  onlineLabel: string;
  statusText: string;
  positionLabel: string;
  actionLabel: string;
  actionAgeLabel: string;
  actionDetail: string;
  actionResultLabel: string;
  actionResultAgeLabel: string;
  actionResultDetail: string;
  inferenceLabel: string;
  inferenceAgeLabel: string;
  progressLabel: string;
  progressDetail: string;
  moveLabel: string;
  moveDetail: string;
  goalLabel: string;
  moduleLabel: string;
  moduleDetail: string;
  attentionLabel: string;
  feedLabel: string;
  surroundingsLabel: string;
  eventLabel: string;
  stale: boolean;
}

const STALE_ACTION_MS = 120_000;

export function buildActivitySnapshot(runtime: RuntimeReadModel | undefined, session: SpectatorSession | undefined, now = Date.now()): ActivitySnapshot {
  const actionLog = runtime?.logs.actions || [];
  const { entry: latestAction, index: latestActionIndex } = findLatestAction(actionLog);
  const latestActionRequestId = entryRequestId(latestAction);
  const { entry: latestActionResult, index: latestActionResultIndex } = findLatestResult(actionLog, latestActionRequestId);
  const latestInference = runtime?.thinking.latestInference || runtime?.logs.inference.at(-1);
  const actionAgeMs = ageMs(latestAction?.t, now);
  const actionResultAgeMs = ageMs(latestActionResult?.t, now);
  const actionResultPending = latestActionIndex >= 0 && latestActionIndex > latestActionResultIndex;
  const inferenceAgeMs = ageMs(latestInference?.t, now);
  const feedAgeMs = ageMs(runtime?.body.lastFeedAt, now);
  const livePerception = session?.latestPerception || runtime?.body.latestPerception;
  const online = runtime?.online === true;
  const feedLive = feedAgeMs !== undefined && feedAgeMs <= STALE_ACTION_MS;
  const stale = online && !feedLive && (!latestAction || actionAgeMs === undefined || actionAgeMs > STALE_ACTION_MS);

  return {
    onlineLabel: online ? 'online' : runtime?.available ? 'offline' : 'unknown',
    statusText: statusText(online, stale, actionAgeMs, feedLive, runtime?.body.perceptionTick),
    positionLabel: formatPosition(session?.position || runtime?.body.position || positionFromPerception(runtime?.body.latestPerception)),
    actionLabel: formatAction(latestAction),
    actionAgeLabel: formatAge(actionAgeMs),
    actionDetail: formatActionDetail(latestAction),
    actionResultLabel: formatActionResult(latestActionResult, actionResultPending),
    actionResultAgeLabel: formatAge(actionResultAgeMs),
    actionResultDetail: formatActionResultDetail(latestActionResult, actionResultAgeMs, actionResultPending, actionAgeMs),
    inferenceLabel: formatInference(latestInference),
    inferenceAgeLabel: formatAge(inferenceAgeMs),
    ...formatProgress(runtime, now),
    ...formatActiveMove(runtime),
    goalLabel: formatGoal(runtime),
    ...formatSparkModule(runtime),
    attentionLabel: formatAttention(runtime),
    feedLabel: formatFeed(runtime, session, livePerception, now),
    surroundingsLabel: formatSurroundings(livePerception),
    eventLabel: formatEvents(runtime, livePerception),
    stale,
  };
}

function findLatestAction(entries: ActionLogEntry[]): { entry: ActionLogEntry | undefined; index: number } {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const action = asRecord(entries[index]?.action);
    if (action.kind || action.type) return { entry: entries[index], index };
  }
  return { entry: undefined, index: -1 };
}

function findLatestResult(entries: ActionLogEntry[], requestId?: string): { entry: ActionLogEntry | undefined; index: number } {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (!entry?.result || isDispatchAckResult(entry)) continue;
    if (requestId && entryRequestId(entry) !== requestId) continue;
    return { entry, index };
  }
  return { entry: undefined, index: -1 };
}

function isDispatchAckResult(entry: ActionLogEntry): boolean {
  const result = asRecord(entry.result);
  if (result.ok !== true) return false;
  if (stringField(result, 'finalStatus') || stringField(result, 'status') || stringField(result, 'finalReason') || stringField(result, 'reason')) return false;
  return numberOrString(result.requestId) !== undefined || numberOrString(entry.requestId) !== undefined;
}

function entryRequestId(entry: ActionLogEntry | undefined): string | undefined {
  if (!entry) return undefined;
  const result = asRecord(entry.result);
  const requestId = numberOrString(result.requestId) ?? numberOrString(entry.requestId);
  return requestId === undefined ? undefined : String(requestId);
}

function statusText(online: boolean, stale: boolean, actionAgeMs: number | undefined, feedLive: boolean, tick: number | undefined): string {
  if (!online) return 'Resident is not online.';
  if (feedLive && tick !== undefined) return `Resident feed live at tick ${tick}.`;
  if (feedLive) return 'Resident feed live.';
  if (stale) return `No visible action for ${formatDuration(actionAgeMs)}.`;
  return 'Recent action visible.';
}

function formatProgress(runtime: RuntimeReadModel | undefined, now: number): { progressLabel: string; progressDetail: string } {
  const progress = runtime?.progress;
  const latest = progress?.latest;
  if (!latest) {
    return { progressLabel: 'no progress evidence', progressDetail: '-' };
  }

  const sampleAgeMs = ageMs(latest.ts, now);
  const stale = sampleAgeMs !== undefined && sampleAgeMs > STALE_ACTION_MS;
  const labelPrefix = runtime?.online === false ? 'offline; last ' : stale ? 'stale; last ' : '';
  const detailPrefix = labelPrefix && sampleAgeMs !== undefined ? `${formatAge(sampleAgeMs)} | ` : '';
  const latestMeaningful = progress.latestMeaningful;
  const meaningfulDetail = latestMeaningful
    ? `last progress tick ${latestMeaningful.tick ?? '?'}: ${formatProgressReasons(latestMeaningful.reasons)}`
    : 'no meaningful progress yet';
  if (typeof progress.stuckTicks === 'number') {
    return {
      progressLabel: `${labelPrefix}stuck ${progress.stuckTicks} tick${progress.stuckTicks === 1 ? '' : 's'}`,
      progressDetail: `${detailPrefix}${meaningfulDetail}`,
    };
  }
  if (latest.meaningful) {
    return {
      progressLabel: `${labelPrefix}progress tick ${latest.tick ?? '?'}`,
      progressDetail: `${detailPrefix}${formatProgressReasons(latest.reasons)}`,
    };
  }
  return {
    progressLabel: `${labelPrefix}no progress at tick ${latest.tick ?? '?'}`,
    progressDetail: `${detailPrefix}${meaningfulDetail}`,
  };
}

function formatProgressReasons(reasons: string[]): string {
  return reasons.length ? reasons.map(reason => reason.replaceAll('_', ' ').replaceAll(':', ' ')).join(', ') : 'reason not logged';
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
  if (kind === 'trade_request') {
    const target = tradeTargetLabel(asRecord(action.target));
    return target ? `request trade with ${target}` : 'request trade';
  }
  if (kind === 'trade_offer_item') {
    const quantity = numberOrString(action.quantity) ?? numberOrString(action.amount);
    const slot = numberOrString(action.slot) ?? numberOrString(action.inventorySlot);
    const itemId = numberOrString(action.itemId);
    if (quantity !== undefined && itemId !== undefined) return `offer ${quantity} of item ${itemId}`;
    if (quantity !== undefined && slot !== undefined) return `offer ${quantity} from slot ${slot}`;
    if (itemId !== undefined) return `offer item ${itemId}`;
    return 'offer item';
  }
  if (kind === 'trade_accept' || kind === 'trade_accept_stage_1') {
    return 'accept trade stage 1';
  }
  if (kind === 'trade_accept_stage_2') {
    return 'accept trade stage 2';
  }
  if (kind === 'trade_decline') {
    return 'decline trade';
  }
  return kind.replaceAll('_', ' ');
}

function tradeTargetLabel(target: Record<string, unknown>): string | undefined {
  return (
    stringField(target, 'playerHandle') ||
    stringField(target, 'name') ||
    stringField(target, 'residentId') ||
    stringField(target, 'id')
  );
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

function formatActionResult(entry: ActionLogEntry | undefined, pending: boolean): string {
  if (pending) return 'pending';
  if (!entry) return 'no result logged';
  return resultStatusLabel(entry.result) || 'result logged';
}

function formatActionResultDetail(entry: ActionLogEntry | undefined, resultAgeMs: number | undefined, pending: boolean, actionAgeMs: number | undefined): string {
  if (pending) {
    const actionAge = actionAgeMs !== undefined ? `action ${formatAge(actionAgeMs)}` : '';
    return ['awaiting result for latest action', actionAge].filter(Boolean).join(' | ');
  }
  if (!entry) return '-';
  const result = asRecord(entry.result);
  const reason = resultReason(result);
  const requestId = stringField(result, 'requestId') || stringField(entry, 'requestId');
  const parts = [
    stringField(entry, 'cause') || stringField(asRecord(entry.action), 'cause'),
    reason ? `reason ${normalizeReason(reason)}` : '',
    entry.source ? `source ${entry.source}` : '',
    typeof entry.tick === 'number' ? `tick ${entry.tick}` : '',
    requestId ? `request ${truncate(requestId, 18)}` : '',
    resultAgeMs !== undefined ? formatAge(resultAgeMs) : '',
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

function formatAttention(runtime: RuntimeReadModel | undefined): string {
  const attention = runtime?.state?.attention;
  if (typeof attention !== 'number') return '-';
  const requestsThisMinute = runtime?.state?.budgets?.requestsThisMinute;
  const requestsToday = runtime?.state?.budgets?.requestsToday;
  const budget = typeof requestsThisMinute === 'number' || typeof requestsToday === 'number'
    ? ` | ${requestsThisMinute ?? 0}/m ${requestsToday ?? 0}/d`
    : '';
  return `${attention}${budget}`;
}

function formatFeed(runtime: RuntimeReadModel | undefined, session: SpectatorSession | undefined, perception: unknown, now: number): string {
  const tick = numberField(perception, 'tick') ?? runtime?.body.perceptionTick;
  const lastFeedAt = session?.lastEventAt || runtime?.body.lastFeedAt;
  const age = ageMs(lastFeedAt, now);
  const parts = [
    tick !== undefined ? `tick ${tick}` : '',
    age !== undefined ? `${formatDuration(age)} ago` : '',
    session?.connected ? 'spectator' : runtime?.body.feed?.attached ? 'attached' : '',
  ].filter(Boolean);
  return parts.join(' | ') || '-';
}

function formatSurroundings(perception: unknown): string {
  const nearby = asRecord(asRecord(perception).nearby);
  return [
    `players ${arrayCount(nearby.players)}`,
    `npcs ${arrayCount(nearby.npcs)}`,
    `objects ${arrayCount(nearby.objects)}`,
    `items ${arrayCount(nearby.worldItems)}`,
  ].join(' | ');
}

function formatEvents(runtime: RuntimeReadModel | undefined, perception: unknown): string {
  const feedEvent = runtime?.body.feed?.latestEventKind;
  const feedText = runtime?.body.feed?.latestEventText;
  if (feedEvent && feedText) return `${feedEvent}: ${truncate(feedText, 42)}`;
  if (feedEvent) return feedEvent;
  const events = asRecord(perception).events;
  return Array.isArray(events) && events.length ? `${events.length} event${events.length === 1 ? '' : 's'}` : '-';
}

function formatSparkModule(runtime: RuntimeReadModel | undefined): { moduleLabel: string; moduleDetail: string } {
  const module = runtime?.spark?.activeModule;
  if (!module) {
    return { moduleLabel: 'no module logged', moduleDetail: '-' };
  }

  const version = module.version ? `@${module.version}` : '';
  const facets = module.activeFacets?.length ? module.activeFacets.join(', ') : 'unknown facets';
  return {
    moduleLabel: `${module.id}${version}`,
    moduleDetail: `${facets} | ${module.source}`,
  };
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

function positionFromPerception(perception: unknown): { x: number; y: number; level: number } | undefined {
  const root = asRecord(perception);
  return asPosition(asRecord(root.resident).position) || asPosition(root.position);
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
  const status = resultStatusLabel(value);
  if (status === 'success') return 'ok';
  if (status) return status;
  return '';
}

function resultStatusLabel(value: unknown): string | undefined {
  if (typeof value === 'string') return normalizedResultStatus(value);
  const record = asRecord(value);
  const explicitStatus = normalizedResultStatus(stringField(record, 'finalStatus') || stringField(record, 'status') || stringField(record, 'kind'));
  if (explicitStatus) return explicitStatus;
  const safeReason = resultReason(record);
  const reasonStatus = normalizedResultStatus(safeReason);
  if (reasonStatus === 'timeout') return 'timeout';
  if (typeof record.ok === 'boolean') return record.ok ? 'success' : 'failed';
  if (safeReason) return 'failed';
  if (stringField(record, 'error')) return 'failed';
  return reasonStatus;
}

function normalizedResultStatus(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const normalized = value.toLowerCase().replaceAll('-', '_');
  if (normalized === 'ok' || normalized === 'accepted' || normalized === 'success' || normalized === 'succeeded') return 'success';
  if (normalized.includes('timeout')) return 'timeout';
  if (normalized === 'failed' || normalized === 'failure' || normalized === 'blocked' || normalized.includes('error')) return 'failed';
  return undefined;
}

function resultReason(record: Record<string, unknown>): string | undefined {
  return (
    enumLikeReason(stringField(record, 'finalReason')) ||
    enumLikeReason(stringField(record, 'reason')) ||
    (stringField(record, 'error') ? 'error' : undefined)
  );
}

function normalizeReason(reason: string): string {
  const normalized = reason.toLowerCase().replaceAll('-', '_');
  return (normalized.includes('timeout') ? 'timeout' : normalized).replaceAll('_', ' ');
}

function enumLikeReason(reason: string | undefined): string | undefined {
  return reason && /^[A-Za-z0-9_:-]{1,64}$/.test(reason) ? reason : undefined;
}

function stringField(value: unknown, key: string): string | undefined {
  const field = asRecord(value)[key];
  return typeof field === 'string' ? field : undefined;
}

function numberOrString(value: unknown): number | string | undefined {
  return typeof value === 'number' || typeof value === 'string' ? value : undefined;
}

function numberField(value: unknown, key: string): number | undefined {
  const field = asRecord(value)[key];
  const number = Number(field);
  return Number.isFinite(number) ? number : undefined;
}

function arrayCount(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}...` : value;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}
