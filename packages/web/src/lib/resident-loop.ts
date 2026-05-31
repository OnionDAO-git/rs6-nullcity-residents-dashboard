import type { BenchmarkArtifactSummary, ResidentDashboardRow, SparkModuleSummary } from '@nullcity-dashboard/shared';
import type { ResidentBenchmarkSignal } from './resident-benchmark';

export interface ResidentLoopFact {
  label: string;
  value: string;
  detail?: string | undefined;
  tone?: 'ok' | 'warn' | 'fail' | undefined;
}

export interface ResidentRosterScanLine {
  label: string;
  text: string;
  tone?: 'ok' | 'warn' | 'fail';
  limit: number;
  priority: 'primary' | 'secondary';
}

export interface ResidentNextStepCue {
  tone: 'ok' | 'warn' | 'fail';
  label: 'Next step';
  action: string;
  target: string;
  detail: string;
}

export interface ResidentDemoPickCue {
  tone: 'ok' | 'warn' | 'fail';
  label: 'Demo pick';
  residentName?: string;
  target: string;
  action: string;
  detail: string;
}

export interface ResidentOperatorWarning {
  tone: 'ok' | 'warn' | 'fail';
  summary: string;
  detail: string;
}

export interface ResidentLoopSignal {
  plan: string;
  action: string;
  speech: string;
  story: string;
}

export interface ResidentLoopCheckpoint {
  key: 'plan' | 'action' | 'speech' | 'story';
  label: 'Plan' | 'Action' | 'Speech' | 'Story';
  value: string;
  detail: string;
  tone: 'ok' | 'warn' | 'fail';
}

export interface ResidentPublicStateTile {
  label: string;
  value: string;
  detail: string;
  tone?: 'ok' | 'warn' | 'fail';
}

export interface ResidentPublicStateSignals {
  economyGp?: { tone: 'ok' | 'warn'; summary: string; detail: string } | undefined;
}

export interface ResidentProofPulse {
  tone: 'ok' | 'warn' | 'fail';
  summary: string;
  detail: string;
}

export interface ResidentAgencyCue {
  tone: 'ok' | 'warn' | 'fail';
  summary: string;
}

export interface ResidentLiveMoment {
  label: 'Said' | 'Did' | 'Remembered' | 'Working' | 'Reconnect';
  title: string;
  detail: string;
  tone: 'ok' | 'warn' | 'fail';
}

export interface ResidentAttentionRunway {
  label: 'empty' | 'floor' | 'short' | 'steady' | 'long' | 'unknown';
  value: string;
  detail: string;
  tone: 'ok' | 'warn' | 'fail';
}

export interface ResidentApSupportRecommendation {
  tone: 'ok' | 'warn' | 'fail';
  title: string;
  detail: string;
  suggestedAp: number;
  suggestedMemo: string;
  actionLabel: string;
}

export interface ResidentMemoryFreshness {
  label: 'fresh' | 'stale' | 'thin';
  summary: string;
  detail: string;
  tone: 'ok' | 'warn';
}

type ResidentMemoryFact = NonNullable<NonNullable<ResidentDashboardRow['memory']>['facts']>[number];

export interface ResidentCauseSignal {
  value: string;
  detail: string;
  tone: 'ok' | 'warn';
}

export interface ResidentProofRollupAction {
  label: string;
  tone: 'warn' | 'fail';
  detail: string;
}

export interface ResidentProofRollup {
  tone: 'ok' | 'warn' | 'fail';
  headline: string;
  detail: string;
  actions: ResidentProofRollupAction[];
  healthy: number;
  warn: number;
  fail: number;
  online: number;
}

export interface ResidentLivenessLedgerEntry {
  residentName: string;
  displayName: string;
  tone: 'ok' | 'warn' | 'fail';
  status: string;
  proof: string;
  detail: string;
  nextAction: string;
  nextTarget: string;
  ap: string;
  gp: string;
  plan: string;
  story: string;
  memory: string;
}

export interface ResidentLivenessDetail {
  residentName: string;
  displayName: string;
  tone: 'ok' | 'warn' | 'fail';
  headline: string;
  moment: string;
  detail: string;
  nextAction: string;
  nextTarget: string;
  nextDetail: string;
  facts: ResidentLoopFact[];
}

export interface ResidentTriageBucket {
  key: 'offline' | 'attention' | 'recovery' | 'quiet' | 'action' | 'plan' | 'gp' | 'story' | 'memory' | 'benchmark';
  label: string;
  tone: 'ok' | 'warn' | 'fail';
  count: number;
  residents: string[];
  detail: string;
}

export type ResidentTriageBucketKey = ResidentTriageBucket['key'];

export interface ResidentTriageSummary {
  tone: 'ok' | 'warn' | 'fail';
  headline: string;
  detail: string;
  urgentResidents: number;
  totalResidents: number;
  onlineResidents: number;
  buckets: ResidentTriageBucket[];
}

export interface ResidentGuestTrailPulse {
  online: number;
  lowAp: number;
  planPublished: number;
  recentAction: number;
  recoveryWait?: number;
  recoveryWaitResidents?: string[];
  recoveryWaitMaxStuckTicks?: number;
  recentSpeech: number;
  storyEvidence: number;
  memoryEvidence?: number;
  observedGp: number;
}

export interface ResidentGuestTrailGuideCopy {
  tone: 'ok' | 'warn';
  headline: string;
  detail: string;
}

export interface ResidentNormalLifeAuditSignal {
  tone: 'ok' | 'warn' | 'fail';
  summary: string;
  detail: string;
}

export interface ResidentProofPulseSignals {
  benchmark?: ResidentBenchmarkSignal;
  goalContract?: { tone: 'ok' | 'warn'; summary: string };
  economyGp?: { tone: 'ok' | 'warn'; summary: string; detail: string } | undefined;
  storyteller?: { tone: 'ok' | 'warn'; summary: string };
}

interface ResidentProofCheck {
  label: string;
  ok: boolean;
  optional?: boolean;
}

interface ResidentRecoveryWaitSignal {
  cause: string;
  title: string;
  summary: string;
  detail: string;
  momentDetail: string;
  tone: 'warn';
}

export interface ResidentIntentSignals {
  goalContract?: { tone: 'ok' | 'warn'; summary: string; detail?: string };
  economyGp?: { tone: 'ok' | 'warn'; summary: string; detail: string } | undefined;
  storyteller?: { tone: 'ok' | 'warn'; summary: string; detail?: string };
}

export interface ResidentOperatorEvidenceSignals {
  economyGp?: { tone: 'ok' | 'warn'; summary: string; detail: string } | undefined;
}

const LOW_AP_THRESHOLD = 10;
const STALE_FEED_MS = 120_000;
const ACTION_STALE_TICK_GAP = 180;
const SPEECH_STALE_TICK_GAP = 300;
const STORY_STALE_TICK_GAP = 1200;
const SHORT_AP_RUNWAY_THRESHOLD = LOW_AP_THRESHOLD + 15;
const STABLE_AP_RUNWAY_TARGET = 50;
const LONG_AP_RUNWAY_THRESHOLD = 100;
const GP_ITEM_ID = 995;
const LOW_HEALTH_RECOVERY_WAIT_CAUSES = new Set([
  'low_health_heal_wait',
  'low_health_hold_position',
  'low_health_stranded',
]);
const LOW_HEALTH_RECOVERY_WAIT_GUIDANCE = 'inspect food/cook/eat recovery before trusting combat liveness';

export function residentGuestTrailPulse(rows: ResidentDashboardRow[]): ResidentGuestTrailPulse {
  const pulse: ResidentGuestTrailPulse = {
    online: 0,
    lowAp: 0,
    planPublished: 0,
    recentAction: 0,
    recoveryWait: 0,
    recentSpeech: 0,
    storyEvidence: 0,
    memoryEvidence: 0,
    observedGp: 0,
  };

  for (const row of rows) {
    if (!row.online) continue;
    const signal = residentLoopSignal(row);
    const checkpoints = residentLoopCheckpoints(row);
    const actionCheckpoint = checkpoints.find(checkpoint => checkpoint.key === 'action');
    pulse.online += 1;
    if (residentNeedsAp(row)) pulse.lowAp += 1;
    if (signal.plan !== '-' && signal.plan !== 'No active plan published') pulse.planPublished += 1;
    if (actionCheckpoint?.tone === 'ok') pulse.recentAction += 1;
    if (residentRecoveryWaitSignal(row)) {
      pulse.recoveryWait = (pulse.recoveryWait ?? 0) + 1;
      pulse.recoveryWaitResidents = [...(pulse.recoveryWaitResidents ?? []), row.name];
      pulse.recoveryWaitMaxStuckTicks = Math.max(
        pulse.recoveryWaitMaxStuckTicks ?? 0,
        recoveryWaitStuckTicks(row),
      );
    }
    if (signal.speech !== '-') pulse.recentSpeech += 1;
    if (signal.story !== '-') pulse.storyEvidence += 1;
    if ((row.memory?.facts || []).length > 0) pulse.memoryEvidence = (pulse.memoryEvidence ?? 0) + 1;
    pulse.observedGp += residentCoinEvidenceAmount(row);
  }

  return pulse;
}

export function residentIntelligenceFacts(
  row: ResidentDashboardRow,
  signals: ResidentPublicStateSignals = {},
): ResidentLoopFact[] {
  const module = activeModule(row);
  const model = modelIdentityParts(row);
  const endpoint = endpointParts(row);
  const action = row.body?.lastAction;
  const story = row.storyArc;
  const feed = row.feed || row.body?.feed;
  const gp = residentPublicGpEvidenceLabel(row, signals.economyGp);
  const currentPlan = row.thinking?.activePlan?.trim();

  return [
    {
      label: 'Life force',
      value: row.attention === undefined ? '-' : `${row.attention} AP`,
      detail: residentNeedsAp(row) ? 'needs AP' : row.attention === undefined ? 'not reported' : 'stable',
      tone: residentNeedsAp(row) ? 'warn' : row.attention === undefined ? undefined : 'ok',
    },
    { label: 'Model', value: model.value, detail: model.detail },
    { label: 'Endpoint', value: endpoint.value, detail: endpoint.detail },
    {
      label: 'SPARK',
      value: module ? `${module.id}${module.version ? `@${module.version}` : ''}` : '-',
      detail: module?.source || '-',
    },
    {
      label: 'Goal',
      value: residentGoalLabel(row),
      detail: residentGoalDetail(row),
    },
    {
      label: 'Thinking',
      value: row.thinking?.mode || 'unknown',
      detail: row.thinking?.lastInferenceCause || row.thinking?.inFlightRequest || '-',
    },
    {
      label: 'Current plan',
      value: currentPlan || '-',
      detail: currentPlan ? 'live thinking plan' : 'No active plan published',
    },
    {
      label: 'Last action',
      value: action?.kind || row.lastEvent?.kind || '-',
      detail: actionDetail(row),
    },
    {
      label: 'Story',
      value: story?.phase || '-',
      detail: storyDetail(row),
    },
    {
      label: 'Feed',
      value: feedLabel(row),
      detail: feedDetail(row),
      tone: feedTone(row),
    },
    {
      label: 'GP evidence',
      value: gp.value,
      detail: gp.detail,
      tone: gp.tone,
    },
  ];
}

