import type { ResidentDashboardRow } from '@nullcity-dashboard/shared';
import type { StorytellerDigestSummary } from './api';
import type { PrintQueueInsightSummary } from './print-queue-insights';
import { residentCoinEvidenceAmount, residentLoopSignal, residentNeedsAp } from './resident-loop';

export type ReleaseReadinessStatus = 'ready' | 'watch' | 'blocked';
export type ReleaseReadinessTone = 'ok' | 'warn' | 'fail';

export interface ReleaseReadinessCheck {
  id: 'residents' | 'plans' | 'ap' | 'gp' | 'storyteller' | 'ncri-print';
  label: string;
  tone: ReleaseReadinessTone;
  value: string;
  detail: string;
}

export interface ReleaseReadinessMetrics {
  residents: number;
  onlineResidents: number;
  activePlans: number;
  lowApResidents: number;
  observedGp: number;
  latestStorytellerAgeMinutes?: number;
}

export interface ReleaseReadinessSummary {
  status: ReleaseReadinessStatus;
  headline: string;
  detail: string;
  checks: ReleaseReadinessCheck[];
  metrics: ReleaseReadinessMetrics;
  blockers: string[];
  nextActions: string[];
}

export interface ReleaseReadinessInput {
  residents: ResidentDashboardRow[];
  storyDigests: StorytellerDigestSummary[];
  printInsights: PrintQueueInsightSummary;
  nowMs?: number;
}

const LOW_AP_DEMO_THRESHOLD = 10;
const STORYTELLER_STALE_MS = 60 * 60 * 1000;

export function buildReleaseReadiness(input: ReleaseReadinessInput): ReleaseReadinessSummary {
  const nowMs = input.nowMs ?? Date.now();
  const residents = input.residents;
  const onlineResidents = residents.filter(row => row.online).length;
  const lowApResidents = residents.filter(row => residentNeedsAp(row)).length;
  const activePlans = residents.filter(row => {
    const signal = residentLoopSignal(row);
    return signal.plan !== '-' && signal.plan !== 'No active plan published';
  }).length;
  const observedGp = residents.reduce((sum, row) => sum + residentCoinEvidenceAmount(row), 0);
  const latestDigest = latestStorytellerDigest(input.storyDigests);
  const latestStorytellerAgeMinutes = latestDigest ? digestAgeMinutes(latestDigest, nowMs) : undefined;

  const checks: ReleaseReadinessCheck[] = [
    residentCheck(residents.length, onlineResidents),
    planCheck(activePlans, residents.length),
    apCheck(lowApResidents),
    gpCheck(observedGp),
    storytellerCheck(latestDigest, latestStorytellerAgeMinutes),
    ncriPrintCheck(input.printInsights),
  ];

  const blockers = checks.filter(check => check.tone === 'fail').map(check => check.detail);
  const nextActions = nextActionsFor(checks);
  const status = blockers.length ? 'blocked' : checks.some(check => check.tone === 'warn') ? 'watch' : 'ready';

  return {
    status,
    headline: headlineFor(status),
    detail: detailFor(status, checks),
    checks,
    metrics: {
      residents: residents.length,
      onlineResidents,
      activePlans,
      lowApResidents,
      observedGp,
      ...(latestStorytellerAgeMinutes !== undefined ? { latestStorytellerAgeMinutes } : {}),
    },
    blockers,
    nextActions,
  };
}

function residentCheck(total: number, online: number): ReleaseReadinessCheck {
  if (total === 0) {
    return {
      id: 'residents',
      label: 'Residents',
      tone: 'fail',
      value: '0 visible',
      detail: 'No residents are visible in the dashboard snapshot.',
    };
  }
  if (online === 0) {
    return {
      id: 'residents',
      label: 'Residents',
      tone: 'fail',
      value: `${total.toLocaleString()} offline`,
      detail: 'Residents are loaded, but none are online.',
    };
  }
  return {
    id: 'residents',
    label: 'Residents',
    tone: 'ok',
    value: `${online.toLocaleString()} online`,
    detail: `${total.toLocaleString()} resident${total === 1 ? '' : 's'} visible in the dashboard snapshot.`,
  };
}

function planCheck(activePlans: number, residents: number): ReleaseReadinessCheck {
  if (residents > 0 && activePlans === 0) {
    return {
      id: 'plans',
      label: 'Plans',
      tone: 'warn',
      value: 'none published',
      detail: 'No residents have an active plan visible from the thinking module.',
    };
  }
  return {
    id: 'plans',
    label: 'Plans',
    tone: 'ok',
    value: `${activePlans.toLocaleString()} live`,
    detail: 'At least one resident is publishing a plan/goal signal.',
  };
}

function apCheck(lowApResidents: number): ReleaseReadinessCheck {
  if (lowApResidents > 0) {
    return {
      id: 'ap',
      label: 'Attention',
      tone: 'warn',
      value: `${lowApResidents.toLocaleString()} low AP`,
      detail: `${lowApResidents.toLocaleString()} resident${lowApResidents === 1 ? '' : 's'} at or below ${LOW_AP_DEMO_THRESHOLD} AP.`,
    };
  }
  return {
    id: 'ap',
    label: 'Attention',
    tone: 'ok',
    value: 'stable',
    detail: 'No visible residents are below the low-AP demo threshold.',
  };
}

function gpCheck(observedGp: number): ReleaseReadinessCheck {
  if (observedGp <= 0) {
    return {
      id: 'gp',
      label: 'GP Evidence',
      tone: 'warn',
      value: 'not observed',
      detail: 'No coin-995 GP is visible in current resident inventory snapshots.',
    };
  }
  return {
    id: 'gp',
    label: 'GP Evidence',
    tone: 'ok',
    value: `${observedGp.toLocaleString()} GP`,
    detail: 'Resident inventory snapshots include real coin-995 GP evidence.',
  };
}

