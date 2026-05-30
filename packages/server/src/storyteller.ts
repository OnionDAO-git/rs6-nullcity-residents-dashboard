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
  residentCount: number;
  summary?: string;
  dispatch?: {
    dispatchId: string;
    generatedAt?: string;
    modelProfile?: string;
    needsReview: boolean;
    warningCount: number;
    publicTitle?: string;
    eventRefCount: number;
    estimatedCostUsd?: number | null;
  };
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
        publicTitle: stringField(dispatchRecord, 'publicTitle'),
        eventRefCount: arrayField(dispatchRecord.eventRefsUsed).length,
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
    residentCount: residents.length,
    summary: summary || undefined,
    dispatch,
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