export function residentLoopSummaryLine(
  row: ResidentDashboardRow,
  signals: ResidentPublicStateSignals = {},
): string {
  const model = modelParts(row).value;
  const module = activeModule(row)?.id || 'no SPARK';
  const action = row.body?.lastAction?.kind || row.lastEvent?.kind || 'no action';
  const runway = residentAttentionRunway(row);
  const ap = runway.label === 'unknown'
    ? 'AP unknown'
    : runway.label === 'empty' || runway.label === 'floor'
      ? 'needs AP'
      : runway.label === 'short'
        ? 'AP runway short'
        : runway.value;
  const gpEvidence = residentPublicGpEvidenceLabel(row, signals.economyGp);
  const gp = gpEvidence.source === 'none' ? 'GP unobserved' : gpEvidence.value;
  return `${model} · ${module} · ${action} · ${ap} · ${gp}`;
}

export function residentStackSummary(row: ResidentDashboardRow): string {
  const model = modelParts(row);
  const module = activeModule(row);
  const modelLabel = model.value !== '-' ? model.value : 'model/endpoint unavailable';
  const moduleLabel = module ? `${module.id}${module.version ? `@${module.version}` : ''}` : 'SPARK unavailable';
  return `${modelLabel} | ${moduleLabel}`;
}

export function residentIntentFacts(row: ResidentDashboardRow, signals: ResidentIntentSignals = {}): ResidentLoopFact[] {
  const speech = recentSpeechSignal(row);
  const action = row.body?.lastAction?.kind || row.lastEvent?.kind;
  const actionFreshness = tickFreshness(row, row.body?.lastAction?.tick ?? row.lastEvent?.tick, ACTION_STALE_TICK_GAP);
  const speechFreshness = tickFreshness(row, speech.tick, SPEECH_STALE_TICK_GAP);
  const gp = residentPublicGpEvidenceLabel(row, signals.economyGp);
  const apRunway = residentAttentionRunway(row);
  const memory = residentMemoryFreshness(row);
  const cause = residentCauseSignal(row);
  const needsAp = residentNeedsAp(row);
  const needsGpEvidence = gp.tone === 'warn';
  const storyValue = memory.label === 'thin' ? signals.storyteller?.summary || '-' : memory.summary;
  const storyDetailParts = [
    memory.label === 'thin' ? '' : memory.detail,
    signals.storyteller?.summary,
  ].filter(Boolean);

  return [
    {
      label: 'Wants',
      value: residentGoalLabel(row),
      detail: residentGoalDetail(row) === 'plan' ? 'live plan' : residentGoalDetail(row),
      tone: row.thinking?.activePlan ? 'ok' : 'warn',
    },
    {
      label: 'Needs',
      value: needsAp ? 'AP support' : needsGpEvidence ? 'coin-995 evidence' : 'steady',
      detail: `${apRunway.detail} · ${needsGpEvidence ? 'GP not observed' : gp.value}`,
      tone: apRunway.tone === 'fail' ? 'fail' : needsAp || needsGpEvidence || apRunway.tone === 'warn' ? 'warn' : 'ok',
    },
    {
      label: 'Did',
      value: action || '-',
      detail: action ? [actionDetail(row), actionFreshness].filter(Boolean).join(' | ') : 'no recent action',
      tone: action && !isTickStale(actionFreshness) ? 'ok' : 'warn',
    },
    {
      label: 'Said',
      value: speech.text,
      detail: speech.text !== '-'
        ? [speech.source === 'feed' ? 'live speech in feed' : 'latest say event', speechFreshness].filter(Boolean).join(' | ')
        : 'no recent speech',
      tone: speech.text !== '-' && !isTickStale(speechFreshness) ? 'ok' : 'warn',
    },
    {
      label: 'Because',
      value: cause.value,
      detail: cause.detail,
      tone: cause.tone,
    },
    {
      label: 'Remembers',
      value: storyValue,
      detail: storyDetailParts.join(' | ') || signals.storyteller?.detail || 'no Library or Storyteller evidence yet',
      tone: memory.tone === 'ok' || signals.storyteller?.tone === 'ok' ? 'ok' : 'warn',
    },
  ];
}

export function residentAgencyCue(row: ResidentDashboardRow, signals: ResidentProofPulseSignals = {}): ResidentAgencyCue {
  const actionOutcome = residentActionOutcome(row);
  const gpObserved = residentCoinEvidenceAmount(row) > 0 || signals.economyGp?.tone === 'ok';
  const storyObserved = Boolean(row.storyArc?.summary || row.storyArc?.latestEventKind || signals.storyteller?.tone === 'ok');
  const planLive = Boolean(row.thinking?.activePlan?.trim());
  const workingOn = !row.online
    ? 'Waiting for reconnect'
    : planLive
      ? `Working on "${truncateAgencyText(residentGoalLabel(row), 72)}"`
      : 'Working on publishing a plan';
  const just = residentAgencyActionLabel(row);
  const need = !row.online
    ? { tone: 'fail' as const, label: 'needs reconnect' }
    : actionOutcome.failed
      ? { tone: 'fail' as const, label: 'needs action repair' }
      : residentNeedsAp(row)
        ? { tone: 'warn' as const, label: 'needs AP support' }
        : !planLive
          ? { tone: 'warn' as const, label: 'needs a live plan' }
          : !gpObserved
            ? { tone: 'warn' as const, label: 'needs coin-995 proof' }
            : !storyObserved
              ? { tone: 'warn' as const, label: 'needs Storyteller proof' }
              : { tone: 'ok' as const, label: 'needs no immediate operator action' };

  return {
    tone: need.tone,
    summary: `${workingOn} · ${just} · ${need.label}`,
  };
}

export function residentLiveMoment(row: ResidentDashboardRow): ResidentLiveMoment {
  if (!row.online) {
    const cause = residentCauseSignal(row);
    const causeDetail = compactMomentCauseDetail(cause);
    return {
      label: 'Reconnect',
      title: 'Waiting for reconnect',
      detail: ['offline live snapshot', causeDetail].filter(Boolean).join(' | '),
      tone: 'fail',
    };
  }

  const recoveryWait = residentRecoveryWaitSignal(row);
  if (recoveryWait) {
    return {
      label: 'Working',
      title: recoveryWait.title,
      detail: recoveryWait.momentDetail,
      tone: recoveryWait.tone,
    };
  }

  const speech = recentSpeechSignal(row);
  const speechFreshness = tickFreshness(row, speech.tick, SPEECH_STALE_TICK_GAP);
  if (speech.text !== '-') {
    const cause = residentCauseSignal(row);
    const causeDetail = cause.value === 'live speech' ? cause.detail : '';
    return {
      label: 'Said',
      title: truncateAgencyText(speech.text, 96),
      detail: [speech.source === 'feed' ? 'live speech in feed' : 'latest say event', speechFreshness, causeDetail].filter(Boolean).join(' | '),
      tone: isTickStale(speechFreshness) ? 'warn' : 'ok',
    };
  }

  const actionKind = row.body?.lastAction?.kind || row.lastEvent?.kind;
  const actionFreshness = tickFreshness(row, row.body?.lastAction?.tick ?? row.lastEvent?.tick, ACTION_STALE_TICK_GAP);
  if (actionKind) {
    const outcome = residentActionOutcome(row);
    const detail = actionDetailWithoutCause(row);
    const cause = residentCauseSignal(row);
    const causeDetail = cause.tone === 'ok' && cause.value !== 'live plan' && cause.value !== 'live speech' ? cause.detail : '';
    const detailParts = [detail === '-' ? '' : detail, causeDetail, actionFreshness].filter(Boolean);
    return {
      label: 'Did',
      title: friendlyActionLabel(actionKind, row),
      detail: detailParts.join(' | ') || outcome.detail,
      tone: outcome.failed ? 'fail' : isTickStale(actionFreshness) ? 'warn' : 'ok',
    };
  }

  const storyTitle = row.storyArc?.summary || row.storyArc?.latestEventKind;
  if (storyTitle) {
    const storyFreshness = tickFreshness(row, row.storyArc?.latestEventTick, STORY_STALE_TICK_GAP);
    const cause = residentCauseSignal(row);
    const causeDetail = compactMomentCauseDetail(cause);
    return {
      label: 'Remembered',
      title: truncateAgencyText(storyTitle, 96),
      detail: ['Library evidence', storyFreshness, causeDetail].filter(Boolean).join(' | '),
      tone: isTickStale(storyFreshness) ? 'warn' : 'ok',
    };
  }

  const plan = residentGoalLabel(row);
  if (plan !== '-') {
    const detail = residentGoalDetail(row);
    const cause = residentCauseSignal(row);
    const causeDetail = compactMomentCauseDetail(cause);
    return {
      label: 'Working',
      title: truncateAgencyText(plan, 96),
      detail: [detail === 'plan' ? 'live plan' : detail, causeDetail].filter(Boolean).join(' | '),
      tone: row.thinking?.activePlan ? 'ok' : 'warn',
    };
  }

  return {
    label: 'Working',
    title: 'Waiting for a live moment',
    detail: 'No speech, action, story, or plan signal yet.',
    tone: 'warn',
  };
}

export function residentMemoryFreshness(row: ResidentDashboardRow): ResidentMemoryFreshness {
  const qmdFact = row.memory?.facts?.[0];
  const storyTitle = row.storyArc?.summary || row.storyArc?.latestEventKind;
  if (!storyTitle) {
    if (qmdFact) {
      return {
        label: 'fresh',
        summary: truncateAgencyText(qmdFact.text, 96),
        detail: qmdFactDetail(qmdFact),
        tone: 'ok',
      };
    }
    return {
      label: 'thin',
      summary: 'No Library memory yet',
      detail: 'No current Library story signal.',
      tone: 'warn',
    };
  }

  const freshness = tickFreshness(row, row.storyArc?.latestEventTick, STORY_STALE_TICK_GAP);
  return {
    label: isTickStale(freshness) ? 'stale' : 'fresh',
    summary: truncateAgencyText(storyTitle, 96),
    detail: ['Library memory', storyDetail(row), qmdFact ? qmdFactDetail(qmdFact) : '', freshness].filter(Boolean).join(' | '),
    tone: isTickStale(freshness) ? 'warn' : 'ok',
  };
}

export function residentMemoryEvidenceFacts(row: ResidentDashboardRow, limit = 3): ResidentLoopFact[] {
  const facts = row.memory?.facts || [];
  if (facts.length === 0) {
    return [
      {
        label: 'Memory',
        value: 'No qmd facts',
        detail: 'No formal facts/*.md memory snippets yet.',
        tone: 'warn',
      },
    ];
  }

  return facts.slice(0, Math.max(1, Math.trunc(limit))).map(fact => ({
    label: fact.topic || 'fact',
    value: truncateAgencyText(fact.text, 88),
    detail: [fact.path, fact.timestamp].filter(Boolean).join(' | ') || 'facts/*.md',
    tone: 'ok',
  }));
}

function qmdFactDetail(fact: ResidentMemoryFact): string {
  return ['qmd fact', fact.topic, fact.path, fact.timestamp].filter(Boolean).join(' | ');
}

