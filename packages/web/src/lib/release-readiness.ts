import type { BenchmarkArtifactSummary, ResidentDashboardRow } from '@nullcity-dashboard/shared';
import type { StorytellerDigestSummary } from './api';
import type { EconomyTransportSummary } from './live-economy';
import type { PrintQueueInsightSummary } from './print-queue-insights';
import { residentCoinEvidenceAmount, residentLoopCheckpoints, residentLoopSignal, residentNeedsAp } from './resident-loop';
import { storytellerGroundingAudit } from './resident-story';

export type ReleaseReadinessStatus = 'ready' | 'watch' | 'blocked';
export type ReleaseReadinessTone = 'ok' | 'warn' | 'fail';

export interface ReleaseReadinessCheck {
  id: 'residents' | 'identity' | 'plans' | 'loop' | 'ap' | 'gp' | 'economy-transport' | 'capabilities' | 'storyteller' | 'ncri-print';
  label: string;
  tone: ReleaseReadinessTone;
  value: string;
  detail: string;
}

export interface ReleaseReadinessMetrics {
  residents: number;
  onlineResidents: number;
  modelEndpointResidents: number;
  sparkModuleResidents: number;
  activePlans: number;
  lowApResidents: number;
  failedActionResidents: number;
  observedGp: number;
  storytellerReviewBacklog: number;
  latestStorytellerAgeMinutes?: number;
  capabilityProofs: number;
  capabilityMissing: number;
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
  economyTransport?: EconomyTransportSummary;
  benchmarkRuns?: BenchmarkArtifactSummary[];
  nowMs?: number;
}

export interface ReleaseReadinessMetricTile {
  label: string;
  value: string;
  tone?: ReleaseReadinessTone;
  detail?: string;
}

export interface ReleaseReadinessFirstFiveStep {
  label: 'Stabilize' | 'Act' | 'Capture';
  tone: ReleaseReadinessTone;
  detail: string;
}

export interface ReleaseReadinessActionQueueItem {
  label: string;
  tone: ReleaseReadinessTone;
  detail: string;
}

export interface ReleaseReadinessDemoProofItem {
  label: 'Residents' | 'AP/GP' | 'Story' | 'Dry-run';
  tone: ReleaseReadinessTone;
  detail: string;
}

const LOW_AP_DEMO_THRESHOLD = 10;
const STORYTELLER_STALE_MS = 60 * 60 * 1000;
const CAPABILITY_STALE_MS = 48 * 60 * 60 * 1000;
const FIRST_FIVE_CAPTURE_EVIDENCE = 'resident roster, AP/GP proof, Storyteller review, and dry-run digest evidence';

type CapabilityGroupId = 'ap-gp' | 'trade' | 'combat' | 'gear' | 'memory';

interface CapabilityGroup {
  id: CapabilityGroupId;
  label: string;
  match: RegExp;
}

interface CapabilityQaSummary {
  proven: number;
  missing: CapabilityGroup[];
  stale: Array<{ group: CapabilityGroup; run: BenchmarkArtifactSummary }>;
  failed: Array<{ group: CapabilityGroup; run: BenchmarkArtifactSummary }>;
}

const CAPABILITY_GROUPS: CapabilityGroup[] = [
  { id: 'ap-gp', label: 'AP/GP loop', match: /(ap-gp|starter[-_]gp|coin[-_]995)/i },
  { id: 'trade', label: 'trade safety', match: /(named[-_]trade[-_]soak|trade[-_]soak|operator[-_]trade)/i },
  { id: 'combat', label: 'combat/survival', match: /(combat[-_]prayer|combat[-_]survival)/i },
  { id: 'gear', label: 'gear/equip', match: /(named[-_]equip[-_]soak|equipment[-_]prep|gear[-_]soak)/i },
  { id: 'memory', label: 'memory/world recall', match: /(memory[-_]route[-_]recall|world[-_]event[-_]reaction|cross[-_]resident)/i },
];

