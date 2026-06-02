import type { ResidentDashboardRow } from '@nullcity-dashboard/shared';

export function toPublicOverviewResident(row: ResidentDashboardRow): ResidentDashboardRow {
  return withoutUndefined({
    name: row.name,
    online: row.online,
    position: row.position ? publicPosition(row.position) : undefined,
    hp: row.hp ? publicHp(row.hp) : undefined,
    inCombat: row.inCombat,
    busy: row.busy,
    attention: row.attention,
    feed: row.feed ? withoutUndefined({
      attached: row.feed.attached,
      tick: row.feed.tick,
      ageMs: row.feed.ageMs,
      lastFeedAt: row.feed.lastFeedAt,
      position: row.feed.position ? publicPosition(row.feed.position) : undefined,
      hp: row.feed.hp ? publicHp(row.feed.hp) : undefined,
      inCombat: row.feed.inCombat,
      busy: row.feed.busy,
      nearby: row.feed.nearby ? publicNearby(row.feed.nearby) : undefined,
      events: row.feed.events,
      availableActions: row.feed.availableActions,
      latestEventKind: row.feed.latestEventKind,
    }) : undefined,
    body: row.body ? withoutUndefined({
      controlHeld: row.body.controlHeld,
      position: row.body.position ? publicPosition(row.body.position) : undefined,
      lastFeedAt: row.body.lastFeedAt,
      lastAction: row.body.lastAction ? withoutUndefined({
        kind: row.body.lastAction.kind,
        result: row.body.lastAction.result,
        tick: row.body.lastAction.tick,
        source: row.body.lastAction.source,
      }) : undefined,
      gatewayHealthy: row.body.gatewayHealthy,
    }) : undefined,
    lastEvent: row.lastEvent ? withoutUndefined({
      kind: row.lastEvent.kind,
      tick: row.lastEvent.tick,
      at: row.lastEvent.at,
    }) : undefined,
    storyArc: row.storyArc ? withoutUndefined({
      phase: row.storyArc.phase,
      latestEventKind: row.storyArc.latestEventKind,
    }) : undefined,
  }) as ResidentDashboardRow;
}

function publicPosition(position: { x: number; y: number; level?: number }) {
  return withoutUndefined({
    x: position.x,
    y: position.y,
    level: position.level,
  });
}

function publicNearby(nearby: { players?: number; npcs?: number; objects?: number; worldItems?: number }) {
  return withoutUndefined({
    players: nearby.players,
    npcs: nearby.npcs,
    objects: nearby.objects,
    worldItems: nearby.worldItems,
  });
}

function publicHp(hp: { current: number; max: number }) {
  return {
    current: hp.current,
    max: hp.max,
  };
}

function withoutUndefined<T extends Record<string, unknown>>(input: T): T {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)) as T;
}
