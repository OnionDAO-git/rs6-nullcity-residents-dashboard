import type { ResidentDashboardRow } from '@nullcity-dashboard/shared';

export type ResidentHealthFilter = 'all' | 'needs-attention' | 'online' | 'offline' | 'active-inference' | 'stale' | 'stuck';
export type ResidentSortMode = 'health' | 'attention' | 'model' | 'name';

export interface ResidentHealthControls {
  filter: ResidentHealthFilter;
  sort: ResidentSortMode;
  modelQuery: string;
}

export interface ResidentHealthSummary {
  status: ResidentHealthFilter;
  label: string;
  detail: string;
  rank: number;
  model: string;
}

const STALE_FEED_MS = 120_000;

export function applyResidentHealthControls(rows: ResidentDashboardRow[], controls: ResidentHealthControls): ResidentDashboardRow[] {
  const query = controls.modelQuery.trim().toLowerCase();
  return rows
    .filter(row => healthMatches(row, controls.filter))
    .filter(row => !query || residentModelText(row).toLowerCase().includes(query))
    .sort((a, b) => compareResidents(a, b, controls.sort));
}

export function residentHealthSummary(row: ResidentDashboardRow): ResidentHealthSummary {
  const model = residentModelLabel(row);
  if (isStuck(row)) return { status: 'stuck', label: 'stuck', detail: stuckDetail(row), rank: 0, model };
  if (isStale(row)) return { status: 'stale', label: 'stale', detail: staleDetail(row), rank: 1, model };
  if (isActiveInference(row)) return { status: 'active-inference', label: 'thinking', detail: inferenceDetail(row), rank: 2, model };
  if (row.online) return { status: 'online', label: 'online', detail: onlineDetail(row), rank: 3, model };
  return { status: 'offline', label: 'offline', detail: row.controllerId || 'not connected', rank: 4, model };
}

export function residentModelLabel(row: ResidentDashboardRow): string {
  return row.stack?.model?.endpoint ||
    row.stack?.model?.model ||
    row.stack?.brain?.endpoint ||
    row.stack?.brain?.model ||
    row.stack?.body?.endpoint ||
    row.stack?.body?.model ||
    row.thinking?.latestInference?.model ||
    '-';
}

function compareResidents(a: ResidentDashboardRow, b: ResidentDashboardRow, sort: ResidentSortMode): number {
  if (sort === 'attention') return attentionRank(a) - attentionRank(b) || compareResidents(a, b, 'health');
  if (sort === 'model') return residentModelLabel(a).localeCompare(residentModelLabel(b)) || compareResidents(a, b, 'health');
  if (sort === 'name') return a.name.localeCompare(b.name);
  return residentHealthSummary(a).rank - residentHealthSummary(b).rank || feedAge(a) - feedAge(b) || a.name.localeCompare(b.name);
}

function healthMatches(row: ResidentDashboardRow, filter: ResidentHealthFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'needs-attention') return isStuck(row) || isStale(row);
  return residentHealthSummary(row).status === filter;
}

function isStuck(row: ResidentDashboardRow): boolean {
  return Boolean((row.progress?.stuckTicks || 0) > 0 || row.progress?.latest?.stuckSince);
}

function isStale(row: ResidentDashboardRow): boolean {
  if (!row.online) return false;
  return row.feed?.ageMs === undefined || row.feed.ageMs > STALE_FEED_MS;
}

function isActiveInference(row: ResidentDashboardRow): boolean {
  return row.thinking?.mode === 'deciding' || Boolean(row.thinking?.inFlightRequest);
}

function feedAge(row: ResidentDashboardRow): number {
  return row.feed?.ageMs ?? Number.MAX_SAFE_INTEGER;
}

function attentionRank(row: ResidentDashboardRow): number {
  return row.attention ?? Number.MAX_SAFE_INTEGER;
}

function residentModelText(row: ResidentDashboardRow): string {
  return [
    residentModelLabel(row),
    row.stack?.model?.endpoint,
    row.stack?.model?.model,
    row.stack?.brain?.endpoint,
    row.stack?.brain?.model,
    row.stack?.body?.endpoint,
    row.stack?.body?.model,
    row.spark?.activeModule?.id,
    row.stack?.activeModule?.id,
    row.stack?.configuredModules?.map(module => module.id).join(' '),
  ].filter(Boolean).join(' ');
}

function stuckDetail(row: ResidentDashboardRow): string {
  const ticks = row.progress?.stuckTicks;
  return ticks ? `${ticks} stuck ticks` : 'progress stalled';
}

function staleDetail(row: ResidentDashboardRow): string {
  return row.feed?.ageMs === undefined ? 'no live feed' : `${Math.round(row.feed.ageMs / 1000)}s since feed`;
}

function inferenceDetail(row: ResidentDashboardRow): string {
  return row.thinking?.inFlightRequest ? `request ${row.thinking.inFlightRequest}` : row.thinking?.lastInferenceCause || 'deciding';
}

function onlineDetail(row: ResidentDashboardRow): string {
  return row.feed?.ageMs === undefined ? 'awaiting feed' : `${Math.round(row.feed.ageMs / 1000)}s feed`;
}
