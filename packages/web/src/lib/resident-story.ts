import type { ResidentDashboardRow } from '@nullcity-dashboard/shared';
import type { StorytellerDigestSummary, StorytellerDigestEventSummary } from './api';

const DAY_MS = 24 * 60 * 60 * 1000;
const FUTURE_SKEW_MS = 5 * 60 * 1000;

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
  const ts = parseTimestamp(latest.event.ts);
  if (ts <= 0) {
    return {
      tone: 'warn',
      summary: 'Storyteller evidence exists, but event freshness is unknown.',
      detail: `Latest event has no valid timestamp (${latest.event.ref || latest.event.kind}).`,
    };
  }
  if (ts - nowMs > FUTURE_SKEW_MS) {
    return {
      tone: 'warn',
      summary: 'Storyteller evidence exists, but latest event timestamp is ahead of local time.',
      detail: `Latest event appears ${(Math.round((ts - nowMs) / 60000))}m in the future (${latest.event.ref || latest.event.kind}).`,
    };
  }

  const status = storytellerDigestStatus(latest.digest, nowMs);
  if (status.label === 'review' || status.label === 'stale') {
    return {
      tone: 'warn',
      summary: 'Storyteller evidence exists, but latest digest still needs operator review.',
      detail: `${status.summary} Latest event: ${latest.event.ref || latest.event.kind}.`,
    };
  }

  const age = Math.max(0, nowMs - ts);
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
  const evidenceLabels = event.evidenceLabels.filter(label => label.trim().length > 0);
  return {
    title,
    ...(event.note?.trim() ? { body: event.note.trim() } : {}),
    evidenceLabels: evidenceLabels.length ? evidenceLabels : ['grounded evidence'],
  };
}

export function storytellerDigestStatus(digest: StorytellerDigestSummary, nowMs = Date.now()): StorytellerDigestStatus {
  if (digest.dispatch?.needsReview || hasDispatchWarnings(digest)) {
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
  if (timestamp > nowMs + FUTURE_SKEW_MS) {
    return {
      label: 'review',
      tone: 'warn',
      summary: 'Dispatch timestamp is ahead of local time; verify clock sync before trusting canon freshness.',
    };
  }
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
  let normalized = name.trim().toLowerCase();
  for (;;) {
    if (normalized.startsWith('city-user:')) {
      normalized = normalized.slice('city-user:'.length);
      continue;
    }
    if (normalized.startsWith('resident:')) {
      normalized = normalized.slice('resident:'.length);
      continue;
    }
    if (normalized.startsWith('res:')) {
      normalized = normalized.slice('res:'.length);
      continue;
    }
    break;
  }
  return normalized;
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
    case 'ncri_gift':
      return 'received an NCRI gift';
    case 'ncri_admin_transfer':
      return 'received an admin NCRI transfer';
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
  return parseTimestamp(stamp);
}

function digestTs(digest: StorytellerDigestSummary): number {
  const stamp = digest.dispatch?.generatedAt || digest.builtAt || digest.windowEnd || digest.windowStart;
  return parseTimestamp(stamp);
}

function hasDispatchWarnings(digest: StorytellerDigestSummary): boolean {
  const dispatch = digest.dispatch;
  if (!dispatch) return false;
  if (typeof dispatch.warningCount === 'number' && dispatch.warningCount > 0) return true;
  if (Array.isArray(dispatch.operatorWarnings) && dispatch.operatorWarnings.length > 0) return true;
  if (Array.isArray(dispatch.reviewReasons) && dispatch.reviewReasons.length > 0) return true;
  if ((typeof dispatch.eventRefCount === 'number' && dispatch.eventRefCount === 0) && digest.topEventCount > 0) return true;
  return false;
}

function parseTimestamp(stamp: string | undefined): number {
  if (!stamp) return 0;
  const ts = Date.parse(stamp);
  return Number.isFinite(ts) ? ts : 0;
}