export function buildReleaseReadiness(input: ReleaseReadinessInput): ReleaseReadinessSummary {
  const nowMs = input.nowMs ?? Date.now();
  const residents = input.residents;
  const onlineRows = residents.filter(row => row.online);
  const onlineResidents = onlineRows.length;
  const modelEndpointResidents = onlineRows.filter(row => residentHasModelEndpointSignal(row)).length;
  const sparkModuleResidents = onlineRows.filter(row => residentHasSparkModuleSignal(row)).length;
  const lowApResidents = residents.filter(row => residentNeedsAp(row)).length;
  const failedActionResidents = residents.filter(row => row.online && residentActionOutcomeFailed(row)).length;
  const activePlans = residents.filter(row => {
    const signal = residentLoopSignal(row);
    return signal.plan !== '-' && signal.plan !== 'No active plan published';
  }).length;
  const observedGp = residents.reduce((sum, row) => sum + residentCoinEvidenceAmount(row), 0);
  const latestDigest = latestStorytellerDigest(input.storyDigests);
  const latestStorytellerAgeMinutes = latestDigest ? digestAgeMinutes(latestDigest, nowMs) : undefined;
  const storytellerReviewBacklog = storytellerDigestsNeedingReview(input.storyDigests).length;

  const capabilityQa = summarizeCapabilityQa(input.benchmarkRuns || [], nowMs);
  const economyTransport = economyTransportCheck(input.economyTransport);

  const checks: ReleaseReadinessCheck[] = [
    residentCheck(residents.length, onlineResidents),
    identityCheck(onlineResidents, modelEndpointResidents, sparkModuleResidents),
    planCheck(activePlans, residents.length),
    residentLoopCheck(failedActionResidents, residents),
    apCheck(lowApResidents),
    gpCheck(observedGp),
    ...(economyTransport ? [economyTransport] : []),
    capabilityQaCheck(capabilityQa),
    storytellerCheck(latestDigest, latestStorytellerAgeMinutes, storytellerReviewBacklog),
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
      modelEndpointResidents,
      sparkModuleResidents,
      activePlans,
      lowApResidents,
      failedActionResidents,
      observedGp,
      storytellerReviewBacklog,
      ...(latestStorytellerAgeMinutes !== undefined ? { latestStorytellerAgeMinutes } : {}),
      capabilityProofs: capabilityQa.proven,
      capabilityMissing: capabilityQa.missing.length + capabilityQa.stale.length + capabilityQa.failed.length,
    },
    blockers,
    nextActions,
  };
}

