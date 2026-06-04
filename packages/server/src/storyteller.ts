import fs from 'node:fs/promises';
import path from 'node:path';
import { publicProjectorCopy } from './public-copy';
import { asRecord, readJsonFile, readTextFile } from './util';

export interface StorytellerDigestSummary {
  runId: string;
  digestId: string;
  queue: StorytellerQueue;
  builtAt?: string;
  windowStart?: string;
  windowEnd?: string;
  topEventCount: number;
  topEvents: StorytellerDigestEventSummary[];
  residentCount: number;
  summary?: string;
  dispatch?: {
    dispatchId: string;
    generatedAt?: string;
    modelProfile?: string;
    needsReview: boolean;
    warningCount: number;
    publicTitle?: string;
    publicBody?: string;
    publicBullets: string[];
    operatorSummary?: string;
    operatorWarnings: string[];
    reviewReasons: string[];
    eventRefCount: number;
    eventRefsUsed: string[];
    estimatedCostUsd?: number | null;
  };
}

export interface StorytellerDigestEventSummary {
  ref: string;
  kind: string;
  residentName?: string;
  ts?: string;
  note?: string;
  importance?: string;
  evidenceLabels: string[];
}

export interface StorytellerDigestFeed {
  items: StorytellerDigestSummary[];
}

export type StorytellerQueue = 'dry-run' | 'canon' | 'review';

const DEFAULT_LIMIT = 12;
const STORYTELLER_QUEUE_DIRS = ['canon', 'review'] as const;
const STORYTELLER_QUEUE_PRIORITY: Record<StorytellerQueue, number> = {
  canon: 0,
  review: 1,
  'dry-run': 2,
};

export async function readStorytellerDigestFeed(memoryRoot: string, limit = DEFAULT_LIMIT): Promise<StorytellerDigestFeed> {
  const storytellerRoot = path.join(path.dirname(memoryRoot), 'storyteller');

  let entries: Array<{ name: string; isDirectory(): boolean }> = [];
  try {
    entries = (await fs.readdir(storytellerRoot, { withFileTypes: true })) as Array<{ name: string; isDirectory(): boolean }>;
  } catch {
    return { items: [] };
  }

  const dryRunRows = await Promise.all(
    entries
      .filter(entry => entry.isDirectory() && !isStorytellerQueueDir(entry.name))
      .map(async entry => readStorytellerRun(storytellerRoot, entry.name, 'dry-run')),
  );
  const queueRows = await Promise.all(
    STORYTELLER_QUEUE_DIRS.map(queue => readStorytellerQueue(storytellerRoot, queue)),
  );
  const rows = [...dryRunRows, ...queueRows.flat()];

  return {
    items: rows
      .filter((row): row is StorytellerDigestSummary => Boolean(row))
      .sort((a, b) => sortStorytellerRuns(a, b))
      .slice(0, Math.max(0, limit)),
  };
}

async function readStorytellerQueue(storytellerRoot: string, queue: Exclude<StorytellerQueue, 'dry-run'>): Promise<Array<StorytellerDigestSummary | undefined>> {
  const queueRoot = path.join(storytellerRoot, queue);
  let entries: Array<{ name: string; isDirectory(): boolean }> = [];
  try {
    entries = (await fs.readdir(queueRoot, { withFileTypes: true })) as Array<{ name: string; isDirectory(): boolean }>;
  } catch {
    return [];
  }
  return Promise.all(
    entries
      .filter(entry => entry.isDirectory())
      .map(async entry => readStorytellerRun(queueRoot, `${queue}/${entry.name}`, queue, entry.name)),
  );
}

