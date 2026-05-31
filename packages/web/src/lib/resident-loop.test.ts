import { describe, expect, test } from 'bun:test';
import type { ResidentDashboardRow } from '@nullcity-dashboard/shared';
import {
  residentAgencyCue,
  residentApSupportRecommendation,
  residentAttentionRunway,
  residentCauseSignal,
  residentCoinEvidenceAmount,
  residentGoldEvidenceLabel,
  residentDemoPickCue,
  residentGuestTrailFacts,
  residentGuestTrailGuideCopy,
  residentGuestTrailPulse,
  residentIntelligenceFacts,
  residentIntentFacts,
  residentLivenessDetail,
  residentLivenessLedger,
  residentLiveMoment,
  residentLoopCheckpoints,
  residentLoopSignal,
  residentLoopSummaryLine,
  residentMemoryEvidenceFacts,
  residentMemoryFreshness,
  residentNeedsAp,
  residentNeedsApSupportSoon,
  residentNextStepCue,
  residentNormalLifeAuditSignal,
  residentOperatorWarnings,
  residentProofPulse,
  residentProofRollup,
  residentPrimaryWarning,
  residentPublicStateTiles,
  residentRosterScanLines,
  residentStackSummary,
  residentTriageSummary,
  residentTriageFocusFromSearch,
  visibleResidentTriageBuckets,
} from './resident-loop';

function row(input: Partial<ResidentDashboardRow> & { name?: string } = {}): ResidentDashboardRow {
  return {
    name: 'res:hans',
    online: true,
    ...input,
  };
}

