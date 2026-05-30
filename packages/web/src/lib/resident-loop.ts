import type { ResidentDashboardRow, SparkModuleSummary } from '@nullcity-dashboard/shared';
import type { ResidentBenchmarkSignal } from './resident-benchmark';

export interface ResidentLoopFact {
  label: string;
  value: string;
  detail?: string | undefined;
  tone?: 'ok' | 'warn' | 'fail' | undefined;
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
  tone: 'ok' | 'warn';
}

export interface ResidentProofPulse {
  tone: 'ok' | 'warn' | 'fail';
  summary: string;
  detail: string;
}

export interface ResidentProofRollup {
  tone: 'ok' | 'warn' | 'fail';
  headline: string;
  detail: string;
  healthy: number;
  warn: number;
  fail: number;
  online: number;
}

export interface ResidentTriageBucket {
  key: 'offline' | 'attention' | 'quiet' | 'plan' | 'gp' | 'story' | 'benchmark';
  label: string;
  tone: 'ok' | 'warn' | 'fail';
  count: number;
  residents: string[];
  detail: string;
}

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
  recentSpeech: number;
  storyEvidence: number;
  observedGp: number;
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

export interface ResidentIntentSignals {
  goalContract?: { tone: 'ok' | 'warn'; summary: string; detail?: string };
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
const GP_ITEM_ID = 995;

export function residentGuestTrailPulse(rows: ResidentDashboardRow[]): ResidentGuestTrailPulse {
  const pulse: ResidentGuestTrailPulse = {
    online: 0,
    lowAp: 0,
    planPublished: 0,
    recentAction: 0,
    recentSpeech: 0,
    storyEvidence: 0,
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
    if (signal.speech !== '-') pulse.recentSpeech += 1;
    if (signal.story !== '-') pulse.storyEvidence += 1;
    pulse.observedGp += residentCoinEvidenceAmount(row);
  }

  return pulse;
}

export function residentIntelligenceFacts(row: ResidentDashboardRow): ResidentLoopFact[] {
  const module = activeModule(row);
  const model = modelParts(row);
  const action = row.body?.lastAction;
  const story = row.storyArc;
  const feed = row.feed || row.body?.feed;
  const gp = residentGoldEvidenceLabel(row);

  return [
    {
      label: 'Life force',
      value: row.attention === undefined ? '-' : `${row.attention} AP`,
      detail: residentNeedsAp(row) ? 'needs AP' : row.attention === undefined ? 'not reported' : 'stable',
      tone: residentNeedsAp(row) ? 'warn' : row.attention === undefined ? undefined : 'ok',
    },
    { label: 'Model', value: model.value, detail: model.detail },
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

export function residentLoopSummaryLine(row: ResidentDashboardRow): string {
  const model = modelParts(row).value;
  const module = activeModule(row)?.id || 'no SPARK';
  const action = row.body?.lastAction?.kind || row.lastEvent?.kind || 'no action';
  const ap = residentNeedsAp(row) ? 'needs AP' : row.attention === undefined ? 'AP unknown' : `${row.attention} AP`;
  const gp = residentGoldEvidenceLabel(row).value === 'not observed' ? 'GP unobserved' : residentGoldEvidenceLabel(row).value;
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
  const storyFreshness = tickFreshness(row, row.storyArc?.latestEventTick, STORY_STALE_TICK_GAP);
  const gp = residentGoldEvidenceLabel(row);
  const needsAp = residentNeedsAp(row);
  const needsGpEvidence = gp.value === 'not observed';
  const storyValue = row.storyArc?.summary || row.storyArc?.latestEventKind || signals.storyteller?.summary || '-';

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
      detail: `${attentionLabel(row)} · ${needsGpEvidence ? 'GP not observed' : gp.value}`,
      tone: needsAp || needsGpEvidence ? 'warn' : 'ok',
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
      label: 'Remembers',
      value: storyValue,
      detail: signals.storyteller?.summary || (row.storyArc ? ['Library evidence', storyFreshness].filter(Boolean).join(' | ') : 'no Library or Storyteller evidence yet'),
      tone: signals.storyteller?.tone || (row.storyArc ? 'ok' : 'warn'),
    },
  ];
}

export function residentGuestTrailFacts(pulse: ResidentGuestTrailPulse): ResidentLoopFact[] {
  const online = Math.max(0, pulse.online);
  const denominator = online > 0 ? `/${online}` : '';
  const stableAp = Math.max(0, online - Math.max(0, pulse.lowAp));

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
  ];
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
      tone: actionLive && !isTickStale(actionFreshness) ? 'ok' : 'warn',
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
  const requiredChecks = checks.filter(check => !check.optional);
  const okCount = requiredChecks.filter(check => check.ok).length;
  const missing = requiredChecks.filter(check => !check.ok).map(check => check.label);
  const total = requiredChecks.length || 1;
  const tone: ResidentProofPulse['tone'] = !row.online ? 'fail' : missing.length ? 'warn' : 'ok';
  const detail = !row.online
    ? `offline · ${missing.slice(0, 3).join(', ') || 'no live proofs'}`
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

