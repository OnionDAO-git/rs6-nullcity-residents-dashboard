import fs from 'node:fs/promises';
import path from 'node:path';
import { asRecord, readJsonFile, readTextFile } from './util';

export interface StorytellerDigestSummary {
  runId: string;
  digestId: string;
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

const DEFAULT_LIMIT = 12;

export async function readStorytellerDigestFeed(memoryRoot: string, limit = DEFAULT_LIMIT): Promise<StorytellerDigestFeed> {
  const storytellerRoot = path.join(path.dirname(memoryRoot), 'storyteller');

  let entries: Array<{ name: string; isDirectory(): boolean }> = [];
  try {
    entries = (await fs.readdir(storytellerRoot, { withFileTypes: true })) as Array<{ name: string; isDirectory(): boolean }>;
  } catch {
    return { items: [] };
  }

  const rows = await Promise.all(
    entries
      .filter(entry => entry.isDirectory())
      .map(async entry => readStorytellerRun(storytellerRoot, entry.name)),
  );

  return {
    items: rows
      .filter((row): row is StorytellerDigestSummary => Boolean(row))
      .sort((a, b) => sortStorytellerRuns(a, b))
      .slice(0, Math.max(0, limit)),
  };
}

async function readStorytellerRun(root: string, runId: string): Promise<StorytellerDigestSummary | undefined> {
  const runRoot = path.join(root, runId);
  const digest = asRecord(await readJsonFile<unknown>(path.join(runRoot, 'digest.json')));
  const digestId = stringField(digest, 'digestId') || runId;
  const topEvents = arrayField(digest.topEvents);
  const residents = arrayField(digest.residents);
  const summary = trimText(await readTextFile(path.join(runRoot, 'summary.txt')));

  if (!Object.keys(digest).length && !summary) return undefined;

  const dispatchRecord = asRecord(await readJsonFile<unknown>(path.join(runRoot, 'dispatch.json')));
  const dispatch = Object.keys(dispatchRecord).length
    ? {
        dispatchId: stringField(dispatchRecord, 'dispatchId') || `${runId}:dispatch`,
        generatedAt: stringField(dispatchRecord, 'generatedAt'),
        modelProfile: stringField(dispatchRecord, 'modelProfile'),
        needsReview: Boolean(dispatchRecord.needsReview),
        warningCount: arrayField(dispatchRecord.reviewReasons).length,
        publicTitle: redactOptionalText(stringField(dispatchRecord, 'publicTitle')),
        publicBody: redactOptionalText(stringField(dispatchRecord, 'publicBody')),
        publicBullets: stringArrayField(dispatchRecord.publicBullets).map(redactPublicText),
        operatorSummary: redactOptionalText(stringField(dispatchRecord, 'operatorSummary')),
        operatorWarnings: stringArrayField(dispatchRecord.operatorWarnings).map(redactPublicText),
        reviewReasons: stringArrayField(dispatchRecord.reviewReasons).map(redactPublicText),
        eventRefCount: arrayField(dispatchRecord.eventRefsUsed).length,
        eventRefsUsed: stringArrayField(dispatchRecord.eventRefsUsed).map(redactPublicText),
        estimatedCostUsd: numberOrNullField(dispatchRecord, 'estimatedCostUsd'),
      }
    : undefined;

  return {
    runId,
    digestId,
    builtAt: stringField(digest, 'builtAt'),
    windowStart: stringField(digest, 'windowStart'),
    windowEnd: stringField(digest, 'windowEnd'),
    topEventCount: topEvents.length,
    topEvents: topEvents.map(readTopEvent).filter((event): event is StorytellerDigestEventSummary => event !== undefined),
    residentCount: residents.length,
    summary: summary || undefined,
    dispatch,
  };
}

function readTopEvent(value: unknown): StorytellerDigestEventSummary | undefined {
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
    ...(note !== undefined ? { note: redactPublicText(note) } : {}),
    ...(stringField(event, 'importance') !== undefined ? { importance: stringField(event, 'importance') } : {}),
    evidenceLabels: evidenceLabels(asRecord(event.evidence)),
  };
}

function sortStorytellerRuns(a: StorytellerDigestSummary, b: StorytellerDigestSummary): number {
  return timestampOrZero(b.builtAt) - timestampOrZero(a.builtAt);
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
    .replace(/\b(?:patron|city-user|user):[A-Za-z0-9._:-]+\b/gi, '[human]');
}

function redactOptionalText(value: string | undefined): string | undefined {
  return value === undefined ? undefined : redactPublicText(value);
}

function isPrivateHumanValue(value: string): boolean {
  return /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(value) || /^(?:patron|city-user|user):/i.test(value);
}