export function releaseReadinessMetricTiles(summary: ReleaseReadinessSummary): ReleaseReadinessMetricTile[] {
  const { metrics } = summary;
  const checksById = new Map(summary.checks.map(check => [check.id, check]));
  const missingModelResidents = Math.max(0, metrics.onlineResidents - metrics.modelEndpointResidents);
  const missingSparkResidents = Math.max(0, metrics.onlineResidents - metrics.sparkModuleResidents);
  const identityCoverageValue = metrics.onlineResidents > 0
    ? `${metrics.modelEndpointResidents.toLocaleString()}/${metrics.onlineResidents.toLocaleString()} model · ${metrics.sparkModuleResidents.toLocaleString()}/${metrics.onlineResidents.toLocaleString()} SPARK`
    : '-';
  const identityCoverageDetailParts = [
    missingModelResidents > 0 ? `${missingModelResidents.toLocaleString()} online resident${missingModelResidents === 1 ? '' : 's'} missing model/endpoint` : '',
    missingSparkResidents > 0 ? `${missingSparkResidents.toLocaleString()} online resident${missingSparkResidents === 1 ? '' : 's'} missing SPARK module` : '',
  ].filter(Boolean);
  const economyTransport = checksById.get('economy-transport');
  const ncriPrint = checksById.get('ncri-print');
  const loop = checksById.get('loop');
  const ap = checksById.get('ap');
  const gp = checksById.get('gp');
  const capabilities = checksById.get('capabilities');
  const storyteller = checksById.get('storyteller');
  return [
    { label: 'Residents', value: `${metrics.onlineResidents.toLocaleString()}/${metrics.residents.toLocaleString()}` },
    {
      label: 'Model+SPARK',
      value: identityCoverageValue,
      ...(identityCoverageDetailParts.length > 0 ? { tone: 'warn' as const } : {}),
      ...(identityCoverageDetailParts.length > 0 ? { detail: `${identityCoverageDetailParts.join(' · ')}.` } : {}),
    },
    ...(economyTransport
      ? [{
        label: 'Transport',
        value: economyTransport.value,
        ...(economyTransport.tone !== 'ok' ? { detail: economyTransport.detail } : {}),
        ...(economyTransport.tone !== 'ok' ? { tone: economyTransport.tone } : {}),
      }]
      : []),
    ...(ncriPrint
      ? [{
        label: 'NCRI Prints',
        value: ncriPrint.value,
        ...(ncriPrint.tone !== 'ok' ? { detail: ncriPrint.detail } : {}),
        ...(ncriPrint.tone !== 'ok' ? { tone: ncriPrint.tone } : {}),
      }]
      : []),
    { label: 'Plans', value: metrics.activePlans.toLocaleString() },
    {
      label: 'Action Risks',
      value: metrics.failedActionResidents.toLocaleString(),
      ...(metrics.failedActionResidents > 0 && loop ? { detail: loop.detail } : {}),
      ...(metrics.failedActionResidents > 0 ? { tone: 'fail' as const } : {}),
    },
    {
      label: 'Low AP',
      value: metrics.lowApResidents.toLocaleString(),
      ...(metrics.lowApResidents > 0 && ap ? { detail: ap.detail } : {}),
      ...(metrics.lowApResidents > 0 ? { tone: 'warn' as const } : {}),
    },
    {
      label: 'Observed GP',
      value: metrics.observedGp.toLocaleString(),
      ...(metrics.observedGp <= 0 && gp ? { detail: gp.detail } : {}),
      ...(metrics.observedGp <= 0 ? { tone: 'warn' as const } : {}),
    },
    {
      label: 'Capability QA',
      value: `${metrics.capabilityProofs.toLocaleString()}/${(metrics.capabilityProofs + metrics.capabilityMissing).toLocaleString()}`,
      ...(metrics.capabilityMissing > 0 && capabilities ? { detail: capabilities.detail } : {}),
      ...(metrics.capabilityMissing > 0 ? { tone: 'warn' as const } : {}),
    },
    {
      label: 'Story Review',
      value: metrics.storytellerReviewBacklog.toLocaleString(),
      ...(metrics.storytellerReviewBacklog > 0 && storyteller ? { detail: storyteller.detail } : {}),
      ...(metrics.storytellerReviewBacklog > 0 ? { tone: 'warn' as const } : {}),
    },
    { label: 'Story Age', value: metrics.latestStorytellerAgeMinutes === undefined ? '-' : `${metrics.latestStorytellerAgeMinutes.toLocaleString()}m` },
  ];
}

export function releaseReadinessDemoProofRail(summary: ReleaseReadinessSummary): ReleaseReadinessDemoProofItem[] {
  const checksById = new Map(summary.checks.map(check => [check.id, check]));
  const residents = worstCheck([checksById.get('residents'), checksById.get('plans'), checksById.get('loop')]);
  const apGp = worstCheck([checksById.get('ap'), checksById.get('gp'), checksById.get('economy-transport')]);
  const story = checksById.get('storyteller');
  const dryRunAction = summary.nextActions.find(action => action.startsWith('Run `npm run storyteller:dry-run'));

  return [
    {
      label: 'Residents',
      tone: residents?.tone || 'warn',
      detail: residents && residents.tone !== 'ok' ? residents.detail : 'Residents, plans, and latest action outcomes are visible.',
    },
    {
      label: 'AP/GP',
      tone: apGp?.tone || 'warn',
      detail: apGp && apGp.tone !== 'ok' ? apGp.detail : 'AP support and coin-995 GP evidence are present.',
    },
    {
      label: 'Story',
      tone: story?.tone || 'warn',
      detail: story?.detail || 'Storyteller digest evidence is not loaded.',
    },
    {
      label: 'Dry-run',
      tone: dryRunAction ? 'warn' : story?.tone === 'ok' ? 'ok' : 'warn',
      detail: dryRunAction || dryRunDetail(summary),
    },
  ];
}