  return {
    tone,
    headline: `${healthy.toLocaleString()}/${onlineRows.length.toLocaleString()} residents have live loop proofs`,
    detail,
    healthy,
    warn,
    fail,
    online: onlineRows.length,
  };
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
        emptyTriageBucket('quiet', 'Quiet loop', 'warn', 'No loop cadence is available yet.'),
        emptyTriageBucket('plan', 'Missing plan', 'warn', 'No thinking plans are available yet.'),
        emptyTriageBucket('gp', 'Missing GP proof', 'warn', 'No coin-995 proof is available yet.'),
        emptyTriageBucket('story', 'Thin story', 'warn', 'No Library or Storyteller evidence is available yet.'),
        emptyTriageBucket('benchmark', 'Capability warning', 'warn', 'No capability benchmark signal is loaded yet.'),
      ],
    };
  }

  const offlineRows = rows.filter(row => !row.online);
  const lowApRows = rows.filter(row => row.online && residentNeedsAp(row));
  const quietRows = rows.filter(row => {
    if (!row.online) return false;
    const checkpoints = residentLoopCheckpoints(row);
    const action = checkpoints.find(checkpoint => checkpoint.key === 'action');
    const speech = checkpoints.find(checkpoint => checkpoint.key === 'speech');
    return action?.tone === 'warn' || speech?.tone === 'warn' || feedTone(row) === 'warn';
  });
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
  const benchmarkRows = rows.filter(row => {
    if (!row.online) return false;
    const signal = resolveSignals(row).benchmark;
    return signal !== undefined && signal.tone !== 'ok';
  });

  const buckets: ResidentTriageBucket[] = [
    makeTriageBucket('offline', 'Offline', 'fail', offlineRows, 'Login or AP top-up may be required before new action proof appears.'),
    makeTriageBucket('attention', 'Low AP', 'warn', lowApRows, 'Residents at or below the AP safety floor need support soon.'),
    makeTriageBucket('quiet', 'Quiet loop', 'warn', quietRows, 'Action, speech, or feed cadence is stale enough to deserve an operator glance.'),
    makeTriageBucket('plan', 'Missing plan', 'warn', missingPlanRows, 'Thinking has not published a current plan for these residents.'),
    makeTriageBucket('gp', 'Missing GP proof', 'warn', missingGpRows, 'Do not claim GP purchasing power until coin-995 or economy evidence appears.'),
    makeTriageBucket('story', 'Thin story', 'warn', thinStoryRows, 'Library or Storyteller evidence is not fresh enough to explain the resident.'),
    makeTriageBucket('benchmark', 'Capability warning', 'warn', benchmarkRows, 'Latest capability benchmark signal is stale, failed, or missing confidence.'),
  ];

  const urgentNames = new Set<string>([
    ...offlineRows,
    ...lowApRows,
    ...quietRows,
    ...missingPlanRows,
    ...missingGpRows,
    ...thinStoryRows,
    ...benchmarkRows,
  ].map(row => row.name));

  const urgentResidents = urgentNames.size;
  const onlineResidents = rows.filter(row => row.online).length;
  const tone: ResidentTriageSummary['tone'] =
    offlineRows.length > 0 ? 'fail' : urgentResidents > 0 ? 'warn' : 'ok';
  const activeBuckets = buckets.filter(bucket => bucket.count > 0);
  const detail = activeBuckets.length
    ? activeBuckets.slice(0, 3).map(bucket => `${bucket.label}: ${bucket.count}`).join(' · ')
    : 'All visible residents have AP, cadence, plan, GP/story proof, and capability signals.';

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

function activeModule(row: ResidentDashboardRow): SparkModuleSummary | undefined {
  return row.stack?.activeModule || row.spark?.activeModule || row.stack?.configuredModules?.[0] || row.spark?.modules?.[0];
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
  return [
    { label: 'AP', ok: !residentNeedsAp(row) },
    { label: 'Plan', ok: Boolean(row.thinking?.activePlan?.trim()) },
    { label: 'Action', ok: Boolean(row.body?.lastAction?.kind || row.lastEvent?.kind) },
    { label: 'Speech', ok: recentSpeechSignal(row).text !== '-' },
    { label: 'GP', ok: residentCoinEvidenceAmount(row) > 0 || signals.economyGp?.tone === 'ok' },
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
