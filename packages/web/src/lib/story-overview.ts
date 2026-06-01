import type { DashboardOverview, Position, ResidentDashboardRow } from '@nullcity-dashboard/shared';
import type { StorytellerDigestSummary } from './api';
import { residentRouteSlug } from './resident-route';

export type StoryOverviewTone = 'event' | 'ok' | 'watch' | 'quiet';

export interface StoryOverviewViewport {
  id: string;
  label: string;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface StoryOverviewPin {
  residentName: string;
  label: string;
  path: string;
  x: number;
  y: number;
  level: number;
  leftPct: number;
  topPct: number;
  tone: StoryOverviewTone;
  eventLabel: string;
  detail: string;
  levelLabel: string;
}

export interface StoryOverviewRegion {
  label: string;
  detail: string;
  residents: string[];
}

export interface StoryOverviewAtlas {
  viewport: StoryOverviewViewport;
  pins: StoryOverviewPin[];
  offMapRegions: StoryOverviewRegion[];
  totalPositioned: number;
}

export interface StoryOverviewDispatch {
  title: string;
  body: string;
  bullets: string[];
  statusLabel: string;
  statusTone: 'ok' | 'warn';
  detail: string;
}

export interface StoryOverviewListItem {
  label: string;
  detail: string;
  path?: string;
  tone?: 'ok' | 'warn' | 'fail';
}

export interface StoryOverviewModel {
  dispatch: StoryOverviewDispatch;
  atlas: StoryOverviewAtlas;
  residentActions: StoryOverviewListItem[];
  citySignals: StoryOverviewListItem[];
  watchItems: StoryOverviewListItem[];
}

export interface BuildStoryOverviewModelInput {
  residents: ResidentDashboardRow[];
  digests: StorytellerDigestSummary[];
  overview?: DashboardOverview | undefined;
  patronAp?: number | undefined;
  now?: Date | undefined;
}

const LUMBRIDGE_VIEWPORT: StoryOverviewViewport = { id: 'lumbridge', label: 'Lumbridge West Road', minX: 3150, maxX: 3260, minY: 3195, maxY: 3285 };

const VIEWPORTS: StoryOverviewViewport[] = [
  LUMBRIDGE_VIEWPORT,
  { id: 'draynor', label: 'Draynor', minX: 3070, maxX: 3125, minY: 3205, maxY: 3275 },
  { id: 'varrock', label: 'Varrock', minX: 3190, maxX: 3265, minY: 3375, maxY: 3445 },
  { id: 'edgeville', label: 'Edgeville', minX: 2970, maxX: 3045, minY: 3310, maxY: 3375 },
];

const FALLBACK_VIEWPORT = LUMBRIDGE_VIEWPORT;

export function buildStoryOverviewModel(input: BuildStoryOverviewModelInput): StoryOverviewModel {
  const residents = input.residents;
  const positioned = residents
    .map(row => ({ row, position: residentPosition(row) }))
    .filter((entry): entry is { row: ResidentDashboardRow; position: Position } => Boolean(entry.position));
  const digest = input.digests.find(item => item.dispatch?.publicTitle || item.topEvents.length > 0);
  const storytellerEventKinds = storytellerEventKindByResident(digest);
  const leadResident = findLeadResident(residents, digest);
  const viewport = chooseViewport();
  const pins = positioned
    .filter(entry => pointInViewport(entry.position, viewport))
    .sort((a, b) => residentScore(b.row, leadResident, storytellerEventKinds) - residentScore(a.row, leadResident, storytellerEventKinds))
    .slice(0, 28)
    .map(entry => residentPin(entry.row, entry.position, viewport, leadResident, storytellerEventKinds));
  const offMapRegions = buildOffMapRegions(positioned, viewport);

  return {
    dispatch: buildDispatch(digest, leadResident, input.now),
    atlas: {
      viewport,
      pins,
      offMapRegions,
      totalPositioned: positioned.length,
    },
    residentActions: buildResidentActions(residents, leadResident, storytellerEventKinds),
    citySignals: buildCitySignals(input, digest, positioned.length),
    watchItems: buildWatchItems(residents, digest, offMapRegions),
  };
}

function residentPosition(row: ResidentDashboardRow): Position | undefined {
  return row.position || row.feed?.position || row.body?.position;
}

function findLeadResident(residents: ResidentDashboardRow[], digest: StorytellerDigestSummary | undefined): ResidentDashboardRow | undefined {
  const eventResident = digest?.topEvents.find(event => event.residentName)?.residentName;
  if (eventResident) {
    const match = residents.find(row => namesMatch(row.name, eventResident));
    if (match) return match;
  }
  return [...residents].sort((a, b) => residentScore(b) - residentScore(a))[0];
}

function chooseViewport(): StoryOverviewViewport {
  return FALLBACK_VIEWPORT;
}

function pointInViewport(position: Position, viewport: StoryOverviewViewport): boolean {
  return position.x >= viewport.minX && position.x <= viewport.maxX && position.y >= viewport.minY && position.y <= viewport.maxY;
}

function residentPin(
  row: ResidentDashboardRow,
  position: Position,
  viewport: StoryOverviewViewport,
  leadResident: ResidentDashboardRow | undefined,
  storytellerEventKinds: Map<string, string>,
): StoryOverviewPin {
  const eventLabel = eventKindLabel(row.feed?.latestEventKind || row.lastEvent?.kind || row.storyArc?.latestEventKind || storytellerEventKinds.get(residentRouteSlug(row.name)) || '');
  const isLead = Boolean(leadResident && namesMatch(row.name, leadResident.name));
  const level = position.level ?? 0;
  return {
    residentName: row.name,
    label: displayName(row.name),
    path: `/residents/${encodeURIComponent(residentRouteSlug(row.name))}`,
    x: position.x,
    y: position.y,
    level,
    leftPct: clamp(((position.x - viewport.minX) / (viewport.maxX - viewport.minX)) * 100, 4, 96),
    topPct: clamp((1 - ((position.y - viewport.minY) / (viewport.maxY - viewport.minY))) * 100, 4, 96),
    tone: isLead || eventLabel !== 'quiet' ? 'event' : row.online ? 'ok' : 'quiet',
    eventLabel,
    detail: `${eventLabel} near ${position.x},${position.y}`,
    levelLabel: level > 0 ? `L${level}` : '',
  };
}

function buildOffMapRegions(positioned: { row: ResidentDashboardRow; position: Position }[], viewport: StoryOverviewViewport): StoryOverviewRegion[] {
  const regions = new Map<string, string[]>();
  for (const entry of positioned) {
    if (pointInViewport(entry.position, viewport)) continue;
    const region = regionForPosition(entry.position);
    const label = `${displayName(entry.row.name)} ${entry.position.x},${entry.position.y}`;
    regions.set(region, [...(regions.get(region) || []), label]);
  }

  return [...regions.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, residents]) => ({
      label,
      detail: `${residents.length.toLocaleString()} resident${residents.length === 1 ? '' : 's'} beyond the current viewport`,
      residents: residents.slice(0, 5),
    }));
}

