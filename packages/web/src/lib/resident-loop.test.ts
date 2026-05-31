import { describe, expect, test } from 'bun:test';
import type { ResidentDashboardRow } from '@nullcity-dashboard/shared';
import {
  residentAgencyCue,
  residentCoinEvidenceAmount,
  residentGoldEvidenceLabel,
  residentGuestTrailFacts,
  residentGuestTrailPulse,
  residentIntelligenceFacts,
  residentIntentFacts,
  residentLoopCheckpoints,
  residentLoopSignal,
  residentLoopSummaryLine,
  residentNeedsAp,
  residentOperatorWarnings,
  residentProofPulse,
  residentProofRollup,
  residentPrimaryWarning,
  residentPublicStateTiles,
  residentStackSummary,
  residentTriageSummary,
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
      { label: 'Model', value: 'spacetower', detail: 'qwopus3.5-27b-v3@q4_k_s' },
      { label: 'SPARK', value: 'onion.runescape.standard@0.2.0', detail: 'soul' },
      { label: 'Goal', value: 'Find a way to buy AP with GP', detail: 'plan' },
      { label: 'Thinking', value: 'deciding', detail: '-' },
      { label: 'Last action', value: 'say', detail: 'success | nervous-system | nervous:request-attention' },
      { label: 'Story', value: 'progress', detail: 'city_attention_credit @ 99' },
      { label: 'Feed', value: 'live', detail: '2s old | 8 actions | p1 n2 o3 i4', tone: 'ok' },
      { label: 'GP evidence', value: 'not observed', detail: 'No coin-995 inventory evidence in latest dashboard snapshot', tone: 'warn' },
    ]);
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

  test('builds public state tiles that foreground AP, support need, and GP evidence', () => {
    expect(residentPublicStateTiles(row({
      attention: 2,
      body: { controlHeld: true, latestPerception: { resident: { inventory: [{ itemId: 995, amount: 37 }] } } },
    }))).toEqual([
      { label: 'Status', value: 'online', detail: 'live resident', tone: 'ok' },
      { label: 'AP', value: '2 AP', detail: 'Attention Points are low; this resident needs support soon.', tone: 'warn' },
      { label: 'Support need', value: 'AP support', detail: 'Resident is at or below the AP safety floor.', tone: 'warn' },
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
      { label: 'Needs', value: 'AP support', detail: '2 AP · GP not observed', tone: 'warn' },
      { label: 'Did', value: 'pickup_item', detail: 'success | thinking | goal:ap-gp | tick 2048 (current)', tone: 'ok' },
      { label: 'Said', value: 'I need AP, but coin 995 is nearby.', detail: 'live speech in feed | tick 2048 (current)', tone: 'ok' },
      { label: 'Remembers', value: 'The resident is turning patron support into visible progress.', detail: 'City dispatch cited this resident.', tone: 'ok' },
    ]);
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
    }), {
      economyGp: { tone: 'ok', summary: 'Recent economy GP evidence is available.', detail: 'ap_gp_exchange: exchanged 10 GP for 20 AP' },
    })).toEqual({
      tone: 'ok',
      summary: '5/5 loop proofs live',
      detail: 'all tracked proof signals are live',
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
    }), {
      benchmark: { tone: 'ok', summary: 'pass', detail: 'score 1' },
      storyteller: { tone: 'ok', summary: 'story grounded' },
      goalContract: { tone: 'ok', summary: 'goal condition present' },
    })).toEqual({
      tone: 'fail',
      summary: '7/8 loop proofs live',
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
    }), {
      benchmark: { tone: 'ok', summary: 'pass', detail: 'score 1' },
      storyteller: { tone: 'ok', summary: 'story grounded' },
      goalContract: { tone: 'ok', summary: 'goal condition present' },
    });

    expect(pulse).toEqual({
      tone: 'ok',
      summary: '8/8 loop proofs live',
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
      summary: '0/7 loop proofs live',
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
          detail: 'Residents at or below the AP safety floor need support soon.',
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
      }),
    ], () => ({
      economyGp: { tone: 'ok', summary: 'recent GP exchange', detail: 'city_ap_gp_exchange burned real coin 995' },
      storyteller: { tone: 'ok', summary: 'Storyteller cited this resident' },
      benchmark: { tone: 'ok', summary: 'fresh capability proof', detail: 'passed' },
    }));

    expect(triage.tone).toBe('ok');
    expect(triage.headline).toBe('1/1 residents look steady');
    expect(triage.urgentResidents).toBe(0);
    expect(triage.detail).toBe('All visible residents have AP, cadence, plan, GP/story proof, and capability signals.');
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

    expect(triage.buckets.slice(0, 4).map(bucket => bucket.key)).toEqual(['offline', 'attention', 'quiet', 'action']);
    expect(visibleResidentTriageBuckets(triage, 4).map(bucket => bucket.key)).toEqual(['gp', 'story', 'offline', 'attention']);
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
      recentSpeech: 1,
      storyEvidence: 2,
      observedGp: 995,
    })).toEqual([
      { label: 'AP', value: '3/4 stable', detail: '1 low AP', tone: 'warn' },
      { label: 'GP evidence', value: '995 GP', detail: 'coin-995 observed', tone: 'ok' },
      { label: 'Plan', value: '3/4 live', detail: 'current goals residents are pursuing', tone: 'ok' },
      { label: 'Action', value: '2/4 recent', detail: 'latest visible action', tone: 'ok' },
      { label: 'Speech', value: '1/4 recent', detail: 'latest public say/feed line', tone: 'ok' },
      { label: 'Story', value: '2/4 grounded', detail: 'Library or Storyteller evidence', tone: 'ok' },
    ]);
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
      recentSpeech: 1,
      storyEvidence: 1,
      observedGp: 17,
    });
  });

  test('marks guest trail facts as syncing while resident data is unavailable', () => {
    expect(residentGuestTrailFacts({
      online: 0,
      lowAp: 0,
      planPublished: 0,
      recentAction: 0,
      recentSpeech: 0,
      storyEvidence: 0,
      observedGp: 0,
    })).toEqual([
      { label: 'AP', value: 'syncing', detail: 'waiting for live resident roster', tone: 'warn' },
      { label: 'GP evidence', value: '0 GP', detail: 'no coin-995 evidence yet', tone: 'warn' },
      { label: 'Plan', value: '0 live', detail: 'current goals residents are pursuing', tone: 'warn' },
      { label: 'Action', value: '0 recent', detail: 'latest visible action', tone: 'warn' },
      { label: 'Speech', value: '0 recent', detail: 'latest public say/feed line', tone: 'warn' },
      { label: 'Story', value: '0 grounded', detail: 'Library or Storyteller evidence', tone: 'warn' },
    ]);
  });

  test('clamps guest trail facts so bad upstream counts never render negative proof', () => {
    expect(residentGuestTrailFacts({
      online: -2,
      lowAp: -1,
      planPublished: -4,
      recentAction: -5,
      recentSpeech: -6,
      storyEvidence: -7,
      observedGp: -995,
    })).toEqual([
      { label: 'AP', value: 'syncing', detail: 'waiting for live resident roster', tone: 'warn' },
      { label: 'GP evidence', value: '0 GP', detail: 'no coin-995 evidence yet', tone: 'warn' },
      { label: 'Plan', value: '0 live', detail: 'current goals residents are pursuing', tone: 'warn' },
      { label: 'Action', value: '0 recent', detail: 'latest visible action', tone: 'warn' },
      { label: 'Speech', value: '0 recent', detail: 'latest public say/feed line', tone: 'warn' },
      { label: 'Story', value: '0 grounded', detail: 'Library or Storyteller evidence', tone: 'warn' },
    ]);
  });
});