async function readStorytellerRun(root: string, runId: string, queue: StorytellerQueue, directoryName = runId): Promise<StorytellerDigestSummary | undefined> {
  const runRoot = path.join(root, directoryName);
  const digest = asRecord(await readJsonFile<unknown>(path.join(runRoot, 'digest.json')));
  const digestId = stringField(digest, 'digestId') || runId;
  const topEvents = arrayField(digest.topEvents);
  const residents = arrayField(digest.residents);
  const systemHealth = asRecord(digest.systemHealth);
  const totalResidents = numberOrNullField(systemHealth, 'totalResidents');
  const hasUrgentAttentionRisk = Math.max(0, Math.trunc(numberOrNullField(systemHealth, 'lowApResidents') ?? 0)) > 0;
  const scrub = (text: string) => publicProjectorCopy(redactPublicText(text), { hasUrgentAttentionRisk });
  const summary = trimText(await readTextFile(path.join(runRoot, 'summary.txt')));

  if (!Object.keys(digest).length && !summary) return undefined;

  const dispatchRecord = asRecord(await readJsonFile<unknown>(path.join(runRoot, 'dispatch.json')));
  const dispatch = Object.keys(dispatchRecord).length
    ? (() => {
        const operatorWarnings = stringArrayField(dispatchRecord.operatorWarnings).map(scrub);
        const reviewReasons = stringArrayField(dispatchRecord.reviewReasons).map(scrub);
        const warningCount = operatorWarnings.length + reviewReasons.length;
        const needsReview = typeof dispatchRecord.needsReview === 'boolean'
          ? dispatchRecord.needsReview
          : warningCount > 0;

        const allowPublicCopy = isPublicDispatchCopyAllowed(queue, needsReview, warningCount);

        return {
          dispatchId: stringField(dispatchRecord, 'dispatchId') || `${runId}:dispatch`,
          generatedAt: stringField(dispatchRecord, 'generatedAt'),
          modelProfile: stringField(dispatchRecord, 'modelProfile'),
          needsReview,
          warningCount,
          publicTitle: allowPublicCopy ? scrubOptionalText(stringField(dispatchRecord, 'publicTitle'), scrub) : undefined,
          publicBody: allowPublicCopy ? scrubOptionalText(stringField(dispatchRecord, 'publicBody'), scrub) : undefined,
          publicBullets: allowPublicCopy ? stringArrayField(dispatchRecord.publicBullets).map(scrub) : [],
          operatorSummary: scrubOptionalText(stringField(dispatchRecord, 'operatorSummary'), scrub),
          operatorWarnings,
          reviewReasons,
          eventRefCount: arrayField(dispatchRecord.eventRefsUsed).length,
          eventRefsUsed: stringArrayField(dispatchRecord.eventRefsUsed).map(redactPublicText),
          estimatedCostUsd: numberOrNullField(dispatchRecord, 'estimatedCostUsd'),
        };
      })()
    : undefined;

  return {
    runId,
    digestId,
    queue,
    builtAt: stringField(digest, 'builtAt'),
    windowStart: stringField(digest, 'windowStart'),
    windowEnd: stringField(digest, 'windowEnd'),
    topEventCount: topEvents.length,
    topEvents: topEvents.map(event => readTopEvent(event, scrub)).filter((event): event is StorytellerDigestEventSummary => event !== undefined),
    residentCount: typeof totalResidents === 'number' ? Math.max(0, Math.trunc(totalResidents)) : residents.length,
    summary: summary ? scrub(summary) : undefined,
    dispatch,
  };
}

function isStorytellerQueueDir(name: string): boolean {
  return STORYTELLER_QUEUE_DIRS.includes(name as Exclude<StorytellerQueue, 'dry-run'>);
}

function isPublicDispatchCopyAllowed(queue: StorytellerQueue, needsReview: boolean, warningCount: number): boolean {
  return queue === 'canon' && !needsReview && warningCount === 0;
}

function readTopEvent(value: unknown, scrub: (text: string) => string): StorytellerDigestEventSummary | undefined {
  const event = asRecord(value);
  const ref = stringField(event, 'ref') || stringField(event, 'id');
  const kind = stringField(event, 'kind');
  if (!ref || !kind) return undefined;
  const note = stringField(event, 'note');
  return {
    ref,
    kind,
    ...(stringField(event, 'residentName') !== undefined ? { residentName: stringField(event, 'residentName') } : {}),
    ...(stringField(event, 'ts') !== undefined ? { ts: stringField(event, 'ts') } : {}),
    ...(note !== undefined ? { note: scrub(note) } : {}),
    ...(stringField(event, 'importance') !== undefined ? { importance: stringField(event, 'importance') } : {}),
    evidenceLabels: evidenceLabels(asRecord(event.evidence)).map(scrubEvidenceLabel),
  };
}

