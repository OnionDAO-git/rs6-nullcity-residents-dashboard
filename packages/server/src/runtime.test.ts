import { describe, expect, test } from 'bun:test';
import { buildSparkRuntimeSummary } from './runtime';

describe('buildSparkRuntimeSummary', () => {
  test('exposes the latest SPARK module identity and active facets from runtime logs', () => {
    const summary = buildSparkRuntimeSummary(
      [
        {
          t: '2026-05-20T17:43:10.000Z',
          source: 'thinking',
          sparkModule: { id: 'onion.runescape.standard', version: '0.1.0' },
          action: { kind: 'move_to' },
        },
      ],
      [
        {
          t: '2026-05-20T17:43:38.000Z',
          cause: 'body_wait',
          sparkModule: { id: 'onion.runescape.standard', version: '0.1.0' },
        },
      ],
    );

    expect(summary.activeModule).toEqual({
      id: 'onion.runescape.standard',
      version: '0.1.0',
      source: 'inference-log',
      activeFacets: ['thinking'],
      lastSeenAt: '2026-05-20T17:43:38.000Z',
    });
    expect(summary.modules).toHaveLength(1);
  });
});
