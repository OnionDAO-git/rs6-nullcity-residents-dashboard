import fs from 'node:fs/promises';
import { Buffer } from 'node:buffer';
import path from 'node:path';
import { asRecord, residentSlug } from './util';

/**
 * Resident economy read model surfaced by the dashboard BFF.
 *
 * Reads three substrate artifacts directly from `<memoryRoot>`:
 *   1. `<slug>/runtime-state.json#attention` for the live AP balance.
 *   2. `city-integration/economy-events.jsonl` for the last N events that
 *      mention this resident (newest first).
 *   3. `city-integration/goals/*.json` for active GoalContracts owned by
 *      this resident.
 *
 * All sources are optional: when files don't exist (substrate not wired
 * yet, or this resident has no economy footprint), the response is an
 * empty-state shaped payload (`ap: 0`, empty arrays) instead of an error.
 */

export interface EconomyEventSummary {
  id: string;
  ts: string;
  kind: string;
  apDelta?: number;
  gpDelta?: number;
  ncriId?: string;
  note?: string;
}

export interface ActiveGoalSummary {
  id: string;
  goalText: string;
  completion?: {
    condition: string;
    evidenceSource: string;
  };
}

export interface ResidentEconomy {
  ap: number;
  recentEvents: EconomyEventSummary[];
  activeGoals: ActiveGoalSummary[];
}

export interface ReadResidentEconomyOptions {
  /** How many recent events to surface. Default 10. */
  recentEventLimit?: number;
}

export interface ReadNewestTextLinesOptions {
  /** Read chunk size for backwards scans. Default 64 KiB. */
  chunkBytes?: number;
}

const DEFAULT_TAIL_CHUNK_BYTES = 64 * 1024;

export async function readResidentEconomy(
  memoryRoot: string,
  resident: string,
  options: ReadResidentEconomyOptions = {},
): Promise<ResidentEconomy> {
  const slug = residentSlug(resident);
  const residentName = canonicalResidentName(resident, slug);
  const limit = Math.max(1, Math.min(100, options.recentEventLimit ?? 10));

  const [ap, recentEvents, activeGoals] = await Promise.all([
    readApBalance(memoryRoot, slug),
    readRecentEconomyEvents(memoryRoot, residentName, limit),
    readActiveGoals(memoryRoot, residentName),
  ]);

  return { ap, recentEvents, activeGoals };
}

function canonicalResidentName(input: string, slug: string): string {
  const trimmed = input.trim().toLowerCase();
  if (trimmed.startsWith('res:')) return trimmed;
  return `res:${slug}`;
}

async function readApBalance(memoryRoot: string, slug: string): Promise<number> {
  const statePath = path.join(memoryRoot, slug, 'runtime-state.json');
  try {
    const raw = await fs.readFile(statePath, 'utf8');
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const attention = parsed.attention;
    if (typeof attention === 'number' && Number.isFinite(attention)) return Math.max(0, attention);
    return 0;
  } catch {
    return 0;
  }
}

async function readRecentEconomyEvents(memoryRoot: string, residentName: string, limit: number): Promise<EconomyEventSummary[]> {
  const logPath = path.join(memoryRoot, 'city-integration', 'economy-events.jsonl');
  const out: EconomyEventSummary[] = [];
  try {
    for await (const line of newestTextLines(logPath)) {
      if (out.length >= limit) break;
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(line) as Record<string, unknown>;
      } catch {
        continue;
      }
      if (typeof parsed.residentName === 'string' && parsed.residentName !== residentName) continue;
      if (typeof parsed.residentName !== 'string') continue; // skip non-resident events
      const summary = toEventSummary(parsed);
      if (summary) out.push(summary);
    }
  } catch {
    return [];
  }
  return out;
}

export async function readNewestTextLines(filePath: string, lineLimit: number, options: ReadNewestTextLinesOptions = {}): Promise<string[]> {
  const limit = Math.max(0, Math.floor(lineLimit));
  if (limit === 0) return [];

  const lines: string[] = [];
  for await (const line of newestTextLines(filePath, options)) {
    lines.push(line);
    if (lines.length >= limit) break;
  }
  return lines;
}

async function* newestTextLines(filePath: string, options: ReadNewestTextLinesOptions = {}): AsyncGenerator<string> {
  const chunkBytes = Math.max(1, Math.floor(options.chunkBytes ?? DEFAULT_TAIL_CHUNK_BYTES));
  const file = await fs.open(filePath, 'r');
  try {
    const stat = await file.stat();
    let position = stat.size;
    let carry = '';

    while (position > 0) {
      const readSize = Math.min(chunkBytes, position);
      position -= readSize;
      const buffer = Buffer.allocUnsafe(readSize);
      const { bytesRead } = await file.read(buffer, 0, readSize, position);
      if (bytesRead <= 0) break;

      const text = buffer.subarray(0, bytesRead).toString('utf8') + carry;
      const parts = text.split(/\r?\n/);
      carry = parts.shift() ?? '';
      for (let i = parts.length - 1; i >= 0; i--) {
        const line = parts[i]?.trim();
        if (line) yield line;
      }
    }

    const line = carry.trim();
    if (line) yield line;
  } finally {
    await file.close();
  }
}

function toEventSummary(value: Record<string, unknown>): EconomyEventSummary | undefined {
  const id = typeof value.id === 'string' ? value.id : undefined;
  const ts = typeof value.ts === 'string' ? value.ts : undefined;
  const kind = typeof value.kind === 'string' ? value.kind : undefined;
  if (!id || !ts || !kind) return undefined;
  const summary: EconomyEventSummary = { id, ts, kind };
  if (typeof value.apDelta === 'number' && Number.isFinite(value.apDelta)) summary.apDelta = value.apDelta;
  if (typeof value.gpDelta === 'number' && Number.isFinite(value.gpDelta)) summary.gpDelta = value.gpDelta;
  if (typeof value.ncriId === 'string' && value.ncriId.length > 0) summary.ncriId = value.ncriId;
  if (typeof value.note === 'string' && value.note.length > 0) summary.note = value.note;
  return summary;
}

async function readActiveGoals(memoryRoot: string, residentName: string): Promise<ActiveGoalSummary[]> {
  const goalDir = path.join(memoryRoot, 'city-integration', 'goals');
  let entries: string[];
  try {
    entries = await fs.readdir(goalDir);
  } catch {
    return [];
  }
  const out: ActiveGoalSummary[] = [];
  for (const fname of entries) {
    if (!fname.endsWith('.json')) continue;
    let raw: string;
    try {
      raw = await fs.readFile(path.join(goalDir, fname), 'utf8');
    } catch {
      continue;
    }
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      continue;
    }
    if (parsed.residentName !== residentName) continue;
    if (parsed.status !== 'active') continue;
    const id = typeof parsed.id === 'string' ? parsed.id : undefined;
    const goalText = typeof parsed.goalText === 'string' ? parsed.goalText : undefined;
    if (!id || !goalText) continue;
    const summary: ActiveGoalSummary = { id, goalText };
    const completion = asRecord(parsed.completion);
    if (typeof completion.condition === 'string' && typeof completion.evidenceSource === 'string') {
      summary.completion = { condition: completion.condition, evidenceSource: completion.evidenceSource };
    }
    out.push(summary);
  }
  return out.sort((a, b) => a.goalText.localeCompare(b.goalText));
}
