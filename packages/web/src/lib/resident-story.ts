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

export interface StorytellerMythCard {
  title: string;
  body?: string;
  evidenceLabels: string[];
}

export interface StorytellerDigestStatus {
  label: 'review' | 'ready' | 'dry-run' | 'stale';
  tone: 'ok' | 'warn';
  summary: string;
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

export function storytellerMythCard(event: StorytellerDigestEventSummary): StorytellerMythCard {
  const actor = residentDisplayName(event.residentName);
  const title = `${actor} ${eventVerb(event.kind)}`;
  return {
    title,
    ...(event.note?.trim() ? { body: event.note.trim() } : {}),
    evidenceLabels: [...event.evidenceLabels],
  };
}

export function storytellerDigestStatus(digest: StorytellerDigestSummary, nowMs = Date.now()): StorytellerDigestStatus {
  if (digest.dispatch?.needsReview) {
    return {
      label: 'review',
      tone: 'warn',
      summary: 'Dispatch is grounded but needs operator review before public broadcast.',
    };
  }

  if (!digest.dispatch) {
    return {
      label: 'dry-run',
      tone: 'warn',
      summary: 'No public dispatch exists yet; showing deterministic digest evidence only.',
    };
  }

  const timestamp = digestTs(digest);
  if (timestamp > 0 && nowMs - timestamp > DAY_MS) {
    return {
      label: 'stale',
      tone: 'warn',
      summary: 'Dispatch is older than 24h; review freshness before treating it as live canon.',
    };
  }

  return {
    label: 'ready',
    tone: 'ok',
    summary: 'Dispatch is grounded and ready for public review.',
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

function residentDisplayName(name: string | undefined): string {
  const normalized = normalizeResident(name || 'city');
  return normalized
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase())
    .trim() || 'City';
}

function eventVerb(kind: string): string {
  switch (kind) {
    case 'city_ap_gp_exchange':
    case 'ap_for_gp_exchange':
    case 'ap_gp_exchange':
      return 'traded GP for attention';
    case 'city_attention_credit':
    case 'ap_topup':
    case 'ap_grant':
      return 'received attention';
    case 'request_attention':
      return 'asked for attention';
    case 'goal_completed':
      return 'completed a goal';
    case 'story_goal_progress':
    case 'goal_progress':
      return 'advanced a goal';
    case 'ncri_created':
      return 'created an NCRI';
    case 'ncri_sale':
      return 'entered an NCRI sale';
    case 'ncri_redeemed':
    case 'ncri_redemption':
      return 'redeemed an NCRI';
    case 'gp_earned':
      return 'earned GP';
    case 'gp_traded':
      return 'traded GP';
    default:
      return 'left evidence';
  }
}

function eventTs(event: StorytellerDigestEventSummary, digest: StorytellerDigestSummary): number {
  const stamp = event.ts || digest.builtAt || digest.windowEnd || digest.windowStart;
  if (!stamp) return 0;
  const ts = Date.parse(stamp);
  return Number.isFinite(ts) ? ts : 0;
}

function digestTs(digest: StorytellerDigestSummary): number {
  const stamp = digest.dispatch?.generatedAt || digest.builtAt || digest.windowEnd || digest.windowStart;
  if (!stamp) return 0;
  const ts = Date.parse(stamp);
  return Number.isFinite(ts) ? ts : 0;
}
