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

export interface StorytellerDigestRunList {
  visible: StorytellerDigestSummary[];
  collapsedDryRuns: number;
  selectedCollapsedDryRun: boolean;
  summary: string;
}

export interface StorytellerGroundingAudit {
  tone: 'ok' | 'warn';
  summary: string;
  citedKnownRefs: string[];
  missingRefs: string[];
  uncitedTopRefs: string[];
  warningCount: number;
  reviewReasonCount: number;
}

export interface StorytellerReviewDensity {
  tone: 'ok' | 'warn';
  headline: string;
  detail: string;
  chips: string[];
}

export interface StorytellerLatestPreview {
  tone: 'ok' | 'warn';
  source: 'dispatch' | 'events' | 'summary' | 'empty';
  label: StorytellerDigestStatus['label'] | 'waiting';
  title: string;
  body: string;
  detail: string;
  bullets: string[];
}

export interface StorytellerLibraryPreview {
  tone: StorytellerLatestPreview['tone'];
  source: StorytellerLatestPreview['source'];
  statusLabel: StorytellerLatestPreview['label'];
  title: string;
  body: string;
  detail: string;
  runLabel: string;
  eventLabel: string;
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
      if (!eventMatchesResident(wanted, event)) continue;
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
  const actor = eventActorDisplayName(event);
  const title = eventTitle(event, actor);
  const body = eventBody(event, actor);
  const evidenceLabels = event.evidenceLabels.filter(label => label.trim().length > 0);
  return {
    title,
    ...(body ? { body } : {}),
    evidenceLabels: evidenceLabels.length ? evidenceLabels : ['grounded evidence'],
  };
}

function eventTitle(event: StorytellerDigestEventSummary, actor: string): string {
  if (isSpeechEvent(event)) return `${actor} spoke in the city`;
  return `${actor} ${eventVerb(event.kind)}`;
}