function regionForPosition(position: Position): string {
  const known = VIEWPORTS.find(viewport => pointInViewport(position, viewport));
  if (known) return known.label.replace(/ West Road$/, '');
  if (position.y >= 3370) return position.x < 3100 ? 'Edgeville' : 'Varrock';
  if (position.x < 3150) return 'Draynor';
  return 'Elsewhere';
}

function buildDispatch(
  digest: StorytellerDigestSummary | undefined,
  leadResident: ResidentDashboardRow | undefined,
  now: Date | undefined,
): StoryOverviewDispatch {
  const dispatch = digest?.dispatch;
  const leadPosition = leadResident ? residentPosition(leadResident) : undefined;
  const fallbackTitle = leadResident ? `${displayName(leadResident.name)} is moving the city forward` : 'Null City is coming online';
  const fallbackEvent = leadResident ? eventKindLabel(leadResident.feed?.latestEventKind || leadResident.lastEvent?.kind || '') : '';
  const fallbackBody = leadResident && leadPosition
    ? `${displayName(leadResident.name)} is ${fallbackEvent === 'quiet' ? 'visible' : fallbackEvent} near ${leadPosition.x},${leadPosition.y}. The map is live; the story follows the evidence.`
    : 'Residents with live positions will appear here as soon as the dashboard feed reports them.';
  const needsReview = Boolean(dispatch?.needsReview || (digest && digest.queue !== 'canon'));
  const generated = dispatch?.generatedAt || digest?.builtAt;
  return {
    title: prettifyResidentRefs(dispatch?.publicTitle || fallbackTitle),
    body: prettifyResidentRefs(dispatch?.publicBody || fallbackBody),
    bullets: buildDispatchBullets(digest),
    statusLabel: !digest ? 'live feed' : needsReview ? 'review draft' : 'canon',
    statusTone: needsReview ? 'warn' : 'ok',
    detail: generated ? `updated ${relativeTime(generated, now)}` : 'waiting for first dispatch',
  };
}

function buildDispatchBullets(digest: StorytellerDigestSummary | undefined): string[] {
  const dispatchBullets = digest?.dispatch?.publicBullets || [];
  const source = dispatchBullets.length
    ? dispatchBullets
    : (digest?.topEvents || []).map(event => event.note || `${displayName(event.residentName || 'city')}: ${eventKindLabel(event.kind)}`);
  return source
    .map(item => prettifyResidentRefs(item.trim()))
    .filter(Boolean)
    .slice(0, 4);
}