describe('resident loop helpers', () => {
  test('summarizes model, SPARK, action, AP, and story from existing overview data', () => {
    const facts = residentIntelligenceFacts(row({
      attention: 42,
      thinking: { mode: 'deciding', activePlan: 'Find a way to buy AP with GP' },
      stack: {
        model: { endpoint: 'spacetower', model: 'qwopus3.5-27b-v3@q4_k_s' },
        configuredModules: [],
        activeModule: { id: 'onion.runescape.standard', version: '0.2.0', source: 'soul', activeFacets: ['economy'] },
      },
      body: {
        controlHeld: true,
        lastAction: { kind: 'say', result: 'success', source: 'nervous-system', cause: 'nervous:request-attention' },
      },
      storyArc: { phase: 'progress', latestEventKind: 'city_attention_credit', latestEventTick: 99 },
      feed: { attached: true, ageMs: 1500, nearby: { players: 1, npcs: 2, objects: 3, worldItems: 4 }, events: 1, availableActions: 8 },
    }));

    expect(facts).toEqual([
      { label: 'Life force', value: '42 AP', detail: 'stable', tone: 'ok' },
      { label: 'Model', value: 'qwopus3.5-27b-v3@q4_k_s', detail: 'spacetower' },
      { label: 'Endpoint', value: 'spacetower', detail: 'qwopus3.5-27b-v3@q4_k_s' },
      { label: 'SPARK', value: 'onion.runescape.standard@0.2.0', detail: 'soul' },
      { label: 'Goal', value: 'Find a way to buy AP with GP', detail: 'plan' },
      { label: 'Thinking', value: 'deciding', detail: '-' },
      { label: 'Current plan', value: 'Find a way to buy AP with GP', detail: 'live thinking plan' },
      { label: 'Last action', value: 'say', detail: 'success | nervous-system | nervous:request-attention' },
      { label: 'Story', value: 'progress', detail: 'city_attention_credit @ 99' },
      { label: 'Feed', value: 'live', detail: '2s old | 8 actions | p1 n2 o3 i4', tone: 'ok' },
      { label: 'GP evidence', value: 'not observed', detail: 'No coin-995 inventory evidence in latest dashboard snapshot', tone: 'warn' },
    ]);
  });

  test('summarizes economy-backed GP consistently across resident detail helpers', () => {
    const economyGp = {
      tone: 'ok' as const,
      summary: 'Recent economy GP evidence is available.',
      detail: 'gp_observed: observed 24133 GP in item 995',
    };
    const resident = row({
      attention: 42,
      thinking: { mode: 'deciding', activePlan: 'Keep the Agent status visible.' },
      stack: {
        model: { endpoint: 'default' },
        configuredModules: [],
        activeModule: { id: 'onion.runescape.standard', version: '0.1.0', source: 'inference-log', activeFacets: ['thinking'] },
      },
      body: {
        controlHeld: true,
        lastAction: { kind: 'say', result: 'success', source: 'thinking', cause: 'agent_keepalive', tick: 77 },
      },
    });

    expect(residentIntelligenceFacts(resident, { economyGp }).find(fact => fact.label === 'GP evidence')).toEqual({
      label: 'GP evidence',
      value: 'recent GP proof',
      detail: 'gp_observed: observed 24133 GP in item 995',
      tone: 'ok',
    });
    expect(residentLoopSummaryLine(resident, { economyGp })).toContain('recent GP proof');
    expect(residentIntentFacts(resident, { economyGp }).find(fact => fact.label === 'Needs')).toEqual({
      label: 'Needs',
      value: 'steady',
      detail: '32 AP above support floor. · recent GP proof',
      tone: 'ok',
    });
  });

  test('flags low AP and never fabricates resident GP when coin evidence is missing', () => {
    const low = row({
      attention: 2,
      body: { controlHeld: true, latestPerception: { resident: { inventory: [{ itemId: 995, amount: 37 }] } } },
    });

    expect(residentNeedsAp(low)).toBe(true);
    expect(residentGoldEvidenceLabel(low)).toEqual({ value: '37 GP', detail: 'coin-995 inventory evidence', tone: 'ok' });
    expect(residentCoinEvidenceAmount(low)).toBe(37);
    expect(residentLoopSummaryLine(low)).toContain('needs AP');
    expect(residentLoopSummaryLine(row({ attention: 100 }))).toContain('GP unobserved');
  });

  test('treats short AP runway as support-soon even above the hard floor', () => {
    expect(residentNeedsApSupportSoon(row({ attention: 18 }))).toBe(true);
    expect(residentNeedsAp(row({ attention: 18 }))).toBe(false);
    expect(residentLoopSummaryLine(row({ attention: 18 }))).toContain('AP runway short');
  });

  test('describes AP as a runway above or below the support floor', () => {
    expect(residentAttentionRunway(row())).toEqual({
      label: 'unknown',
      value: 'AP unknown',
      detail: 'No live AP reading in this snapshot.',
      tone: 'warn',
    });
    expect(residentAttentionRunway(row({ attention: 0 }))).toEqual({
      label: 'empty',
      value: '0 AP',
      detail: 'At 0 AP; resident may be unable to act without support.',
      tone: 'fail',
    });
    expect(residentAttentionRunway(row({ attention: 2 }))).toEqual({
      label: 'floor',
      value: '2 AP',
      detail: 'At/below 10 AP support floor.',
      tone: 'warn',
    });
    expect(residentAttentionRunway(row({ attention: 18 }))).toEqual({
      label: 'short',
      value: '18 AP',
      detail: '8 AP above support floor.',
      tone: 'warn',
    });
    expect(residentAttentionRunway(row({ attention: 42 }))).toEqual({
      label: 'steady',
      value: '42 AP',
      detail: '32 AP above support floor.',
      tone: 'ok',
    });
  });

  test('recommends concrete AP support amounts that restore a stable runway', () => {
    expect(residentApSupportRecommendation(row({ name: 'res:empty', attention: 0 }))).toEqual({
      tone: 'fail',
      title: 'Grant 50 AP to restart action',
      detail: 'Resident is at 0 AP; grant enough to reach the 50 AP stable runway target.',
      suggestedAp: 50,
      suggestedMemo: 'AP support: restore empty to 50 AP runway.',
      actionLabel: 'Use 50 AP',
    });
    expect(residentApSupportRecommendation(row({ name: 'res:low', attention: 2 }))).toMatchObject({
      tone: 'warn',
      title: 'Grant 48 AP to restore runway',
      suggestedAp: 48,
      suggestedMemo: 'AP support: restore low to 50 AP runway.',
      actionLabel: 'Use 48 AP',
    });
    expect(residentApSupportRecommendation(row({ name: 'res:watch', attention: 18 }))).toMatchObject({
      tone: 'warn',
      title: 'Grant 32 AP to restore runway',
      suggestedAp: 32,
      suggestedMemo: 'AP support: restore watch to 50 AP runway.',
      actionLabel: 'Use 32 AP',
    });
    expect(residentApSupportRecommendation(row({ name: 'res:steady', attention: 50 }))).toMatchObject({
      tone: 'ok',
      title: 'No AP grant needed',
      suggestedAp: 0,
      suggestedMemo: 'AP stable: no support grant needed for steady.',
      actionLabel: 'Keep watching',
    });
  });

  test('builds public state tiles that foreground AP, support need, and GP evidence', () => {
    expect(residentPublicStateTiles(row({
      attention: 2,
      body: { controlHeld: true, latestPerception: { resident: { inventory: [{ itemId: 995, amount: 37 }] } } },
    }))).toEqual([
      { label: 'Status', value: 'online', detail: 'live resident', tone: 'ok' },
      { label: 'AP', value: '2 AP', detail: 'At/below 10 AP support floor.', tone: 'warn' },
      { label: 'Support need', value: 'AP support', detail: 'Resident is at or below the AP safety floor.', tone: 'warn' },
      { label: 'GP evidence', value: '37 GP', detail: 'coin-995 inventory evidence', tone: 'ok' },
    ]);
  });

  test('uses economy-backed GP proof in public state when inventory coin evidence is absent', () => {
    expect(residentPublicStateTiles(row({ attention: 42 }), {
      economyGp: {
        tone: 'ok',
        summary: 'Recent economy GP evidence is available.',
        detail: 'gp_observed: observed 24133 GP in item 995',
      },
    })).toEqual([
      { label: 'Status', value: 'online', detail: 'live resident', tone: 'ok' },
      { label: 'AP', value: '42 AP', detail: '32 AP above support floor.', tone: 'ok' },
      { label: 'Support need', value: 'steady', detail: 'AP stable and recent economy GP evidence is available.', tone: 'ok' },
      { label: 'GP evidence', value: 'recent GP proof', detail: 'gp_observed: observed 24133 GP in item 995', tone: 'ok' },
    ]);
  });

  test('marks short AP runway as AP watch in public state tiles', () => {
    expect(residentPublicStateTiles(row({
      attention: 18,
      body: { controlHeld: true, latestPerception: { resident: { inventory: [{ itemId: 995, amount: 37 }] } } },
    }))).toEqual([
      { label: 'Status', value: 'online', detail: 'live resident', tone: 'ok' },
      { label: 'AP', value: '18 AP', detail: '8 AP above support floor.', tone: 'warn' },
      { label: 'Support need', value: 'AP watch', detail: 'Resident is above the AP floor but runway is short; top up soon.', tone: 'warn' },
      { label: 'GP evidence', value: '37 GP', detail: 'coin-995 inventory evidence', tone: 'ok' },
    ]);
  });

  test('adds Soul identity and north-star orientation to public state when available', () => {
    expect(residentPublicStateTiles(row({
      attention: 42,
      thinking: { mode: 'executing', activePlan: 'Keep the square lit and visible.' },
      stack: {
        soulId: 'res:duke',
        soulTitle: 'Duke',
        soulFile: 'res-duke.md',
        orientationGoal: {
          id: 'keep-square-lit',
          description: 'Keep the square lit and turn firemaking into public myth.',
          tier: 'pursue',
        },
        behaviorKind: 'autonomous',
        configuredModules: [],
      },
      body: { controlHeld: true, latestPerception: { resident: { inventory: [{ itemId: 995, amount: 37 }] } } },
    }))).toEqual([
      { label: 'Status', value: 'online', detail: 'live resident', tone: 'ok' },
      { label: 'Soul', value: 'Duke', detail: 'res:duke | res-duke.md | behavior autonomous', tone: 'ok' },
      { label: 'North star', value: 'Keep the square lit and turn firemaking into public myth.', detail: 'soul orientation | keep-square-lit | pursue', tone: 'ok' },
      { label: 'AP', value: '42 AP', detail: '32 AP above support floor.', tone: 'ok' },
      { label: 'Support need', value: 'steady', detail: 'AP and GP evidence are both visible.', tone: 'ok' },
      { label: 'GP evidence', value: '37 GP', detail: 'coin-995 inventory evidence', tone: 'ok' },
    ]);
  });

  test('builds current plan/action/speech/story loop signals from live row state', () => {
    expect(residentLoopSignal(row({
      thinking: { mode: 'executing', activePlan: 'Earn GP to fund AP' },
      body: {
        controlHeld: true,
        feed: {
          attached: true,
          ageMs: 5000,
          nearby: { players: 0, npcs: 0, objects: 0, worldItems: 0 },
          events: 1,
          availableActions: 7,
          latestEventKind: 'say',
          latestEventText: 'I can trade once I get coin 995.',
        },
        lastAction: { kind: 'trade_with', result: 'success', source: 'thinking' },
      },
      storyArc: { phase: 'progress', latestEventKind: 'city_attention_credit', latestEventTick: 1337 },
    }))).toEqual({
      plan: 'Earn GP to fund AP',
      action: 'trade_with',
      speech: 'I can trade once I get coin 995.',
      story: 'city_attention_credit @ 1337',
    });
  });

  test('builds a visitor-readable resident intent card from live proof signals', () => {
    expect(residentIntentFacts(row({
      attention: 2,
      thinking: { mode: 'executing', activePlan: 'Earn GP to keep AP above the floor' },
      body: {
        controlHeld: true,
        lastAction: { kind: 'pickup_item', result: 'success', source: 'thinking', cause: 'goal:ap-gp', tick: 2048 },
        feed: {
          attached: true,
          tick: 2048,
          ageMs: 5000,
          nearby: { players: 0, npcs: 1, objects: 0, worldItems: 2 },
          events: 1,
          availableActions: 6,
          latestEventKind: 'say',
          latestEventText: 'I need AP, but coin 995 is nearby.',
        },
      },
      storyArc: {
        phase: 'progress',
        summary: 'The resident is turning patron support into visible progress.',
        latestEventKind: 'city_attention_credit',
        latestEventTick: 2048,
      },
    }), {
      storyteller: {
        tone: 'ok',
        summary: 'City dispatch cited this resident.',
        detail: 'Latest event is 3m old.',
      },
    })).toEqual([
      { label: 'Wants', value: 'Earn GP to keep AP above the floor', detail: 'live plan', tone: 'ok' },
      { label: 'Needs', value: 'AP support', detail: 'At/below 10 AP support floor. · GP not observed', tone: 'warn' },
      { label: 'Did', value: 'pickup_item', detail: 'success | thinking | goal:ap-gp | tick 2048 (current)', tone: 'ok' },
      { label: 'Said', value: 'I need AP, but coin 995 is nearby.', detail: 'live speech in feed | tick 2048 (current)', tone: 'ok' },
      { label: 'Because', value: 'AP/GP goal', detail: 'because the AP/GP goal drove pickup_item (goal:ap-gp)', tone: 'ok' },
      { label: 'Remembers', value: 'The resident is turning patron support into visible progress.', detail: 'Library memory | city_attention_credit @ 2048 | tick 2048 (current) | City dispatch cited this resident.', tone: 'ok' },
    ]);
  });

  test('selects fresh speech as the resident live moment before action or plan', () => {
    expect(residentLiveMoment(row({
      attention: 40,
      thinking: { mode: 'executing', activePlan: 'Trade GP for AP' },
      body: {
        controlHeld: true,
        lastAction: { kind: 'move_to', result: 'success', source: 'body', tick: 100 },
        feed: {
          attached: true,
          tick: 100,
          ageMs: 1000,
          nearby: { players: 0, npcs: 1, objects: 0, worldItems: 0 },
          events: 1,
          availableActions: 4,
          latestEventKind: 'say',
          latestEventText: 'I found the path to logs.',
        },
      },
    }))).toEqual({
      label: 'Said',
      title: 'I found the path to logs.',
      detail: 'live speech in feed | tick 100 (current) | because the live feed captured speech at tick 100',
      tone: 'ok',
    });
  });

  test('uses a concrete recent action as the live moment when no speech is available', () => {
    expect(residentLiveMoment(row({
      attention: 70,
      thinking: { mode: 'executing', activePlan: 'Collect coin proof' },
      body: {
        controlHeld: true,
        lastAction: { kind: 'pickup_item', result: 'success', source: 'thinking', cause: 'goal:ap-gp', tick: 2048 },
        latestPerception: { resident: { inventory: [{ itemId: 995, amount: 37 }] } },
        feed: {
          attached: true,
          tick: 2048,
          ageMs: 1500,
          nearby: { players: 0, npcs: 1, objects: 0, worldItems: 2 },
          events: 1,
          availableActions: 6,
        },
      },
    }))).toEqual({
      label: 'Did',
      title: 'picked up coin-995',
      detail: 'success | thinking | because the AP/GP goal drove pickup_item (goal:ap-gp) | tick 2048 (current)',
      tone: 'ok',
    });
  });

  test('surfaces low-health heal wait as a resident live moment', () => {
    expect(residentLiveMoment(row({
      attention: 80,
      thinking: { mode: 'executing', activePlan: 'Recover health before re-engaging.' },
      body: {
        controlHeld: true,
        lastAction: { kind: 'noop', result: 'success', source: 'thinking', cause: 'low_health_heal_wait', tick: 900 },
        latestPerception: { resident: { inventory: [{ itemId: 995, amount: 25 }] } },
        feed: {
          attached: true,
          tick: 900,
          ageMs: 2000,
          nearby: { players: 0, npcs: 1, objects: 0, worldItems: 0 },
          events: 1,
          availableActions: 5,
        },
      },
      progress: {
        samples: 4,
        stuckTicks: 37,
        latest: { meaningful: false, reasons: [], stuckSince: 863, tick: 900 },
      },
      storyArc: { phase: 'progress', summary: 'Combat recovery in progress.', latestEventKind: 'combat_recovery', latestEventTick: 900 },
    }))).toEqual({
      label: 'Working',
      title: 'Waiting to heal',
      detail: 'low_health_heal_wait | stuck 37 ticks | tick 900 (current) | inspect food/cook/eat recovery before trusting combat liveness',
      tone: 'warn',
    });
  });

  test('falls back to Library memory when speech and action are absent', () => {
    expect(residentLiveMoment(row({
      attention: 88,
      thinking: { mode: 'idle' },
      body: {
        controlHeld: true,
        feed: {
          attached: true,
          tick: 400,
          ageMs: 1000,
          nearby: { players: 0, npcs: 0, objects: 1, worldItems: 0 },
          events: 0,
          availableActions: 3,
        },
      },
      storyArc: {
        phase: 'progress',
        summary: 'Remembered a patron gift.',
        latestEventKind: 'patron_gift',
        latestEventTick: 400,
      },
    }))).toEqual({
      label: 'Remembered',
      title: 'Remembered a patron gift.',
      detail: 'Library evidence | tick 400 (current)',
      tone: 'ok',
    });
  });

  test('uses reconnect as the live moment when the resident is offline', () => {
    expect(residentLiveMoment(row({
      online: false,
      thinking: { mode: 'idle', activePlan: 'Return to the square' },
    }))).toEqual({
      label: 'Reconnect',
      title: 'Waiting for reconnect',
      detail: 'offline live snapshot | because they are working on "Return to the square"',
      tone: 'fail',
    });
  });

  test('builds bounded roster scan lines for the resident directory', () => {
    const lines = residentRosterScanLines(row({
      online: false,
      attention: 7674,
      thinking: { mode: 'offline', activePlan: 'Master woodcutting and supply the city with logs.', lastInferenceCause: 'evidence_record_failed' },
      stack: {
        model: { endpoint: 'openrouter/haiku', model: 'haiku-4' },
        configuredModules: [],
        activeModule: { id: 'onion.runescape.standard', version: '0.3.0', source: 'soul', activeFacets: [] },
      },
      body: {
        controlHeld: false,
        lastAction: { kind: 'action', result: 'success', source: 'thinking', tick: 26 },
      },
      storyArc: {
        phase: 'progress',
        summary: 'The resident is making visible in-game progress.',
        latestEventKind: 'stuck_recovered',
        latestEventTick: 135996,
      },
    }), {
      storyteller: { tone: 'warn', summary: 'No grounded Storyteller events for this resident.' },
    });

    expect(lines).toHaveLength(11);
    expect(lines.map(line => line.label)).toEqual([
      'Moment',
      'Need',
      'Why',
      'Runway',
      'Stack',
      'Plan',
      'Action',
      'Memory',
      'Proof',
      'Warnings',
      'Risk',
    ]);
    expect(lines[0]).toMatchObject({
      label: 'Moment',
      text: 'Reconnect: Waiting for reconnect · offline live snapshot | because evidence record failed',
      tone: 'fail',
      limit: 104,
      priority: 'primary',
    });
    expect(lines.find(line => line.label === 'Why')).toMatchObject({
      text: 'because thinking recorded evidence record failed (evidence_record_failed)',
      tone: 'ok',
    });
    expect(lines.find(line => line.label === 'Risk')).toMatchObject({
      text: 'Resident is offline in the live controller snapshot. · Act from: Grant Attention',
      tone: 'fail',
    });
    expect(lines.find(line => line.label === 'Warnings')).toMatchObject({
      text: '1 fail · 2 warn · top Resident is offline in the live controller snapshot.',
      tone: 'fail',
    });
    expect(lines.find(line => line.label === 'Stack')).toMatchObject({
      text: 'openrouter/haiku | standard@0.3.0',
      tone: 'ok',
      priority: 'secondary',
      limit: 27,
    });
    expect(lines.some(line => line.label === 'Storyteller')).toBe(false);
  });

  test('chooses a demo-ready resident before recovery cues', () => {
    const healthy = row({
      name: 'res:ready-resident',
      attention: 80,
      thinking: { mode: 'executing', activePlan: 'Earn GP safely' },
      body: {
        controlHeld: true,
        lastAction: { kind: 'pickup_item', result: 'success', source: 'thinking', tick: 150 },
        latestPerception: { resident: { inventory: [{ itemId: 995, amount: 25 }] } },
        feed: {
          attached: true,
          tick: 150,
          ageMs: 2000,
          latestEventKind: 'say',
          latestEventText: 'Ready to demo.',
          nearby: { players: 0, npcs: 1, objects: 0, worldItems: 1 },
          events: 1,
          availableActions: 6,
        },
      },
      storyArc: { phase: 'progress', summary: 'Coin proof collected.', latestEventKind: 'gp_observed', latestEventTick: 150 },
      memory: {
        files: ['facts/economy.md'],
        facts: [{ topic: 'economy', path: 'facts/economy.md', text: 'Coin proof collected.' }],
      },
    });
    const offline = row({ name: 'res:offline-resident', online: false });

    expect(residentDemoPickCue([offline, healthy], row => (
      row.name === 'res:ready-resident'
        ? { benchmark: { tone: 'ok', summary: 'Latest benchmark passed.', detail: 'score 1' } }
        : {}
    ))).toEqual({
      tone: 'ok',
      label: 'Demo pick',
      residentName: 'res:ready-resident',
      target: 'Resident Detail',
      action: 'Open demo-ready resident',
      detail: 'ready-resident has 7/7 loop proofs live; all tracked proof signals are live.',
    });
  });

  test('falls back to a recovery cue when no resident is demo-ready', () => {
    expect(residentDemoPickCue([row({
      name: 'res:woodcutter',
      online: false,
      thinking: { mode: 'offline', activePlan: 'Return to the square' },
    })])).toEqual({
      tone: 'fail',
      label: 'Demo pick',
      residentName: 'res:woodcutter',
      target: 'Grant Attention',
      action: 'Reconnect resident',
      detail: 'woodcutter needs attention first: Resident is offline in the live controller snapshot.',
    });
  });

  test('names the resident directory as the demo pick target while roster is empty', () => {
    expect(residentDemoPickCue([])).toEqual({
      tone: 'warn',
      label: 'Demo pick',
      target: 'Residents',
      action: 'Wait for residents',
      detail: 'No resident roster loaded yet.',
    });
  });

  test('turns resident warning state into a concrete detail next step', () => {
    expect(residentNextStepCue(row({
      online: false,
      attention: 7674,
      thinking: { mode: 'offline', activePlan: 'Master woodcutting and supply the city with logs.', lastInferenceCause: 'evidence_record_failed' },
      body: {
        controlHeld: false,
        lastAction: { kind: 'action', result: 'success', source: 'thinking', tick: 26 },
      },
      storyArc: {
        phase: 'progress',
        summary: 'The resident is making visible in-game progress.',
        latestEventKind: 'stuck_recovered',
        latestEventTick: 135996,
      },
    }))).toEqual({
      tone: 'fail',
      label: 'Next step',
      action: 'Reconnect resident',
      target: 'Grant Attention',
      detail: 'Resident is offline in the live controller snapshot. Login or top up AP before expecting new actions.',
    });

    expect(residentNextStepCue(row({
      attention: 80,
      thinking: { mode: 'executing', activePlan: 'Earn GP safely' },
      body: {
        controlHeld: true,
        lastAction: { kind: 'pickup_item', result: 'success', source: 'thinking', tick: 150 },
        latestPerception: { resident: { inventory: [{ itemId: 995, amount: 25 }] } },
        feed: {
          attached: true,
          tick: 150,
          ageMs: 2000,
          nearby: { players: 0, npcs: 1, objects: 0, worldItems: 1 },
          events: 1,
          availableActions: 6,
        },
      },
      storyArc: { phase: 'progress', summary: 'Coin proof collected.', latestEventKind: 'gp_observed', latestEventTick: 150 },
    }), {
      benchmark: { tone: 'ok', summary: 'Latest benchmark passed.', detail: 'score 1' },
    })).toEqual({
      tone: 'ok',
      label: 'Next step',
      action: 'Keep watching',
      target: 'Resident Intent',
      detail: 'Resident has current AP, GP, plan, feed, story, and benchmark signals.',
    });

    expect(residentNextStepCue(row({
      attention: 80,
      thinking: { mode: 'executing', activePlan: 'Recover health before re-engaging.' },
      body: {
        controlHeld: true,
        lastAction: { kind: 'noop', result: 'success', source: 'thinking', cause: 'low_health_heal_wait', tick: 900 },
        latestPerception: { resident: { inventory: [{ itemId: 995, amount: 25 }] } },
        feed: {
          attached: true,
          tick: 900,
          ageMs: 2000,
          nearby: { players: 0, npcs: 1, objects: 0, worldItems: 0 },
          events: 1,
          availableActions: 5,
        },
      },
      progress: {
        samples: 4,
        stuckTicks: 37,
        latest: { meaningful: false, reasons: [], stuckSince: 863, tick: 900 },
      },
      storyArc: { phase: 'progress', summary: 'Combat recovery in progress.', latestEventKind: 'combat_recovery', latestEventTick: 900 },
    }))).toEqual({
      tone: 'warn',
      label: 'Next step',
      action: 'Inspect recovery loop',
      target: 'Open Ops View',
      detail: 'Low-health recovery wait is active. Latest action is noop with cause low_health_heal_wait; stuck 37 ticks; inspect food/cook/eat recovery before trusting combat liveness.',
    });
  });

  test('describes Library memory freshness as fresh, stale, or thin', () => {
    expect(residentMemoryFreshness(row({
      body: {
        controlHeld: true,
        feed: {
          attached: true,
          tick: 100,
          ageMs: 1000,
          nearby: { players: 0, npcs: 0, objects: 1, worldItems: 0 },
          events: 1,
          availableActions: 3,
        },
      },
      storyArc: {
        phase: 'progress',
        summary: 'The resident made progress.',
        latestEventKind: 'city_attention_credit',
        latestEventTick: 90,
      },
    }))).toEqual({
      label: 'fresh',
      summary: 'The resident made progress.',
      detail: 'Library memory | city_attention_credit @ 90 | tick 90 (10 behind)',
      tone: 'ok',
    });

    expect(residentMemoryFreshness(row({
      body: {
        controlHeld: true,
        feed: {
          attached: true,
          tick: 2000,
          ageMs: 1000,
          nearby: { players: 0, npcs: 0, objects: 1, worldItems: 0 },
          events: 1,
          availableActions: 3,
        },
      },
      storyArc: {
        phase: 'progress',
        latestEventKind: 'city_attention_credit',
        latestEventTick: 100,
      },
    }))).toEqual({
      label: 'stale',
      summary: 'city_attention_credit',
      detail: 'Library memory | city_attention_credit @ 100 | tick 100 (1900 behind, stale)',
      tone: 'warn',
    });

    expect(residentMemoryFreshness(row())).toEqual({
      label: 'thin',
      summary: 'No Library memory yet',
      detail: 'No current Library story signal.',
      tone: 'warn',
    });
  });

  test('turns raw action and speech causes into visitor-readable because signals', () => {
    expect(residentCauseSignal(row({
      thinking: { mode: 'executing', activePlan: 'Earn GP to keep AP above the floor' },
      body: {
        controlHeld: true,
        lastAction: { kind: 'pickup_item', result: 'success', source: 'thinking', cause: 'goal:ap-gp', tick: 2048 },
      },
    }))).toEqual({
      value: 'AP/GP goal',
      detail: 'because the AP/GP goal drove pickup_item (goal:ap-gp)',
      tone: 'ok',
    });

    expect(residentCauseSignal(row({
      body: {
        controlHeld: true,
        lastAction: { kind: 'say', result: 'success', source: 'nervous-system', cause: 'nervous:request-attention', tick: 12 },
      },
    }))).toEqual({
      value: 'attention request',
      detail: 'because the nervous system requested attention (nervous:request-attention)',
      tone: 'ok',
    });

    expect(residentCauseSignal(row({
      thinking: { mode: 'executing', activePlan: 'Reach the cow pen safely' },
      body: {
        controlHeld: true,
        feed: {
          attached: true,
          tick: 88,
          ageMs: 1000,
          nearby: { players: 0, npcs: 1, objects: 0, worldItems: 0 },
          events: 1,
          availableActions: 4,
          latestEventKind: 'say',
          latestEventText: 'I am moving carefully.',
        },
      },
    }))).toEqual({
      value: 'live speech',
      detail: 'because the live feed captured speech at tick 88',
      tone: 'ok',
    });

    expect(residentCauseSignal(row())).toEqual({
      value: 'no cause yet',
      detail: 'No action cause, speech source, or live plan is visible.',
      tone: 'warn',
    });
  });

  test('builds a compact agency cue from plan, action, and proof signals', () => {
    expect(residentAgencyCue(row({
      attention: 52,
      thinking: { mode: 'executing', activePlan: 'Earn GP to keep AP above the floor' },
      body: {
        controlHeld: true,
        lastAction: { kind: 'pickup_item', result: 'success', source: 'thinking', cause: 'goal:ap-gp', tick: 2048 },
        latestPerception: { resident: { inventory: [{ itemId: 995, amount: 37 }] } },
        feed: {
          attached: true,
          tick: 2048,
          ageMs: 5000,
          nearby: { players: 0, npcs: 1, objects: 0, worldItems: 2 },
          events: 1,
          availableActions: 6,
        },
      },
      storyArc: {
        phase: 'progress',
        summary: 'The resident is turning patron support into visible progress.',
        latestEventKind: 'city_attention_credit',
        latestEventTick: 2048,
      },
    }))).toEqual({
      tone: 'ok',
      summary: 'Working on "Earn GP to keep AP above the floor" · just picked up coin-995 · needs no immediate operator action',
    });
  });

  test('prioritizes AP support in the agency cue before softer proof gaps', () => {
    expect(residentAgencyCue(row({
      attention: 2,
      thinking: { mode: 'executing', activePlan: 'Earn GP to fund AP' },
      body: {
        controlHeld: true,
        lastAction: { kind: 'say', result: 'success', source: 'thinking', tick: 2100 },
      },
    }))).toEqual({
      tone: 'warn',
      summary: 'Working on "Earn GP to fund AP" · just spoke · needs AP support',
    });
  });

  test('raises failed action repair ahead of steady resident needs', () => {
    expect(residentAgencyCue(row({
      attention: 80,
      thinking: { mode: 'executing', activePlan: 'Finish a safe combat action' },
      body: {
        controlHeld: true,
        lastAction: { kind: 'attack', result: 'failed', source: 'body', tick: 512 },
        latestPerception: { resident: { inventory: [{ itemId: 995, amount: 11 }] } },
      },
      storyArc: { phase: 'progress', summary: 'Combat route under test.', latestEventKind: 'combat_started', latestEventTick: 512 },
    }))).toEqual({
      tone: 'fail',
      summary: 'Working on "Finish a safe combat action" · just attacked · needs action repair',
    });
  });

  test('builds resident loop checkpoints with tone and details for operator triage', () => {
    expect(residentLoopCheckpoints(row({
      thinking: { mode: 'executing', activePlan: 'Earn GP to fund AP', lastInferenceCause: 'goal:ap-gp' },
      body: {
        controlHeld: true,
        feed: {
          attached: true,
          tick: 2048,
          ageMs: 5000,
          nearby: { players: 0, npcs: 0, objects: 0, worldItems: 0 },
          events: 1,
          availableActions: 7,
          latestEventKind: 'say',
          latestEventText: 'Trading once I have item 995.',
        },
        lastAction: { kind: 'trade_with', result: 'success', source: 'thinking', cause: 'goal:ap-gp', tick: 2048 },
      },
      storyArc: { phase: 'progress', latestEventKind: 'city_attention_credit', latestEventTick: 2048 },
    }))).toEqual([
      { key: 'plan', label: 'Plan', value: 'Earn GP to fund AP', detail: 'mode executing | cause goal:ap-gp', tone: 'ok' },
      { key: 'action', label: 'Action', value: 'trade_with', detail: 'success | thinking | goal:ap-gp | tick 2048 (current)', tone: 'ok' },
      { key: 'speech', label: 'Speech', value: 'Trading once I have item 995.', detail: 'live speech in feed | tick 2048 (current)', tone: 'ok' },
      { key: 'story', label: 'Story', value: 'city_attention_credit @ 2048', detail: 'latest Library/Storyteller signal | tick 2048 (current)', tone: 'ok' },
    ]);
  });

  test('marks missing loop checkpoints as warning signals', () => {
    expect(residentLoopCheckpoints(row({
      thinking: { mode: 'idle', activePlan: '' },
      feed: { attached: true, ageMs: 220000, nearby: { players: 0, npcs: 0, objects: 0, worldItems: 0 }, events: 0, availableActions: 0 },
      storyArc: { phase: 'pitch' },
    }))).toEqual([
      { key: 'plan', label: 'Plan', value: '-', detail: 'no active plan published yet', tone: 'warn' },
      { key: 'action', label: 'Action', value: '-', detail: '-', tone: 'warn' },
      { key: 'speech', label: 'Speech', value: '-', detail: 'no recent speech in feed', tone: 'warn' },
      { key: 'story', label: 'Story', value: '-', detail: 'no current story signal', tone: 'warn' },
    ]);
  });

  test('marks stale action/speech/story checkpoints when tick gaps drift', () => {
    expect(residentLoopCheckpoints(row({
      thinking: { mode: 'executing', activePlan: 'Reach the market' },
      body: {
        controlHeld: true,
        feed: {
          attached: true,
          tick: 2200,
          ageMs: 2000,
          nearby: { players: 0, npcs: 0, objects: 0, worldItems: 0 },
          events: 0,
          availableActions: 6,
        },
        lastAction: { kind: 'move_to', result: 'success', source: 'thinking', tick: 1700 },
      },
      lastEvent: { kind: 'say', text: 'On my way.', tick: 1800 },
      storyArc: { phase: 'progress', latestEventKind: 'city_attention_credit', latestEventTick: 400 },
    }))).toEqual([
      { key: 'plan', label: 'Plan', value: 'Reach the market', detail: 'mode executing', tone: 'ok' },
      { key: 'action', label: 'Action', value: 'move_to', detail: 'success | thinking | tick 1700 (500 behind, stale)', tone: 'warn' },
      { key: 'speech', label: 'Speech', value: 'On my way.', detail: 'latest say event | tick 1800 (400 behind, stale)', tone: 'warn' },
      { key: 'story', label: 'Story', value: 'city_attention_credit @ 400', detail: 'latest Library/Storyteller signal | tick 400 (1800 behind, stale)', tone: 'warn' },
    ]);
  });

  test('builds operator warnings from AP, GP, plan, story, feed, and benchmark evidence', () => {
    const warnings = residentOperatorWarnings(row({
      attention: 2,
      feed: { attached: true, ageMs: 180000, nearby: { players: 0, npcs: 0, objects: 0, worldItems: 0 }, events: 0, availableActions: 1 },
      storyArc: { phase: 'pitch' },
    }), {
      tone: 'fail',
      summary: 'Latest benchmark failed on combat-prayer-10m.',
      detail: 'death loop',
    });

    expect(warnings).toEqual([
      { tone: 'warn', summary: 'AP low (2); top-up may be needed soon.', detail: 'Attention is the resident life-force.' },
      { tone: 'warn', summary: 'Feed stale (180s old).', detail: 'Live action/speech may lag the controller.' },
      { tone: 'warn', summary: 'No coin-995 GP evidence in current snapshot.', detail: 'Do not imply this resident can pay GP yet.' },
      { tone: 'warn', summary: 'No active plan published by thinking module.', detail: 'Goal pursuit may be opaque from the dashboard.' },
      { tone: 'warn', summary: 'Library strategy evidence is still thin for this resident.', detail: 'Run Storyteller/digest or wait for progress evidence.' },
      { tone: 'fail', summary: 'Latest benchmark failed on combat-prayer-10m.', detail: 'death loop' },
    ]);
  });

  test('uses recent economy GP evidence when the live inventory snapshot is missing coin proof', () => {
    const warnings = residentOperatorWarnings(row({
      attention: 100,
      thinking: { mode: 'executing', activePlan: 'Trade GP for AP when needed' },
      body: {
        controlHeld: true,
        feed: { attached: true, ageMs: 5000, nearby: { players: 0, npcs: 0, objects: 0, worldItems: 0 }, events: 1, availableActions: 6 },
      },
      storyArc: { phase: 'progress', summary: 'Making GP progress.' },
    }), undefined, {
      economyGp: {
        tone: 'ok',
        summary: 'Recent economy GP evidence is available.',
        detail: 'gp_observed: observed 24138 GP in item 995',
      },
    });

    expect(warnings).toContainEqual({
      tone: 'warn',
      summary: 'Live inventory GP missing; recent economy evidence exists.',
      detail: 'gp_observed: observed 24138 GP in item 995',
    });
    expect(warnings).not.toContainEqual({
      tone: 'warn',
      summary: 'No coin-995 GP evidence in current snapshot.',
      detail: 'Do not imply this resident can pay GP yet.',
    });
  });

  test('counts economy-backed GP evidence in the resident proof pulse', () => {
    expect(residentProofPulse(row({
      attention: 75,
      thinking: { mode: 'executing', activePlan: 'Trade GP for AP when needed' },
      body: {
        controlHeld: true,
        lastAction: { kind: 'exchange_gp_for_ap', result: 'success', source: 'body' },
        feed: {
          attached: true,
          ageMs: 4000,
          nearby: { players: 0, npcs: 1, objects: 0, worldItems: 0 },
          events: 1,
          availableActions: 4,
          latestEventKind: 'say',
          latestEventText: 'I can use coin 995 for AP.',
        },
      },
      storyArc: { phase: 'progress', summary: 'Making GP progress.' },
      memory: {
        files: ['facts/economy.md'],
        facts: [{ topic: 'economy', path: 'facts/economy.md', text: 'GP can self-fund AP.' }],
      },
    }), {
      economyGp: { tone: 'ok', summary: 'Recent economy GP evidence is available.', detail: 'ap_gp_exchange: exchanged 10 GP for 20 AP' },
    })).toEqual({
      tone: 'ok',
      summary: '6/6 loop proofs live',
      detail: 'all tracked proof signals are live',
    });
  });

  test('flags missing qmd memory as a resident proof gap', () => {
    expect(residentProofPulse(row({
      attention: 75,
      thinking: { mode: 'executing', activePlan: 'Trade GP for AP when needed' },
      body: {
        controlHeld: true,
        lastAction: { kind: 'exchange_gp_for_ap', result: 'success', source: 'body' },
        latestPerception: { resident: { inventory: [{ itemId: 995, amount: 42 }] } },
        feed: {
          attached: true,
          ageMs: 4000,
          nearby: { players: 0, npcs: 1, objects: 0, worldItems: 0 },
          events: 1,
          availableActions: 4,
          latestEventKind: 'say',
          latestEventText: 'I can use coin 995 for AP.',
        },
      },
      storyArc: { phase: 'progress', summary: 'Making GP progress.' },
    }))).toEqual({
      tone: 'warn',
      summary: '5/6 loop proofs live',
      detail: 'missing: Memory',
    });
  });

  test('fails the proof pulse when the latest action outcome timed out', () => {
    expect(residentProofPulse(row({
      attention: 75,
      thinking: { mode: 'executing', activePlan: 'Reach the cow pen safely' },
      body: {
        controlHeld: true,
        lastAction: { kind: 'attack', result: 'timeout', source: 'body', tick: 400 },
        latestPerception: { resident: { inventory: [{ itemId: 995, amount: 42 }] } },
        feed: {
          attached: true,
          tick: 400,
          ageMs: 4000,
          nearby: { players: 0, npcs: 1, objects: 0, worldItems: 0 },
          events: 1,
          availableActions: 4,
          latestEventKind: 'say',
          latestEventText: 'I am watching the fight.',
        },
      },
      storyArc: { phase: 'progress', summary: 'Combat attempt recorded.', latestEventKind: 'combat_started', latestEventTick: 400 },
      memory: {
        files: ['facts/combat.md'],
        facts: [{ topic: 'combat', path: 'facts/combat.md', text: 'Cow pen fights need food.' }],
      },
    }), {
      benchmark: { tone: 'ok', summary: 'pass', detail: 'score 1' },
      storyteller: { tone: 'ok', summary: 'story grounded' },
      goalContract: { tone: 'ok', summary: 'goal condition present' },
    })).toEqual({
      tone: 'fail',
      summary: '8/9 loop proofs live',
      detail: 'action outcome: latest action timeout',
    });
  });

  test('surfaces latest action failures in operator warnings', () => {
    expect(residentOperatorWarnings(row({
      attention: 80,
      thinking: { mode: 'executing', activePlan: 'Finish a safe combat action' },
      body: {
        controlHeld: true,
        lastAction: { kind: 'attack', result: 'failed', source: 'body', tick: 512 },
        latestPerception: { resident: { inventory: [{ itemId: 995, amount: 11 }] } },
        feed: {
          attached: true,
          tick: 512,
          ageMs: 5000,
          nearby: { players: 0, npcs: 1, objects: 0, worldItems: 0 },
          events: 1,
          availableActions: 6,
        },
      },
      storyArc: { phase: 'progress', summary: 'Combat route under test.', latestEventKind: 'combat_started', latestEventTick: 512 },
    }), {
      tone: 'ok',
      summary: 'Latest benchmark passed.',
      detail: 'score 1',
    })).toEqual([
      {
        tone: 'fail',
        summary: 'Latest action failed.',
        detail: 'attack returned failed from body.',
      },
    ]);
  });

  test('prioritizes low-health wait in operator warnings', () => {
    expect(residentOperatorWarnings(row({
      attention: 80,
      thinking: { mode: 'executing', activePlan: 'Recover health before re-engaging.' },
      body: {
        controlHeld: true,
        lastAction: { kind: 'noop', result: 'success', source: 'thinking', cause: 'low_health_heal_wait', tick: 900 },
        latestPerception: { resident: { inventory: [{ itemId: 995, amount: 25 }] } },
        feed: {
          attached: true,
          tick: 900,
          ageMs: 2000,
          nearby: { players: 0, npcs: 1, objects: 0, worldItems: 0 },
          events: 1,
          availableActions: 5,
        },
      },
      progress: {
        samples: 4,
        stuckTicks: 37,
        latest: { meaningful: false, reasons: [], stuckSince: 863, tick: 900 },
      },
      storyArc: { phase: 'progress', summary: 'Combat recovery in progress.', latestEventKind: 'combat_recovery', latestEventTick: 900 },
    }), {
      tone: 'ok',
      summary: 'Latest benchmark passed.',
      detail: 'score 1',
    })).toEqual([
      {
        tone: 'warn',
        summary: 'Low-health recovery wait is active.',
        detail: 'Latest action is noop with cause low_health_heal_wait; stuck 37 ticks; inspect food/cook/eat recovery before trusting combat liveness.',
      },
    ]);
  });

  test('builds stack summary from model/endpoint and SPARK module', () => {
    expect(residentStackSummary(row({
      stack: {
        model: { endpoint: 'openrouter/haiku', model: 'haiku-4' },
        configuredModules: [],
        activeModule: { id: 'onion.runescape.standard', version: '0.3.0', source: 'soul', activeFacets: [] },
      },
    }))).toBe('openrouter/haiku | onion.runescape.standard@0.3.0');

    expect(residentStackSummary(row())).toBe('model/endpoint unavailable | SPARK unavailable');
  });

  test('returns the first operator warning as a compact triage signal', () => {
    expect(residentPrimaryWarning(row({
      attention: 1,
      feed: { attached: true, ageMs: 5000, nearby: { players: 0, npcs: 0, objects: 0, worldItems: 0 }, events: 0, availableActions: 0 },
    }))).toEqual({
      tone: 'warn',
      summary: 'AP low (1); top-up may be needed soon.',
      detail: 'Attention is the resident life-force.',
    });
  });

  test('returns one positive operator warning when resident evidence is healthy', () => {
    expect(residentOperatorWarnings(row({
      attention: 100,
      thinking: { mode: 'executing', activePlan: 'Earn GP for AP' },
      body: { controlHeld: true, latestPerception: { resident: { inventory: [{ id: 995, count: 42 }] } } },
      feed: { attached: true, ageMs: 5000, nearby: { players: 0, npcs: 1, objects: 1, worldItems: 0 }, events: 1, availableActions: 6 },
      storyArc: { phase: 'progress', summary: 'Making GP progress.' },
      memory: {
        files: ['facts/economy.md'],
        facts: [{ topic: 'economy', path: 'facts/economy.md', text: 'Coin 995 funds AP.' }],
      },
    }), {
      tone: 'ok',
      summary: 'Latest benchmark passed on ap-gp-library-strategy-5m.',
      detail: 'score 1',
    })).toEqual([
      { tone: 'ok', summary: 'No immediate AP/feed/strategy warnings detected.', detail: 'Resident has current AP, GP, plan, feed, story, and benchmark signals.' },
    ]);
  });

  test('builds a compact resident proof pulse from live loop checkpoints', () => {
    const pulse = residentProofPulse(row({
      attention: 75,
      thinking: { mode: 'executing', activePlan: 'Earn GP for AP' },
      body: {
        controlHeld: true,
        lastAction: { kind: 'pickup_item', result: 'success', source: 'thinking' },
        latestPerception: { resident: { inventory: [{ itemId: 995, amount: 42 }] } },
        feed: {
          attached: true,
          ageMs: 4000,
          nearby: { players: 0, npcs: 1, objects: 0, worldItems: 0 },
          events: 1,
          availableActions: 4,
          latestEventKind: 'say',
          latestEventText: 'I can fund AP from coin 995.',
        },
      },
      memory: {
        files: ['facts/economy.md'],
        facts: [{ topic: 'economy', path: 'facts/economy.md', text: 'Coin 995 funds AP.' }],
      },
    }), {
      benchmark: { tone: 'ok', summary: 'pass', detail: 'score 1' },
      storyteller: { tone: 'ok', summary: 'story grounded' },
      goalContract: { tone: 'ok', summary: 'goal condition present' },
    });

    expect(pulse).toEqual({
      tone: 'ok',
      summary: '9/9 loop proofs live',
      detail: 'all tracked proof signals are live',
    });
  });

  test('flags missing proof checkpoints and offline residents', () => {
    expect(residentProofPulse(row({
      online: false,
      attention: 1,
      thinking: { mode: 'idle', activePlan: '' },
    }), {
      benchmark: { tone: 'warn', summary: 'stale', detail: 'old run' },
      storyteller: { tone: 'warn', summary: 'no digest' },
    })).toEqual({
      tone: 'fail',
      summary: '0/8 loop proofs live',
      detail: 'offline · AP, Plan, Action',
    });
  });

  test('builds city-level proof rollup with top missing signals', () => {
    const rows = [
      row({
        name: 'res:healthy',
        attention: 75,
        thinking: { mode: 'executing', activePlan: 'Earn GP for AP' },
        body: {
          controlHeld: true,
          lastAction: { kind: 'pickup_item', result: 'success', source: 'thinking' },
          latestPerception: { resident: { inventory: [{ itemId: 995, amount: 42 }] } },
          feed: {
            attached: true,
            ageMs: 4000,
            nearby: { players: 0, npcs: 1, objects: 0, worldItems: 0 },
            events: 1,
            availableActions: 4,
            latestEventKind: 'say',
            latestEventText: 'I can fund AP from coin 995.',
          },
        },
        memory: {
          files: ['facts/economy.md'],
          facts: [{ topic: 'economy', path: 'facts/economy.md', text: 'Coin proof collected.' }],
        },
      }),
      row({
        name: 'res:low',
        attention: 1,
        thinking: { mode: 'idle', activePlan: '' },
      }),
    ];

    const rollup = residentProofRollup(rows);
    expect(rollup).toEqual({
      tone: 'warn',
      headline: '1/2 residents have live loop proofs',
      detail: 'Top gaps: AP, Plan, Action',
      actions: [
        {
          label: 'Top up AP',
          tone: 'warn',
          detail: 'Grant AP or pick a stable resident before demoing liveness.',
        },
        {
          label: 'Wake planning',
          tone: 'warn',
          detail: 'Observe or restart thinking until an active plan publishes.',
        },
        {
          label: 'Inspect action loop',
          tone: 'warn',
          detail: 'Open resident detail or runtime logs for failed or missing actions.',
        },
      ],
      healthy: 1,
      warn: 1,
      fail: 0,
      online: 2,
    });
  });

  test('builds a sorted resident liveness ledger with next actions and proof signals', () => {
    const ready = row({
      name: 'res:ready',
      attention: 75,
      stack: {
        model: { endpoint: 'openrouter/haiku', model: 'haiku-4' },
        configuredModules: [],
        activeModule: { id: 'onion.runescape.standard', version: '0.3.0', source: 'soul', activeFacets: [] },
      },
      thinking: { mode: 'executing', activePlan: 'Earn GP for AP' },
      body: {
        controlHeld: true,
        lastAction: { kind: 'pickup_item', result: 'success', source: 'thinking', tick: 100 },
        latestPerception: { resident: { inventory: [{ itemId: 995, amount: 42 }] } },
        feed: {
          attached: true,
          tick: 100,
          ageMs: 4000,
          nearby: { players: 0, npcs: 1, objects: 0, worldItems: 0 },
          events: 1,
          availableActions: 4,
          latestEventKind: 'say',
          latestEventText: 'I can fund AP from coin 995.',
        },
      },
      storyArc: { phase: 'progress', summary: 'Coin proof is live.', latestEventKind: 'gp_observed', latestEventTick: 100 },
      memory: {
        files: ['facts/routes.md'],
        facts: [{ topic: 'routes', path: 'facts/routes.md', text: 'Lumbridge bank is north of the castle.' }],
      },
    });
    const low = row({
      name: 'res:low',
      attention: 1,
      thinking: { mode: 'idle', activePlan: '' },
      body: { controlHeld: true },
    });
    const offline = row({ name: 'res:offline', online: false, attention: 50 });

    const ledger = residentLivenessLedger([ready, low, offline], row =>
      row.name === 'res:ready'
        ? {
          benchmark: { tone: 'ok', summary: 'fresh capability proof', detail: 'passed' },
          storyteller: { tone: 'ok', summary: 'Storyteller cited this resident' },
          goalContract: { tone: 'ok', summary: 'Earn 100 GP/hour' },
        }
        : {},
    );

    expect(ledger.map(entry => entry.residentName)).toEqual(['res:offline', 'res:low', 'res:ready']);
    expect(ledger[0]).toMatchObject({
      tone: 'fail',
      displayName: 'offline',
      status: 'offline',
      nextAction: 'Reconnect resident',
      nextTarget: 'Grant Attention',
    });
    expect(ledger[1]).toMatchObject({
      tone: 'warn',
      displayName: 'low',
      ap: '1 AP',
      gp: 'not observed',
      stack: 'model/endpoint unavailable | SPARK unavailable',
      memory: 'no qmd',
      nextAction: 'Top up AP',
      nextTarget: 'Grant Attention',
    });
    expect(ledger[2]).toMatchObject({
      tone: 'ok',
      displayName: 'ready',
      proof: '9/9 loop proofs live',
      gp: '42 GP',
      stack: 'openrouter/haiku | onion.runescape.standard@0.3.0',
      contract: 'Earn 100 GP/hour',
      memory: 'routes',
      nextAction: 'Keep watching',
      nextTarget: 'Resident Intent',
    });
  });

  test('triages residents whose active goal contract is missing or aspirational', () => {
    const contractOnly = row({
      name: 'res:contract',
      attention: 75,
      thinking: { mode: 'executing', activePlan: 'Earn GP for AP' },
      body: {
        controlHeld: true,
        lastAction: { kind: 'pickup_item', result: 'success', source: 'thinking', tick: 100 },
        latestPerception: { resident: { inventory: [{ itemId: 995, amount: 42 }] } },
        feed: {
          attached: true,
          tick: 100,
          ageMs: 4000,
          nearby: { players: 0, npcs: 1, objects: 0, worldItems: 0 },
          events: 1,
          availableActions: 4,
          latestEventKind: 'say',
          latestEventText: 'I can fund AP from coin 995.',
        },
      },
      storyArc: { phase: 'progress', summary: 'Coin proof is live.', latestEventKind: 'gp_observed', latestEventTick: 100 },
      memory: {
        files: ['facts/economy.md'],
        facts: [{ topic: 'economy', path: 'facts/economy.md', text: 'Coin proof is live.' }],
      },
    });

    const triage = residentTriageSummary([contractOnly], () => ({
      benchmark: { tone: 'ok', summary: 'fresh capability proof', detail: 'passed' },
      storyteller: { tone: 'ok', summary: 'Storyteller cited this resident' },
      goalContract: { tone: 'warn', summary: 'No active goal contract published.' },
    }));

    expect(triage.tone).toBe('warn');
    expect(triage.detail).toBe('Goal contract: 1');
    expect(triage.buckets.find(bucket => bucket.key === 'contract')).toEqual({
      key: 'contract',
      label: 'Goal contract',
      tone: 'warn',
      count: 1,
      residents: ['res:contract'],
      detail: 'Active goal contracts are missing or lack binary completion evidence.',
    });
  });

  test('builds operator triage buckets for quiet, low AP, missing plan, GP, story, and benchmark gaps', () => {
    const rows = [
      row({
        name: 'res:healthy',
        attention: 75,
        thinking: { mode: 'executing', activePlan: 'Earn GP for AP' },
        body: {
          controlHeld: true,
          lastAction: { kind: 'pickup_item', result: 'success', source: 'thinking', tick: 100 },
          latestPerception: { resident: { inventory: [{ itemId: 995, amount: 42 }] } },
          feed: {
            attached: true,
            tick: 100,
            ageMs: 4000,
            nearby: { players: 0, npcs: 1, objects: 0, worldItems: 0 },
            events: 1,
            availableActions: 4,
            latestEventKind: 'say',
            latestEventText: 'I can fund AP from coin 995.',
          },
        },
        storyArc: { phase: 'progress', summary: 'Coin proof is live.', latestEventKind: 'gp_observed', latestEventTick: 100 },
        memory: {
          files: ['facts/economy.md'],
          facts: [{ topic: 'economy', path: 'facts/economy.md', text: 'Coin proof is live.' }],
        },
      }),
      row({
        name: 'res:low',
        attention: 1,
        thinking: { mode: 'idle', activePlan: '' },
        body: {
          controlHeld: true,
          feed: {
            attached: true,
            tick: 200,
            ageMs: 180000,
            nearby: { players: 0, npcs: 0, objects: 0, worldItems: 0 },
            events: 0,
            availableActions: 1,
          },
        },
      }),
      row({ name: 'res:offline', online: false }),
    ];

    const triage = residentTriageSummary(rows, row =>
      row.name === 'res:low'
        ? { benchmark: { tone: 'fail', summary: 'combat failed', detail: 'death loop' } }
        : {},
    );

    expect(triage).toEqual({
      tone: 'fail',
      headline: '2/3 residents need operator attention',
      detail: 'Offline: 1 · Low AP: 1 · Quiet loop: 1',
      urgentResidents: 2,
      totalResidents: 3,
      onlineResidents: 2,
      buckets: [
        {
          key: 'offline',
          label: 'Offline',
          tone: 'fail',
          count: 1,
          residents: ['res:offline'],
          detail: 'Login or AP top-up may be required before new action proof appears.',
        },
        {
          key: 'attention',
          label: 'Low AP',
          tone: 'warn',
          count: 1,
          residents: ['res:low'],
          detail: 'Residents at or near the AP safety floor need support soon.',
        },
        {
          key: 'recovery',
          label: 'Recovery wait',
          tone: 'ok',
          count: 0,
          residents: [],
          detail: 'No residents in this bucket right now.',
        },
        {
          key: 'quiet',
          label: 'Quiet loop',
          tone: 'warn',
          count: 1,
          residents: ['res:low'],
          detail: 'Action, speech, or feed cadence is stale enough to deserve an operator glance.',
        },
        {
          key: 'action',
          label: 'Action outcome',
          tone: 'ok',
          count: 0,
          residents: [],
          detail: 'No residents in this bucket right now.',
        },
        {
          key: 'plan',
          label: 'Missing plan',
          tone: 'warn',
          count: 1,
          residents: ['res:low'],
          detail: 'Thinking has not published a current plan for these residents.',
        },
        {
          key: 'contract',
          label: 'Goal contract',
          tone: 'ok',
          count: 0,
          residents: [],
          detail: 'No residents in this bucket right now.',
        },
        {
          key: 'gp',
          label: 'Missing GP proof',
          tone: 'warn',
          count: 1,
          residents: ['res:low'],
          detail: 'Do not claim GP purchasing power until coin-995 or economy evidence appears.',
        },
        {
          key: 'story',
          label: 'Thin story',
          tone: 'warn',
          count: 1,
          residents: ['res:low'],
          detail: 'Library or Storyteller evidence is not fresh enough to explain the resident.',
        },
        {
          key: 'memory',
          label: 'Thin memory',
          tone: 'warn',
          count: 1,
          residents: ['res:low'],
          detail: 'No qmd facts/*.md memory snippets are visible for these residents.',
        },
        {
          key: 'benchmark',
          label: 'Capability warning',
          tone: 'warn',
          count: 1,
          residents: ['res:low'],
          detail: 'Latest capability benchmark signal is stale, failed, or missing confidence.',
        },
      ],
    });
  });

  test('keeps resident triage steady when economy and storyteller evidence cover missing live snapshots', () => {
    const triage = residentTriageSummary([
      row({
        name: 'res:covered',
        attention: 50,
        thinking: { mode: 'executing', activePlan: 'Trade coin 995 for AP' },
        body: {
          controlHeld: true,
          lastAction: { kind: 'exchange_gp_for_ap', result: 'success', source: 'body', tick: 44 },
          feed: {
            attached: true,
            tick: 44,
            ageMs: 4000,
            nearby: { players: 0, npcs: 1, objects: 0, worldItems: 0 },
            events: 1,
            availableActions: 5,
            latestEventKind: 'say',
            latestEventText: 'The exchange completed.',
          },
        },
        storyArc: { phase: 'progress', latestEventKind: 'city_ap_gp_exchange', latestEventTick: 44 },
        memory: {
          files: ['facts/economy.md'],
          facts: [{ topic: 'economy', path: 'facts/economy.md', text: 'The exchange completed.' }],
        },
      }),
    ], () => ({
      economyGp: { tone: 'ok', summary: 'recent GP exchange', detail: 'city_ap_gp_exchange burned real coin 995' },
      storyteller: { tone: 'ok', summary: 'Storyteller cited this resident' },
      benchmark: { tone: 'ok', summary: 'fresh capability proof', detail: 'passed' },
    }));

    expect(triage.tone).toBe('ok');
    expect(triage.headline).toBe('1/1 residents look steady');
    expect(triage.urgentResidents).toBe(0);
    expect(triage.detail).toBe('All visible residents have AP, cadence, plan, GP/story/memory proof, and capability signals.');
    expect(triage.buckets.every(bucket => bucket.count === 0 && bucket.tone === 'ok')).toBe(true);
  });

  test('selects active triage buckets before clear buckets for truncated strips', () => {
    const triage = residentTriageSummary([
      row({
        name: 'res:needs-proof',
        attention: 75,
        thinking: { mode: 'executing', activePlan: 'Earn GP and make the story visible.' },
        body: {
          controlHeld: true,
          lastAction: { kind: 'move_to', result: 'success', source: 'body', tick: 80 },
          feed: {
            attached: true,
            tick: 80,
            ageMs: 1000,
            nearby: { players: 0, npcs: 1, objects: 2, worldItems: 0 },
            events: 1,
            availableActions: 8,
            latestEventKind: 'movement_progress',
          },
        },
      }),
    ]);

    expect(triage.buckets.slice(0, 4).map(bucket => bucket.key)).toEqual(['offline', 'attention', 'recovery', 'quiet']);
    expect(visibleResidentTriageBuckets(triage, 4).map(bucket => bucket.key)).toEqual(['gp', 'story', 'memory', 'offline']);
  });

  test('parses resident triage focus links from the route query', () => {
    expect(residentTriageFocusFromSearch('?triage=attention')).toBe('attention');
    expect(residentTriageFocusFromSearch('triage=recovery')).toBe('recovery');
    expect(residentTriageFocusFromSearch('?human=guest&triage=quiet')).toBe('quiet');
    expect(residentTriageFocusFromSearch('?triage=memory')).toBe('memory');
    expect(residentTriageFocusFromSearch('?triage=unknown')).toBe('');
    expect(residentTriageFocusFromSearch('?triage=')).toBe('');
  });

  test('buckets low-health wait separately from generic quiet-loop risk', () => {
    const triage = residentTriageSummary([
      row({
        name: 'res:recovering',
        attention: 80,
        thinking: { mode: 'executing', activePlan: 'Recover health before re-engaging.' },
        body: {
          controlHeld: true,
          lastAction: { kind: 'noop', result: 'success', source: 'thinking', cause: 'low_health_heal_wait', tick: 900 },
          latestPerception: { resident: { inventory: [{ itemId: 995, amount: 25 }] } },
          feed: {
            attached: true,
            tick: 900,
            ageMs: 2000,
            nearby: { players: 0, npcs: 1, objects: 0, worldItems: 0 },
            events: 1,
            availableActions: 5,
          },
        },
        progress: {
          samples: 4,
          stuckTicks: 37,
          latest: { meaningful: false, reasons: [], stuckSince: 863, tick: 900 },
        },
        storyArc: { phase: 'progress', summary: 'Combat recovery in progress.', latestEventKind: 'combat_recovery', latestEventTick: 900 },
        memory: {
          files: ['facts/combat.md'],
          facts: [{ topic: 'combat', path: 'facts/combat.md', text: 'Recover health before re-engaging.' }],
        },
      }),
    ], () => ({
      economyGp: { tone: 'ok', summary: 'recent GP evidence', detail: 'coin-995 observed recently' },
      storyteller: { tone: 'ok', summary: 'Storyteller cited recovery' },
      benchmark: { tone: 'ok', summary: 'fresh capability proof', detail: 'passed' },
    }));

    expect(triage.tone).toBe('warn');
    expect(triage.headline).toBe('1/1 residents need operator attention');
    expect(triage.detail).toBe('Recovery wait: 1');
    expect(triage.buckets.find(bucket => bucket.key === 'recovery')).toEqual({
      key: 'recovery',
      label: 'Recovery wait',
      tone: 'warn',
      count: 1,
      residents: ['res:recovering'],
      detail: 'Residents are waiting at low health; inspect food/cook/eat recovery before trusting combat liveness.',
    });
  });

  test('does not invent low-health recovery risk for healthy action causes', () => {
    const healthy = row({
      name: 'res:moving',
      attention: 80,
      thinking: { mode: 'executing', activePlan: 'Walk back to the square.' },
      body: {
        controlHeld: true,
        lastAction: { kind: 'move_to', result: 'success', source: 'thinking', cause: 'goal:patrol', tick: 900 },
        latestPerception: { resident: { inventory: [{ itemId: 995, amount: 25 }] } },
        feed: {
          attached: true,
          tick: 900,
          ageMs: 2000,
          nearby: { players: 0, npcs: 1, objects: 0, worldItems: 0 },
          events: 1,
          availableActions: 5,
          latestEventKind: 'say',
          latestEventText: 'Walking back.',
        },
      },
      storyArc: { phase: 'progress', summary: 'Patrol route visible.', latestEventKind: 'movement_progress', latestEventTick: 900 },
    });
    const triage = residentTriageSummary([healthy], () => ({
      economyGp: { tone: 'ok', summary: 'recent GP evidence', detail: 'coin-995 observed recently' },
      storyteller: { tone: 'ok', summary: 'Storyteller cited movement' },
      benchmark: { tone: 'ok', summary: 'fresh capability proof', detail: 'passed' },
    }));

    expect(triage.buckets.find(bucket => bucket.key === 'recovery')).toMatchObject({ count: 0, tone: 'ok' });
    expect(residentOperatorWarnings(healthy)).not.toContainEqual(expect.objectContaining({
      summary: 'Low-health recovery wait is active.',
    }));
  });

  test('does not call an acting resident quiet just because no fresh speech line is visible', () => {
    const triage = residentTriageSummary([
      row({
        name: 'res:active-but-silent',
        attention: 4000,
        thinking: { mode: 'executing', activePlan: 'Patrol Lumbridge and keep moving.' },
        body: {
          controlHeld: true,
          lastAction: { kind: 'move_to', result: 'success', source: 'body', tick: 100 },
          feed: {
            attached: true,
            tick: 101,
            ageMs: 500,
            nearby: { players: 0, npcs: 1, objects: 2, worldItems: 0 },
            events: 0,
            availableActions: 8,
          },
        },
        storyArc: { phase: 'progress', latestEventKind: 'movement_progress', latestEventTick: 100 },
        memory: {
          files: ['facts/routes.md'],
          facts: [{ topic: 'routes', path: 'facts/routes.md', text: 'Patrol Lumbridge and keep moving.' }],
        },
      }),
    ], () => ({
      economyGp: { tone: 'ok', summary: 'recent GP evidence', detail: 'coin-995 observed recently' },
      storyteller: { tone: 'ok', summary: 'Storyteller cited movement' },
      benchmark: { tone: 'ok', summary: 'fresh capability proof', detail: 'passed' },
    }));

    expect(triage.buckets.find(bucket => bucket.key === 'quiet')).toMatchObject({ count: 0, tone: 'ok' });
    expect(triage.urgentResidents).toBe(0);
  });

  test('adds failed action outcomes to resident triage', () => {
    const triage = residentTriageSummary([
      row({
        name: 'res:timeout',
        attention: 75,
        thinking: { mode: 'executing', activePlan: 'Recover from a stuck combat action' },
        body: {
          controlHeld: true,
          lastAction: { kind: 'attack', result: 'timeout', source: 'body', tick: 300 },
          latestPerception: { resident: { inventory: [{ itemId: 995, amount: 20 }] } },
          feed: {
            attached: true,
            tick: 300,
            ageMs: 2000,
            nearby: { players: 0, npcs: 1, objects: 0, worldItems: 0 },
            events: 1,
            availableActions: 5,
            latestEventKind: 'say',
            latestEventText: 'Still trying.',
          },
        },
        storyArc: { phase: 'progress', summary: 'Combat action was attempted.', latestEventKind: 'combat_started', latestEventTick: 300 },
        memory: {
          files: ['facts/combat.md'],
          facts: [{ topic: 'combat', path: 'facts/combat.md', text: 'Recover from stuck combat action.' }],
        },
      }),
    ], () => ({
      economyGp: { tone: 'ok', summary: 'recent GP evidence', detail: 'coin-995 observed recently' },
      storyteller: { tone: 'ok', summary: 'Storyteller cited combat attempt' },
      benchmark: { tone: 'ok', summary: 'fresh capability proof', detail: 'passed' },
    }));

    expect(triage.tone).toBe('warn');
    expect(triage.headline).toBe('1/1 residents need operator attention');
    expect(triage.detail).toBe('Action outcome: 1');
    expect(triage.buckets.find(bucket => bucket.key === 'action')).toEqual({
      key: 'action',
      label: 'Action outcome',
      tone: 'fail',
      count: 1,
      residents: ['res:timeout'],
      detail: 'Latest action result timed out or failed; inspect before trusting liveness.',
    });
  });

  test('returns syncing rollup when no online residents are visible', () => {
    const rollup = residentProofRollup([
      row({ name: 'res:offline-a', online: false }),
      row({ name: 'res:offline-b', online: false }),
    ]);

    expect(rollup).toEqual({
      tone: 'warn',
      headline: 'No online residents in current snapshot',
      detail: 'Waiting for live AP/GP proof signals.',
      actions: [
        {
          label: 'Reconnect residents',
          tone: 'warn',
          detail: 'Start or reconnect the controller before treating this as live proof.',
        },
      ],
      healthy: 0,
      warn: 0,
      fail: 0,
      online: 0,
    });
  });

  test('builds guest trail facts from aggregate resident loop evidence', () => {
    expect(residentGuestTrailFacts({
      online: 4,
      lowAp: 1,
      planPublished: 3,
      recentAction: 2,
      recoveryWait: 1,
      recoveryWaitResidents: ['res:survivor'],
      recoveryWaitMaxStuckTicks: 37,
      recentSpeech: 1,
      storyEvidence: 2,
      memoryEvidence: 2,
      observedGp: 995,
    })).toEqual([
      { label: 'AP', value: '3/4 stable', detail: '1 low AP', tone: 'warn' },
      { label: 'GP evidence', value: '995 GP', detail: 'coin-995 observed', tone: 'ok' },
      { label: 'Plan', value: '3/4 live', detail: 'current goals residents are pursuing', tone: 'ok' },
      { label: 'Action', value: '2/4 recent', detail: 'latest visible action', tone: 'ok' },
      { label: 'Recovery', value: '1/4 waiting', detail: 'survivor waiting; worst stuck 37 ticks; inspect food/cook/eat recovery before trusting combat liveness', tone: 'warn' },
      { label: 'Speech', value: '1/4 recent', detail: 'latest public say/feed line', tone: 'ok' },
      { label: 'Story', value: '2/4 grounded', detail: 'Library or Storyteller evidence', tone: 'ok' },
      { label: 'Memory', value: '2/4 qmd', detail: 'formal facts/*.md snippets', tone: 'ok' },
    ]);
  });

  test('explains clear recovery in the guest trail guide copy', () => {
    expect(residentGuestTrailGuideCopy({
      online: 4,
      lowAp: 0,
      planPublished: 4,
      recentAction: 4,
      recoveryWait: 0,
      recentSpeech: 2,
      storyEvidence: 3,
      memoryEvidence: 3,
      observedGp: 250,
    })).toEqual({
      tone: 'ok',
      headline: 'Follow AP, GP, plan, action, recovery, speech, story, and memory.',
      detail: 'Recovery is clear when no online resident is waiting at low health. AP is the resident life force; GP still needs coin-995 evidence. Memory is backed by qmd facts/*.md snippets.',
    });
  });

  test('explains active recovery waits in the guest trail guide copy', () => {
    expect(residentGuestTrailGuideCopy({
      online: 6,
      lowAp: 0,
      planPublished: 6,
      recentAction: 6,
      recoveryWait: 4,
      recoveryWaitResidents: ['res:survivor', 'res:guardian', 'res:priest', 'res:scout'],
      recoveryWaitMaxStuckTicks: 37,
      recentSpeech: 2,
      storyEvidence: 4,
      memoryEvidence: 0,
      observedGp: 250,
    })).toEqual({
      tone: 'warn',
      headline: 'Follow AP, GP, plan, action, recovery, speech, story, and memory.',
      detail: 'survivor, guardian +2 more waiting; worst stuck 37 ticks; inspect food/cook/eat recovery before trusting combat liveness. AP, GP, speech, story, and memory still need live proof before demoing liveness.',
    });
  });

  test('keeps the guest trail guide honest while the roster is syncing', () => {
    expect(residentGuestTrailGuideCopy({
      online: 0,
      lowAp: 0,
      planPublished: 0,
      recentAction: 0,
      recentSpeech: 0,
      storyEvidence: 0,
      memoryEvidence: 0,
      observedGp: 0,
    })).toEqual({
      tone: 'warn',
      headline: 'Follow AP, GP, plan, action, recovery, speech, story, and memory.',
      detail: 'Waiting for the live resident roster before reading recovery or demo liveness.',
    });
  });

  test('summarizes the latest normal-life audit when recovery is clear but AP/GP recurrence is absent', () => {
    expect(residentNormalLifeAuditSignal([
      {
        file: 'capability-qa/normal_life_audit_20260531T074740Z.json',
        runId: 'normal_life_audit_20260531T074740Z',
        task: { id: 'normal-life-audit' },
        module: { id: 'ordinary-life' },
        mode: 'autonomous',
        resident: 'multi-resident',
        startedAt: '2026-05-31T07:27:39.000Z',
        endedAt: '2026-05-31T07:47:39.000Z',
        status: 'passed',
        score: 1,
        metrics: {
          totalActionAttempts: 2677,
          successfulActionSubmissions: 2677,
          failedActionSubmissions: 0,
          cause_low_health_heal_wait: 0,
          timeline_city_ap_gp_exchange: 0,
          timeline_trade_completed: 0,
          timeline_stuck_detected: 592,
          timeline_stuck_recovered: 590,
        },
      },
    ])).toEqual({
      tone: 'warn',
      summary: 'Recovery clear; AP/GP recurrence not observed.',
      detail: '20m audit: 2677/2677 actions, low-health waits 0, AP/GP exchanges 0, trade closures 0, stuck recovered 590/592.',
    });
  });

  test('keeps normal-life audit caveats honest when AP/GP recurrence is controlled-only', () => {
    expect(residentNormalLifeAuditSignal([
      {
        file: 'capability-qa/normal_life_audit_20260531T090612Z.json',
        runId: 'normal_life_audit_20260531T090612Z',
        task: { id: 'normal-life-audit' },
        module: { id: 'ordinary-life' },
        mode: 'autonomous',
        resident: 'multi-resident',
        startedAt: '2026-05-31T08:50:00.000Z',
        endedAt: '2026-05-31T09:10:00.000Z',
        status: 'passed',
        score: 1,
        metrics: {
          totalActionAttempts: 1283,
          successfulActionSubmissions: 1283,
          failedActionSubmissions: 0,
          cause_low_health_heal_wait: 0,
          timeline_city_ap_gp_exchange: 1,
          timeline_trade_completed: 0,
          timeline_stuck_detected: 79,
          timeline_stuck_recovered: 76,
          recurrence_ap_gp_exchange_events: 1,
          recurrence_trade_completed: 0,
          economy_organic_self_initiated_ap_gp_exchange_events: 0,
          economy_controlled_ap_gp_exchange_events: 1,
        },
      },
    ])).toEqual({
      tone: 'warn',
      summary: 'AP/GP recurrence is controlled-only in latest audit.',
      detail: '20m audit: 1283/1283 actions, low-health waits 0, AP/GP exchanges 1, organic AP/GP 0, controlled AP/GP 1, trade closures 0, stuck recovered 76/79.',
    });
  });

  test('warns when organic AP/GP recurrence appears without trade closures', () => {
    expect(residentNormalLifeAuditSignal([
      {
        file: 'capability-qa/normal_life_audit_20260531T093212Z.json',
        runId: 'normal_life_audit_20260531T093212Z',
        task: { id: 'normal-life-audit' },
        module: { id: 'ordinary-life' },
        mode: 'autonomous',
        resident: 'multi-resident',
        startedAt: '2026-05-31T09:00:30.000Z',
        endedAt: '2026-05-31T09:31:53.000Z',
        status: 'passed',
        score: 1,
        metrics: {
          totalActionAttempts: 3391,
          successfulActionSubmissions: 3391,
          failedActionSubmissions: 0,
          cause_low_health_heal_wait: 0,
          timeline_city_ap_gp_exchange: 3,
          timeline_trade_completed: 0,
          timeline_stuck_detected: 237,
          timeline_stuck_recovered: 183,
          recurrence_ap_gp_exchange_events: 3,
          recurrence_trade_completed: 0,
          economy_organic_self_initiated_ap_gp_exchange_events: 3,
          economy_controlled_ap_gp_exchange_events: 0,
        },
      },
    ])).toEqual({
      tone: 'warn',
      summary: 'Organic AP/GP recurrence appears, but trade closures are still absent.',
      detail: '31m audit: 3391/3391 actions, low-health waits 0, AP/GP exchanges 3, organic AP/GP 3, controlled AP/GP 0, trade closures 0, stuck recovered 183/237.',
    });
  });

  test('includes top stuck-churn residents when the latest audit exposes attribution', () => {
    expect(residentNormalLifeAuditSignal([
      {
        file: 'capability-qa/normal_life_audit_20260531T111938Z.json',
        runId: 'normal_life_audit_20260531T111938Z',
        task: { id: 'normal-life-audit' },
        module: { id: 'ordinary-life' },
        mode: 'autonomous',
        resident: 'multi-resident',
        startedAt: '2026-05-31T10:19:38.000Z',
        endedAt: '2026-05-31T11:19:38.000Z',
        status: 'passed',
        score: 1,
        metrics: {
          totalActionAttempts: 6914,
          successfulActionSubmissions: 6914,
          failedActionSubmissions: 0,
          cause_low_health_heal_wait: 0,
          timeline_city_ap_gp_exchange: 0,
          timeline_trade_completed: 0,
          timeline_stuck_detected: 542,
          timeline_stuck_recovered: 435,
        },
        evidenceSummaries: [
          'normal-life audit: 23 active residents, 6914/6914 actions, low-health waits 0, AP/GP exchanges 0, stuck recovered 435/542',
          'top stuck churn: qa-trader 122 (61 detected/61 recovered), agent 119 (64 detected/55 recovered), qa-social 117 (62 detected/55 recovered)',
        ],
      },
    ])).toEqual({
      tone: 'warn',
      summary: 'Recovery clear; AP/GP recurrence not observed.',
      detail: '60m audit: 6914/6914 actions, low-health waits 0, AP/GP exchanges 0, trade closures 0, stuck recovered 435/542. Top stuck churn: qa-trader 122 (61 detected/61 recovered), agent 119 (64 detected/55 recovered), qa-social 117 (62 detected/55 recovered).',
    });
  });

  test('warns when the latest normal-life audit still has recovery waits', () => {
    expect(residentNormalLifeAuditSignal([
      {
        file: 'capability-qa/normal_life_audit_20260531T070509Z.json',
        runId: 'normal_life_audit_20260531T070509Z',
        task: { id: 'normal-life-audit' },
        module: { id: 'ordinary-life' },
        mode: 'autonomous',
        resident: 'multi-resident',
        startedAt: '2026-05-31T06:45:09.000Z',
        endedAt: '2026-05-31T07:05:09.000Z',
        status: 'passed',
        score: 1,
        metrics: {
          totalActionAttempts: 5285,
          successfulActionSubmissions: 5285,
          failedActionSubmissions: 0,
          cause_low_health_heal_wait: 3021,
          timeline_city_ap_gp_exchange: 0,
          timeline_trade_completed: 0,
          timeline_stuck_detected: 31,
          timeline_stuck_recovered: 29,
        },
      },
    ])).toEqual({
      tone: 'warn',
      summary: 'Recovery waits still visible in latest audit.',
      detail: '20m audit: 5285/5285 actions, low-health waits 3021, AP/GP exchanges 0, trade closures 0, stuck recovered 29/31.',
    });
  });

  test('marks normal-life audit signal healthy when recovery and AP/GP recurrence both appear', () => {
    expect(residentNormalLifeAuditSignal([
      {
        file: 'capability-qa/normal_life_audit_20260531T080000Z.json',
        runId: 'normal_life_audit_20260531T080000Z',
        task: { id: 'normal-life-audit' },
        module: { id: 'ordinary-life' },
        mode: 'autonomous',
        resident: 'multi-resident',
        startedAt: '2026-05-31T07:40:00.000Z',
        endedAt: '2026-05-31T08:00:00.000Z',
        status: 'passed',
        score: 1,
        metrics: {
          totalActionAttempts: 300,
          successfulActionSubmissions: 300,
          failedActionSubmissions: 0,
          cause_low_health_heal_wait: 0,
          timeline_city_ap_gp_exchange: 2,
          timeline_trade_completed: 1,
          timeline_stuck_detected: 5,
          timeline_stuck_recovered: 5,
        },
      },
    ])).toEqual({
      tone: 'ok',
      summary: 'Normal-life audit shows recovery and AP/GP recurrence.',
      detail: '20m audit: 300/300 actions, low-health waits 0, AP/GP exchanges 2, trade closures 1, stuck recovered 5/5.',
    });
  });

  test('keeps normal-life audit signal honest when no audit artifact is visible', () => {
    expect(residentNormalLifeAuditSignal([])).toEqual({
      tone: 'warn',
      summary: 'No normal-life audit visible yet.',
      detail: 'Run or sync a CQA10 normal-life audit before treating resident recurrence as proven.',
    });
  });

  test('summarizes multiple recovery-wait residents without overflowing the activity tile', () => {
    expect(residentGuestTrailFacts({
      online: 6,
      lowAp: 0,
      planPublished: 6,
      recentAction: 6,
      recoveryWait: 4,
      recoveryWaitResidents: ['res:survivor', 'res:guardian', 'res:priest', 'res:scout'],
      recoveryWaitMaxStuckTicks: 1,
      recentSpeech: 2,
      storyEvidence: 4,
      observedGp: 250,
    }).find(fact => fact.label === 'Recovery')).toEqual({
      label: 'Recovery',
      value: '4/6 waiting',
      detail: 'survivor, guardian +2 more waiting; worst stuck 1 tick; inspect food/cook/eat recovery before trusting combat liveness',
      tone: 'warn',
    });
  });

  test('marks guest trail recovery as clear when no online residents are waiting', () => {
    expect(residentGuestTrailFacts({
      online: 4,
      lowAp: 0,
      planPublished: 4,
      recentAction: 4,
      recoveryWait: 0,
      recentSpeech: 2,
      storyEvidence: 3,
      observedGp: 250,
    }).find(fact => fact.label === 'Recovery')).toEqual({
      label: 'Recovery',
      value: '0/4 waiting',
      detail: 'no low-health recovery waits visible',
      tone: 'ok',
    });
  });

  test('builds guest trail pulse from online resident evidence only', () => {
    expect(residentGuestTrailPulse([
      row({
        online: true,
        attention: 20,
        thinking: { mode: 'executing', activePlan: 'Gather coin 995' },
        body: {
          controlHeld: true,
          lastAction: { kind: 'pickup_item', result: 'success', source: 'thinking', tick: 12 },
          latestPerception: { resident: { inventory: [{ itemId: 995, amount: 17 }] } },
          feed: {
            attached: true,
            tick: 12,
            ageMs: 1000,
            nearby: { players: 0, npcs: 0, objects: 0, worldItems: 0 },
            events: 1,
            availableActions: 3,
            latestEventKind: 'say',
            latestEventText: 'Found some coin.',
          },
        },
        memory: {
          files: ['facts/routes.md'],
          facts: [{ topic: 'routes', path: 'facts/routes.md', text: 'The bank is west.' }],
        },
        storyArc: { phase: 'progress', latestEventKind: 'coin_pickup', latestEventTick: 12 },
      }),
      row({
        name: 'res:offline',
        online: false,
        attention: 0,
        thinking: { mode: 'executing', activePlan: 'This should not inflate the public denominator' },
        body: {
          controlHeld: true,
          lastAction: { kind: 'move_to', result: 'success', source: 'thinking', tick: 12 },
          latestPerception: { resident: { inventory: [{ itemId: 995, amount: 999 }] } },
        },
        storyArc: { phase: 'progress', latestEventKind: 'offline_event', latestEventTick: 12 },
      }),
    ])).toEqual({
      online: 1,
      lowAp: 0,
      planPublished: 1,
      recentAction: 1,
      recoveryWait: 0,
      recentSpeech: 1,
      storyEvidence: 1,
      memoryEvidence: 1,
      observedGp: 17,
    });
  });

  test('counts low-health recovery waits in guest trail pulse for online residents only', () => {
    const pulse = residentGuestTrailPulse([
      row({
        name: 'res:survivor',
        online: true,
        body: {
          controlHeld: true,
          lastAction: { kind: 'noop', result: 'success', source: 'thinking', cause: 'low_health_heal_wait' },
        },
        progress: { samples: 3, stuckTicks: 37, latest: { meaningful: false, reasons: [], stuckSince: 100, tick: 137 } },
      }),
      row({
        name: 'res:guardian',
        online: true,
        body: {
          controlHeld: true,
          lastAction: { kind: 'noop', result: 'success', source: 'thinking', ruleId: 'low_health_hold_position' },
        },
        progress: { samples: 3, stuckTicks: 12, latest: { meaningful: false, reasons: [], stuckSince: 120, tick: 132 } },
      }),
      row({
        name: 'res:priest',
        online: true,
        thinking: { mode: 'executing', lastInferenceCause: 'runescape:low-health-stranded' },
      }),
      row({
        name: 'res:offline',
        online: false,
        body: {
          controlHeld: true,
          lastAction: { kind: 'noop', result: 'success', source: 'thinking', cause: 'low_health_heal_wait' },
        },
        progress: { samples: 3, stuckTicks: 99, latest: { meaningful: false, reasons: [], stuckSince: 40, tick: 139 } },
      }),
    ]);

    expect(pulse.online).toBe(3);
    expect(pulse.recoveryWait).toBe(3);
    expect(pulse.recoveryWaitResidents).toEqual(['res:survivor', 'res:guardian', 'res:priest']);
    expect(pulse.recoveryWaitMaxStuckTicks).toBe(37);
  });

  test('marks guest trail facts as syncing while resident data is unavailable', () => {
    expect(residentGuestTrailFacts({
      online: 0,
      lowAp: 0,
      planPublished: 0,
      recentAction: 0,
      recentSpeech: 0,
      storyEvidence: 0,
      memoryEvidence: 0,
      observedGp: 0,
    })).toEqual([
      { label: 'AP', value: 'syncing', detail: 'waiting for live resident roster', tone: 'warn' },
      { label: 'GP evidence', value: '0 GP', detail: 'no coin-995 evidence yet', tone: 'warn' },
      { label: 'Plan', value: '0 live', detail: 'current goals residents are pursuing', tone: 'warn' },
      { label: 'Action', value: '0 recent', detail: 'latest visible action', tone: 'warn' },
      { label: 'Recovery', value: 'syncing', detail: 'waiting for live resident roster', tone: 'warn' },
      { label: 'Speech', value: '0 recent', detail: 'latest public say/feed line', tone: 'warn' },
      { label: 'Story', value: '0 grounded', detail: 'Library or Storyteller evidence', tone: 'warn' },
      { label: 'Memory', value: 'syncing', detail: 'waiting for qmd facts/*.md snippets', tone: 'warn' },
    ]);
  });

  test('clamps guest trail facts so bad upstream counts never render negative proof', () => {
    expect(residentGuestTrailFacts({
      online: -2,
      lowAp: -1,
      planPublished: -4,
      recentAction: -5,
      recoveryWait: -6,
      recentSpeech: -6,
      storyEvidence: -7,
      memoryEvidence: -8,
      observedGp: -995,
    })).toEqual([
      { label: 'AP', value: 'syncing', detail: 'waiting for live resident roster', tone: 'warn' },
      { label: 'GP evidence', value: '0 GP', detail: 'no coin-995 evidence yet', tone: 'warn' },
      { label: 'Plan', value: '0 live', detail: 'current goals residents are pursuing', tone: 'warn' },
      { label: 'Action', value: '0 recent', detail: 'latest visible action', tone: 'warn' },
      { label: 'Recovery', value: 'syncing', detail: 'waiting for live resident roster', tone: 'warn' },
      { label: 'Speech', value: '0 recent', detail: 'latest public say/feed line', tone: 'warn' },
      { label: 'Story', value: '0 grounded', detail: 'Library or Storyteller evidence', tone: 'warn' },
      { label: 'Memory', value: 'syncing', detail: 'waiting for qmd facts/*.md snippets', tone: 'warn' },
    ]);
  });

  test('builds a resident detail liveness summary from AP, GP, plan, action, speech, and story proof', () => {
    const resident = row({
      name: 'res:ready',
      attention: 75,
      thinking: { mode: 'executing', activePlan: 'Earn GP for AP' },
      stack: {
        model: { endpoint: 'openrouter/haiku', model: 'haiku-4' },
        configuredModules: [],
        activeModule: { id: 'onion.runescape.standard', version: '0.3.0', source: 'soul', activeFacets: [] },
      },
      body: {
        controlHeld: true,
        lastAction: { kind: 'pickup_item', result: 'success', source: 'thinking', tick: 100 },
        latestPerception: { resident: { inventory: [{ itemId: 995, amount: 42 }] } },
        feed: {
          attached: true,
          tick: 100,
          ageMs: 4000,
          nearby: { players: 0, npcs: 1, objects: 0, worldItems: 0 },
          events: 1,
          availableActions: 4,
          latestEventKind: 'say',
          latestEventText: 'I can fund AP from coin 995.',
        },
      },
      storyArc: { phase: 'progress', summary: 'Coin proof is live.', latestEventKind: 'gp_observed', latestEventTick: 100 },
      memory: {
        files: ['facts/economy.md'],
        facts: [{ topic: 'economy', path: 'facts/economy.md', text: 'Coin 995 funds AP.' }],
      },
    });

    const detail = residentLivenessDetail(resident, {
      benchmark: { tone: 'ok', summary: 'fresh capability proof', detail: 'passed' },
      goalContract: { tone: 'ok', summary: 'goal contract live' },
      storyteller: { tone: 'ok', summary: 'Storyteller cited this resident' },
    });

    expect(detail).toMatchObject({
      residentName: 'res:ready',
      displayName: 'ready',
      tone: 'ok',
      headline: '9/9 loop proofs live',
      moment: 'Said: I can fund AP from coin 995.',
      nextAction: 'Keep watching',
      nextTarget: 'Resident Intent',
    });
    expect(detail.facts.map(fact => fact.label)).toEqual(['AP runway', 'GP proof', 'Stack', 'Plan', 'Action', 'Speech', 'Story', 'Memory']);
    expect(detail.facts.find(fact => fact.label === 'GP proof')).toMatchObject({
      value: '42 GP',
      tone: 'ok',
    });
    expect(detail.facts.find(fact => fact.label === 'Plan')).toMatchObject({
      value: 'Earn GP for AP',
      detail: 'mode executing',
      tone: 'ok',
    });
    expect(detail.facts.find(fact => fact.label === 'Stack')).toMatchObject({
      value: 'openrouter/haiku | onion.runescape.standard@0.3.0',
      detail: 'model/endpoint and SPARK module identity',
      tone: 'ok',
    });
  });

  test('uses qmd fact memory when Library story memory is thin', () => {
    const memory = residentMemoryFreshness(row({
      memory: {
        files: ['facts/routes.md'],
        facts: [
          {
            topic: 'routes',
            path: 'facts/routes.md',
            timestamp: '2026-05-31T14:45:00.000Z',
            text: 'Lumbridge cow pen is safer than goblins for weak residents.',
          },
        ],
      },
    }));

    expect(memory).toEqual({
      label: 'fresh',
      summary: 'Lumbridge cow pen is safer than goblins for weak residents.',
      detail: 'qmd fact | routes | facts/routes.md | 2026-05-31T14:45:00.000Z',
      tone: 'ok',
    });
  });

  test('builds qmd memory evidence facts for resident detail', () => {
    expect(residentMemoryEvidenceFacts(row({
      memory: {
        files: ['facts/routes.md', 'facts/social.md'],
        facts: [
          {
            topic: 'routes',
            path: 'facts/routes.md',
            timestamp: '2026-05-31T14:45:00.000Z',
            text: 'Lumbridge cow pen is safer than goblins for weak residents.',
          },
          {
            topic: 'social',
            path: 'facts/social.md',
            timestamp: '2026-05-31T14:41:00.000Z',
            text: 'res:qa-scout said they found 21 trees near the river.',
          },
          {
            topic: 'skills',
            path: 'facts/skills.md',
            timestamp: '2026-05-31T14:40:00.000Z',
            text: 'Woodcutting gives reliable logs near Lumbridge.',
          },
        ],
      },
    }), 2)).toEqual([
      {
        label: 'routes',
        value: 'Lumbridge cow pen is safer than goblins for weak residents.',
        detail: 'facts/routes.md | 2026-05-31T14:45:00.000Z',
        tone: 'ok',
      },
      {
        label: 'social',
        value: 'res:qa-scout said they found 21 trees near the river.',
        detail: 'facts/social.md | 2026-05-31T14:41:00.000Z',
        tone: 'ok',
      },
    ]);

    expect(residentMemoryEvidenceFacts(row())).toEqual([
      {
        label: 'Memory',
        value: 'No qmd facts',
        detail: 'No formal facts/*.md memory snippets yet.',
        tone: 'warn',
      },
    ]);
  });
});