export function releaseReadinessFirstFiveSteps(summary: ReleaseReadinessSummary): ReleaseReadinessFirstFiveStep[] {
  const stateTone = summary.status === 'blocked' ? 'fail' : summary.status === 'watch' ? 'warn' : 'ok';
  const firstBlocker = summary.blockers[0];
  const firstAction = summary.nextActions[0] || 'Keep the controller running and capture fresh screenshots/logs before a public demo.';
  return [
    {
      label: 'Stabilize',
      tone: stateTone,
      detail: firstBlocker || summary.detail,
    },
    {
      label: 'Act',
      tone: stateTone,
      detail: firstAction,
    },
    {
      label: 'Capture',
      tone: summary.status === 'ready' ? 'ok' : 'warn',
      detail: summary.status === 'blocked'
        ? `After the blocker clears, capture ${FIRST_FIVE_CAPTURE_EVIDENCE} before the public demo.`
        : `Capture ${FIRST_FIVE_CAPTURE_EVIDENCE} before the public demo.`,
    },
  ];
}

function worstCheck(checks: Array<ReleaseReadinessCheck | undefined>): ReleaseReadinessCheck | undefined {
  return checks
    .filter((check): check is ReleaseReadinessCheck => Boolean(check))
    .sort((a, b) => tonePriority(b.tone) - tonePriority(a.tone))[0];
}

function tonePriority(tone: ReleaseReadinessTone): number {
  if (tone === 'fail') return 2;
  if (tone === 'warn') return 1;
  return 0;
}

function dryRunDetail(summary: ReleaseReadinessSummary): string {
  const age = summary.metrics.latestStorytellerAgeMinutes;
  const ageLabel = age === undefined ? 'available' : `${age.toLocaleString()}m old`;
  return `Latest digest is ${ageLabel}; rerun \`npm run storyteller:dry-run -- --fixture\` for fresh demo evidence.`;
}

export function releaseReadinessActionQueue(summary: ReleaseReadinessSummary, limit = 4): ReleaseReadinessActionQueueItem[] {
  if (summary.status === 'ready') return [];
  return summary.nextActions
    .filter(action => !action.startsWith('Keep the controller running'))
    .map((action, index) => {
      const item = {
        label: readinessActionLabel(action),
        tone: readinessActionTone(summary, action),
        detail: action,
      };
      return { item, index, priority: readinessActionPriority(item) };
    })
    .sort((a, b) => a.priority - b.priority || a.index - b.index)
    .slice(0, limit)
    .map(action => action.item);
}

function readinessActionLabel(action: string): string {
  if (action.startsWith('Start or reconnect')) return 'Reconnect residents';
  if (action.startsWith('Confirm model/endpoint')) return 'Confirm stack';
  if (action.startsWith('Restart or observe')) return 'Wake planning';
  if (action.startsWith('Inspect residents')) return 'Inspect actions';
  if (action.startsWith('Top up')) return 'Top up AP';
  if (action.startsWith('Run an AP/GP')) return 'Prove GP';
  if (action.startsWith('Configure the live economy')) return 'Configure bridge';
  if (action.startsWith('Restore the economy')) return 'Check economy';
  if (action.startsWith('Run missing')) return 'Run capability QA';
  if (action.startsWith('Review and clear')) return 'Review Storyteller';
  if (action.startsWith('Review Storyteller grounding')) return 'Review grounding';
  if (action.startsWith('Run Storyteller with grounded')) return 'Ground Story';
  if (action.startsWith('Run `npm run storyteller:dry-run')) return 'Run dry-run';
  if (action.startsWith('Run or review Storyteller')) return 'Review Storyteller';
  if (action.startsWith('Assign blocked print')) return 'Check prints';
  return 'Next action';
}

function readinessActionTone(summary: ReleaseReadinessSummary, action: string): ReleaseReadinessTone {
  if (summary.status === 'blocked' && (action.startsWith('Start or reconnect') || action.startsWith('Inspect residents'))) {
    return 'fail';
  }
  return 'warn';
}