function storytellerCheck(
  digest: StorytellerDigestSummary | undefined,
  ageMinutes: number | undefined,
): ReleaseReadinessCheck {
  if (!digest) {
    return {
      id: 'storyteller',
      label: 'Storyteller',
      tone: 'warn',
      value: 'no digest',
      detail: 'No Storyteller digest is available for operator or public narrative context.',
    };
  }

  const needsReview = Boolean(digest.dispatch?.needsReview || (digest.dispatch?.warningCount ?? 0) > 0);
  const stale = ageMinutes !== undefined && ageMinutes * 60 * 1000 > STORYTELLER_STALE_MS;
  if (needsReview || stale) {
    const reasons = [
      needsReview ? 'dispatch needs review' : '',
      stale && ageMinutes !== undefined ? `${ageMinutes.toLocaleString()}m old` : '',
    ].filter(Boolean).join(' · ');
    return {
      id: 'storyteller',
      label: 'Storyteller',
      tone: 'warn',
      value: reasons || 'watch',
      detail: 'Latest Storyteller digest exists, but needs operator review or refresh.',
    };
  }

  return {
    id: 'storyteller',
    label: 'Storyteller',
    tone: 'ok',
    value: ageMinutes === undefined ? 'grounded' : `${ageMinutes.toLocaleString()}m old`,
    detail: `${digest.topEventCount.toLocaleString()} grounded event${digest.topEventCount === 1 ? '' : 's'} across ${digest.residentCount.toLocaleString()} resident${digest.residentCount === 1 ? '' : 's'}.`,
  };
}

function ncriPrintCheck(insights: PrintQueueInsightSummary): ReleaseReadinessCheck {
  const blockerCount = insights.queueHealth.blockers.length + insights.queueHealth.failed + insights.queueHealth.orphaned;
  if (blockerCount > 0 || insights.ncriTrades.failed > 0 || insights.paidWithoutQueue > 0) {
    return {
      id: 'ncri-print',
      label: 'NCRI / Prints',
      tone: 'warn',
      value: `${blockerCount.toLocaleString()} blocker${blockerCount === 1 ? '' : 's'}`,
      detail: 'Print queue or NCRI trade records need operator attention before relying on the loop live.',
    };
  }
  if (insights.activeRequests === 0 && insights.ncriTrades.accepted === 0 && insights.ncriTrades.pending === 0) {
    return {
      id: 'ncri-print',
      label: 'NCRI / Prints',
      tone: 'warn',
      value: 'no live signal',
      detail: 'No active print request or NCRI trade signal is visible yet.',
    };
  }
  return {
    id: 'ncri-print',
    label: 'NCRI / Prints',
    tone: 'ok',
    value: insights.ncriTrades.accepted > 0 ? `${insights.ncriTrades.accepted.toLocaleString()} accepted` : `${insights.activeRequests.toLocaleString()} active`,
    detail: 'NCRI/print state is present without queue blockers.',
  };
}

function latestStorytellerDigest(digests: StorytellerDigestSummary[]): StorytellerDigestSummary | undefined {
  return digests
    .slice()
    .sort((a, b) => digestTimestamp(b) - digestTimestamp(a))[0];
}

function digestAgeMinutes(digest: StorytellerDigestSummary, nowMs: number): number {
  const ts = digestTimestamp(digest);
  if (ts <= 0) return 0;
  return Math.max(0, Math.round((nowMs - ts) / (60 * 1000)));
}

function digestTimestamp(digest: StorytellerDigestSummary): number {
  const stamp = digest.dispatch?.generatedAt || digest.builtAt || digest.windowEnd || digest.windowStart;
  if (!stamp) return 0;
  const ts = Date.parse(stamp);
  return Number.isFinite(ts) ? ts : 0;
}

function headlineFor(status: ReleaseReadinessStatus): string {
  if (status === 'ready') return 'Ready for operator review.';
  if (status === 'blocked') return 'Blocked for live demo.';
  return 'Ready with watch items.';
}

function detailFor(status: ReleaseReadinessStatus, checks: ReleaseReadinessCheck[]): string {
  const warningCount = checks.filter(check => check.tone === 'warn').length;
  const failCount = checks.filter(check => check.tone === 'fail').length;
  if (status === 'ready') return 'Core resident, AP/GP, Storyteller, and NCRI/print signals are present.';
  if (status === 'blocked') return `${failCount.toLocaleString()} critical signal${failCount === 1 ? '' : 's'} missing. Fix before demo or live QA.`;
  return `${warningCount.toLocaleString()} signal${warningCount === 1 ? '' : 's'} need operator attention before relying on the loop live.`;
}

function nextActionsFor(checks: ReleaseReadinessCheck[]): string[] {
  const actions: string[] = [];
  const byId = new Map(checks.map(check => [check.id, check]));
  if (byId.get('residents')?.tone === 'fail') actions.push('Start or reconnect the controller before demoing the resident loop.');
  if (byId.get('plans')?.tone === 'warn') actions.push('Restart or observe residents until thinking publishes active plans.');
  if (byId.get('ap')?.tone === 'warn') actions.push('Top up low-AP residents or avoid presenting them as healthy.');
  if (byId.get('gp')?.tone === 'warn') actions.push('Run an AP/GP or coin-995 capability proof before claiming resident purchasing power.');
  if (byId.get('storyteller')?.tone === 'warn') actions.push('Run or review Storyteller before using public canon narration.');
  if (byId.get('ncri-print')?.tone === 'warn') actions.push('Assign blocked print queue entries or avoid the print queue during the demo.');
  return actions.length ? actions : ['Keep the controller running and capture fresh screenshots/logs before a public demo.'];
}
