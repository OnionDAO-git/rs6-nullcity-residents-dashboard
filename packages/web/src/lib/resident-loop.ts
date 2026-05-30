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

const LOW_AP_THRESHOLD = 10;
const STALE_FEED_MS = 120_000;
const GP_ITEM_ID = 995;

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

export function residentPrimaryWarning(
  row: ResidentDashboardRow | undefined,
  benchmarkSignal?: ResidentBenchmarkSignal,
): ResidentOperatorWarning {
  const warning = residentOperatorWarnings(row, benchmarkSignal)[0];
  return warning || {
    tone: 'warn',
    summary: 'No operator warning available.',
    detail: 'Resident warnings are not yet populated.',
  };
}

export function residentOperatorWarnings(
  row: ResidentDashboardRow | undefined,
  benchmarkSignal?: ResidentBenchmarkSignal,
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
  if (residentGoldEvidenceLabel(row).value === 'not observed') {
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
  const speech = recentSpeech(row);
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

function recentSpeech(row: ResidentDashboardRow): string {
  const feed = row.feed || row.body?.feed;
  if (feed?.latestEventKind === 'say' && typeof feed.latestEventText === 'string' && feed.latestEventText.trim().length > 0) {
    return feed.latestEventText.trim();
  }
  if (row.lastEvent?.kind === 'say' && typeof row.lastEvent.text === 'string' && row.lastEvent.text.trim().length > 0) {
    return row.lastEvent.text.trim();
  }
  return '-';
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
