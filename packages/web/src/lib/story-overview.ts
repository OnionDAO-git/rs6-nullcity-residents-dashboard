import type { DashboardOverview, Position, ProjectorStoryFrame, ResidentDashboardRow } from '@nullcity-dashboard/shared';
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
  count: number;
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
  bodyLead: string;
  bodyParagraphs: string[];
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
  leaderboardItems: StoryOverviewListItem[];
  citySignals: StoryOverviewListItem[];
  dramaItems: StoryOverviewListItem[];
  watchItems: StoryOverviewListItem[];
}

export interface BuildStoryOverviewModelInput {
  residents: ResidentDashboardRow[];
  digests: StorytellerDigestSummary[];
  overview?: DashboardOverview | undefined;
  patronAp?: number | undefined;
  projectorFrame?: ProjectorStoryFrame | undefined;
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
  const projectorFrame = input.projectorFrame;
  const positioned = residents
    .map(row => ({ row, position: residentPosition(row) }))
    .filter((entry): entry is { row: ResidentDashboardRow; position: Position } => Boolean(entry.position));
  const digest = projectorFrame ? undefined : input.digests.find(hasProjectorDigestContent);
  const storytellerEventKinds = projectorFrame ? projectorEventLabelByResident(projectorFrame) : storytellerEventKindByResident(digest);
  const leadResident = findLeadResident(residents, digest, projectorFrame);
  const viewport = chooseViewport(leadResident, positioned, storytellerEventKinds);
  const pins = positioned
    .filter(entry => pointInViewport(entry.position, viewport))
    .sort((a, b) => residentScore(b.row, leadResident, storytellerEventKinds) - residentScore(a.row, leadResident, storytellerEventKinds))
    .slice(0, 28)
    .map(entry => residentPin(entry.row, entry.position, viewport, leadResident, storytellerEventKinds));
  const offMapRegions = buildOffMapRegions(positioned, viewport);

  return {
    dispatch: projectorFrame ? buildProjectorFrameDispatch(projectorFrame, input.now) : buildDispatch(digest, leadResident, input.now),
    atlas: {
      viewport,
      pins,
      offMapRegions,
      totalPositioned: positioned.length,
    },
    residentActions: buildResidentActions(residents, leadResident, storytellerEventKinds),
    leaderboardItems: buildLeaderboardItems(residents, leadResident, storytellerEventKinds),
    citySignals: projectorFrame ? buildProjectorFrameCitySignals(projectorFrame) : buildCitySignals(input, digest, positioned.length),
    dramaItems: projectorFrame ? buildProjectorFrameDramaItems(projectorFrame) : buildDramaItems(residents, digest, offMapRegions),
    watchItems: projectorFrame ? buildProjectorFrameWatchItems(projectorFrame) : buildWatchItems(residents, digest, offMapRegions, leadResident),
  };
}

function residentPosition(row: ResidentDashboardRow): Position | undefined {
  return row.position || row.feed?.position || row.body?.position;
}

function findLeadResident(
  residents: ResidentDashboardRow[],
  digest: StorytellerDigestSummary | undefined,
  projectorFrame?: ProjectorStoryFrame,
): ResidentDashboardRow | undefined {
  const eventResident = projectorFrame?.leadEvent?.residentName || digest?.topEvents.find(event => event.residentName)?.residentName;
  if (eventResident) {
    const match = residents.find(row => namesMatch(row.name, eventResident));
    if (match) return match;
  }
  return [...residents].sort((a, b) => residentScore(b) - residentScore(a))[0];
}

function chooseViewport(
  leadResident: ResidentDashboardRow | undefined,
  positioned: { row: ResidentDashboardRow; position: Position }[],
  storytellerEventKinds: Map<string, string>,
): StoryOverviewViewport {
  const leadPosition = leadResident ? residentPosition(leadResident) : undefined;
  if (leadPosition) {
    const leadViewport = VIEWPORTS.find(viewport => pointInViewport(leadPosition, viewport));
    if (leadViewport) return leadViewport;
  }

  const scored = VIEWPORTS
    .map(viewport => ({
      viewport,
      score: positioned
        .filter(entry => pointInViewport(entry.position, viewport))
        .reduce((sum, entry) => sum + residentScore(entry.row, leadResident, storytellerEventKinds), 0),
    }))
    .sort((a, b) => b.score - a.score);
  if ((scored[0]?.score ?? 0) > 0) return scored[0]?.viewport || FALLBACK_VIEWPORT;
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
  const needsWatch = row.inCombat || (row.attention ?? 999) <= 2;
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
    tone: eventLabel !== 'quiet' || (isLead && !needsWatch) ? 'event' : needsWatch ? 'watch' : row.online ? 'ok' : 'quiet',
    eventLabel,
    detail: `${eventLabel} at ${locationLabel(position)}`,
    levelLabel: level > 0 ? `L${level}` : '',
  };
}

