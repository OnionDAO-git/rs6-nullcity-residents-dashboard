import type { ResidentDashboardRow } from '@nullcity-dashboard/shared';
import type { StorytellerDigestSummary, StorytellerDigestEventSummary } from './api';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface ResidentStoryEvent {
  digest: StorytellerDigestSummary;
  event: StorytellerDigestEventSummary;
}

export interface ResidentStoryDigestSignal {
  tone: 'ok' | 'warn';
  summary: string;
  detail: string;
}

export function residentStoryEvents(
  resident: ResidentDashboardRow | undefined,
  digests: StorytellerDigestSummary[],
  limit = 5,
): ResidentStoryEvent[] {
  const residentId = resident?.name;
  if (!residentId) return [];

  const wanted = normalizeResident(residentId);
  const seenRefs = new Set<string>();
  const matches: ResidentStoryEvent[] = [];

  for (const digest of digests) {
    for (const event of digest.topEvents) {
      if (!residentMatches(wanted, event.residentName)) continue;
      const key = event.ref || `${digest.runId}:${event.kind}:${event.ts || ''}`;
      if (seenRefs.has(key)) continue;
      seenRefs.add(key);
      matches.push({ digest, event });
    }
  }

  return matches
    .sort((left, right) => eventTs(right.event, right.digest) - eventTs(left.event, left.digest))
    .slice(0, Math.max(0, limit));
}

export function residentStoryDigestSignal(
  resident: ResidentDashboardRow | undefined,
  digests: StorytellerDigestSummary[],
  nowMs = Date.now(),
): ResidentStoryDigestSignal {
  const events = residentStoryEvents(resident, digests, 1);
  if (!events.length) {
    return {
      tone: 'warn',
      summary: 'No grounded Storyteller events for this resident.',
      detail: 'Run or review digest generation to capture resident-specific evidence.',
    };
  }

  const latest = events[0];
  if (!latest) {
    return {
      tone: 'warn',
      summary: 'No grounded Storyteller events for this resident.',
      detail: 'Run or review digest generation to capture resident-specific evidence.',
    };
  }
  const age = Math.max(0, nowMs - eventTs(latest.event, latest.digest));
  const ageMinutes = Math.round(age / (60 * 1000));
  if (age > DAY_MS) {
    return {
      tone: 'warn',
      summary: 'Grounded Storyteller events found, but latest evidence is stale.',
      detail: `Latest event is ${Math.round(age / (60 * 60 * 1000))}h old (${latest.event.ref || latest.event.kind}).`,
    };
  }

  return {
    tone: 'ok',
    summary: 'Grounded Storyteller events found for this resident.',
    detail: `Latest event is ${ageMinutes}m old (${latest.event.ref || latest.event.kind}).`,
  };
}

function residentMatches(wanted: string, residentName: string | undefined): boolean {
  if (!residentName) return false;
  return normalizeResident(residentName) === wanted;
}

function normalizeResident(name: string): string {
  const normalized = name.trim().toLowerCase();
  return normalized.startsWith('res:') ? normalized.slice(4) : normalized;
}

function eventTs(event: StorytellerDigestEventSummary, digest: StorytellerDigestSummary): number {
  const stamp = event.ts || digest.builtAt || digest.windowEnd || digest.windowStart;
  if (!stamp) return 0;
  const ts = Date.parse(stamp);
  return Number.isFinite(ts) ? ts : 0;
}