export function residentCauseSignal(row: ResidentDashboardRow): ResidentCauseSignal {
  const action = row.body?.lastAction;
  const actionKind = action?.kind || row.lastEvent?.kind;
  const rawCause = action?.cause || action?.ruleId;
  if (rawCause) {
    return readableRawCause(rawCause, actionKind || 'action');
  }

  if (row.thinking?.lastInferenceCause) {
    const cause = readableCauseToken(row.thinking.lastInferenceCause);
    return {
      value: cause,
      detail: `because thinking recorded ${cause} (${row.thinking.lastInferenceCause})`,
      tone: 'ok',
    };
  }

  const speech = recentSpeechSignal(row);
  if (speech.text !== '-') {
    const source = speech.source === 'feed' ? 'live feed' : 'latest event';
    const tick = speech.tick === undefined ? '' : ` at tick ${speech.tick}`;
    return {
      value: 'live speech',
      detail: `because the ${source} captured speech${tick}`,
      tone: 'ok',
    };
  }

  const plan = row.thinking?.activePlan?.trim();
  if (plan) {
    return {
      value: 'live plan',
      detail: `because they are working on "${truncateAgencyText(plan, 72)}"`,
      tone: 'ok',
    };
  }

  return {
    value: 'no cause yet',
    detail: 'No action cause, speech source, or live plan is visible.',
    tone: 'warn',
  };
}

export function residentGuestTrailFacts(pulse: ResidentGuestTrailPulse): ResidentLoopFact[] {
  const online = Math.max(0, pulse.online);
  const denominator = online > 0 ? `/${online}` : '';
  const stableAp = Math.max(0, online - Math.max(0, pulse.lowAp));
  const recoveryWait = Math.max(0, pulse.recoveryWait ?? 0);
  const memoryEvidence = Math.max(0, pulse.memoryEvidence ?? 0);

  return [
    {
      label: 'AP',
      value: online > 0 ? `${stableAp}${denominator} stable` : 'syncing',
      detail: online > 0 ? `${Math.max(0, pulse.lowAp)} low AP` : 'waiting for live resident roster',
      tone: pulse.lowAp > 0 || online === 0 ? 'warn' : 'ok',
    },
    {
      label: 'GP evidence',
      value: `${Math.max(0, pulse.observedGp).toLocaleString()} GP`,
      detail: pulse.observedGp > 0 ? 'coin-995 observed' : 'no coin-995 evidence yet',
      tone: pulse.observedGp > 0 ? 'ok' : 'warn',
    },
    {
      label: 'Plan',
      value: `${Math.max(0, pulse.planPublished)}${denominator} live`,
      detail: 'current goals residents are pursuing',
      tone: pulse.planPublished > 0 ? 'ok' : 'warn',
    },
    {
      label: 'Action',
      value: `${Math.max(0, pulse.recentAction)}${denominator} recent`,
      detail: 'latest visible action',
      tone: pulse.recentAction > 0 ? 'ok' : 'warn',
    },
    {
      label: 'Recovery',
      value: online > 0 ? `${recoveryWait}${denominator} waiting` : 'syncing',
      detail: online > 0
        ? recoveryWait > 0
          ? recoveryWaitDetail(pulse, recoveryWait)
          : 'no low-health recovery waits visible'
        : 'waiting for live resident roster',
      tone: recoveryWait > 0 || online === 0 ? 'warn' : 'ok',
    },
    {
      label: 'Speech',
      value: `${Math.max(0, pulse.recentSpeech)}${denominator} recent`,
      detail: 'latest public say/feed line',
      tone: pulse.recentSpeech > 0 ? 'ok' : 'warn',
    },
    {
      label: 'Story',
      value: `${Math.max(0, pulse.storyEvidence)}${denominator} grounded`,
      detail: 'Library or Storyteller evidence',
      tone: pulse.storyEvidence > 0 ? 'ok' : 'warn',
    },
    {
      label: 'Memory',
      value: online > 0 ? `${memoryEvidence}${denominator} qmd` : 'syncing',
      detail: online > 0 ? 'formal facts/*.md snippets' : 'waiting for qmd facts/*.md snippets',
      tone: memoryEvidence > 0 ? 'ok' : 'warn',
    },
  ];
}

export function residentGuestTrailGuideCopy(pulse: ResidentGuestTrailPulse): ResidentGuestTrailGuideCopy {
  const online = Math.max(0, pulse.online);
  const recoveryWait = Math.max(0, pulse.recoveryWait ?? 0);
  const memoryEvidence = Math.max(0, pulse.memoryEvidence ?? 0);
  const headline = 'Follow AP, GP, plan, action, recovery, speech, story, and memory.';

  if (online === 0) {
    return {
      tone: 'warn',
      headline,
      detail: 'Waiting for the live resident roster before reading recovery or demo liveness.',
    };
  }

  if (recoveryWait > 0) {
    return {
      tone: 'warn',
      headline,
      detail: `${recoveryWaitDetail(pulse, recoveryWait)}. AP, GP, speech, story, and memory still need live proof before demoing liveness.`,
    };
  }

  return {
    tone: 'ok',
    headline,
    detail: [
      'Recovery is clear when no online resident is waiting at low health. AP is the resident life force; GP still needs coin-995 evidence.',
      memoryEvidence > 0 ? 'Memory is backed by qmd facts/*.md snippets.' : '',
    ].filter(Boolean).join(' '),
  };
}

export function residentNormalLifeAuditSignal(runs: BenchmarkArtifactSummary[]): ResidentNormalLifeAuditSignal {
  const latest = latestNormalLifeAudit(runs);
  if (!latest) {
    return {
      tone: 'warn',
      summary: 'No normal-life audit visible yet.',
      detail: 'Run or sync a CQA10 normal-life audit before treating resident recurrence as proven.',
    };
  }

  const totalActions = auditMetric(latest, 'totalActionAttempts');
  const successfulActions = auditMetric(latest, 'successfulActionSubmissions') || Math.max(0, totalActions - auditMetric(latest, 'failedActionSubmissions'));
  const failedActions = auditMetric(latest, 'failedActionSubmissions');
  const lowHealthWaits = auditMetric(latest, 'cause_low_health_heal_wait');
  const apGpExchanges = Math.max(
    auditMetric(latest, 'timeline_city_ap_gp_exchange'),
    auditMetric(latest, 'recurrence_ap_gp_exchange_events'),
  );
  const tradeClosures = Math.max(
    auditMetric(latest, 'timeline_trade_completed'),
    auditMetric(latest, 'recurrence_trade_completed'),
  );
  const hasApGpBreakdown = hasAuditMetric(latest, 'economy_organic_self_initiated_ap_gp_exchange_events')
    || hasAuditMetric(latest, 'economy_controlled_ap_gp_exchange_events');
  const organicApGp = auditMetric(latest, 'economy_organic_self_initiated_ap_gp_exchange_events');
  const controlledApGp = auditMetric(latest, 'economy_controlled_ap_gp_exchange_events');
  const stuckDetected = auditMetric(latest, 'timeline_stuck_detected');
  const stuckRecovered = auditMetric(latest, 'timeline_stuck_recovered');
  const duration = auditDurationLabel(latest);
  const apGpBreakdown = hasApGpBreakdown
    ? `, organic AP/GP ${organicApGp}, controlled AP/GP ${controlledApGp}`
    : '';
  const stuckAttribution = auditStuckAttributionSentence(latest);
  const detail = `${duration} audit: ${successfulActions}/${totalActions} actions, low-health waits ${lowHealthWaits}, AP/GP exchanges ${apGpExchanges}${apGpBreakdown}, trade closures ${tradeClosures}, stuck recovered ${stuckRecovered}/${stuckDetected}.${stuckAttribution ? ` ${stuckAttribution}` : ''}`;

  if (failedActions > 0 || latest.status !== 'passed') {
    return {
      tone: 'fail',
      summary: 'Normal-life audit has failed actions.',
      detail,
    };
  }

  if (lowHealthWaits > 0) {
    return {
      tone: 'warn',
      summary: 'Recovery waits still visible in latest audit.',
      detail,
    };
  }

  if (apGpExchanges <= 0 && tradeClosures <= 0) {
    return {
      tone: 'warn',
      summary: 'Recovery clear; AP/GP recurrence not observed.',
      detail,
    };
  }

  if (hasApGpBreakdown && apGpExchanges > 0 && organicApGp <= 0) {
    return {
      tone: 'warn',
      summary: 'AP/GP recurrence is controlled-only in latest audit.',
      detail,
    };
  }

  if (hasApGpBreakdown && organicApGp > 0 && tradeClosures <= 0) {
    return {
      tone: 'warn',
      summary: 'Organic AP/GP recurrence appears, but trade closures are still absent.',
      detail,
    };
  }

  return {
    tone: 'ok',
    summary: 'Normal-life audit shows recovery and AP/GP recurrence.',
    detail,
  };
}

export function residentRosterScanLines(
  row: ResidentDashboardRow,
  signals: ResidentProofPulseSignals = {},
): ResidentRosterScanLine[] {
  const loopSignal = residentLoopSignal(row);
  const checkpoints = residentLoopCheckpoints(row);
  const planCheckpoint = checkpoints.find(checkpoint => checkpoint.key === 'plan');
  const actionCheckpoint = checkpoints.find(checkpoint => checkpoint.key === 'action');
  const liveMoment = residentLiveMoment(row);
  const agencyCue = residentAgencyCue(row, signals);
  const causeSignal = residentCauseSignal(row);
  const apRunway = residentAttentionRunway(row);
  const memoryFreshness = residentMemoryFreshness(row);
  const proofPulse = residentProofPulse(row, signals);
  const warning = residentPrimaryWarning(row, signals.benchmark, { economyGp: signals.economyGp });

  return [
    {
      label: 'Moment',
      text: `${liveMoment.label}: ${liveMoment.title} · ${liveMoment.detail}`,
      tone: liveMoment.tone,
      limit: 104,
      priority: 'primary',
    },
    {
      label: 'Need',
      text: agencyCue.summary,
      tone: agencyCue.tone,
      limit: 96,
      priority: 'primary',
    },
    {
      label: 'Why',
      text: causeSignal.detail,
      tone: causeSignal.tone,
      limit: 84,
      priority: 'primary',
    },
    {
      label: 'Runway',
      text: `${apRunway.label} · ${apRunway.detail}`,
      tone: apRunway.tone,
      limit: 76,
      priority: 'primary',
    },
    {
      label: 'Plan',
      text: planCheckpoint?.value || '-',
      tone: planCheckpoint?.tone || 'warn',
      limit: 72,
      priority: 'secondary',
    },
    {
      label: 'Action',
      text: loopSignal.action,
      tone: actionCheckpoint?.tone || 'warn',
      limit: 60,
      priority: 'secondary',
    },
    {
      label: 'Memory',
      text: `${memoryFreshness.label} · ${memoryFreshness.summary} · ${memoryFreshness.detail}`,
      tone: memoryFreshness.tone,
      limit: 84,
      priority: 'secondary',
    },
    {
      label: 'Proof',
      text: `${proofPulse.summary} · ${proofPulse.detail}`,
      tone: proofPulse.tone,
      limit: 84,
      priority: 'secondary',
    },
    {
      label: 'Risk',
      text: `${warning.summary} · Act from: ${nextStepTargetLabel(warning)}`,
      tone: warning.tone,
      limit: 96,
      priority: 'secondary',
    },
  ];
}

