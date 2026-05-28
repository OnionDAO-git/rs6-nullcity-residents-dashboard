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

  test('keeps attempted action separate from later result-only rows', () => {
    const snapshot = buildActivitySnapshot(
      runtime({
        logs: {
          actions: [
            {
              t: '2026-05-20T17:43:40.000Z',
              source: 'thinking',
              action: { kind: 'move_to', target: { x: 3233, y: 3244, level: 0 }, range: 1 },
            },
            {
              t: '2026-05-20T17:43:42.000Z',
              source: 'body',
              result: { status: 'success', requestId: 'controller-1234567890-abcdef' },
            },
          ],
          inference: [],
        },
      }),
      session(),
      now,
    );

    expect(snapshot.actionLabel).toBe('move to 3233, 3244, 0');
    expect(snapshot.actionResultLabel).toBe('success');
    expect(snapshot.actionResultAgeLabel).toBe('18s ago');
    expect(snapshot.actionResultDetail).toBe('source body | request controller-123456... | 18s ago');
  });

  test('classifies timeout and failed action results for operator QA', () => {
    const timeoutSnapshot = buildActivitySnapshot(
      runtime({
        logs: {
          actions: [
            {
              t: '2026-05-20T17:43:50.000Z',
              source: 'body',
              result: { ok: false, reason: 'action_result_timeout' },
            },
          ],
          inference: [],
        },
      }),
      session(),
      now,
    );
    const failedSnapshot = buildActivitySnapshot(
      runtime({
        logs: {
          actions: [
            {
              t: '2026-05-20T17:43:50.000Z',
              source: 'body',
              result: { ok: false, reason: 'target_not_found' },
            },
          ],
          inference: [],
        },
      }),
      session(),
      now,
    );
    const statusTimeoutSnapshot = buildActivitySnapshot(
      runtime({
        logs: {
          actions: [
            {
              t: '2026-05-20T17:43:50.000Z',
              source: 'body',
              result: { status: 'timeout' },
            },
          ],
          inference: [],
        },
      }),
      session(),
      now,
    );

    expect(timeoutSnapshot.actionResultLabel).toBe('timeout');
    expect(timeoutSnapshot.actionResultDetail).toBe('reason timeout | source body | 10s ago');
    expect(failedSnapshot.actionResultLabel).toBe('failed');
    expect(failedSnapshot.actionResultDetail).toBe('reason target not found | source body | 10s ago');
    expect(statusTimeoutSnapshot.actionResultLabel).toBe('timeout');
  });

  test('shows pending when the latest action is newer than the latest result', () => {
    const snapshot = buildActivitySnapshot(
      runtime({
        logs: {
          actions: [
            {
              t: '2026-05-20T17:43:20.000Z',
              source: 'thinking',
              action: { kind: 'say', text: 'Checking the road.' },
              result: { ok: true },
            },
            {
              t: '2026-05-20T17:43:50.000Z',
              source: 'thinking',
              action: { kind: 'move_to', target: { x: 3233, y: 3244, level: 0 }, range: 1 },
            },
          ],
          inference: [],
        },
      }),
      session(),
      now,
    );

    expect(snapshot.actionLabel).toBe('move to 3233, 3244, 0');
    expect(snapshot.actionResultLabel).toBe('pending');
    expect(snapshot.actionResultDetail).toBe('awaiting result for latest action | action 10s ago');
  });

  test('treats controller acknowledgements as pending until a final action result arrives', () => {
    const pendingSnapshot = buildActivitySnapshot(
      runtime({
        logs: {
          actions: [
            {
              t: '2026-05-20T17:43:49.000Z',
              type: 'action_result',
              source: 'body',
              requestId: 'controller-1234567890-abcdef',
              result: { ok: true },
            },
            {
              t: '2026-05-20T17:43:50.000Z',
              source: 'thinking',
              action: { kind: 'move_to', target: { x: 3233, y: 3244, level: 0 }, range: 1 },
              result: { ok: true, requestId: 'controller-1234567890-abcdef' },
            },
          ],
          inference: [],
        },
      }),
      session(),
      now,
    );
    const timeoutSnapshot = buildActivitySnapshot(
      runtime({
        logs: {
          actions: [
            {
              t: '2026-05-20T17:43:49.000Z',
              type: 'action_result',
              source: 'body',
              requestId: 'controller-1234567890-abcdef',
              result: { ok: true },
            },
            {
              t: '2026-05-20T17:43:50.000Z',
              source: 'thinking',
              action: { kind: 'move_to', target: { x: 3233, y: 3244, level: 0 }, range: 1 },
              result: { ok: true, requestId: 'controller-1234567890-abcdef' },
            },
            {
              t: '2026-05-20T17:43:58.000Z',
              tick: 67424,
              requestId: 'controller-1234567890-abcdef',
              result: { status: 'timeout', reason: 'timeout', requestId: 'controller-1234567890-abcdef' },
            },
          ],
          inference: [],
        },
      }),
      session(),
      now,
    );

    expect(pendingSnapshot.actionResultLabel).toBe('pending');
    expect(pendingSnapshot.actionResultDetail).toBe('awaiting result for latest action | action 10s ago');
    expect(timeoutSnapshot.actionResultLabel).toBe('timeout');
    expect(timeoutSnapshot.actionResultDetail).toBe('reason timeout | tick 67424 | request controller-123456... | 2s ago');
  });

  test('matches final action results to the latest action request id', () => {
    const snapshot = buildActivitySnapshot(
      runtime({
        logs: {
          actions: [
            {
              t: '2026-05-20T17:43:40.000Z',
              source: 'thinking',
              action: { kind: 'move_to', target: { x: 3233, y: 3244, level: 0 }, range: 1 },
              result: { ok: true, requestId: 'controller-action-a' },
            },
            {
              t: '2026-05-20T17:43:50.000Z',
              source: 'thinking',
              action: { kind: 'move_to', target: { x: 3234, y: 3244, level: 0 }, range: 1 },
              result: { ok: true, requestId: 'controller-action-b' },
            },
            {
              t: '2026-05-20T17:43:58.000Z',
              tick: 67424,
              requestId: 'controller-action-a',
              result: { status: 'timeout', reason: 'timeout', requestId: 'controller-action-a' },
            },
          ],
          inference: [],
        },
      }),
      session(),
      now,
    );

    expect(snapshot.actionLabel).toBe('move to 3234, 3244, 0');
    expect(snapshot.actionResultLabel).toBe('pending');
    expect(snapshot.actionResultDetail).toBe('awaiting result for latest action | action 10s ago');
  });

  test('sanitizes raw action-result errors and treats enum-like reasons as failures', () => {
    const errorSnapshot = buildActivitySnapshot(
      runtime({
        logs: {
          actions: [
            {
              t: '2026-05-20T17:43:50.000Z',
              source: 'body',
              result: { status: 'error', error: 'Error: token sk-secret and player@example.com should not render' },
            },
          ],
          inference: [],
        },
      }),
      session(),
      now,
    );
    const rejectedSnapshot = buildActivitySnapshot(
      runtime({
        logs: {
          actions: [
            {
              t: '2026-05-20T17:43:50.000Z',
              source: 'body',
              result: { finalReason: 'inventory_full' },
            },
          ],
          inference: [],
        },
      }),
      session(),
      now,
    );

    expect(errorSnapshot.actionResultLabel).toBe('failed');
    expect(errorSnapshot.actionResultDetail).toBe('reason error | source body | 10s ago');
    expect(errorSnapshot.actionResultDetail).not.toContain('sk-secret');
    expect(errorSnapshot.actionResultDetail).not.toContain('player@example.com');
    expect(rejectedSnapshot.actionResultLabel).toBe('failed');
    expect(rejectedSnapshot.actionResultDetail).toBe('reason inventory full | source body | 10s ago');
  });

  test('shows trade actions as readable player activity', () => {
    const target = { residentId: 'res:codex', playerHandle: 'Codex' };
    const cases = [
      {
        action: { kind: 'trade_request', target },
        label: 'request trade with Codex',
        cause: 'direct_chat_trade',
        detail: 'direct_chat_trade | ok | source body | tick 12',
      },
      {
        action: { kind: 'trade_offer_item', inventorySlot: 2, amount: 3 },
        label: 'offer 3 from slot 2',
        cause: 'trade_offer_safe_item',
        detail: 'trade_offer_safe_item | ok | source body | tick 12',
      },
      {
        action: { kind: 'trade_accept_stage_1' },
        label: 'accept trade stage 1',
        cause: 'trade_accept_stage_1',
        detail: 'trade_accept_stage_1 | ok | source body | tick 12',
      },
      {
        action: { kind: 'trade_decline', reason: 'untrusted_partner' },
        label: 'decline trade',
        cause: 'trade_decline_untrusted_partner',
        detail: 'trade_decline_untrusted_partner | ok | source body | tick 12',
      },
    ];

    for (const { action, label, cause, detail } of cases) {
      const snapshot = buildActivitySnapshot(
        runtime({
          logs: {
            actions: [
              {
                t: '2026-05-20T17:43:50.000Z',
                tick: 12,
                source: 'body',
                cause,
                action,
                result: { ok: true },
              },
            ],
            inference: [],
          },
        }),
        session(),
        now,
      );

      expect(snapshot.actionLabel).toBe(label);
      expect(snapshot.actionDetail).toBe(detail);
    }
  });

  test('shows whether the resident is stuck or making meaningful progress', () => {
    const snapshot = buildActivitySnapshot(
      runtime({
        progress: {
          sessionId: 'session-a',
          progressPath: 'progress/session-a.jsonl',
          samples: 2,
          latest: {
            ts: '2026-05-23T05:00:06.000Z',
            tick: 104,
            meaningful: false,
            reasons: [],
            stuckSince: 100,
          },
          latestMeaningful: {
            ts: '2026-05-23T05:00:00.000Z',
            tick: 98,
            meaningful: true,
            reasons: ['xp_gain:firemaking:40'],
            stuckSince: null,
          },
          stuckTicks: 4,
        },
      } as Partial<RuntimeReadModel>),
      session(),
      now,
    );

    expect(snapshot.progressLabel).toBe('stuck 4 ticks');
    expect(snapshot.progressDetail).toBe('last progress tick 98: xp gain firemaking 40');
  });

  test('labels old progress evidence as offline instead of current activity', () => {
    const snapshot = buildActivitySnapshot(
      runtime({
        online: false,
        progress: {
          sessionId: 'session-a',
          progressPath: 'progress/session-a.jsonl',
          samples: 2,
          latest: {
            ts: '2026-05-20T17:34:00.000Z',
            tick: 104,
            meaningful: false,
            reasons: [],
            stuckSince: 100,
          },
          latestMeaningful: {
            ts: '2026-05-20T17:30:00.000Z',
            tick: 98,
            meaningful: true,
            reasons: ['xp_gain:firemaking:40'],
            stuckSince: null,
          },
          stuckTicks: 4,
        },
      }),
      session(),
      now,
    );

    expect(snapshot.progressLabel).toBe('offline; last stuck 4 ticks');
    expect(snapshot.progressDetail).toBe('10m ago | last progress tick 98: xp gain firemaking 40');
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

  test('shows the active SPARK module driving the resident', () => {
    const snapshot = buildActivitySnapshot(
      runtime({
        spark: {
          modules: [
            {
              id: 'onion.runescape.standard',
              version: '0.1.0',
              source: 'inference-log',
              activeFacets: ['thinking'],
              lastSeenAt: '2026-05-20T17:43:38.000Z',
            },
          ],
          activeModule: {
            id: 'onion.runescape.standard',
            version: '0.1.0',
            source: 'inference-log',
            activeFacets: ['thinking'],
            lastSeenAt: '2026-05-20T17:43:38.000Z',
          },
        },
      }),
      session(),
      now,
    );

    expect(snapshot.moduleLabel).toBe('onion.runescape.standard@0.1.0');
    expect(snapshot.moduleDetail).toBe('thinking | inference-log');
  });

  test('shows configured model and falls back to configured SPARK module before logs exist', () => {
    const snapshot = buildActivitySnapshot(
      runtime({
        stack: {
          soulTitle: 'QA Scout',
          soulFile: 'res-qa-scout.md',
          model: { endpoint: 'spacetower_qwopus_q4', model: 'qwopus3.5-27b-v3@q4_k_s' },
          behaviorKind: 'hybrid-agent',
          brain: { thinking: true, temperature: 0.55 },
          body: { thinking: false, temperature: 0.1 },
          configuredModules: [{ id: 'onion.runescape.standard', version: '0.1.0', source: 'soul', activeFacets: ['thinking', 'body'] }],
        },
      }),
      undefined,
      now,
    );

    expect(snapshot.modelLabel).toBe('spacetower_qwopus_q4');
    expect(snapshot.modelDetail).toBe('model qwopus3.5-27b-v3@q4_k_s | brain temp 0.55 | body temp 0.1');
    expect(snapshot.moduleLabel).toBe('onion.runescape.standard@0.1.0');
    expect(snapshot.moduleDetail).toBe('thinking, body | soul');
  });

  test('describes residents with model thinking disabled but no explicit endpoint', () => {
    const snapshot = buildActivitySnapshot(
      runtime({
        stack: {
          soulTitle: 'Hans',
          soulFile: 'res-hans.md',
          model: { thinking: false },
          configuredModules: [],
        },
      }),
      undefined,
      now,
    );

    expect(snapshot.modelLabel).toBe('-');
    expect(snapshot.modelDetail).toBe('model thinking off');
  });
});