function buildOffMapRegions(positioned: { row: ResidentDashboardRow; position: Position }[], viewport: StoryOverviewViewport): StoryOverviewRegion[] {
  const regions = new Map<string, string[]>();
  for (const entry of positioned) {
    if (pointInViewport(entry.position, viewport)) continue;
    const region = regionForPosition(entry.position);
    const label = `${displayName(entry.row.name)} at ${locationLabel(entry.position)}`;
    regions.set(region, [...(regions.get(region) || []), label]);
  }

  return [...regions.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, residents]) => ({
      label,
      count: residents.length,
      detail: `${residents.length.toLocaleString()} resident${residents.length === 1 ? '' : 's'} beyond the current viewport`,
      residents: residents.slice(0, 5),
    }));
}

function hasProjectorDigestContent(item: StorytellerDigestSummary): boolean {
  return Boolean(hasPublicProjectorDispatch(item) || (item.queue === 'canon' && item.topEvents.length > 0));
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
  const dispatch = digest && hasPublicProjectorDispatch(digest) ? digest.dispatch : undefined;
  const leadPosition = leadResident ? residentPosition(leadResident) : undefined;
  const fallbackTitle = leadResident ? `${displayName(leadResident.name)} is moving the city forward` : 'Null City is coming online';
  const fallbackEvent = leadResident ? eventKindLabel(leadResident.feed?.latestEventKind || leadResident.lastEvent?.kind || '') : '';
  const fallbackBody = leadResident && leadPosition
    ? `${displayName(leadResident.name)} is ${fallbackEvent === 'quiet' ? 'visible' : fallbackEvent} at ${locationLabel(leadPosition)}. The map is live; the story follows the evidence.`
    : 'Residents with live positions will appear here as soon as the dashboard feed reports them.';
  const generated = dispatch?.generatedAt || digest?.builtAt;
  const body = prettifyResidentRefs(dispatch?.publicBody || fallbackBody);
  const formattedBody = formatStoryBody(body);
  return {
    title: prettifyResidentRefs(dispatch?.publicTitle || fallbackTitle),
    body,
    bodyLead: formattedBody.bodyLead,
    bodyParagraphs: formattedBody.bodyParagraphs,
    bullets: buildDispatchBullets(digest),
    statusLabel: dispatch ? 'canon' : 'live feed',
    statusTone: 'ok',
    detail: generated ? `updated ${relativeTime(generated, now)}` : 'waiting for first dispatch',
  };
}

function buildProjectorFrameDispatch(frame: ProjectorStoryFrame, now: Date | undefined): StoryOverviewDispatch {
  const publicTitle = publicProjectorTitle(frame);
  const publicBody = publicProjectorBody(frame);
  const formattedBody = formatStoryBody(publicBody);
  const freshness = frame.source.freshnessStatus === 'fresh'
    ? 'fresh city evidence'
    : frame.source.freshnessStatus === 'stale'
      ? 'stale city evidence'
      : 'city evidence freshness unknown';
  const source = frame.narration.source === 'verified_dispatch' ? 'verified narration' : 'live fallback narration';
  return {
    title: publicTitle,
    body: publicBody,
    bodyLead: formattedBody.bodyLead,
    bodyParagraphs: formattedBody.bodyParagraphs,
    bullets: frame.narration.bullets.map(publicProjectorCopy).slice(0, 4),
    statusLabel: frame.narration.source === 'verified_dispatch' ? 'verified story' : 'grounded live story',
    statusTone: frame.publicHealth.status === 'ok' ? 'ok' : 'warn',
    detail: `${freshness} · ${source} · updated ${relativeTime(frame.generatedAt, now)}`,
  };
}

function formatStoryBody(body: string): Pick<StoryOverviewDispatch, 'bodyLead' | 'bodyParagraphs'> {
  const sentences = splitStorySentences(body);
  if (!sentences.length) return { bodyLead: '', bodyParagraphs: [] };
  const bodyLead = sentences[0] || '';
  const remaining = sentences.slice(1);
  return {
    bodyLead,
    bodyParagraphs: chunkSentences(remaining, storyParagraphChunkSize(remaining.length)),
  };
}

