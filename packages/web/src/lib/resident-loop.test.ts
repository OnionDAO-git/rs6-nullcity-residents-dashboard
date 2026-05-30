import { describe, expect, test } from 'bun:test';
import type { ResidentDashboardRow } from '@nullcity-dashboard/shared';
import {
  residentGoldEvidenceLabel,
  residentIntelligenceFacts,
  residentLoopSummaryLine,
  residentNeedsAp,
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
      thinking: { mode: 'deciding' },
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
    expect(residentLoopSummaryLine(low)).toContain('needs AP');
    expect(residentLoopSummaryLine(row({ attention: 100 }))).toContain('GP unobserved');
  });
});