export function residentDemoPickCue(
  rows: ResidentDashboardRow[],
  resolveSignals: (row: ResidentDashboardRow) => ResidentProofPulseSignals = () => ({}),
): ResidentDemoPickCue {
  if (rows.length === 0) {
    return {
      tone: 'warn',
      label: 'Demo pick',
      target: 'Residents',
      action: 'Wait for residents',
      detail: 'No resident roster loaded yet.',
    };
  }

  const evaluated = rows.map((row, index) => {
    const signals = resolveSignals(row);
    const pulse = residentProofPulse(row, signals);
    const nextStep = residentNextStepCue(row, signals);
    const warning = residentPrimaryWarning(row, signals.benchmark, { economyGp: signals.economyGp });
    return { row, index, pulse, nextStep, warning };
  });
  const ready = evaluated.find(candidate => candidate.row.online && candidate.pulse.tone === 'ok');

  if (ready) {
    return {
      tone: 'ok',
      label: 'Demo pick',
      residentName: ready.row.name,
      target: 'Resident Detail',
      action: 'Open demo-ready resident',
      detail: `${residentShortName(ready.row.name)} has ${ready.pulse.summary}; ${ready.pulse.detail}.`,
    };
  }

  const fallback = [...evaluated].sort((a, b) => {
    const toneDelta = demoPickToneRank(a.nextStep.tone) - demoPickToneRank(b.nextStep.tone);
    if (toneDelta !== 0) return toneDelta;
    return a.index - b.index;
  })[0];

  if (fallback) {
    return {
      tone: fallback.nextStep.tone,
      label: 'Demo pick',
      residentName: fallback.row.name,
      target: fallback.nextStep.target,
      action: fallback.nextStep.action,
      detail: `${residentShortName(fallback.row.name)} needs attention first: ${fallback.warning.summary}`,
    };
  }

  return {
    tone: 'warn',
    label: 'Demo pick',
    target: 'Residents',
    action: 'Wait for residents',
    detail: 'No resident roster loaded yet.',
  };
}

function demoPickToneRank(tone: ResidentDemoPickCue['tone']): number {
  if (tone === 'fail') return 0;
  if (tone === 'warn') return 1;
  return 2;
}

function residentShortName(name: string): string {
  return name.replace(/^res:/, '') || name;
}

function latestNormalLifeAudit(runs: BenchmarkArtifactSummary[]): BenchmarkArtifactSummary | undefined {
  const audits = runs
    .filter(run => run.task?.id === 'normal-life-audit' || /^normal_life_audit_/i.test(run.runId))
    .sort((a, b) => benchmarkTimeMs(b) - benchmarkTimeMs(a));
  return audits[0];
}

function benchmarkTimeMs(run: BenchmarkArtifactSummary): number {
  const time = Date.parse(run.endedAt || run.generatedAt || run.startedAt || '');
  return Number.isFinite(time) ? time : 0;
}

