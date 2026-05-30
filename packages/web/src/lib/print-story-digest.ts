import type { StorytellerDigestEventSummary, StorytellerDigestSummary } from './api';
import type { NullCityNcriRecord } from './city-api';
import type { PrintQueueInsightSummary } from './print-queue-insights';

export type PrintStoryDigestTone = 'ok' | 'warn' | 'fail';

export interface PrintStoryDigestSignal {
  tone: PrintStoryDigestTone;
  summary: string;
  detail: string;
  eventCount: number;
  latestRunId?: string;
  latestAgeMinutes?: number;
  dispatchNeedsReview?: boolean;
  reviewReasons: string[];
  events: StorytellerDigestEventSummary[];
}

export interface PrintStoryDigestInput {
  digests: StorytellerDigestSummary[];
  printInsights: PrintQueueInsightSummary;
  ncriRecords: NullCityNcriRecord[];
  nowMs?: number;
}

const STALE_DIGEST_MS = 60 * 60 * 1000;
const NCRI_EVENT_PATTERN = /\b(ncri|print|redemption|redeemed|relic)\b/i;

export function printStoryDigestSignal(input: PrintStoryDigestInput): PrintStoryDigestSignal {
  const nowMs = input.nowMs ?? Date.now();
  const latest = latestDigest(input.digests);
  const activeNcriSignals = activeNcriSignalCount(input.printInsights, input.ncriRecords);

  if (!latest) {
    return {
      tone: activeNcriSignals > 0 ? 'warn' : 'ok',
      summary: 'No Storyteller digest',
      detail: activeNcriSignals > 0
        ? 'Run Storyteller dry-run/run so current NCRI and print activity can enter public canon.'
        : 'No current NCRI or print activity is waiting for Storyteller canon.',
      eventCount: 0,
      reviewReasons: [],
      events: [],
    };
  }

  const latestStamp = digestTimestamp(latest);
  const latestAgeMinutes = latestStamp > 0 ? Math.max(0, Math.floor((nowMs - latestStamp) / 60_000)) : undefined;
  const events = latest.topEvents.filter(isPrintStoryEvent);
  const reviewReasons = latest.dispatch?.reviewReasons || [];
  const reviewDetails = [
    ...reviewReasons,
    ...(latest.dispatch?.operatorWarnings || []),
  ];
  const dispatchNeedsReview = Boolean(latest.dispatch?.needsReview || latest.dispatch?.warningCount || reviewDetails.length);

  if (dispatchNeedsReview) {
    return {
      tone: 'warn',
      summary: 'Story needs review',
      detail: reviewDetails.length
        ? `Latest Storyteller dispatch needs review: ${reviewDetails.slice(0, 3).join('; ')}.`
        : 'Latest Storyteller dispatch is marked for operator review before public display.',
      eventCount: events.length,
      latestRunId: latest.runId,
      ...(latestAgeMinutes !== undefined ? { latestAgeMinutes } : {}),
      dispatchNeedsReview,
      reviewReasons,
      events,
    };
  }

  if (latestAgeMinutes !== undefined && latestAgeMinutes * 60_000 > STALE_DIGEST_MS) {
    return {
      tone: 'warn',
      summary: 'Story digest stale',
      detail: `Latest Storyteller digest is ${latestAgeMinutes.toLocaleString()}m old; rerun it before presenting print/NCRI canon.`,
      eventCount: events.length,
      latestRunId: latest.runId,
      latestAgeMinutes,
      dispatchNeedsReview,
      reviewReasons,
      events,
    };
  }

  if (activeNcriSignals > 0 && events.length === 0) {
    return {
      tone: 'warn',
      summary: 'NCRI not in latest story',
      detail: `${activeNcriSignals.toLocaleString()} NCRI signal${activeNcriSignals === 1 ? '' : 's'} exist, but the latest Storyteller digest has no NCRI/print top event.`,
      eventCount: 0,
      latestRunId: latest.runId,
      ...(latestAgeMinutes !== undefined ? { latestAgeMinutes } : {}),
      dispatchNeedsReview,
      reviewReasons,
      events,
    };
  }

  return {
    tone: 'ok',
    summary: events.length > 0 ? 'NCRI canon linked' : 'No NCRI canon pending',
    detail: events.length > 0
      ? `Latest Storyteller digest cites ${events.length.toLocaleString()} print/NCRI event${events.length === 1 ? '' : 's'}: ${events.map(event => event.kind).slice(0, 3).join(', ')}.`
      : 'No current NCRI or print activity is waiting for Storyteller canon.',
    eventCount: events.length,
    latestRunId: latest.runId,
    ...(latestAgeMinutes !== undefined ? { latestAgeMinutes } : {}),
    dispatchNeedsReview,
    reviewReasons,
    events,
  };
}

function latestDigest(digests: StorytellerDigestSummary[]): StorytellerDigestSummary | undefined {
  return digests
    .slice()
    .sort((left, right) => digestTimestamp(right) - digestTimestamp(left))[0];
}

function digestTimestamp(digest: StorytellerDigestSummary): number {
  const stamp = digest.dispatch?.generatedAt || digest.builtAt || digest.windowEnd || digest.windowStart;
  if (!stamp) return 0;
  const parsed = Date.parse(stamp);
  return Number.isFinite(parsed) ? parsed : 0;
}

function activeNcriSignalCount(printInsights: PrintQueueInsightSummary, ncriRecords: NullCityNcriRecord[]): number {
  return printInsights.ncriTrades.pending +
    printInsights.ncriTrades.accepted +
    printInsights.ncriTrades.failed +
    ncriRecords.filter(record => record.approvalStatus === 'approved' || record.redemptionStatus === 'available').length;
}

function isPrintStoryEvent(event: StorytellerDigestEventSummary): boolean {
  const haystack = [
    event.kind,
    event.note,
    event.ref,
    event.residentName,
    ...event.evidenceLabels,
  ].filter(Boolean).join(' ');
  return NCRI_EVENT_PATTERN.test(haystack);
}