function sortStorytellerRuns(a: StorytellerDigestSummary, b: StorytellerDigestSummary): number {
  return (
    timestampOrZero(b.builtAt) - timestampOrZero(a.builtAt) ||
    STORYTELLER_QUEUE_PRIORITY[a.queue] - STORYTELLER_QUEUE_PRIORITY[b.queue] ||
    timestampOrZero(b.dispatch?.generatedAt) - timestampOrZero(a.dispatch?.generatedAt) ||
    a.runId.localeCompare(b.runId)
  );
}

function timestampOrZero(value: string | undefined): number {
  if (!value) return 0;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : 0;
}

function trimText(value: string | undefined): string {
  return value?.trim() || '';
}

function stringField(value: Record<string, unknown>, key: string): string | undefined {
  const field = value[key];
  return typeof field === 'string' ? field : undefined;
}

function numberOrNullField(value: Record<string, unknown>, key: string): number | null | undefined {
  const field = value[key];
  if (field === null) return null;
  const num = Number(field);
  return Number.isFinite(num) ? num : undefined;
}

function arrayField(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringArrayField(value: unknown): string[] {
  return arrayField(value).filter((item): item is string => typeof item === 'string');
}

function evidenceLabels(evidence: Record<string, unknown>): string[] {
  const labels: string[] = [];
  appendItemLabel(labels, evidence.gpItemId ?? evidence.itemId);
  appendGpLabel(labels, evidence.gpBurned ?? evidence.amountEarned ?? evidence.amountTraded ?? evidence.amount);
  appendApLabel(labels, evidence.apGranted ?? evidence.attentionCurrent ?? evidence.apDelta);
  appendThresholdLabel(labels, evidence.threshold);
  appendStringLabel(labels, 'exchange', evidence.exchangeId);
  appendStringLabel(labels, 'ncri', evidence.ncriId);
  appendStringLabel(labels, 'quest', evidence.questId, ':');
  appendStringLabel(labels, 'evidence', evidence.evidenceSource, ':');
  appendStringLabel(labels, 'source', evidence.source, ':');
  appendTickLabel(labels, evidence.tick);
  appendReasonLabels(labels, evidence.reasons);
  return labels;
}

function appendItemLabel(labels: string[], value: unknown): void {
  const itemId = finiteNumber(value);
  if (itemId === undefined) return;
  labels.push(itemId === 995 ? 'coin-995' : `item-${itemId}`);
}

function appendGpLabel(labels: string[], value: unknown): void {
  const amount = finiteNumber(value);
  if (amount === undefined) return;
  labels.push(`${Math.abs(amount).toLocaleString()} GP`);
}

function appendApLabel(labels: string[], value: unknown): void {
  const amount = finiteNumber(value);
  if (amount === undefined) return;
  labels.push(`${Math.abs(amount).toLocaleString()} AP`);
}

function appendThresholdLabel(labels: string[], value: unknown): void {
  const amount = finiteNumber(value);
  if (amount === undefined) return;
  labels.push(`threshold ${amount.toLocaleString()} AP`);
}

function appendTickLabel(labels: string[], value: unknown): void {
  const tick = finiteNumber(value);
  if (tick === undefined) return;
  labels.push(`tick ${Math.trunc(tick).toLocaleString()}`);
}

function appendReasonLabels(labels: string[], value: unknown): void {
  for (const reason of stringArrayField(value)) {
    appendStringLabel(labels, 'reason', reason, ':');
  }
}

function appendStringLabel(labels: string[], prefix: string, value: unknown, separator = ' '): void {
  if (typeof value !== 'string' || value.trim().length === 0) return;
  if (isPrivateHumanValue(value)) return;
  labels.push(`${prefix}${separator}${redactPublicText(value)}`);
}

function finiteNumber(value: unknown): number | undefined {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function redactPublicText(value: string): string {
  return value
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[human]')
    .replace(/\b(?:human|patron|city-user|user):[A-Za-z0-9._:-]+\b/gi, '[human]');
}

function scrubOptionalText(value: string | undefined, scrub: (text: string) => string): string | undefined {
  return value === undefined ? undefined : scrub(value);
}

function scrubEvidenceLabel(value: string): string {
  return redactPublicText(value)
    .replace(/\bAP\b/g, 'attention')
    .replace(/\bGP\b/g, 'RuneScape gold')
    .replace(/\bNPCs\b/g, 'Characters')
    .replace(/\bNPC\b/g, 'character');
}

function isPrivateHumanValue(value: string): boolean {
  return /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(value) || /^(?:human|patron|city-user|user):/i.test(value);
}