function auditMetric(run: BenchmarkArtifactSummary, key: string): number {
  const value = Number(run.metrics[key]);
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function hasAuditMetric(run: BenchmarkArtifactSummary, key: string): boolean {
  return Number.isFinite(Number(run.metrics[key]));
}

function auditDurationLabel(run: BenchmarkArtifactSummary): string {
  const startedAt = Date.parse(run.startedAt || '');
  const endedAt = Date.parse(run.endedAt || run.generatedAt || '');
  if (Number.isFinite(startedAt) && Number.isFinite(endedAt) && endedAt >= startedAt) {
    return `${Math.max(1, Math.round((endedAt - startedAt) / 60_000))}m`;
  }
  return 'latest';
}

function auditStuckAttributionSentence(run: BenchmarkArtifactSummary): string {
  const summary = run.evidenceSummaries?.find(item => /^top stuck churn:/i.test(item.trim()));
  if (!summary) return '';
  return `${summary.trim().replace(/^top/, 'Top')}.`;
}

function recoveryWaitDetail(pulse: ResidentGuestTrailPulse, recoveryWait: number): string {
  const names = (pulse.recoveryWaitResidents ?? [])
    .map(name => residentShortName(name))
    .filter(Boolean)
    .slice(0, 2);
  const overflow = Math.max(0, recoveryWait - names.length);
  const nameDetail = names.length > 0
    ? `${names.join(', ')}${overflow > 0 ? ` +${overflow.toLocaleString()} more` : ''} waiting`
    : `${recoveryWait.toLocaleString()} waiting`;
  const stuckTicks = Math.max(0, Math.floor(pulse.recoveryWaitMaxStuckTicks ?? 0));
  const stuckDetail = stuckTicks > 0
    ? `worst stuck ${stuckTicks.toLocaleString()} ${stuckTicks === 1 ? 'tick' : 'ticks'}`
    : '';

  return [nameDetail, stuckDetail, LOW_HEALTH_RECOVERY_WAIT_GUIDANCE].filter(Boolean).join('; ');
}

export function residentPrimaryWarning(
  row: ResidentDashboardRow | undefined,
  benchmarkSignal?: ResidentBenchmarkSignal,
  signals: ResidentOperatorEvidenceSignals = {},
): ResidentOperatorWarning {
  const warning = residentOperatorWarnings(row, benchmarkSignal, signals)[0];
  return warning || {
    tone: 'warn',
    summary: 'No operator warning available.',
    detail: 'Resident warnings are not yet populated.',
  };
}

export function residentNextStepCue(
  row: ResidentDashboardRow | undefined,
  signals: ResidentProofPulseSignals = {},
): ResidentNextStepCue {
  const warning = residentPrimaryWarning(row, signals.benchmark, { economyGp: signals.economyGp });

  return {
    tone: warning.tone,
    label: 'Next step',
    action: nextStepActionLabel(warning),
    target: nextStepTargetLabel(warning),
    detail: warning.tone === 'ok' ? warning.detail : [warning.summary, warning.detail].filter(Boolean).join(' '),
  };
}

export function residentOperatorWarnings(
  row: ResidentDashboardRow | undefined,
  benchmarkSignal?: ResidentBenchmarkSignal,
  signals: ResidentOperatorEvidenceSignals = {},
): ResidentOperatorWarning[] {
  if (!row) {
    return [{ tone: 'warn', summary: 'No live resident snapshot yet.', detail: 'Wait for the controller or city read model to publish this resident.' }];
  }

  const warnings: ResidentOperatorWarning[] = [];
  const feed = row.feed || row.body?.feed;
  if (!row.online) {
    warnings.push({ tone: 'fail', summary: 'Resident is offline in the live controller snapshot.', detail: 'Login or top up AP before expecting new actions.' });
  }
  if (residentNeedsAp(row)) {
    warnings.push({ tone: 'warn', summary: `AP low (${row.attention ?? 0}); top-up may be needed soon.`, detail: 'Attention is the resident life-force.' });
  }
  if (!feed) {
    warnings.push({ tone: 'warn', summary: 'No live feed attached; latest action/speech may be stale.', detail: 'Start spectator or wait for the gateway feed.' });
  } else if (feed.ageMs !== undefined && feed.ageMs > STALE_FEED_MS) {
    warnings.push({ tone: 'warn', summary: `Feed stale (${Math.round(feed.ageMs / 1000)}s old).`, detail: 'Live action/speech may lag the controller.' });
  }
  const actionOutcome = residentActionOutcome(row);
  if (actionOutcome.failed) {
    warnings.push({ tone: 'fail', summary: actionOutcome.summary, detail: actionOutcome.detail });
  }
  const recoveryWait = residentRecoveryWaitSignal(row);
  if (recoveryWait) {
    warnings.push({ tone: recoveryWait.tone, summary: recoveryWait.summary, detail: recoveryWait.detail });
  }
  if (residentGoldEvidenceLabel(row).value === 'not observed' && signals.economyGp?.tone === 'ok') {
    warnings.push({
      tone: 'warn',
      summary: 'Live inventory GP missing; recent economy evidence exists.',
      detail: signals.economyGp.detail,
    });
  } else if (residentGoldEvidenceLabel(row).value === 'not observed') {
    warnings.push({ tone: 'warn', summary: 'No coin-995 GP evidence in current snapshot.', detail: 'Do not imply this resident can pay GP yet.' });
  }
  if (!row.thinking?.activePlan) {
    warnings.push({ tone: 'warn', summary: 'No active plan published by thinking module.', detail: 'Goal pursuit may be opaque from the dashboard.' });
  }
  if (!row.storyArc?.summary && !row.storyArc?.latestEventKind) {
    warnings.push({ tone: 'warn', summary: 'Library strategy evidence is still thin for this resident.', detail: 'Run Storyteller/digest or wait for progress evidence.' });
  }
  if (benchmarkSignal && benchmarkSignal.tone !== 'ok') {
    warnings.push({ tone: benchmarkSignal.tone, summary: benchmarkSignal.summary, detail: benchmarkSignal.detail });
  }

  return warnings.length ? warnings : [{
    tone: 'ok',
    summary: 'No immediate AP/feed/strategy warnings detected.',
    detail: 'Resident has current AP, GP, plan, feed, story, and benchmark signals.',
  }];
}

export function residentNeedsAp(row: ResidentDashboardRow): boolean {
  return typeof row.attention === 'number' && row.attention <= LOW_AP_THRESHOLD;
}

export function residentNeedsApSupportSoon(row: ResidentDashboardRow): boolean {
  const runway = residentAttentionRunway(row);
  return runway.label === 'empty' || runway.label === 'floor' || runway.label === 'short';
}

export function residentApSupportRecommendation(row: ResidentDashboardRow | undefined): ResidentApSupportRecommendation {
  if (!row) {
    return {
      tone: 'warn',
      title: 'Wait for live AP reading',
      detail: 'No live resident snapshot is loaded, so AP support cannot be sized yet.',
      suggestedAp: STABLE_AP_RUNWAY_TARGET,
      suggestedMemo: 'AP support: restore resident to stable runway.',
      actionLabel: `Use ${STABLE_AP_RUNWAY_TARGET} AP`,
    };
  }

  const name = residentShortName(row.name);
  if (row.attention === undefined) {
    return {
      tone: 'warn',
      title: 'Wait for live AP reading',
      detail: 'No live AP reading is available for this resident yet.',
      suggestedAp: STABLE_AP_RUNWAY_TARGET,
      suggestedMemo: `AP support: restore ${name} to stable runway.`,
      actionLabel: `Use ${STABLE_AP_RUNWAY_TARGET} AP`,
    };
  }

  const currentAp = Math.max(0, Math.floor(row.attention));
  const suggestedAp = Math.max(0, STABLE_AP_RUNWAY_TARGET - currentAp);
  const suggestedMemo = `AP support: restore ${name} to ${STABLE_AP_RUNWAY_TARGET} AP runway.`;

  if (suggestedAp <= 0) {
    return {
      tone: 'ok',
      title: 'No AP grant needed',
      detail: `${name} is at ${currentAp.toLocaleString()} AP, at or above the ${STABLE_AP_RUNWAY_TARGET} AP stable runway target.`,
      suggestedAp: 0,
      suggestedMemo: `AP stable: no support grant needed for ${name}.`,
      actionLabel: 'Keep watching',
    };
  }

  if (currentAp <= 0) {
    return {
      tone: 'fail',
      title: `Grant ${suggestedAp.toLocaleString()} AP to restart action`,
      detail: `Resident is at 0 AP; grant enough to reach the ${STABLE_AP_RUNWAY_TARGET} AP stable runway target.`,
      suggestedAp,
      suggestedMemo,
      actionLabel: `Use ${suggestedAp.toLocaleString()} AP`,
    };
  }

  return {
    tone: currentAp <= SHORT_AP_RUNWAY_THRESHOLD ? 'warn' : 'ok',
    title: `Grant ${suggestedAp.toLocaleString()} AP to restore runway`,
    detail: `${name} has ${currentAp.toLocaleString()} AP; this restores the resident to the ${STABLE_AP_RUNWAY_TARGET} AP stable runway target.`,
    suggestedAp,
    suggestedMemo,
    actionLabel: `Use ${suggestedAp.toLocaleString()} AP`,
  };
}

export function residentAttentionRunway(row: ResidentDashboardRow): ResidentAttentionRunway {
  if (row.attention === undefined) {
    return {
      label: 'unknown',
      value: 'AP unknown',
      detail: 'No live AP reading in this snapshot.',
      tone: 'warn',
    };
  }

  const ap = Math.max(0, Math.floor(row.attention));
  if (ap <= 0) {
    return {
      label: 'empty',
      value: '0 AP',
      detail: 'At 0 AP; resident may be unable to act without support.',
      tone: 'fail',
    };
  }

  if (ap <= LOW_AP_THRESHOLD) {
    return {
      label: 'floor',
      value: `${ap} AP`,
      detail: `At/below ${LOW_AP_THRESHOLD} AP support floor.`,
      tone: 'warn',
    };
  }

  const floorDelta = ap - LOW_AP_THRESHOLD;
  if (ap <= SHORT_AP_RUNWAY_THRESHOLD) {
    return {
      label: 'short',
      value: `${ap} AP`,
      detail: `${floorDelta} AP above support floor.`,
      tone: 'warn',
    };
  }

  return {
    label: ap >= LONG_AP_RUNWAY_THRESHOLD ? 'long' : 'steady',
    value: `${ap} AP`,
    detail: `${floorDelta} AP above support floor.`,
    tone: 'ok',
  };
}

export function residentGoldEvidenceLabel(row: ResidentDashboardRow): { value: string; detail: string; tone: 'ok' | 'warn' } {
  const amount = residentCoinEvidenceAmount(row);
  if (amount > 0) {
    return { value: `${amount} GP`, detail: 'coin-995 inventory evidence', tone: 'ok' };
  }
  return {
    value: 'not observed',
    detail: 'No coin-995 inventory evidence in latest dashboard snapshot',
    tone: 'warn',
  };
}

export function residentCoinEvidenceAmount(row: ResidentDashboardRow): number {
  return coin995Amount(row);
}

export function residentPublicStateTiles(
  row: ResidentDashboardRow,
  signals: ResidentPublicStateSignals = {},
): ResidentPublicStateTile[] {
  const gp = residentPublicGpEvidenceLabel(row, signals.economyGp);
  const apRunway = residentAttentionRunway(row);
  const needsAp = residentNeedsApSupportSoon(row);
  const needsGpEvidence = gp.tone === 'warn';
  const supportNeed = needsAp
    ? {
        value: apRunway.label === 'short' ? 'AP watch' : 'AP support',
        detail: apRunway.label === 'short'
          ? 'Resident is above the AP floor but runway is short; top up soon.'
          : 'Resident is at or below the AP safety floor.',
        tone: 'warn' as const,
      }
    : needsGpEvidence
      ? {
          value: 'coin-995 evidence',
          detail: 'GP is not visible in the latest resident inventory snapshot.',
          tone: 'warn' as const,
        }
      : {
          value: 'steady',
          detail: gp.source === 'economy'
            ? 'AP stable and recent economy GP evidence is available.'
            : 'AP and GP evidence are both visible.',
          tone: 'ok' as const,
        };

  return [
    {
      label: 'Status',
      value: row.online ? 'online' : 'offline',
      detail: row.online ? 'live resident' : 'not currently attached',
      tone: row.online ? 'ok' : 'fail',
    },
    ...residentPublicIdentityTiles(row),
    {
      label: 'AP',
      value: apRunway.value,
      detail: apRunway.detail,
      tone: apRunway.tone,
    },
    {
      label: 'Support need',
      ...supportNeed,
    },
    {
      label: 'GP evidence',
      value: gp.value,
      detail: gp.detail,
      tone: gp.tone,
    },
  ];
}

function residentPublicGpEvidenceLabel(
  row: ResidentDashboardRow,
  economyGp: ResidentPublicStateSignals['economyGp'],
): { value: string; detail: string; tone: 'ok' | 'warn'; source: 'inventory' | 'economy' | 'none' } {
  const inventory = residentGoldEvidenceLabel(row);
  if (inventory.tone === 'ok') return { ...inventory, source: 'inventory' };
  if (economyGp?.tone === 'ok') {
    return {
      value: 'recent GP proof',
      detail: economyGp.detail,
      tone: 'ok',
      source: 'economy',
    };
  }
  return { ...inventory, source: 'none' };
}

function residentPublicIdentityTiles(row: ResidentDashboardRow): ResidentPublicStateTile[] {
  const tiles: ResidentPublicStateTile[] = [];
  const stack = row.stack;
  const soulValue = stack?.soulTitle || stack?.soulId;

  if (soulValue) {
    const detail = [
      stack?.soulId && stack.soulId !== soulValue ? stack.soulId : '',
      stack?.soulFile,
      stack?.behaviorKind ? `behavior ${stack.behaviorKind}` : '',
    ].filter(Boolean).join(' | ');
    tiles.push({
      label: 'Soul',
      value: soulValue,
      detail: detail || 'Soul file linked',
      tone: 'ok',
    });
  }

  const orientation = stack?.orientationGoal?.description?.trim();
  if (orientation) {
    const detail = [
      'soul orientation',
      stack?.orientationGoal?.id,
      stack?.orientationGoal?.tier,
    ].filter(Boolean).join(' | ');
    tiles.push({
      label: 'North star',
      value: orientation,
      detail,
      tone: 'ok',
    });
  }

  return tiles;
}

export function residentLoopSignal(row: ResidentDashboardRow): ResidentLoopSignal {
  const story = row.storyArc;
  const speech = recentSpeechSignal(row).text;
  const storyLabel =
    story?.summary ||
    (story?.latestEventKind && story.latestEventTick !== undefined
      ? `${story.latestEventKind} @ ${story.latestEventTick}`
      : story?.latestEventKind) ||
    '-';

  return {
    plan: residentGoalLabel(row),
    action: row.body?.lastAction?.kind || row.lastEvent?.kind || '-',
    speech,
    story: storyLabel,
  };
}

export function residentLoopCheckpoints(row: ResidentDashboardRow): ResidentLoopCheckpoint[] {
  const signal = residentLoopSignal(row);
  const speech = recentSpeechSignal(row);
  const planLive = Boolean(row.thinking?.activePlan?.trim());
  const speechLive = speech.text !== '-';
  const storyLive = signal.story !== '-';
  const actionLive = signal.action !== '-';
  const actionOutcome = residentActionOutcome(row);
  const actionFreshness = tickFreshness(row, row.body?.lastAction?.tick ?? row.lastEvent?.tick, ACTION_STALE_TICK_GAP);
  const speechFreshness = tickFreshness(row, speech.tick, SPEECH_STALE_TICK_GAP);
  const storyFreshness = tickFreshness(row, row.storyArc?.latestEventTick, STORY_STALE_TICK_GAP);
  const actionDetailParts = [actionDetail(row), actionFreshness].filter(Boolean);
  const speechDetailPrefix = speech.source === 'feed' ? 'live speech in feed' : speech.source === 'event' ? 'latest say event' : '';
  const speechDetailParts = [speechDetailPrefix, speechFreshness].filter(Boolean);
  const storyDetailParts = ['latest Library/Storyteller signal', storyFreshness].filter(Boolean);
  const planDetailParts = [
    row.thinking?.mode ? `mode ${row.thinking.mode}` : '',
    row.thinking?.lastInferenceCause ? `cause ${row.thinking.lastInferenceCause}` : '',
  ].filter(Boolean);

  return [
    {
      key: 'plan',
      label: 'Plan',
      value: planLive ? signal.plan : '-',
      detail: planLive ? (planDetailParts.join(' | ') || 'live thinking plan') : 'no active plan published yet',
      tone: planLive ? 'ok' : 'warn',
    },
    {
      key: 'action',
      label: 'Action',
      value: actionLive ? signal.action : '-',
      detail: actionLive ? actionDetailParts.join(' | ') : '-',
      tone: actionOutcome.failed ? 'fail' : actionLive && !isTickStale(actionFreshness) ? 'ok' : 'warn',
    },
    {
      key: 'speech',
      label: 'Speech',
      value: speechLive ? speech.text : '-',
      detail: speechLive ? speechDetailParts.join(' | ') : 'no recent speech in feed',
      tone: speechLive && !isTickStale(speechFreshness) ? 'ok' : 'warn',
    },
    {
      key: 'story',
      label: 'Story',
      value: storyLive ? signal.story : '-',
      detail: storyLive ? storyDetailParts.join(' | ') : 'no current story signal',
      tone: storyLive && !isTickStale(storyFreshness) ? 'ok' : 'warn',
    },
  ];
}

export function residentProofPulse(
  row: ResidentDashboardRow | undefined,
  signals: ResidentProofPulseSignals = {},
): ResidentProofPulse {
  if (!row) {
    return {
      tone: 'fail',
      summary: '0/1 loop proofs live',
      detail: 'Resident snapshot missing.',
    };
  }

  const checks = residentProofChecks(row, signals);
  const actionOutcome = residentActionOutcome(row);
  const requiredChecks = checks.filter(check => !check.optional);
  const okCount = requiredChecks.filter(check => check.ok).length;
  const missing = requiredChecks.filter(check => !check.ok).map(check => check.label);
  const total = requiredChecks.length || 1;
  const tone: ResidentProofPulse['tone'] = !row.online || actionOutcome.failed ? 'fail' : missing.length ? 'warn' : 'ok';
  const detail = !row.online
    ? `offline · ${missing.slice(0, 3).join(', ') || 'no live proofs'}`
    : actionOutcome.failed
      ? `action outcome: ${actionOutcome.outcome}`
    : missing.length
      ? `missing: ${missing.slice(0, 4).join(', ')}`
      : 'all tracked proof signals are live';

  return {
    tone,
    summary: `${okCount}/${total} loop proofs live`,
    detail,
  };
}

export function residentProofRollup(
  rows: ResidentDashboardRow[],
  resolveSignals: (row: ResidentDashboardRow) => ResidentProofPulseSignals = () => ({}),
): ResidentProofRollup {
  const onlineRows = rows.filter(row => row.online);
  if (onlineRows.length === 0) {
    return {
      tone: 'warn',
      headline: 'No online residents in current snapshot',
      detail: 'Waiting for live AP/GP proof signals.',
      actions: [{
        label: 'Reconnect residents',
        tone: 'warn',
        detail: 'Start or reconnect the controller before treating this as live proof.',
      }],
      healthy: 0,
      warn: 0,
      fail: 0,
      online: 0,
    };
  }

  let healthy = 0;
  let warn = 0;
  let fail = 0;
  const gapCounts = new Map<string, number>();
  const gapOrder = new Map<string, number>();
  let gapIndex = 0;

  for (const row of onlineRows) {
    const pulse = residentProofPulse(row, resolveSignals(row));
    if (pulse.tone === 'ok') healthy += 1;
    else if (pulse.tone === 'warn') warn += 1;
    else fail += 1;

    const checks = residentProofChecks(row, resolveSignals(row)).filter(check => !check.optional && !check.ok);
    for (const check of checks) {
      gapCounts.set(check.label, (gapCounts.get(check.label) ?? 0) + 1);
      if (!gapOrder.has(check.label)) {
        gapOrder.set(check.label, gapIndex);
        gapIndex += 1;
      }
    }
  }

  const topGaps = [...gapCounts.entries()]
    .sort((a, b) => {
      const countDelta = b[1] - a[1];
      if (countDelta !== 0) return countDelta;
      return (gapOrder.get(a[0]) ?? 0) - (gapOrder.get(b[0]) ?? 0);
    })
    .slice(0, 3)
    .map(([label]) => label);

  const tone: ResidentProofRollup['tone'] = healthy === onlineRows.length ? 'ok' : fail > 0 && healthy === 0 ? 'fail' : 'warn';
  const detail = topGaps.length ? `Top gaps: ${topGaps.join(', ')}` : 'All tracked AP/GP loop proofs are live.';
  const actions = topGaps.map(proofGapAction);

  return {
    tone,
    headline: `${healthy.toLocaleString()}/${onlineRows.length.toLocaleString()} residents have live loop proofs`,
    detail,
    actions,
    healthy,
    warn,
    fail,
    online: onlineRows.length,
  };
}

export function residentLivenessLedger(
  rows: ResidentDashboardRow[],
  resolveSignals: (row: ResidentDashboardRow) => ResidentProofPulseSignals = () => ({}),
  limit = 12,
): ResidentLivenessLedgerEntry[] {
  return rows
    .map(row => {
      const signals = resolveSignals(row);
      const proof = residentProofPulse(row, signals);
      const nextStep = residentNextStepCue(row, signals);
      const moment = residentLiveMoment(row);
      const ap = residentAttentionRunway(row);
      const gp = residentPublicGpEvidenceLabel(row, signals.economyGp);
      const checkpoints = residentLoopCheckpoints(row);
      const plan = checkpoints.find(checkpoint => checkpoint.key === 'plan');
      const story = checkpoints.find(checkpoint => checkpoint.key === 'story');
      const memory = residentLedgerMemoryLabel(row);
      return {
        residentName: row.name,
        displayName: residentShortName(row.name),
        tone: proof.tone,
        status: row.online ? `${moment.label}: ${moment.title}` : 'offline',
        proof: proof.summary,
        detail: proof.detail,
        nextAction: nextStep.action,
        nextTarget: nextStep.target,
        ap: ap.value,
        gp: gp.value,
        plan: plan?.value || '-',
        story: story?.value || '-',
        memory,
      };
    })
    .sort((left, right) => {
      const toneDelta = livenessToneRank(left.tone) - livenessToneRank(right.tone);
      if (toneDelta !== 0) return toneDelta;
      const actionDelta = left.nextAction.localeCompare(right.nextAction);
      if (actionDelta !== 0) return actionDelta;
      return left.residentName.localeCompare(right.residentName);
    })
    .slice(0, Math.max(0, limit));
}

function residentLedgerMemoryLabel(row: ResidentDashboardRow): string {
  const facts = row.memory?.facts || [];
  if (facts.length === 0) return 'no qmd';
  const topics = [...new Set(facts.map(fact => fact.topic).filter(Boolean))];
  if (topics.length === 0) return `${facts.length} qmd`;
  return topics.slice(0, 2).join(', ');
}

export function residentLivenessDetail(
  row: ResidentDashboardRow,
  signals: ResidentProofPulseSignals = {},
): ResidentLivenessDetail {
  const proof = residentProofPulse(row, signals);
  const nextStep = residentNextStepCue(row, signals);
  const moment = residentLiveMoment(row);
  const ap = residentAttentionRunway(row);
  const gp = residentPublicGpEvidenceLabel(row, signals.economyGp);
  const checkpoints = residentLoopCheckpoints(row);
  const memory = residentMemoryFreshness(row);

  const checkpointFact = (key: ResidentLoopCheckpoint['key']): ResidentLoopFact => {
    const checkpoint = checkpoints.find(item => item.key === key);
    return {
      label: checkpoint?.label || key,
      value: checkpoint?.value || '-',
      detail: checkpoint?.detail || `no ${key} signal`,
      tone: checkpoint?.tone || 'warn',
    };
  };

  return {
    residentName: row.name,
    displayName: residentShortName(row.name),
    tone: proof.tone,
    headline: proof.summary,
    moment: `${moment.label}: ${moment.title}`,
    detail: [moment.detail, proof.detail].filter(Boolean).join(' | '),
    nextAction: nextStep.action,
    nextTarget: nextStep.target,
    nextDetail: nextStep.detail,
    facts: [
      { label: 'AP runway', value: ap.value, detail: ap.detail, tone: ap.tone },
      { label: 'GP proof', value: gp.value, detail: gp.detail, tone: gp.tone },
      checkpointFact('plan'),
      checkpointFact('action'),
      checkpointFact('speech'),
      checkpointFact('story'),
      { label: 'Memory', value: memory.label, detail: `${memory.summary}; ${memory.detail}`, tone: memory.tone },
    ],
  };
}

function livenessToneRank(tone: ResidentLivenessLedgerEntry['tone']): number {
  if (tone === 'fail') return 0;
  if (tone === 'warn') return 1;
  return 2;
}

function proofGapAction(label: string): ResidentProofRollupAction {
  switch (label) {
    case 'AP':
      return {
        label: 'Top up AP',
        tone: 'warn',
        detail: 'Grant AP or pick a stable resident before demoing liveness.',
      };
    case 'Plan':
      return {
        label: 'Wake planning',
        tone: 'warn',
        detail: 'Observe or restart thinking until an active plan publishes.',
      };
    case 'Action':
      return {
        label: 'Inspect action loop',
        tone: 'warn',
        detail: 'Open resident detail or runtime logs for failed or missing actions.',
      };
    case 'Action outcome':
      return {
        label: 'Inspect failed action',
        tone: 'fail',
        detail: 'Open resident detail or runtime logs before trusting liveness.',
      };
    case 'Speech':
      return {
        label: 'Prompt speech proof',
        tone: 'warn',
        detail: 'Ask for a short status line or wait for a fresh say event.',
      };
    case 'GP':
      return {
        label: 'Gather GP proof',
        tone: 'warn',
        detail: 'Run coin-995 or AP/GP exchange proof before claiming purchasing power.',
      };
    case 'Memory':
      return {
        label: 'Capture memory proof',
        tone: 'warn',
        detail: 'Wait for a qmd facts/*.md snippet or inspect resident memory before demoing recall.',
      };
    case 'Goal contract':
      return {
        label: 'Check goal contract',
        tone: 'warn',
        detail: 'Review resident goal contract before presenting intent as grounded.',
      };
    case 'Storyteller':
      return {
        label: 'Run Storyteller',
        tone: 'warn',
        detail: 'Generate or review Storyteller digest refs for this resident.',
      };
    case 'Benchmark':
      return {
        label: 'Run benchmark proof',
        tone: 'warn',
        detail: 'Capture a fresh focused capability benchmark for the weak resident.',
      };
    default:
      return {
        label: `Inspect ${label}`,
        tone: 'warn',
        detail: 'Open resident detail and capture fresh proof before demoing liveness.',
      };
  }
}

export function residentTriageSummary(
  rows: ResidentDashboardRow[],
  resolveSignals: (row: ResidentDashboardRow) => ResidentProofPulseSignals = () => ({}),
): ResidentTriageSummary {
  if (rows.length === 0) {
    return {
      tone: 'warn',
      headline: 'No resident roster loaded',
      detail: 'Waiting for live controller or dashboard read-model data.',
      urgentResidents: 0,
      totalResidents: 0,
      onlineResidents: 0,
      buckets: [
        emptyTriageBucket('offline', 'Offline', 'fail', 'No resident snapshots are available yet.'),
        emptyTriageBucket('attention', 'Low AP', 'warn', 'No AP balances are available yet.'),
        emptyTriageBucket('recovery', 'Recovery wait', 'warn', 'No recovery-wait signals are available yet.'),
        emptyTriageBucket('quiet', 'Quiet loop', 'warn', 'No loop cadence is available yet.'),
        emptyTriageBucket('action', 'Action outcome', 'fail', 'No action outcome data is available yet.'),
        emptyTriageBucket('plan', 'Missing plan', 'warn', 'No thinking plans are available yet.'),
        emptyTriageBucket('gp', 'Missing GP proof', 'warn', 'No coin-995 proof is available yet.'),
        emptyTriageBucket('story', 'Thin story', 'warn', 'No Library or Storyteller evidence is available yet.'),
        emptyTriageBucket('memory', 'Thin memory', 'warn', 'No qmd facts/*.md memory snippets are available yet.'),
        emptyTriageBucket('benchmark', 'Capability warning', 'warn', 'No capability benchmark signal is loaded yet.'),
      ],
    };
  }

  const offlineRows = rows.filter(row => !row.online);
  const lowApRows = rows.filter(row => row.online && residentNeedsApSupportSoon(row));
  const recoveryWaitRows = rows.filter(row => row.online && residentRecoveryWaitSignal(row));
  const quietRows = rows.filter(row => {
    if (!row.online) return false;
    const checkpoints = residentLoopCheckpoints(row);
    const action = checkpoints.find(checkpoint => checkpoint.key === 'action');
    const speech = checkpoints.find(checkpoint => checkpoint.key === 'speech');
    return feedTone(row) === 'warn' || (action?.tone === 'warn' && speech?.tone === 'warn');
  });
  const actionOutcomeRows = rows.filter(row => row.online && residentActionOutcome(row).failed);
  const missingPlanRows = rows.filter(row => row.online && !row.thinking?.activePlan?.trim());
  const missingGpRows = rows.filter(row => {
    if (!row.online) return false;
    const signals = resolveSignals(row);
    return residentCoinEvidenceAmount(row) <= 0 && signals.economyGp?.tone !== 'ok';
  });
  const thinStoryRows = rows.filter(row => {
    if (!row.online) return false;
    const signals = resolveSignals(row);
    const storyCheckpoint = residentLoopCheckpoints(row).find(checkpoint => checkpoint.key === 'story');
    return storyCheckpoint?.tone === 'warn' && signals.storyteller?.tone !== 'ok';
  });
  const missingMemoryRows = rows.filter(row => row.online && !residentHasQmdMemory(row));
  const benchmarkRows = rows.filter(row => {
    if (!row.online) return false;
    const signal = resolveSignals(row).benchmark;
    return signal !== undefined && signal.tone !== 'ok';
  });

  const buckets: ResidentTriageBucket[] = [
    makeTriageBucket('offline', 'Offline', 'fail', offlineRows, 'Login or AP top-up may be required before new action proof appears.'),
    makeTriageBucket('attention', 'Low AP', 'warn', lowApRows, 'Residents at or near the AP safety floor need support soon.'),
    makeTriageBucket('recovery', 'Recovery wait', 'warn', recoveryWaitRows, 'Residents are waiting at low health; inspect food/cook/eat recovery before trusting combat liveness.'),
    makeTriageBucket('quiet', 'Quiet loop', 'warn', quietRows, 'Action, speech, or feed cadence is stale enough to deserve an operator glance.'),
    makeTriageBucket('action', 'Action outcome', 'fail', actionOutcomeRows, 'Latest action result timed out or failed; inspect before trusting liveness.'),
    makeTriageBucket('plan', 'Missing plan', 'warn', missingPlanRows, 'Thinking has not published a current plan for these residents.'),
    makeTriageBucket('gp', 'Missing GP proof', 'warn', missingGpRows, 'Do not claim GP purchasing power until coin-995 or economy evidence appears.'),
    makeTriageBucket('story', 'Thin story', 'warn', thinStoryRows, 'Library or Storyteller evidence is not fresh enough to explain the resident.'),
    makeTriageBucket('memory', 'Thin memory', 'warn', missingMemoryRows, 'No qmd facts/*.md memory snippets are visible for these residents.'),
    makeTriageBucket('benchmark', 'Capability warning', 'warn', benchmarkRows, 'Latest capability benchmark signal is stale, failed, or missing confidence.'),
  ];

  const urgentNames = new Set<string>([
    ...offlineRows,
    ...lowApRows,
    ...recoveryWaitRows,
    ...quietRows,
    ...actionOutcomeRows,
    ...missingPlanRows,
    ...missingGpRows,
    ...thinStoryRows,
    ...missingMemoryRows,
    ...benchmarkRows,
  ].map(row => row.name));

  const urgentResidents = urgentNames.size;
  const onlineResidents = rows.filter(row => row.online).length;
  const tone: ResidentTriageSummary['tone'] =
    offlineRows.length > 0 ? 'fail' : urgentResidents > 0 ? 'warn' : 'ok';
  const activeBuckets = buckets.filter(bucket => bucket.count > 0);
  const detail = activeBuckets.length
    ? activeBuckets.slice(0, 3).map(bucket => `${bucket.label}: ${bucket.count}`).join(' · ')
    : 'All visible residents have AP, cadence, plan, GP/story/memory proof, and capability signals.';

  return {
    tone,
    headline: urgentResidents > 0
      ? `${urgentResidents.toLocaleString()}/${rows.length.toLocaleString()} residents need operator attention`
      : `${onlineResidents.toLocaleString()}/${rows.length.toLocaleString()} residents look steady`,
    detail,
    urgentResidents,
    totalResidents: rows.length,
    onlineResidents,
    buckets,
  };
}

export function visibleResidentTriageBuckets(summary: ResidentTriageSummary, limit: number): ResidentTriageBucket[] {
  if (limit <= 0) return [];
  const activeBuckets = summary.buckets.filter(bucket => bucket.count > 0);
  const clearBuckets = summary.buckets.filter(bucket => bucket.count === 0);
  return [...activeBuckets, ...clearBuckets].slice(0, limit);
}

const residentTriageBucketKeys = new Set<ResidentTriageBucketKey>([
  'offline',
  'attention',
  'recovery',
  'quiet',
  'action',
  'plan',
  'gp',
  'story',
  'memory',
  'benchmark',
]);

export function residentTriageFocusFromSearch(search: string): ResidentTriageBucketKey | '' {
  const focus = new URLSearchParams(search).get('triage')?.trim().toLowerCase() || '';
  return residentTriageBucketKeys.has(focus as ResidentTriageBucketKey) ? focus as ResidentTriageBucketKey : '';
}

function modelParts(row: ResidentDashboardRow): { value: string; detail?: string } {
  const profile = row.stack?.model || row.stack?.brain || row.stack?.body;
  const value =
    profile?.endpoint ||
    profile?.model ||
    stringField(row.thinking?.latestInference, 'endpoint') ||
    row.thinking?.latestInference?.provider ||
    '-';
  const detail = profile?.model || row.thinking?.latestInference?.model;
  return detail ? { value, detail } : { value };
}

function endpointParts(row: ResidentDashboardRow): { value: string; detail?: string } {
  const profile = row.stack?.model || row.stack?.brain || row.stack?.body;
  const value =
    profile?.endpoint ||
    stringField(row.thinking?.latestInference, 'endpoint') ||
    row.thinking?.latestInference?.provider ||
    '-';
  const detail = profile?.model || stringField(row.thinking?.latestInference, 'model');
  return detail ? { value, detail } : { value };
}

function modelIdentityParts(row: ResidentDashboardRow): { value: string; detail?: string } {
  const profile = row.stack?.model || row.stack?.brain || row.stack?.body;
  const value =
    profile?.model ||
    stringField(row.thinking?.latestInference, 'model') ||
    '-';
  const detail =
    profile?.endpoint ||
    stringField(row.thinking?.latestInference, 'endpoint') ||
    row.thinking?.latestInference?.provider;
  return detail ? { value, detail } : { value };
}

function activeModule(row: ResidentDashboardRow): SparkModuleSummary | undefined {
  return row.stack?.activeModule || row.spark?.activeModule || row.stack?.configuredModules?.[0] || row.spark?.modules?.[0];
}

function residentAgencyActionLabel(row: ResidentDashboardRow): string {
  const actionKind = row.body?.lastAction?.kind || row.lastEvent?.kind;
  if (actionKind) {
    return `just ${friendlyActionLabel(actionKind, row)}`;
  }

  const speech = recentSpeechSignal(row);
  if (speech.text !== '-') {
    return `just said "${truncateAgencyText(speech.text, 52)}"`;
  }

  return 'no recent action yet';
}

function friendlyActionLabel(kind: string, row: ResidentDashboardRow): string {
  const normalized = kind.trim().toLowerCase().replace(/[-\s]+/g, '_');
  if (normalized === 'pickup_item') {
    return residentCoinEvidenceAmount(row) > 0 ? 'picked up coin-995' : 'picked up an item';
  }

  const labels: Record<string, string> = {
    action: 'acted',
    attack: 'attacked',
    chat: 'chatted',
    cook: 'cooked',
    eat: 'ate',
    exchange_gp_for_ap: 'exchanged GP for AP',
    fish: 'fished',
    move_to: 'moved',
    say: 'spoke',
    trade_with: 'traded',
  };
  return labels[normalized] || `did ${normalized.replace(/_/g, ' ')}`;
}

function readableRawCause(rawCause: string, actionKind: string): ResidentCauseSignal {
  const raw = rawCause.trim();
  const normalized = raw.toLowerCase();
  if (normalized === 'goal:ap-gp') {
    return {
      value: 'AP/GP goal',
      detail: `because the AP/GP goal drove ${actionKind} (${raw})`,
      tone: 'ok',
    };
  }
  if (normalized === 'nervous:request-attention') {
    return {
      value: 'attention request',
      detail: `because the nervous system requested attention (${raw})`,
      tone: 'ok',
    };
  }

  if (normalized.startsWith('goal:')) {
    const value = `${readableCauseToken(raw.slice('goal:'.length))} goal`;
    return {
      value,
      detail: `because ${value} drove ${actionKind} (${raw})`,
      tone: 'ok',
    };
  }
  if (normalized.startsWith('nervous:')) {
    const value = readableCauseToken(raw.slice('nervous:'.length));
    return {
      value,
      detail: `because the nervous system recorded ${value} (${raw})`,
      tone: 'ok',
    };
  }

  const value = raw.includes(':') ? readableCauseToken(raw.split(':').slice(1).join(':') || raw) : `rule ${readableCauseToken(raw)}`;
  return {
    value,
    detail: `because ${value} drove ${actionKind} (${raw})`,
    tone: 'ok',
  };
}

function readableCauseToken(value: string): string {
  return value.trim().replace(/[_:-]+/g, ' ').replace(/\s+/g, ' ');
}

function truncateAgencyText(value: string, maxLength: number): string {
  const normalized = value.trim().replace(/\s+/g, ' ');
  return normalized.length > maxLength ? `${normalized.slice(0, Math.max(0, maxLength - 1))}...` : normalized;
}

function residentGoalLabel(row: ResidentDashboardRow): string {
  return row.thinking?.activePlan || row.stack?.soulTitle || row.stack?.soulId || row.storyArc?.summary || '-';
}

function residentGoalDetail(row: ResidentDashboardRow): string {
  if (row.thinking?.activePlan) return 'plan';
  if (row.stack?.soulTitle || row.stack?.soulId) return 'soul';
  if (row.storyArc?.summary) return 'library';
  return '-';
}

function attentionLabel(row: ResidentDashboardRow): string {
  return row.attention === undefined ? 'AP unknown' : `${row.attention} AP`;
}

function actionDetail(row: ResidentDashboardRow): string {
  const action = row.body?.lastAction;
  if (!action) return row.lastEvent?.text || '-';
  return [action.result, action.source, action.cause || action.ruleId].filter(Boolean).join(' | ') || '-';
}

function actionDetailWithoutCause(row: ResidentDashboardRow): string {
  const action = row.body?.lastAction;
  if (!action) return row.lastEvent?.text || '-';
  return [action.result, action.source].filter(Boolean).join(' | ') || '-';
}

function nextStepActionLabel(warning: ResidentOperatorWarning): string {
  if (warning.tone === 'ok') return 'Keep watching';
  if (warning.summary.startsWith('Resident is offline')) return 'Reconnect resident';
  if (warning.summary.startsWith('AP low')) return 'Top up AP';
  if (warning.summary.startsWith('No live feed') || warning.summary.startsWith('Feed stale')) return 'Attach live feed';
  if (warning.summary.startsWith('Low-health recovery wait')) return 'Inspect recovery loop';
  if (warning.summary.startsWith('Latest action')) return 'Repair latest action';
  if (warning.summary.includes('GP')) return 'Capture GP proof';
  if (warning.summary.startsWith('No active plan')) return 'Publish active plan';
  if (warning.summary.startsWith('Library strategy')) return 'Ground story evidence';
  if (warning.summary.toLowerCase().includes('benchmark')) return 'Run capability proof';
  return 'Review resident signal';
}

function nextStepTargetLabel(warning: ResidentOperatorWarning): string {
  if (warning.tone === 'ok') return 'Resident Intent';
  if (warning.summary.startsWith('Resident is offline') || warning.summary.startsWith('AP low')) return 'Grant Attention';
  if (warning.summary.startsWith('No live feed') || warning.summary.startsWith('Feed stale')) return 'Open Ops View';
  if (warning.summary.startsWith('Low-health recovery wait')) return 'Open Ops View';
  if (warning.summary.startsWith('Latest action')) return 'Open Ops View';
  if (warning.summary.includes('GP')) return 'Resident Economy';
  if (warning.summary.startsWith('No active plan')) return 'Open Ops View';
  if (warning.summary.startsWith('Library strategy')) return 'Storyteller Grounded Events';
  if (warning.summary.toLowerCase().includes('benchmark')) return 'Capability Warnings';
  return 'Capability Warnings';
}

function residentRecoveryWaitSignal(row: ResidentDashboardRow | undefined): ResidentRecoveryWaitSignal | undefined {
  if (!row?.online) return undefined;

  const action = row.body?.lastAction;
  const actionKind = action?.kind || row.lastEvent?.kind || 'action';
  const cause = [action?.cause, action?.ruleId, row.thinking?.lastInferenceCause]
    .find(rawCause => isLowHealthRecoveryWaitCause(rawCause));
  if (!cause) return undefined;

  const stuckLabel = residentRecoveryWaitStuckLabel(row);
  const actionDetail = `Latest action is ${actionKind} with cause ${cause}`;
  const tick = action?.tick ?? row.lastEvent?.tick;

  return {
    cause,
    title: residentRecoveryWaitTitle(cause),
    summary: 'Low-health recovery wait is active.',
    detail: [actionDetail, stuckLabel, LOW_HEALTH_RECOVERY_WAIT_GUIDANCE].filter(Boolean).join('; ') + '.',
    momentDetail: [
      cause,
      stuckLabel,
      tickFreshness(row, tick, ACTION_STALE_TICK_GAP),
      LOW_HEALTH_RECOVERY_WAIT_GUIDANCE,
    ].filter(Boolean).join(' | '),
    tone: 'warn',
  };
}

function isLowHealthRecoveryWaitCause(rawCause: string | undefined): rawCause is string {
  if (!rawCause) return false;
  const normalized = normalizeRecoveryWaitCause(rawCause);
  for (const cause of LOW_HEALTH_RECOVERY_WAIT_CAUSES) {
    if (normalized === cause || normalized.endsWith(`_${cause}`)) return true;
  }
  return false;
}

function normalizeRecoveryWaitCause(rawCause: string): string {
  return rawCause.trim().toLowerCase().replace(/[-\s:]+/g, '_');
}

function residentRecoveryWaitTitle(cause: string): string {
  const normalized = normalizeRecoveryWaitCause(cause);
  if (normalized.endsWith('low_health_stranded')) return 'Stranded while low-health';
  if (normalized.endsWith('low_health_hold_position')) return 'Holding position to heal';
  return 'Waiting to heal';
}

function residentRecoveryWaitStuckLabel(row: ResidentDashboardRow): string {
  const ticks = recoveryWaitStuckTicks(row);
  if (ticks <= 0) return '';
  return `stuck ${ticks.toLocaleString()} ${ticks === 1 ? 'tick' : 'ticks'}`;
}

function recoveryWaitStuckTicks(row: ResidentDashboardRow): number {
  const stuckTicks = row.progress?.stuckTicks;
  if (typeof stuckTicks !== 'number' || stuckTicks <= 0) return 0;
  return Math.floor(stuckTicks);
}

function compactMomentCauseDetail(cause: ResidentCauseSignal): string {
  if (cause.tone !== 'ok') return '';
  if (cause.value === 'live plan' || cause.value === 'live speech') return cause.detail;
  return `because ${cause.value}`;
}

function residentActionOutcome(row: ResidentDashboardRow): {
  ok: boolean;
  failed: boolean;
  outcome: string;
  summary: string;
  detail: string;
} {
  const action = row.body?.lastAction;
  const result = normalizeActionResult(action?.result);
  const failed = result === 'timeout' || result === 'failed' || result === 'error' || result === 'cancelled';
  const kind = action?.kind || 'Latest action';
  const source = action?.source ? ` from ${action.source}` : '';
  const resultLabel = result || 'unknown';

  return {
    ok: Boolean(row.body?.lastAction?.kind || row.lastEvent?.kind) && !failed,
    failed,
    outcome: failed ? `latest action ${result}` : result ? `latest action ${result}` : 'latest action result pending',
    summary: failed ? `Latest action ${result === 'failed' ? 'failed' : result}.` : 'Latest action outcome is usable.',
    detail: failed ? `${kind} returned ${resultLabel}${source}.` : `${kind}${source || ' has no failing result.'}`,
  };
}

function normalizeActionResult(result: string | undefined): string {
  const value = (result || '').trim().toLowerCase().replace(/[_\s-]+/g, ' ');
  if (!value) return '';
  if (value.includes('timeout') || value.includes('timed out') || value.includes('time out')) return 'timeout';
  if (value === 'failed' || value === 'fail' || value.includes('target not found')) return 'failed';
  if (value === 'error' || value.includes('error')) return 'error';
  if (value === 'cancelled' || value === 'canceled') return 'cancelled';
  if (value === 'ok' || value === 'success' || value === 'complete' || value === 'completed') return 'success';
  return value.replaceAll(' ', '_');
}

function storyDetail(row: ResidentDashboardRow): string {
  const story = row.storyArc;
  if (!story) return row.progress?.latestMeaningful?.reasons?.join(' | ') || '-';
  const latest = story.latestEventKind && story.latestEventTick !== undefined
    ? `${story.latestEventKind} @ ${story.latestEventTick}`
    : story.latestEventKind;
  return latest || story.summary || '-';
}

function feedLabel(row: ResidentDashboardRow): string {
  const feed = row.feed || row.body?.feed;
  if (!row.online) return 'offline';
  if (!feed) return 'no feed';
  if (feed.ageMs === undefined || feed.ageMs > STALE_FEED_MS) return 'stale';
  return 'live';
}

function feedTone(row: ResidentDashboardRow): 'ok' | 'warn' | 'fail' | undefined {
  const label = feedLabel(row);
  if (label === 'live') return 'ok';
  if (label === 'stale' || label === 'no feed') return 'warn';
  if (label === 'offline') return 'fail';
  return undefined;
}

function feedDetail(row: ResidentDashboardRow): string {
  const feed = row.feed || row.body?.feed;
  if (!feed) return '-';
  const nearby = feed.nearby;
  return [
    feed.ageMs === undefined ? '' : `${Math.round(feed.ageMs / 1000)}s old`,
    `${feed.availableActions} actions`,
    `p${nearby.players} n${nearby.npcs} o${nearby.objects} i${nearby.worldItems}`,
  ].filter(Boolean).join(' | ');
}

function coin995Amount(row: ResidentDashboardRow): number {
  const resident = asRecord(asRecord(row.body?.latestPerception).resident);
  const sources = [resident.inventory, row.body?.saved?.inventory];
  for (const source of sources) {
    const amount = inventoryCoinAmount(source);
    if (amount > 0) return amount;
  }
  return 0;
}

function recentSpeechSignal(row: ResidentDashboardRow): { text: string; source: 'feed' | 'event' | 'none'; tick?: number } {
  const feed = row.feed || row.body?.feed;
  if (feed?.latestEventKind === 'say' && typeof feed.latestEventText === 'string' && feed.latestEventText.trim().length > 0) {
    return {
      text: feed.latestEventText.trim(),
      source: 'feed',
      ...(feed.tick === undefined ? {} : { tick: feed.tick }),
    };
  }
  if (row.lastEvent?.kind === 'say' && typeof row.lastEvent.text === 'string' && row.lastEvent.text.trim().length > 0) {
    return {
      text: row.lastEvent.text.trim(),
      source: 'event',
      ...(row.lastEvent.tick === undefined ? {} : { tick: row.lastEvent.tick }),
    };
  }
  return { text: '-', source: 'none' };
}

function residentProofChecks(row: ResidentDashboardRow, signals: ResidentProofPulseSignals): ResidentProofCheck[] {
  const actionOutcome = residentActionOutcome(row);
  return [
    { label: 'AP', ok: !residentNeedsApSupportSoon(row) },
    { label: 'Plan', ok: Boolean(row.thinking?.activePlan?.trim()) },
    { label: actionOutcome.failed ? 'Action outcome' : 'Action', ok: actionOutcome.ok },
    { label: 'Speech', ok: recentSpeechSignal(row).text !== '-' },
    { label: 'GP', ok: residentCoinEvidenceAmount(row) > 0 || signals.economyGp?.tone === 'ok' },
    { label: 'Memory', ok: residentHasQmdMemory(row) },
    {
      label: 'Goal contract',
      ok: signals.goalContract?.tone === 'ok',
      optional: signals.goalContract === undefined,
    },
    {
      label: 'Storyteller',
      ok: signals.storyteller?.tone === 'ok',
      optional: signals.storyteller === undefined,
    },
    {
      label: 'Benchmark',
      ok: signals.benchmark?.tone === 'ok',
      optional: signals.benchmark === undefined,
    },
  ];
}

function residentHasQmdMemory(row: ResidentDashboardRow): boolean {
  return (row.memory?.facts || []).length > 0;
}

function emptyTriageBucket(
  key: ResidentTriageBucket['key'],
  label: string,
  tone: ResidentTriageBucket['tone'],
  detail: string,
): ResidentTriageBucket {
  return { key, label, tone, count: 0, residents: [], detail };
}

function makeTriageBucket(
  key: ResidentTriageBucket['key'],
  label: string,
  tone: ResidentTriageBucket['tone'],
  rows: ResidentDashboardRow[],
  detail: string,
): ResidentTriageBucket {
  const sorted = [...rows].sort((a, b) => {
    const attentionDelta = (a.attention ?? Number.MAX_SAFE_INTEGER) - (b.attention ?? Number.MAX_SAFE_INTEGER);
    if (attentionDelta !== 0) return attentionDelta;
    return a.name.localeCompare(b.name);
  });
  return {
    key,
    label,
    tone: rows.length > 0 ? tone : 'ok',
    count: rows.length,
    residents: sorted.slice(0, 5).map(row => row.name),
    detail: rows.length > 0 ? detail : 'No residents in this bucket right now.',
  };
}

function tickFreshness(row: ResidentDashboardRow, eventTick: number | undefined, staleGap: number): string {
  const liveTick = row.feed?.tick ?? row.body?.feed?.tick;
  if (eventTick === undefined) return 'tick unknown';
  if (liveTick === undefined) return `tick ${eventTick}`;
  const delta = Math.max(0, liveTick - eventTick);
  if (delta === 0) return `tick ${eventTick} (current)`;
  return `tick ${eventTick} (${delta} behind${delta > staleGap ? ', stale' : ''})`;
}

function isTickStale(label: string): boolean {
  return label.includes('stale');
}

function inventoryCoinAmount(value: unknown): number {
  if (!Array.isArray(value)) return 0;
  return value.reduce((sum, item) => {
    const record = asRecord(item);
    const itemId = numberField(record, 'itemId') ?? numberField(record, 'id');
    if (itemId !== GP_ITEM_ID) return sum;
    return sum + (numberField(record, 'amount') ?? numberField(record, 'count') ?? 1);
  }, 0);
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : {};
}

function numberField(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function stringField(value: unknown, key: string): string | undefined {
  const field = asRecord(value)[key];
  return typeof field === 'string' && field.length > 0 ? field : undefined;
}