function eventActorDisplayName(event: StorytellerDigestEventSummary): string {
  const speaker = speechEventSpeakerName(event);
  return speaker ? residentDisplayName(speaker) : residentDisplayName(event.residentName);
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

export function storytellerLatestPreview(
  digest: StorytellerDigestSummary | undefined,
  nowMs = Date.now(),
): StorytellerLatestPreview {
  if (!digest) {
    return {
      tone: 'warn',
      source: 'empty',
      label: 'waiting',
      title: 'No Storyteller run loaded',
      body: 'Digest and dispatch artifacts will appear once the controller writes grounded Storyteller runs.',
      detail: 'No latest Storyteller digest is available yet.',
      bullets: [],
    };
  }

  const status = storytellerDigestStatus(digest, nowMs);
  const dispatchTitle = digest.dispatch?.publicTitle?.trim();
  const dispatchBody = digest.dispatch?.publicBody?.trim();
  const bullets = cleanBullets(digest.dispatch?.publicBullets || []);
  const title = dispatchTitle || digest.summary?.trim() || digest.digestId || digest.runId;

  if (status.label === 'ready' && dispatchBody) {
    return {
      tone: status.tone,
      source: 'dispatch',
      label: status.label,
      title,
      body: dispatchBody,
      detail: status.summary,
      bullets,
    };
  }

  const eventLines = digest.topEvents
    .slice(0, 3)
    .map(storytellerEventPreviewLine)
    .filter(line => line.length > 0);
  if (eventLines.length) {
    return {
      tone: status.tone,
      source: 'events',
      label: status.label,
      title,
      body: eventLines.join(' '),
      detail: `${status.summary} Preview is derived from ${plural(eventLines.length, 'grounded top event')}.`,
      bullets: status.label === 'ready' ? bullets : [],
    };
  }

  return {
    tone: status.tone,
    source: 'summary',
    label: status.label,
    title,
    body: digest.summary?.trim() || 'No grounded top events are available for this Storyteller run yet.',
    detail: `${status.summary} No grounded top events are available for a public preview.`,
    bullets: status.label === 'ready' ? bullets : [],
  };
}

export function storytellerLibraryPreview(
  digest: StorytellerDigestSummary | undefined,
  nowMs = Date.now(),
): StorytellerLibraryPreview {
  if (!digest) {
    return {
      tone: 'warn',
      source: 'empty',
      statusLabel: 'waiting',
      title: 'No Library story digest yet',
      body: 'Grounded resident stories will appear here once Storyteller has a digest to review.',
      detail: 'Open the Storyteller feed for operator review context.',
      runLabel: '-',
      eventLabel: '0 events',
    };
  }
  const preview = storytellerLatestPreview(digest, nowMs);
  return {
    tone: preview.tone,
    source: preview.source,
    statusLabel: preview.label,
    title: preview.title,
    body: preview.body,
    detail: preview.detail,
    runLabel: digest.runId || '-',
    eventLabel: plural(digest.topEventCount || digest.topEvents.length, 'event'),
  };
}

export function storytellerDigestRunList(digests: StorytellerDigestSummary[], selectedRunId = ''): StorytellerDigestRunList {
  const visible: StorytellerDigestSummary[] = [];
  const selectedId = selectedRunId.trim();
  let dryRunSeen = false;
  let collapsedDryRuns = 0;
  let selectedCollapsedDryRun = false;

  for (const digest of digests) {
    if (isDryRunDigest(digest)) {
      if (dryRunSeen) {
        if (digestMatchesSelectedRun(digest, selectedId)) {
          visible.push(digest);
          selectedCollapsedDryRun = true;
          continue;
        }
        collapsedDryRuns += 1;
        continue;
      }
      dryRunSeen = true;
    }
    visible.push(digest);
  }

  return {
    visible,
    collapsedDryRuns,
    selectedCollapsedDryRun,
    summary: collapsedDryRuns > 0
      ? selectedCollapsedDryRun
        ? `Showing canon/review runs, latest dry-run, and selected dry-run; ${collapsedDryRuns.toLocaleString()} other older dry-run${collapsedDryRuns === 1 ? '' : 's'} collapsed.`
        : `Showing canon/review runs plus latest dry-run; ${collapsedDryRuns.toLocaleString()} older dry-run${collapsedDryRuns === 1 ? '' : 's'} collapsed.`
      : visible.length > 0
        ? 'Showing all loaded Storyteller runs.'
        : 'No Storyteller runs loaded yet.',
  };
}

export function storytellerGroundingAudit(digest: StorytellerDigestSummary): StorytellerGroundingAudit {
  const topRefs = uniqueRefs(digest.topEvents.map(event => event.ref));
  const dispatchRefs = uniqueRefs(digest.dispatch?.eventRefsUsed || []);
  const topRefSet = new Set(topRefs);
  const dispatchRefSet = new Set(dispatchRefs);
  const citedKnownRefs = dispatchRefs.filter(ref => topRefSet.has(ref));
  const missingRefs = dispatchRefs.filter(ref => !topRefSet.has(ref));
  const uncitedTopRefs = topRefs.filter(ref => !dispatchRefSet.has(ref));
  const warningCount = digest.dispatch
    ? Math.max(digest.dispatch.warningCount || 0, digest.dispatch.operatorWarnings.length)
    : 0;
  const reviewReasonCount = digest.dispatch?.reviewReasons.length || 0;
  const hasReviewSignals = Boolean(digest.dispatch?.needsReview || warningCount > 0 || reviewReasonCount > 0);
  const tone: StorytellerGroundingAudit['tone'] = !digest.dispatch || missingRefs.length > 0 || hasReviewSignals ? 'warn' : 'ok';

  return {
    tone,
    summary: storytellerGroundingSummary({
      hasDispatch: Boolean(digest.dispatch),
      citedKnownRefs: citedKnownRefs.length,
      missingRefs: missingRefs.length,
      uncitedTopRefs: uncitedTopRefs.length,
      hasReviewSignals,
    }),
    citedKnownRefs,
    missingRefs,
    uncitedTopRefs,
    warningCount,
    reviewReasonCount,
  };
}

export function storytellerReviewDensity(digest: StorytellerDigestSummary): StorytellerReviewDensity {
  const audit = storytellerGroundingAudit(digest);
  const dispatchRefs = uniqueRefs(digest.dispatch?.eventRefsUsed || []);
  const topEventTotal = Math.max(digest.topEventCount || 0, digest.topEvents.length);
  const residentTotal = digest.residentCount || 0;

  if (!digest.dispatch) {
    return {
      tone: 'warn',
      headline: `Dry-run: ${plural(topEventTotal, 'grounded event')} await dispatch`,
      detail: `${withoutTrailingPeriod(audit.summary)}; ${plural(topEventTotal, 'top event')} ${topEventTotal === 1 ? 'is' : 'are'} available across ${plural(residentTotal, 'resident')}.`,
      chips: ['0 matched', '0 missing', `${audit.uncitedTopRefs.length.toLocaleString()} uncited`, 'dry-run'],
    };
  }

  const reviewSignals =
    audit.missingRefs.length +
    audit.warningCount +
    audit.reviewReasonCount +
    (digest.dispatch.needsReview ? 1 : 0);

  if (reviewSignals > 0) {
    const pressure = [
      audit.missingRefs.length > 0 ? plural(audit.missingRefs.length, 'missing dispatch ref') : '',
      audit.warningCount > 0 ? plural(audit.warningCount, 'warning') : '',
      audit.reviewReasonCount > 0 ? plural(audit.reviewReasonCount, 'review reason') : '',
      digest.dispatch.needsReview ? 'review flag' : '',
    ].filter(Boolean);

    return {
      tone: 'warn',
      headline: `Review load: ${plural(reviewSignals, 'signal')}`,
      detail: `${joinHumanList(pressure)} across ${plural(dispatchRefs.length, 'dispatch ref')} and ${plural(topEventTotal, 'top event')}.`,
      chips: [
        `${audit.citedKnownRefs.length.toLocaleString()} matched`,
        `${audit.missingRefs.length.toLocaleString()} missing`,
        `${audit.uncitedTopRefs.length.toLocaleString()} uncited`,
        `${audit.warningCount.toLocaleString()} warning${audit.warningCount === 1 ? '' : 's'}`,
        `${audit.reviewReasonCount.toLocaleString()} review reason${audit.reviewReasonCount === 1 ? '' : 's'}`,
      ],
    };
  }

  return {
    tone: 'ok',
    headline: `Ready: ${audit.citedKnownRefs.length.toLocaleString()}/${topEventTotal.toLocaleString()} top events cited`,
    detail: audit.uncitedTopRefs.length > 0
      ? `${plural(audit.uncitedTopRefs.length, 'uncited top event')} remain${audit.uncitedTopRefs.length === 1 ? 's' : ''} available for operator context.`
      : 'Every grounded top event is cited by the dispatch.',
    chips: [
      `${audit.citedKnownRefs.length.toLocaleString()} matched`,
      `${audit.missingRefs.length.toLocaleString()} missing`,
      `${audit.uncitedTopRefs.length.toLocaleString()} uncited`,
      '0 review signals',
    ],
  };
}

export function storytellerRunListPressureLine(digest: StorytellerDigestSummary): string {
  const density = storytellerReviewDensity(digest);
  return [density.headline, ...density.chips].join(' · ');
}

function residentMatches(wanted: string, residentName: string | undefined): boolean {
  if (!residentName) return false;
  return normalizeResident(residentName) === wanted;
}

function eventMatchesResident(wanted: string, event: StorytellerDigestEventSummary): boolean {
  const speechSpeaker = speechEventSpeakerName(event);
  return residentMatches(wanted, speechSpeaker || event.residentName);
}

function storytellerGroundingSummary(input: {
  hasDispatch: boolean;
  citedKnownRefs: number;
  missingRefs: number;
  uncitedTopRefs: number;
  hasReviewSignals: boolean;
}): string {
  if (!input.hasDispatch) {
    return 'No dispatch refs to audit yet.';
  }
  if (input.missingRefs > 0) {
    const review = input.hasReviewSignals ? '; review signals present' : '';
    return `${plural(input.missingRefs, 'dispatch ref')} missing from top events${review}.`;
  }

  const uncited = input.uncitedTopRefs > 0
    ? `${plural(input.uncitedTopRefs, 'top event')} uncited`
    : input.citedKnownRefs === 0
      ? 'no top events selected'
      : 'all top events cited';
  const review = input.hasReviewSignals ? '; review signals present' : '';
  const matchVerb = input.citedKnownRefs === 1 ? 'matches' : 'match';
  return `${plural(input.citedKnownRefs, 'dispatch ref')} ${matchVerb} top events; ${uncited}${review}.`;
}

function uniqueRefs(refs: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const ref of refs) {
    const normalized = ref.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function plural(count: number, singular: string): string {
  return `${count.toLocaleString()} ${singular}${count === 1 ? '' : 's'}`;
}

function joinHumanList(items: string[]): string {
  if (items.length === 0) return '0 review signals';
  if (items.length === 1) return items[0] || '';
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items.at(-1)}`;
}

function withoutTrailingPeriod(value: string): string {
  return value.trim().replace(/\.$/, '');
}

function cleanBullets(bullets: string[]): string[] {
  return bullets.map(bullet => bullet.trim()).filter(bullet => bullet.length > 0);
}

function storytellerEventPreviewLine(event: StorytellerDigestEventSummary): string {
  const myth = storytellerMythCard(event);
  return myth.body ? `${myth.title}: ${myth.body}` : myth.title;
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
    case 'ap_granted':
      return 'received attention';
    case 'ap_low':
      return 'ran low on attention';
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
    case 'gp_observed':
      return 'showed GP proof';
    case 'gp_traded':
      return 'traded GP';
    case 'resident_faded':
      return 'faded from the live window';
    case 'stuck_recovered':
      return 'got moving again';
    case 'say':
      return 'spoke in the city';
    case 'patron_gift':
      return 'received patron support';
    case 'quiet_resident':
      return 'went quiet';
    default:
      return 'left evidence';
  }
}

function eventBody(event: StorytellerDigestEventSummary, actor: string): string | undefined {
  if (event.kind === 'stuck_recovered') return `${actor} recovered and kept moving.`;
  if (isSpeechEvent(event)) return speechEventBody(event);
  return event.note?.trim() || undefined;
}

function speechEventBody(event: StorytellerDigestEventSummary): string | undefined {
  const note = event.note?.trim();
  if (!note) return undefined;
  const said = note.match(/^[^:]+:[^\s]+\s+said:\s*(.+)$/i) || note.match(/^.+?\s+said:\s*(.+)$/i);
  return (said?.[1] || note).trim();
}

function speechEventSpeakerDisplayName(event: StorytellerDigestEventSummary): string | undefined {
  const speaker = speechEventSpeakerName(event);
  return speaker ? residentDisplayName(speaker) : undefined;
}

function speechEventSpeakerName(event: StorytellerDigestEventSummary): string | undefined {
  if (!isSpeechEvent(event)) return undefined;
  const note = event.note?.trim();
  if (!note) return undefined;
  return note.match(/^((?:city-user:)?res:[^\s]+|resident:[^\s]+)\s+said:/i)?.[1];
}

function isSpeechEvent(event: StorytellerDigestEventSummary): boolean {
  return event.kind === 'say' || /\bsaid:\s*/i.test(event.note || '');
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

function isDryRunDigest(digest: StorytellerDigestSummary): boolean {
  return digest.queue === 'dry-run' || !digest.dispatch;
}

function digestMatchesSelectedRun(digest: StorytellerDigestSummary, selectedRunId: string): boolean {
  return selectedRunId.length > 0 && (digest.runId === selectedRunId || digest.digestId === selectedRunId);
}

function parseTimestamp(stamp: string | undefined): number {
  if (!stamp) return 0;
  const ts = Date.parse(stamp);
  return Number.isFinite(ts) ? ts : 0;
}