function splitStorySentences(body: string): string[] {
  const compact = body.replace(/\s+/g, ' ').trim();
  if (!compact) return [];
  return compact.match(/[^.!?]+[.!?]+(?:["')\]]+)?|[^.!?]+$/g)?.map(sentence => sentence.trim()).filter(Boolean) || [compact];
}

function chunkSentences(sentences: string[], size: number): string[] {
  const chunks: string[] = [];
  for (let index = 0; index < sentences.length; index += size) {
    chunks.push(sentences.slice(index, index + size).join(' '));
  }
  return chunks;
}

function storyParagraphChunkSize(sentenceCount: number): number {
  return sentenceCount > 4 ? 3 : 2;
}

function buildDispatchBullets(digest: StorytellerDigestSummary | undefined): string[] {
  const dispatchBullets = digest && hasPublicProjectorDispatch(digest) ? digest.dispatch?.publicBullets || [] : [];
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
        detail: position ? `${eventLabel} at ${locationLabel(position)}` : row.thinking?.activePlan || eventLabel,
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
    { label: 'Mapped Residents', detail: `${positionedCount.toLocaleString()} have named locations`, tone: positionedCount > 0 ? 'ok' : 'warn' },
    { label: 'Visible AP', detail: visibleAp === undefined ? 'waiting for patron summary' : `${visibleAp.toLocaleString()} AP in the city pool`, tone: visibleAp ? 'ok' : 'warn' },
    { label: 'Storyteller', detail: digest ? `${digest.topEventCount.toLocaleString()} top events in latest run` : 'waiting for digest', tone: digest ? 'ok' : 'warn' },
  ];
}

function buildProjectorFrameCitySignals(frame: ProjectorStoryFrame): StoryOverviewListItem[] {
  const health = frame.publicHealth;
  const freshnessTone = frame.source.freshnessStatus === 'fresh' ? 'ok' : 'warn';
  const safetyDetail = frame.narration.source === 'verified_dispatch'
    ? 'verified narration is live'
    : 'showing safe fallback copy';
  const attentionDetail = health.lowApResidents > 0
    ? `${health.lowApResidents.toLocaleString()} resident${health.lowApResidents === 1 ? '' : 's'} near the edge`
    : 'no residents at the edge';
  return [
    { label: 'Residents Awake', detail: `${health.activeResidents.toLocaleString()} / ${health.totalResidents.toLocaleString()} active`, tone: health.activeResidents > 0 ? 'ok' : 'warn' },
    { label: 'Latest Story', detail: frame.source.freshnessStatus === 'fresh' ? 'fresh city evidence' : 'city evidence needs refresh', tone: freshnessTone },
    { label: 'Projector Safety', detail: safetyDetail, tone: frame.publicHealth.status === 'ok' ? 'ok' : 'warn' },
    { label: 'Attention Pressure', detail: attentionDetail, tone: health.lowApResidents > 0 ? 'warn' : 'ok' },
  ];
}

function buildLeaderboardItems(
  residents: ResidentDashboardRow[],
  leadResident: ResidentDashboardRow | undefined,
  storytellerEventKinds: Map<string, string>,
): StoryOverviewListItem[] {
  return [...residents]
    .filter(row => isHighQualityLeaderboardResident(row, leadResident, storytellerEventKinds))
    .sort((a, b) => leaderboardScore(b, leadResident, storytellerEventKinds) - leaderboardScore(a, leadResident, storytellerEventKinds))
    .slice(0, 3)
    .map(row => {
      const position = residentPosition(row);
      const nearby = nearbyActivityCount(row);
      const eventLabel = eventKindLabel(row.feed?.latestEventKind || row.lastEvent?.kind || row.body?.lastAction?.kind || storytellerEventKinds.get(residentRouteSlug(row.name)) || '');
      const detailParts = [
        eventLabel,
        nearby > 0 ? `${nearby.toLocaleString()} nearby` : '',
        position ? locationLabel(position) : '',
      ].filter(Boolean);
      return {
        label: displayName(row.name),
        detail: detailParts.join(' | ') || 'waiting for live signal',
        path: `/residents/${encodeURIComponent(residentRouteSlug(row.name))}`,
        tone: row.inCombat || (row.attention ?? 999) <= 2 ? 'warn' : 'ok',
      };
    });
}

function buildDramaItems(
  residents: ResidentDashboardRow[],
  digest: StorytellerDigestSummary | undefined,
  offMapRegions: StoryOverviewRegion[],
): StoryOverviewListItem[] {
  const items: StoryOverviewListItem[] = [];
  for (const event of (digest?.topEvents || []).filter(isHighQualityDramaEvent)) {
    const label = event.residentName ? displayName(event.residentName) : eventKindLabel(event.kind);
    items.push({
      label,
      detail: compactDetail(prettifyResidentRefs(event.note || eventKindLabel(event.kind))),
      ...(event.residentName ? { path: `/residents/${encodeURIComponent(residentRouteSlug(event.residentName))}` } : {}),
      tone: event.importance === 'critical' || event.importance === 'high' ? 'warn' : 'ok',
    });
  }

  for (const row of residents.filter(row => row.inCombat).slice(0, 3)) {
    const position = residentPosition(row);
    items.push({
      label: `${displayName(row.name)} in combat`,
      detail: position ? `combat at ${locationLabel(position)}` : 'combat reported without a current place',
      path: `/residents/${encodeURIComponent(residentRouteSlug(row.name))}`,
      tone: 'warn',
    });
  }

  for (const row of residents.filter(row => (row.attention ?? 999) <= 2).slice(0, 3)) {
    items.push({
      label: `${displayName(row.name)} needs AP`,
      detail: `${(row.attention ?? 0).toLocaleString()} AP remaining`,
      path: `/residents/${encodeURIComponent(residentRouteSlug(row.name))}`,
      tone: 'warn',
    });
  }

  if (!items.length) {
    items.push({ label: 'Stable Window', detail: 'No major alerts in the current public feed.', tone: 'ok' });
  }

  return items.slice(0, 3);
}

function buildProjectorFrameDramaItems(frame: ProjectorStoryFrame): StoryOverviewListItem[] {
  const lead = frame.leadEvent ? [frame.leadEvent] : [];
  const events = [...lead, ...frame.events.filter(event => event.ref !== frame.leadEvent?.ref)]
    .slice(0, 3)
    .map(event => ({
      label: event.label,
      detail: compactDetail(prettifyResidentRefs(event.note)),
      path: `/residents/${encodeURIComponent(residentRouteSlug(event.residentName))}`,
      tone: event.importance === 'critical' || event.importance === 'high' ? 'warn' as const : 'ok' as const,
    }));
  if (events.length) return events;
  if (frame.publicHealth.warnings.length) {
    return frame.publicHealth.warnings.slice(0, 3).map(warning => ({
      label: 'Public health warning',
      detail: warning,
      tone: 'warn' as const,
    }));
  }
  return [{ label: 'Stable Window', detail: 'No major alerts in the current public feed.', tone: 'ok' }];
}

function buildWatchItems(
  residents: ResidentDashboardRow[],
  digest: StorytellerDigestSummary | undefined,
  offMapRegions: StoryOverviewRegion[],
  leadResident: ResidentDashboardRow | undefined,
): StoryOverviewListItem[] {
  const lowAp = residents.filter(row => (row.attention ?? 999) <= 2);
  const items: StoryOverviewListItem[] = [];
  if (leadResident) {
    const position = residentPosition(leadResident);
    const eventLabel = eventKindLabel(leadResident.feed?.latestEventKind || leadResident.lastEvent?.kind || leadResident.body?.lastAction?.kind || '');
    items.push({
      label: `Follow ${displayName(leadResident.name)}`,
      detail: position ? `${eventLabel} at ${locationLabel(position)}` : eventLabel,
      path: `/residents/${encodeURIComponent(residentRouteSlug(leadResident.name))}`,
      tone: leadResident.inCombat || (leadResident.attention ?? 999) <= 2 ? 'warn' : 'ok',
    });
  }
  if (digest?.dispatch?.needsReview || (digest && digest.queue !== 'canon')) {
    items.push({ label: 'Story Review', detail: 'Latest dispatch is a review draft, not canon yet.', tone: 'warn', path: '/story' });
  }
  if (offMapRegions.length) {
    items.push({ label: 'Off-Map Tension', detail: `${offMapRegions.reduce((sum, region) => sum + region.count, 0)} residents outside the atlas viewport`, tone: 'ok' });
  }
  if (lowAp.length) {
    items.push({ label: 'AP Runway', detail: `${lowAp.length} residents are at or below the support floor`, tone: 'warn', path: '/residents?triage=attention' });
  }
  return items.slice(0, 2);
}

function buildProjectorFrameWatchItems(frame: ProjectorStoryFrame): StoryOverviewListItem[] {
  const watch = frame.watchNext.map(item => ({
    label: publicProjectorWatchLine(item, frame.leadEvent),
    detail: 'Watch this next.',
    tone: 'ok' as const,
  }));
  const actionItems = frame.actions.map(action => ({
    label: action.label,
    detail: action.detail,
    ...(action.residentName ? { path: `/residents/${encodeURIComponent(residentRouteSlug(action.residentName))}` } : {}),
    tone: action.kind === 'grant_attention' ? 'warn' as const : 'ok' as const,
  }));
  return [...watch, ...actionItems].slice(0, 2);
}

function hasPublicProjectorDispatch(item: StorytellerDigestSummary): boolean {
  const dispatch = item.dispatch;
  return Boolean(
    item.queue === 'canon' &&
    dispatch &&
    !dispatch.needsReview &&
    dispatch.warningCount === 0 &&
    (dispatch.publicTitle || dispatch.publicBody || dispatch.publicBullets.length),
  );
}

function leaderboardScore(row: ResidentDashboardRow, leadResident?: ResidentDashboardRow, storytellerEventKinds = new Map<string, string>()): number {
  return residentScore(row, leadResident, storytellerEventKinds)
    + nearbyActivityCount(row)
    + ((row.feed?.events ?? 0) * 4)
    + ((row.feed?.availableActions ?? 0) * 2);
}

function nearbyActivityCount(row: ResidentDashboardRow): number {
  const nearby = row.feed?.nearby;
  if (!nearby) return 0;
  return (nearby.players ?? 0) + (nearby.npcs ?? 0);
}

function isHighQualityLeaderboardResident(
  row: ResidentDashboardRow,
  leadResident: ResidentDashboardRow | undefined,
  storytellerEventKinds: Map<string, string>,
): boolean {
  if (!(row.online || residentPosition(row))) return false;
  if (leadResident && namesMatch(row.name, leadResident.name)) return true;
  if (storytellerEventKinds.has(residentRouteSlug(row.name))) return true;
  if (row.inCombat || (row.attention ?? 999) <= 2) return true;
  if (row.feed?.latestEventKind || row.lastEvent?.kind || row.body?.lastAction?.kind) return true;
  return nearbyActivityCount(row) > 0;
}

function isHighQualityDramaEvent(event: NonNullable<StorytellerDigestSummary['topEvents']>[number]): boolean {
  if (event.importance === 'critical' || event.importance === 'high' || event.importance === 'medium') return true;
  return ['resident_faded', 'ap_for_gp_exchange', 'ap_gp_exchange', 'ncri_sale', 'ncri_minted', 'goal_completed', 'stuck_recovered'].includes(event.kind);
}

function compactDetail(value: string, maxLength = 96): string {
  const compact = value.replace(/\s+/g, ' ').trim();
  if (compact.length <= maxLength) return compact;
  return `${compact.slice(0, maxLength - 1).trimEnd()}…`;
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

function projectorEventLabelByResident(frame: ProjectorStoryFrame): Map<string, string> {
  const labels = new Map<string, string>();
  for (const event of [frame.leadEvent, ...frame.events]) {
    if (!event?.residentName) continue;
    const slug = residentRouteSlug(event.residentName);
    if (!labels.has(slug)) labels.set(slug, event.label);
  }
  return labels;
}

function displayName(name: string): string {
  if (residentRouteSlug(name) === 'agent') return 'The Steward';
  return residentRouteSlug(name)
    .split(/[-_]+/)
    .filter(Boolean)
    .map(part => part.toLowerCase() === 'qa' ? 'QA' : `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

function prettifyResidentRefs(text: string): string {
  return humanizeAcronyms(text.replace(/\bres:([a-z0-9_-]+)/gi, (_match, slug: string) => displayName(`res:${slug}`)));
}

function publicProjectorCopy(text: string): string {
  return prettifyResidentRefs(text)
    .replace(/\bAn NCRI\b/g, 'A special item')
    .replace(/\ban NCRI\b/g, 'a special item')
    .replace(/\bAttention-for-gold\b/g, 'Gold-for-attention')
    .replace(/\battention-for-gold\b/g, 'gold-for-attention')
    .replace(/\bRuneScape GP\b/g, 'RuneScape gold')
    .replace(/\bAP\b/g, 'attention')
    .replace(/\bGP\b/g, 'RuneScape gold')
    .replace(/\bNCRI\b/g, 'special item');
}

function publicProjectorTitle(frame: ProjectorStoryFrame): string {
  const title = publicProjectorCopy(frame.narration.title);
  if (!frame.leadEvent || !/\bis where the city is pointing\b/i.test(title)) return title;
  return titleForLeadEvent(frame.leadEvent);
}

function publicProjectorBody(frame: ProjectorStoryFrame): string {
  const body = publicProjectorCopy(frame.narration.body);
  if (!frame.leadEvent || !/\bis the current focus:/i.test(body)) return body;
  return bodyForLeadEvent(frame.leadEvent, frame.publicHealth.activeResidents);
}

function publicProjectorWatchLine(item: string, leadEvent: ProjectorStoryFrame['leadEvent']): string {
  const line = publicProjectorCopy(item);
  if (!leadEvent) return line;
  if (/\bafter attention-for-gold exchange\b/i.test(item) || /\battention-for-GP\b/i.test(item)) {
    return watchLineForLeadEvent(leadEvent);
  }
  return line;
}

function titleForLeadEvent(event: NonNullable<ProjectorStoryFrame['leadEvent']>): string {
  const name = displayName(event.residentName);
  switch (event.label) {
    case 'Attention-for-gold exchange':
      return `${name} traded gold for more time`;
    case 'Recovered from being stuck':
      return `${name} escaped a dead loop`;
    case 'Attention running low':
      return `${name} is running out of attention`;
    case 'Gold observed':
    case 'Gold earned':
      return `${name} put RuneScape gold on the board`;
    case 'Special item created':
    case 'Special item redeemed':
      return `${name} moved a special item forward`;
    case 'Goal completed':
      return `${name} finished a bounded goal`;
    default:
      return `${name} has the lead story`;
  }
}

function bodyForLeadEvent(event: NonNullable<ProjectorStoryFrame['leadEvent']>, activeResidents: number): string {
  const name = displayName(event.residentName);
  const active = activeResidents > 0
    ? ` ${activeResidents.toLocaleString()} resident${activeResidents === 1 ? '' : 's'} are still active.`
    : '';
  switch (event.label) {
    case 'Attention-for-gold exchange':
      return `${name} converted RuneScape gold into attention.${active}`;
    case 'Recovered from being stuck':
      return `${name} recovered from a stuck state.${active}`;
    case 'Attention running low':
      return `${name} is near the edge, and human support can still change the outcome.${active}`;
    default:
      return `${name} has the strongest verified beat in the current window.${active}`;
  }
}

function watchLineForLeadEvent(event: NonNullable<ProjectorStoryFrame['leadEvent']>): string {
  const name = displayName(event.residentName);
  switch (event.label) {
    case 'Attention-for-gold exchange':
      return `Whether ${name}'s gold-for-attention exchange buys real progress.`;
    case 'Recovered from being stuck':
      return `Whether ${name} keeps moving after the recovery.`;
    case 'Attention running low':
      return `Whether ${name} gets attention before the window closes.`;
    default:
      return `${name}'s next move after the lead event.`;
  }
}

function humanizeAcronyms(text: string): string {
  return text
    .replace(/\bQa\b/g, 'QA')
    .replace(/\bGp\b/g, 'GP')
    .replace(/\bAp\b/g, 'AP')
    .replace(/\bNcri\b/g, 'NCRI');
}

function eventKindLabel(kind: string): string {
  const cleaned = kind.trim().replace(/_/g, ' ');
  return cleaned || 'quiet';
}

function locationLabel(position: Position): string {
  if (position.level > 0 && position.x >= 3218 && position.x <= 3226 && position.y >= 3215 && position.y <= 3224) {
    return 'Lumbridge Castle upstairs';
  }
  if (position.x >= 3218 && position.x <= 3226 && position.y >= 3215 && position.y <= 3224) return 'Lumbridge Castle courtyard';
  if (position.x >= 3238 && position.x <= 3247 && position.y >= 3204 && position.y <= 3214) return 'Lumbridge church';
  if (position.x >= 3198 && position.x <= 3220 && position.y >= 3200 && position.y <= 3222) return 'Lumbridge west road';
  if (position.x >= 3150 && position.x <= 3198 && position.y >= 3215 && position.y <= 3250) return 'Lumbridge West Road';
  return regionForPosition(position);
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