function readinessActionPriority(action: ReleaseReadinessActionQueueItem): number {
  if (action.tone === 'fail') return 0;
  if (action.label === 'Check economy' || action.label === 'Configure bridge') return 10;
  if (action.label === 'Check prints') return 20;
  if (action.label === 'Confirm stack') return 25;
  if (action.label === 'Top up AP') return 30;
  if (action.label === 'Prove GP') return 40;
  if (action.label === 'Run capability QA') return 50;
  if (action.label === 'Review Storyteller' || action.label === 'Review grounding' || action.label === 'Ground Story' || action.label === 'Run dry-run') return 60;
  return 100;
}

function summarizeCapabilityQa(runs: BenchmarkArtifactSummary[], nowMs: number): CapabilityQaSummary {
  const latestByGroup = new Map<CapabilityGroupId, BenchmarkArtifactSummary>();
  for (const run of runs) {
    const group = capabilityGroupForRun(run);
    if (!group) continue;
    const current = latestByGroup.get(group.id);
    if (!current || benchmarkTimestamp(run) > benchmarkTimestamp(current)) latestByGroup.set(group.id, run);
  }

  const missing: CapabilityGroup[] = [];
  const stale: Array<{ group: CapabilityGroup; run: BenchmarkArtifactSummary }> = [];
  const failed: Array<{ group: CapabilityGroup; run: BenchmarkArtifactSummary }> = [];
  let proven = 0;

  for (const group of CAPABILITY_GROUPS) {
    const run = latestByGroup.get(group.id);
    if (!run) {
      missing.push(group);
      continue;
    }
    if (run.status !== 'passed' || run.score < 0.95) {
      failed.push({ group, run });
      continue;
    }
    if (nowMs - benchmarkTimestamp(run) > CAPABILITY_STALE_MS) {
      stale.push({ group, run });
      continue;
    }
    proven += 1;
  }

  return { proven, missing, stale, failed };
}

function capabilityQaCheck(summary: CapabilityQaSummary): ReleaseReadinessCheck {
  if (summary.failed.length > 0) {
    const failedLabels = summary.failed.map(item => `${item.group.label} (${item.run.status})`).join(', ');
    return {
      id: 'capabilities',
      label: 'Capability QA',
      tone: 'fail',
      value: `${summary.failed.length.toLocaleString()} failed`,
      detail: `Latest proof failed for ${failedLabels}.`,
    };
  }

  const weakCount = summary.missing.length + summary.stale.length;
  if (weakCount > 0) {
    const missingLabels = summary.missing.map(group => group.label);
    const staleLabels = summary.stale.map(item => `${item.group.label} (${item.run.runId})`);
    return {
      id: 'capabilities',
      label: 'Capability QA',
      tone: 'warn',
      value: `${summary.proven.toLocaleString()}/${CAPABILITY_GROUPS.length.toLocaleString()} fresh`,
      detail: `Missing or stale proofs: ${[...missingLabels, ...staleLabels].join(', ')}.`,
    };
  }

  return {
    id: 'capabilities',
    label: 'Capability QA',
    tone: 'ok',
    value: `${summary.proven.toLocaleString()}/${CAPABILITY_GROUPS.length.toLocaleString()} fresh`,
    detail: 'Core AP/GP, trade, combat, gear, and memory capability proofs are fresh and passing.',
  };
}

function capabilityGroupForRun(run: BenchmarkArtifactSummary): CapabilityGroup | undefined {
  const haystack = [
    run.task?.id,
    run.runId,
    run.file,
    run.failureReason,
  ].filter(Boolean).join(' ');
  return CAPABILITY_GROUPS.find(group => group.match.test(haystack));
}

