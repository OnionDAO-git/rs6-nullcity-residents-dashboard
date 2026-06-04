import { describe, expect, test } from 'bun:test';
import type { ProjectorStoryFrame, ResidentDashboardRow } from '@nullcity-dashboard/shared';
import { buildProjectorOverviewSnapshot } from './projector-overview';

describe('buildProjectorOverviewSnapshot', () => {
  test('returns public-safe residents plus the server-owned projector frame', () => {
    const resident: ResidentDashboardRow = {
      name: 'res:hans',
      online: true,
      position: { x: 3221, y: 3218, level: 0 },
      thinking: { mode: 'deciding', activePlan: 'private internal plan should not leak' },
      errors: ['debug stack should not leak'],
    };
    const frame: ProjectorStoryFrame = {
      ok: true,
      schemaVersion: 1,
      frameId: 'projector:digest-1:2026-06-03T18:00:00.000Z',
      digestId: 'digest-1',
      generatedAt: '2026-06-03T18:00:00.000Z',
      source: {
        digestId: 'digest-1',
        freshnessMs: 0,
        freshnessStatus: 'fresh',
      },
      narration: {
        source: 'verified_dispatch',
        title: 'Hans found the crowd',
        body: 'Hans moved through Lumbridge.',
        bullets: [],
      },
      leadEvent: null,
      events: [],
      residents: [],
      actions: [],
      watchNext: [],
      omitted: { events: 0, residents: 0 },
      publicHealth: {
        status: 'ok',
        totalResidents: 1,
        activeResidents: 1,
        fadedResidents: 0,
        lowApResidents: 0,
        warnings: [],
      },
    };

    const snapshot = buildProjectorOverviewSnapshot({
      generatedAt: '2026-06-03T18:01:00.000Z',
      residents: [resident],
      patronAp: 12,
      projectorFrame: frame,
    });

    expect(snapshot).toMatchObject({
      generatedAt: '2026-06-03T18:01:00.000Z',
      patronAp: 12,
      projectorFrame: { frameId: 'projector:digest-1:2026-06-03T18:00:00.000Z' },
    });
    expect(snapshot.residents[0]).toEqual({
      name: 'res:hans',
      online: true,
      position: { x: 3221, y: 3218, level: 0 },
    });
    expect(JSON.stringify(snapshot)).not.toContain('private internal plan');
    expect(JSON.stringify(snapshot)).not.toContain('debug stack');
  });

  test('recomputes projector frame freshness when serving an old latest-frame', () => {
    const frame: ProjectorStoryFrame = {
      ok: true,
      schemaVersion: 1,
      frameId: 'projector:digest-old:2026-06-03T18:00:00.000Z',
      digestId: 'digest-old',
      generatedAt: '2026-06-03T18:00:00.000Z',
      source: {
        digestId: 'digest-old',
        digestBuiltAt: '2026-06-03T18:00:00.000Z',
        freshnessMs: 0,
        freshnessStatus: 'fresh',
      },
      narration: {
        source: 'deterministic_fallback',
        title: 'Hans escaped a dead loop',
        body: 'Hans recovered from a stuck state.',
        bullets: [],
      },
      leadEvent: null,
      events: [],
      residents: [],
      actions: [],
      watchNext: [],
      omitted: { events: 0, residents: 0 },
      publicHealth: {
        status: 'ok',
        totalResidents: 2,
        activeResidents: 2,
        fadedResidents: 0,
        lowApResidents: 0,
        warnings: [],
      },
    };

    const snapshot = buildProjectorOverviewSnapshot({
      generatedAt: '2026-06-03T18:48:00.000Z',
      residents: [],
      projectorFrame: frame,
    });

    expect(snapshot.projectorFrame?.source.freshnessMs).toBe(48 * 60_000);
    expect(snapshot.projectorFrame?.source.freshnessStatus).toBe('stale');
    expect(snapshot.projectorFrame?.publicHealth.status).toBe('stale');
    expect(snapshot.projectorFrame?.publicHealth.warnings).toEqual(['storyteller frame is stale (48m old)']);
    expect(frame.source.freshnessStatus).toBe('fresh');
  });

  test('sanitizes model and game jargon before serving the public projector JSON', () => {
    const frame: ProjectorStoryFrame = {
      ok: true,
      schemaVersion: 1,
      frameId: 'projector:npc-jargon:2026-06-03T18:00:00.000Z',
      digestId: 'npc-jargon',
      generatedAt: '2026-06-03T18:00:00.000Z',
      source: {
        digestId: 'npc-jargon',
        freshnessMs: 0,
        freshnessStatus: 'fresh',
      },
      narration: {
        source: 'verified_dispatch',
        title: 'The agent is waiting on Bob NPC',
        body: 'The agent is waiting for the Bob NPC to materialize. NPCs nearby can unblock axe collection.',
        bullets: ['Will Bob NPC spawn and allow agent to acquire axe?'],
      },
      leadEvent: {
        ref: 'axe-bob',
        label: 'Tool route waiting',
        residentName: 'res:agent',
        happenedAt: '2026-06-03T17:59:00.000Z',
        importance: 'medium',
        note: 'res:agent is waiting for the Bob NPC to materialize.',
        whyItMatters: 'Bob NPC can unblock axe collection',
      },
      events: [{
        ref: 'axe-bob-2',
        label: 'Tool route waiting',
        residentName: 'res:agent',
        happenedAt: '2026-06-03T18:00:00.000Z',
        importance: 'medium',
        note: 'The agent still needs the Bob NPC to spawn.',
        whyItMatters: 'agent needs axe access',
      }],
      residents: [{
        residentName: 'res:agent',
        displayName: 'The Steward',
        attention: 12_617,
        status: 'active',
        gpObserved: 0,
        goal: 'Wait for Bob NPC to spawn.',
        latestSpeechSummary: 'The agent asked whether the NPC arrived.',
      }],
      actions: [{
        kind: 'watch_resident',
        label: 'Watch agent NPC route',
        detail: 'Will Bob NPC spawn and allow agent to acquire axe?',
        residentName: 'res:agent',
      }],
      watchNext: [
        'Will Bob NPC spawn and allow agent to acquire axe?',
        "Agent's first fire-lighting attempt once tools are secured",
      ],
      omitted: { events: 0, residents: 0 },
      publicHealth: {
        status: 'ok',
        totalResidents: 1,
        activeResidents: 1,
        fadedResidents: 0,
        lowApResidents: 0,
        warnings: [],
      },
    };

    const snapshot = buildProjectorOverviewSnapshot({
      generatedAt: '2026-06-03T18:01:00.000Z',
      residents: [],
      projectorFrame: frame,
    });

    expect(snapshot.projectorFrame?.narration.title).toBe('The Steward is waiting on Bob');
    expect(snapshot.projectorFrame?.narration.body).toBe('The Steward is waiting for Bob to appear. Characters nearby can unblock axe collection.');
    expect(snapshot.projectorFrame?.narration.bullets).toEqual(['Whether Bob appears and lets The Steward get an axe.']);
    expect(snapshot.projectorFrame?.leadEvent?.note).toBe('The Steward is waiting for Bob to appear.');
    expect(snapshot.projectorFrame?.events[0]?.note).toBe('The Steward still needs Bob to appear.');
    expect(snapshot.projectorFrame?.residents[0]?.goal).toBe('Wait for Bob to appear.');
    expect(snapshot.projectorFrame?.residents[0]?.latestSpeechSummary).toBe('The Steward asked whether the character arrived.');
    expect(snapshot.projectorFrame?.actions[0]?.detail).toBe('Whether Bob appears and lets The Steward get an axe.');
    expect(snapshot.projectorFrame?.watchNext[0]).toBe('Whether Bob appears and lets The Steward get an axe.');
    expect(snapshot.projectorFrame?.watchNext[1]).toBe("The Steward's first fire-lighting attempt once tools are secured");
    expect(JSON.stringify({
      narration: snapshot.projectorFrame?.narration,
      leadEvent: snapshot.projectorFrame?.leadEvent && {
        label: snapshot.projectorFrame.leadEvent.label,
        note: snapshot.projectorFrame.leadEvent.note,
        whyItMatters: snapshot.projectorFrame.leadEvent.whyItMatters,
      },
      events: snapshot.projectorFrame?.events.map(event => ({
        label: event.label,
        note: event.note,
        whyItMatters: event.whyItMatters,
      })),
      residents: snapshot.projectorFrame?.residents.map(resident => ({
        displayName: resident.displayName,
        goal: resident.goal,
        latestSpeechSummary: resident.latestSpeechSummary,
      })),
      actions: snapshot.projectorFrame?.actions.map(action => ({
        label: action.label,
        detail: action.detail,
      })),
      watchNext: snapshot.projectorFrame?.watchNext,
      publicWarnings: snapshot.projectorFrame?.publicHealth.warnings,
    })).not.toMatch(/\bNPCs?\b|\bspawn\b|\bmaterialize\b|\bthe agent\b/i);
  });

  test('does not manufacture fade urgency when no residents need urgent attention', () => {
    const frame: ProjectorStoryFrame = {
      ok: true,
      schemaVersion: 1,
      frameId: 'projector:attention-risk:2026-06-03T18:00:00.000Z',
      digestId: 'attention-risk',
      generatedAt: '2026-06-03T18:00:00.000Z',
      source: {
        digestId: 'attention-risk',
        freshnessMs: 0,
        freshnessStatus: 'fresh',
      },
      narration: {
        source: 'verified_dispatch',
        title: "Two residents unstuck; Bob's shop still empty, attention warnings rise",
        body: "Hans, sitting at 5000 attention, voiced the familiar refrain: an embassy offering could buy more time before the fade clock starts ticking.",
        bullets: ['Hans has 5000 attention, but fade risk becomes real if no one helps.'],
      },
      leadEvent: null,
      events: [],
      residents: [{
        residentName: 'res:hans',
        displayName: 'Hans',
        attention: 5_000,
        status: 'active',
        gpObserved: null,
        goal: 'Ask for help before fade risk becomes real.',
      }],
      actions: [],
      watchNext: ['Hans at 5000 attention—will an embassy offering arrive before fade risk becomes real?'],
      omitted: { events: 0, residents: 0 },
      publicHealth: {
        status: 'ok',
        totalResidents: 2,
        activeResidents: 2,
        fadedResidents: 0,
        lowApResidents: 0,
        warnings: [],
      },
    };

    const snapshot = buildProjectorOverviewSnapshot({
      generatedAt: '2026-06-03T18:01:00.000Z',
      residents: [],
      projectorFrame: frame,
    });

    expect(snapshot.projectorFrame?.narration.title).toBe("Two residents unstuck; Bob's shop still empty, attention reserves hold");
    expect(snapshot.projectorFrame?.narration.body).toBe('Hans has 5000 attention, and an embassy offering could still shape what happens next.');
    expect(snapshot.projectorFrame?.narration.bullets).toEqual(['Hans has 5000 attention, and support can still shape what happens next.']);
    expect(snapshot.projectorFrame?.residents[0]?.goal).toBe('Ask for help while support still has time to matter.');
    expect(snapshot.projectorFrame?.watchNext[0]).toBe('Hans at 5000 attention—will an embassy offering arrive while support still has time to matter?');
    expect(JSON.stringify({
      narration: snapshot.projectorFrame?.narration,
      residents: snapshot.projectorFrame?.residents.map(resident => ({ goal: resident.goal })),
      watchNext: snapshot.projectorFrame?.watchNext,
    })).not.toMatch(/attention warnings|fade clock|fade risk|before fade/i);
  });

  test('softens fast-fading attention copy when public health has no low-attention residents', () => {
    const frame: ProjectorStoryFrame = {
      ok: true,
      schemaVersion: 1,
      frameId: 'projector:fast-fading:2026-06-04T18:19:50.000Z',
      digestId: 'fast-fading',
      generatedAt: '2026-06-04T18:19:50.000Z',
      source: {
        digestId: 'fast-fading',
        freshnessMs: 0,
        freshnessStatus: 'fresh',
      },
      narration: {
        source: 'verified_dispatch',
        title: 'Hans unstuck, The Steward waiting on Bob—both hunting basics',
        body: "Hans shook off a navigation freeze near the embassy and immediately flagged his attention situation: 5000 on the ledger, but fading fast enough that he's eyeing an offering to stay anchored. Meanwhile, The Steward made it to Bob's axe shop with a clear goal—gather logs, light a fire—but Bob himself isn't rendering yet. No panic, just the familiar RuneScape wait-state: look around, try another angle, or let the tile load.",
        bullets: [
          "Hans recovered from a stuck state and warned his attention is fading—5000 remains, but he's considering an embassy offering.",
        ],
      },
      leadEvent: null,
      events: [],
      residents: [{
        residentName: 'res:hans',
        displayName: 'Hans',
        attention: 5_000,
        status: 'active',
        gpObserved: null,
        latestSpeechSummary: "Hans: I can feel my attention fading. An offering at the embassy would keep me here a while longer.",
      }],
      actions: [],
      watchNext: ['Will Hans make an embassy offering to stabilize attention?'],
      omitted: { events: 0, residents: 0 },
      publicHealth: {
        status: 'ok',
        totalResidents: 2,
        activeResidents: 2,
        fadedResidents: 0,
        lowApResidents: 0,
        warnings: [],
      },
    };

    const snapshot = buildProjectorOverviewSnapshot({
      generatedAt: '2026-06-04T18:20:00.000Z',
      residents: [],
      projectorFrame: frame,
    });

    expect(snapshot.projectorFrame?.narration.body).toBe(
      "Hans shook off a navigation freeze near the embassy and immediately flagged his attention: 5000 remains, and an offering could help choose his next move. Meanwhile, The Steward made it to Bob's axe shop with a clear goal—gather logs, light a fire—but Bob still has not appeared. No panic, just the familiar RuneScape problem: look around, try another angle, or wait a moment.",
    );
    expect(snapshot.projectorFrame?.narration.bullets).toEqual([
      "Hans recovered from a stuck state and mentioned attention—5000 remains, but he's considering an embassy offering.",
    ]);
    expect(snapshot.projectorFrame?.residents[0]?.latestSpeechSummary).toBe(
      'Hans: I have 5000 attention. An offering at the embassy would help choose what happens next.',
    );
    expect(snapshot.projectorFrame?.watchNext[0]).toBe('Will Hans make an embassy offering to guide his next move?');
    expect(JSON.stringify(snapshot.projectorFrame)).not.toMatch(/fading fast|attention situation|on the ledger|attention is fading|feel my attention fading|stabilize attention|rendering|wait-state|tile load/i);
  });

  test('cleans live model phrasing about rendering, loading, and fade lines', () => {
    const frame: ProjectorStoryFrame = {
      ok: true,
      schemaVersion: 1,
      frameId: 'projector:live-phrasing:2026-06-04T18:39:25.000Z',
      digestId: 'live-phrasing',
      generatedAt: '2026-06-04T18:39:25.000Z',
      source: {
        digestId: 'live-phrasing',
        freshnessMs: 0,
        freshnessStatus: 'fresh',
      },
      narration: {
        source: 'verified_dispatch',
        title: "Two recoveries, one axe shop, and a city that won't let go",
        body: "The Steward is hunting logs and a fire, but Bob's counter is empty or the character hasn't rendered yet. The city is holding its breath: two residents, both active, both above the fade line, both waiting for something to load. It's the kind of quiet that hums—not dead air, but the pause before a click, a spawn, or a pivot.",
        bullets: ['Both residents remain active; system health stable at 2/2'],
      },
      leadEvent: null,
      events: [],
      residents: [],
      actions: [],
      watchNext: ['Will Bob spawn or will The Steward pivot to another tool source?'],
      omitted: { events: 0, residents: 0 },
      publicHealth: {
        status: 'ok',
        totalResidents: 2,
        activeResidents: 2,
        fadedResidents: 0,
        lowApResidents: 0,
        warnings: [],
      },
    };

    const snapshot = buildProjectorOverviewSnapshot({
      generatedAt: '2026-06-04T18:40:00.000Z',
      residents: [],
      projectorFrame: frame,
    });

    expect(snapshot.projectorFrame?.narration.body).toBe(
      "The Steward is hunting logs and a fire, but Bob's counter is empty or the character has not appeared yet. The city is holding its breath: two residents, both active, both stable for now, both waiting for the next opening. It's the kind of quiet that hums—not dead air, but the pause before the next move.",
    );
    expect(snapshot.projectorFrame?.watchNext[0]).toBe('Will Bob appear or will The Steward pivot to another tool source?');
    expect(JSON.stringify(snapshot.projectorFrame)).not.toMatch(/render|fade line|something to load|tile load|wait-state|\bspawn\b|a appear/i);
  });
});