function buildResidentActions(
  residents: ResidentDashboardRow[],
  leadResident: ResidentDashboardRow | undefined,
  storytellerEventKinds: Map<string, string>,
): StoryOverviewListItem[] {
  return [...residents]
    .filter(row => row.online || residentPosition(row))
    .sort((a, b) => residentScore(b, leadResident, storytellerEventKinds) - residentScore(a, leadResident, storytellerEventKinds))
    .slice(0, 10)
    .map(row => {
      const position = residentPosition(row);
      const eventLabel = eventKindLabel(row.feed?.latestEventKind || row.lastEvent?.kind || row.body?.lastAction?.kind || storytellerEventKinds.get(residentRouteSlug(row.name)) || '');
      return {
        label: displayName(row.name),
        detail: position ? `${eventLabel} near ${position.x},${position.y}` : row.thinking?.activePlan || eventLabel,
        path: `/residents/${encodeURIComponent(residentRouteSlug(row.name))}`,
        tone: row.inCombat || (row.attention ?? 999) <= 2 ? 'warn' : 'ok',
      };
    });
}

function buildCitySignals(
  input: BuildStoryOverviewModelInput,
  digest: StorytellerDigestSummary | undefined,
  positionedCount: number,
): StoryOverviewListItem[] {
  const residents = input.residents;
  const online = residents.filter(row => row.online).length;
  const visibleAp = input.patronAp ?? input.overview?.patrons?.totalShardBalance;
  return [
    { label: 'Online Residents', detail: `${online.toLocaleString()} / ${residents.length.toLocaleString()} visible`, tone: online > 0 ? 'ok' : 'warn' },
    { label: 'Mapped Residents', detail: `${positionedCount.toLocaleString()} have live coordinates`, tone: positionedCount > 0 ? 'ok' : 'warn' },
    { label: 'Visible AP', detail: visibleAp === undefined ? 'waiting for patron summary' : `${visibleAp.toLocaleString()} AP in the city pool`, tone: visibleAp ? 'ok' : 'warn' },
    { label: 'Storyteller', detail: digest ? `${digest.topEventCount.toLocaleString()} top events in latest run` : 'waiting for digest', tone: digest ? 'ok' : 'warn' },
  ];
}

function buildWatchItems(
  residents: ResidentDashboardRow[],
  digest: StorytellerDigestSummary | undefined,
  offMapRegions: StoryOverviewRegion[],
): StoryOverviewListItem[] {
  const lowAp = residents.filter(row => (row.attention ?? 999) <= 2);
  const items: StoryOverviewListItem[] = [];
  if (digest?.dispatch?.needsReview || (digest && digest.queue !== 'canon')) {
    items.push({ label: 'Story Review', detail: 'Latest dispatch is a review draft, not canon yet.', tone: 'warn', path: '/story' });
  }
  if (offMapRegions.length) {
    items.push({ label: 'Off-Map Tension', detail: `${offMapRegions.reduce((sum, region) => sum + region.residents.length, 0)} residents outside the atlas viewport`, tone: 'ok' });
  }
  if (lowAp.length) {
    items.push({ label: 'AP Runway', detail: `${lowAp.length} residents are at or below the support floor`, tone: 'warn', path: '/residents?triage=attention' });
  }
  return items.slice(0, 5);
}

function residentScore(row: ResidentDashboardRow, leadResident?: ResidentDashboardRow, storytellerEventKinds = new Map<string, string>()): number {
  let score = 0;
  if (leadResident && namesMatch(row.name, leadResident.name)) score += 1000;
  if (storytellerEventKinds.has(residentRouteSlug(row.name))) score += 160;
  if (row.feed?.latestEventKind) score += 120;
  if (row.lastEvent?.kind) score += 80;
  if (row.body?.lastAction) score += 40;
  if (row.busy) score += 25;
  if (row.inCombat) score += 20;
  if (row.online) score += 10;
  if ((row.attention ?? 999) <= 2) score += 30;
  return score;
}

function storytellerEventKindByResident(digest: StorytellerDigestSummary | undefined): Map<string, string> {
  const eventKinds = new Map<string, string>();
  for (const event of digest?.topEvents || []) {
    if (!event.residentName) continue;
    const slug = residentRouteSlug(event.residentName);
    if (!eventKinds.has(slug)) eventKinds.set(slug, event.kind);
  }
  return eventKinds;
}

function displayName(name: string): string {
  return residentRouteSlug(name)
    .split(/[-_]+/)
    .filter(Boolean)
    .map(part => part.toLowerCase() === 'qa' ? 'QA' : `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

function prettifyResidentRefs(text: string): string {
  return text.replace(/\bres:([a-z0-9_-]+)/gi, (_match, slug: string) => displayName(`res:${slug}`));
}

function eventKindLabel(kind: string): string {
  const cleaned = kind.trim().replace(/_/g, ' ');
  return cleaned || 'quiet';
}

function namesMatch(a: string, b: string): boolean {
  return residentRouteSlug(a) === residentRouteSlug(b);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function relativeTime(ts: string, now: Date | undefined): string {
  if (!now) return ts;
  const then = Date.parse(ts);
  if (!Number.isFinite(then)) return ts;
  const diffMs = Math.max(0, now.getTime() - then);
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  return `${diffHours}h ago`;
}