function benchmarkTimestamp(run: BenchmarkArtifactSummary): number {
  const stamp = run.endedAt || run.startedAt || run.generatedAt;
  if (!stamp) return 0;
  const ts = Date.parse(stamp);
  return Number.isFinite(ts) ? ts : 0;
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

function identityCheck(online: number, modelEndpoint: number, sparkModule: number): ReleaseReadinessCheck {
  if (online === 0) {
    return {
      id: 'identity',
      label: 'Model+SPARK',
      tone: 'ok',
      value: '-',
      detail: 'Model/endpoint and SPARK module identity will be checked once residents reconnect.',
    };
  }

  const missingModel = Math.max(0, online - modelEndpoint);
  const missingSpark = Math.max(0, online - sparkModule);
  const value = `${modelEndpoint.toLocaleString()}/${online.toLocaleString()} model · ${sparkModule.toLocaleString()}/${online.toLocaleString()} SPARK`;
  const missingParts = [
    missingModel > 0 ? `${missingModel.toLocaleString()} online resident${missingModel === 1 ? '' : 's'} missing model/endpoint` : '',
    missingSpark > 0 ? `${missingSpark.toLocaleString()} online resident${missingSpark === 1 ? '' : 's'} missing SPARK module` : '',
  ].filter(Boolean);

  if (missingParts.length > 0) {
    return {
      id: 'identity',
      label: 'Model+SPARK',
      tone: 'warn',
      value,
      detail: `${missingParts.join(' · ')}.`,
    };
  }

  return {
    id: 'identity',
    label: 'Model+SPARK',
    tone: 'ok',
    value,
    detail: 'Every online resident has model/endpoint and SPARK module identity visible.',
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

function residentLoopCheck(failedActionResidents: number, residents: ResidentDashboardRow[]): ReleaseReadinessCheck {
  if (failedActionResidents > 0) {
    const names = residents
      .filter(row => row.online && residentActionOutcomeFailed(row))
      .map(row => row.name)
      .slice(0, 3);
    const detail = failedActionResidents === 1
      ? `${names[0]} latest action outcome is failed, timed out, or cancelled.`
      : `Latest action outcomes are failed, timed out, or cancelled for ${residentNameOverflowList(names, failedActionResidents)}.`;
    return {
      id: 'loop',
      label: 'Resident Loop',
      tone: 'fail',
      value: `${failedActionResidents.toLocaleString()} failed action${failedActionResidents === 1 ? '' : 's'}`,
      detail,
    };
  }

  return {
    id: 'loop',
    label: 'Resident Loop',
    tone: 'ok',
    value: 'actions usable',
    detail: 'No visible online resident has a failed or timed-out latest action outcome.',
  };
}

function residentNameOverflowList(names: string[], total: number): string {
  const overflow = total - names.length;
  if (overflow <= 0) return names.join(', ');
  return `${names.join(', ')}, and ${overflow.toLocaleString()} more resident${overflow === 1 ? '' : 's'}`;
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

function economyTransportCheck(summary: EconomyTransportSummary | undefined): ReleaseReadinessCheck | undefined {
  if (!summary) return undefined;
  return {
    id: 'economy-transport',
    label: 'Economy Transport',
    tone: summary.tone,
    value: summary.label,
    detail: summary.detail,
  };
}

function storytellerCheck(
  digest: StorytellerDigestSummary | undefined,
  ageMinutes: number | undefined,
  reviewBacklogCount: number,
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

  const audit = storytellerGroundingAudit(digest);
  if (audit.missingRefs.length > 0) {
    const names = audit.missingRefs.slice(0, 3).join(', ');
    const overflow = audit.missingRefs.length > 3 ? `, and ${(audit.missingRefs.length - 3).toLocaleString()} more` : '';
    return {
      id: 'storyteller',
      label: 'Storyteller',
      tone: 'warn',
      value: `${audit.missingRefs.length.toLocaleString()} missing ref${audit.missingRefs.length === 1 ? '' : 's'}`,
      detail: `Latest Storyteller dispatch cites refs missing from digest top events: ${names}${overflow}.`,
    };
  }

  if (digest.topEventCount <= 0 || digest.topEvents.length === 0) {
    return {
      id: 'storyteller',
      label: 'Storyteller',
      tone: 'warn',
      value: 'no top events',
      detail: 'Latest Storyteller dispatch has no grounded top events selected.',
    };
  }

  if (reviewBacklogCount > 0) {
    return {
      id: 'storyteller',
      label: 'Storyteller',
      tone: 'warn',
      value: `${reviewBacklogCount.toLocaleString()} pending review`,
      detail: `${reviewBacklogCount.toLocaleString()} Storyteller digest dispatch${reviewBacklogCount === 1 ? '' : 'es'} still need operator review.`,
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

function storytellerDigestsNeedingReview(digests: StorytellerDigestSummary[]): StorytellerDigestSummary[] {
  return digests.filter(digest => Boolean(digest.dispatch?.needsReview || (digest.dispatch?.warningCount ?? 0) > 0));
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
  return `${warningCount.toLocaleString()} signal${warningCount === 1 ? '' : 's'} ${warningCount === 1 ? 'needs' : 'need'} operator attention before relying on the loop live.`;
}

function nextActionsFor(checks: ReleaseReadinessCheck[]): string[] {
  const actions: string[] = [];
  const byId = new Map(checks.map(check => [check.id, check]));
  if (byId.get('residents')?.tone === 'fail') actions.push('Start or reconnect the controller before demoing the resident loop.');
  if (byId.get('identity')?.tone === 'warn') actions.push('Confirm model/endpoint and SPARK module identity for every online resident before demoing cognition coverage.');
  if (byId.get('plans')?.tone === 'warn') actions.push('Restart or observe residents until thinking publishes active plans.');
  if (byId.get('loop')?.tone === 'fail') actions.push('Inspect residents with failed or timed-out latest actions before demoing liveness.');
  if (byId.get('ap')?.tone === 'warn') actions.push('Top up low-AP residents or avoid presenting them as healthy.');
  if (byId.get('gp')?.tone === 'warn') actions.push('Run an AP/GP or coin-995 capability proof before claiming resident purchasing power.');
  const economyTransport = byId.get('economy-transport');
  if (economyTransport && economyTransport.tone !== 'ok') {
    if (economyTransport.value === 'bridge') {
      actions.push('Configure the live economy bridge before claiming AP/GP state is current.');
    } else {
      actions.push('Restore the economy stream or confirm polling fallback before relying on live AP/GP state.');
    }
  }
  if (byId.get('capabilities')?.tone !== 'ok') actions.push('Run missing or stale capability benchmarks before relying on unproven resident loops.');
  if (byId.get('storyteller')?.tone === 'warn') {
    if (byId.get('storyteller')?.value.includes('pending review')) {
      actions.push('Review and clear pending Storyteller dispatches before using public canon narration.');
    } else if (byId.get('storyteller')?.value.includes('missing ref')) {
      actions.push('Review Storyteller grounding audit before using public canon narration.');
    } else if (byId.get('storyteller')?.value.includes('no top events')) {
      actions.push('Run Storyteller with grounded event evidence before using public canon narration.');
    } else if (byId.get('storyteller')?.value.includes('no digest')) {
      actions.push('Run `npm run storyteller:dry-run -- --fixture` and open the Storyteller feed before using public canon narration.');
    } else {
      actions.push('Run or review Storyteller before using public canon narration.');
    }
  }
  if (byId.get('ncri-print')?.tone === 'warn') actions.push('Assign blocked print queue entries or avoid the print queue during the demo.');
  return actions.length ? actions : ['Keep the controller running and capture fresh screenshots/logs before a public demo.'];
}

function residentActionOutcomeFailed(row: ResidentDashboardRow): boolean {
  return residentLoopCheckpoints(row).some(checkpoint => checkpoint.key === 'action' && checkpoint.tone === 'fail');
}

function residentHasModelEndpointSignal(row: ResidentDashboardRow): boolean {
  const profile = row.stack?.model || row.stack?.brain || row.stack?.body;
  const latestInference = row.thinking?.latestInference;
  const inferenceEndpoint = latestInference && typeof latestInference.endpoint === 'string' ? latestInference.endpoint : undefined;
  const inferenceProvider = latestInference && typeof latestInference.provider === 'string' ? latestInference.provider : undefined;
  return Boolean(profile?.endpoint || profile?.model || inferenceEndpoint || inferenceProvider);
}

function residentHasSparkModuleSignal(row: ResidentDashboardRow): boolean {
  return Boolean(
    row.stack?.activeModule?.id ||
    row.spark?.activeModule?.id ||
    row.stack?.configuredModules?.[0]?.id ||
    row.spark?.modules?.[0]?.id,
  );
}
