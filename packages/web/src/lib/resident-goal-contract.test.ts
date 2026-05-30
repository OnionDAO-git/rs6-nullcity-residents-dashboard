import { describe, expect, test } from 'bun:test';
import type { ResidentEconomy } from './api';
import { residentGoalContractSignal } from './resident-goal-contract';

function economy(overrides: Partial<ResidentEconomy> = {}): ResidentEconomy {
  return {
    ap: 125,
    recentEvents: [],
    activeGoals: [],
    ...overrides,
  };
}

describe('residentGoalContractSignal', () => {
  test('returns a warning when economy projection is unavailable', () => {
    expect(residentGoalContractSignal(undefined)).toEqual({
      tone: 'warn',
      summary: 'Goal contract feed unavailable.',
      detail: 'Controller economy projection has not published active goal contract data yet.',
    });
  });

  test('returns an ok signal for a binary completion goal contract', () => {
    const signal = residentGoalContractSignal(economy({
      ap: 200,
      recentEvents: [
        { id: '1', ts: '2026-05-30T20:00:00.000Z', kind: 'ap_topup', apDelta: 50 },
      ],
      activeGoals: [
        {
          id: 'goal-1',
          goalText: 'Earn 100 GP/hour and write the strategy into the Library.',
          completion: {
            condition: 'gp_hour >= 100',
            evidenceSource: 'runtime:bank-balance',
          },
        },
      ],
    }));

    expect(signal.tone).toBe('ok');
    expect(signal.summary).toBe('Earn 100 GP/hour and write the strategy into the Library.');
    expect(signal.detail).toContain('Condition: gp_hour >= 100');
    expect(signal.detail).toContain('Evidence: runtime:bank-balance');
    expect(signal.detail).toContain('AP 200');
    expect(signal.detail).toContain('ap_topup (+50 AP)');
  });

  test('warns when only aspirational goals exist', () => {
    const signal = residentGoalContractSignal(economy({
      ap: 15,
      recentEvents: [
        { id: '1', ts: '2026-05-30T20:00:00.000Z', kind: 'ap_decay', apDelta: -4 },
      ],
      activeGoals: [{ id: 'goal-2', goalText: 'Become known as the city chef.' }],
    }));

    expect(signal).toEqual({
      tone: 'warn',
      summary: 'Become known as the city chef.',
      detail: 'Aspirational goal without binary completion evidence. AP 15 · ap_decay (-4 AP)',
    });
  });
});
