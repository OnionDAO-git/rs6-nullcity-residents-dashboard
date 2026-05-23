import { describe, expect, test } from 'bun:test';
import type { BenchmarkEvidence } from '@nullcity-dashboard/shared';
import { benchmarkActionRows } from './benchmarks';

describe('benchmarkActionRows', () => {
  test('summarizes final action-effect evidence for benchmark detail views', () => {
    const evidence: BenchmarkEvidence = {
      actionAttempts: [
        {
          requestId: 'controller-1',
          actionKind: 'use_item_on_item',
          source: 'body',
          cause: 'woodcutting_chain_firemaking',
          ok: true,
          finalStatus: 'success',
          evidenceCount: 1,
          effectEvidenceCount: 1,
          sparkModule: { id: 'onion.runescape.standard', version: '0.1.0' },
        },
      ],
    };

    expect(benchmarkActionRows(evidence)).toEqual([
      {
        key: 'controller-1',
        actionLabel: 'use item on item',
        statusLabel: 'success',
        effectLabel: '1 effect',
        detail: 'body | woodcutting_chain_firemaking | onion.runescape.standard@0.1.0 | 1 evidence',
        ok: true,
      },
    ]);
  });

  test('returns an empty list when a run has no structured action attempts', () => {
    expect(benchmarkActionRows({ summaries: ['made fire'] })).toEqual([]);
  });
});
