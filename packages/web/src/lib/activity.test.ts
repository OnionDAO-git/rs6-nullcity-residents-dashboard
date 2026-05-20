import { describe, expect, test } from 'bun:test';
import type { RuntimeReadModel, SpectatorSession } from '@nullcity-dashboard/shared';
import { buildActivitySnapshot } from './activity';

const now = new Date('2026-05-20T17:44:00.000Z').getTime();

function runtime(overrides: Partial<RuntimeReadModel> = {}): RuntimeReadModel {
  return {
    available: true,
    online: true,
    thinking: {
      mode: 'idle',
      lastInferenceCause: 'body_wait',
      latestInference: {
        t: '2026-05-20T17:43:38.000Z',
        cause: 'body_wait',
        nooped: true,
      },
    },
    nervous: {},
    body: {
      controlHeld: true,
      lastAction: { kind: 'interact' },
      gatewayHealthy: true,
    },
    memory: { files: [] },
    logs: {
      actions: [
        {
          t: '2026-05-20T17:43:10.000Z',
          source: 'thinking',
          action: {
            kind: 'interact',
            option: 'chop down',
            target: { objectId: 1278, position: { x: 3225, y: 3232, level: 0 } },
          },
          result: { ok: true },
        },
      ],
      inference: [],
    },
    errors: [],
    ...overrides,
  };
}

function session(position = { x: 3226, y: 3231, level: 0 }): SpectatorSession {
  return {
    id: 'session-1',
    subject: { kind: 'resident', name: 'res:agent' },
    mode: 'follow',
    connected: true,
    position,
  };
}

describe('buildActivitySnapshot', () => {
  test('summarizes latest action and inference freshness', () => {
    const snapshot = buildActivitySnapshot(runtime(), session(), now);

    expect(snapshot.onlineLabel).toBe('online');
    expect(snapshot.positionLabel).toBe('3226, 3231, 0');
    expect(snapshot.actionLabel).toBe('chop down object 1278');
    expect(snapshot.actionAgeLabel).toBe('50s ago');
    expect(snapshot.inferenceLabel).toBe('body_wait, no action');
    expect(snapshot.inferenceAgeLabel).toBe('22s ago');
    expect(snapshot.stale).toBe(false);
  });

  test('marks an online resident stale when no recent action is visible', () => {
    const staleRuntime = runtime({
      logs: {
        actions: [
          {
            t: '2026-05-20T17:38:00.000Z',
            action: { kind: 'use_item_on_item', itemSlot: 0, targetSlot: 2 },
            result: { ok: true },
          },
        ],
        inference: [],
      },
    });

    const snapshot = buildActivitySnapshot(staleRuntime, session(), now);

    expect(snapshot.actionLabel).toBe('use item slot 0 on slot 2');
    expect(snapshot.stale).toBe(true);
    expect(snapshot.statusText).toBe('No visible action for 6m.');
  });

  test('shows move_to targets clearly', () => {
    const movingRuntime = runtime({
      logs: {
        actions: [
          {
            t: '2026-05-20T17:43:50.000Z',
            action: { kind: 'move_to', target: { x: 3233, y: 3244, level: 0 }, range: 1, cause: 'routine_loop_break' },
            result: { ok: true },
          },
        ],
        inference: [],
      },
    });

    const snapshot = buildActivitySnapshot(movingRuntime, session(), now);

    expect(snapshot.actionLabel).toBe('move to 3233, 3244, 0');
    expect(snapshot.actionDetail).toContain('routine_loop_break');
  });

  test('summarizes the active move intent when the controller is pursuing a target', () => {
    const movingRuntime = runtime({
      state: {
        resident: 'res:agent',
        attention: 100,
        tick: 10,
        legacy: { kind: 'endurer', progress: {}, complete: false },
        budgets: { minuteStartedAt: '2026-05-20T17:00:00.000Z', dayStartedAt: '2026-05-20T17:00:00.000Z', requestsThisMinute: 0, requestsToday: 0 },
        cognition: {
          activeMove: {
            target: { x: 3231, y: 3239, level: 0 },
            range: 1,
            cause: 'continue_move',
            stationaryCount: 2,
          },
        },
      },
    });

    const snapshot = buildActivitySnapshot(movingRuntime, session(), now);

    expect(snapshot.moveLabel).toBe('move to 3231, 3239, 0');
    expect(snapshot.moveDetail).toBe('continue_move | range 1 | still 2');
  });
});
