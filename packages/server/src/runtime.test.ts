import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
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

describe('RuntimeRepository resident feeds', () => {
  test('merges live feed perception and action results into the runtime model', async () => {
    const { RuntimeRepository } = await import('./runtime');
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dashboard-runtime-'));
    const repository = new RuntimeRepository(
      path.join(root, 'memory'),
      path.join(root, 'logs'),
      path.join(root, 'agent-logs'),
      path.join(root, 'souls'),
    );

    const model = await repository.residentRuntime(
      'res:brimsmith52',
      { name: 'res:brimsmith52', online: true },
      {
        resident: 'res:brimsmith52',
        attached: true,
        latestPerception: {
          tick: 42,
          resident: { position: { x: 3225, y: 3217, level: 0 } },
          nearby: { players: [{ id: 'player:codex' }], npcs: [], objects: [{ id: 1 }], worldItems: [] },
          events: [{ kind: 'message', text: 'Welcome.' }],
          availableActions: [{ kind: 'move_to' }],
        },
        latestEvent: { kind: 'message', text: 'Welcome.' },
        lastFeedAt: '2026-05-21T05:46:30.451Z',
        actionResults: [{ t: '2026-05-21T05:46:31.000Z', requestId: 'r1', result: { ok: true } }],
        events: [{ t: '2026-05-21T05:46:30.900Z', event: { kind: 'message', text: 'Welcome.' } }],
      },
    );

    expect(model.available).toBe(true);
    expect(model.body.position).toEqual({ x: 3225, y: 3217, level: 0 });
    expect(model.body.feed?.nearby).toEqual({ players: 1, npcs: 0, objects: 1, worldItems: 0 });
    expect(model.body.feed?.events).toBe(1);
    expect(model.body.feed?.latestEventKind).toBe('message');
    expect(model.body.perceptionTick).toBe(42);
    expect(model.body.lastAction?.result).toBe('ok');
    expect(model.logs.actions).toHaveLength(2);
    expect(model.logs.actions.at(-1)?.result).toEqual({ ok: true });
  });
});

describe('RuntimeRepository resident deletion', () => {
  test('removes dashboard-visible resident runtime and agent log files', async () => {
    const { RuntimeRepository } = await import('./runtime');
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dashboard-delete-'));
    const memoryDir = path.join(root, 'memory', 'resident_001');
    const controllerLogDir = path.join(root, 'logs', 'res:resident_001');
    const agentLogDir = path.join(root, 'agent-logs', 'res:resident_001');
    const repository = new RuntimeRepository(
      path.join(root, 'memory'),
      path.join(root, 'logs'),
      path.join(root, 'agent-logs'),
      path.join(root, 'souls'),
    );
    await Promise.all([
      fs.mkdir(memoryDir, { recursive: true }),
      fs.mkdir(controllerLogDir, { recursive: true }),
      fs.mkdir(agentLogDir, { recursive: true }),
    ]);

    const result = await repository.deleteResidentFiles('res:resident_001');

    expect(result.removed.sort()).toEqual([agentLogDir, controllerLogDir, memoryDir].sort());
    await expect(fs.stat(memoryDir)).rejects.toThrow();
    await expect(fs.stat(controllerLogDir)).rejects.toThrow();
    await expect(fs.stat(agentLogDir)).rejects.toThrow();
  });
});

describe('RuntimeRepository souls', () => {
  test('writes a controller-discoverable autonomous soul for a spawned resident', async () => {
    const { RuntimeRepository } = await import('./runtime');
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dashboard-soul-'));
    const repository = new RuntimeRepository(
      path.join(root, 'memory'),
      path.join(root, 'logs'),
      path.join(root, 'agent-logs'),
      path.join(root, 'souls'),
    );

    const soul = await repository.writeResidentSoul(
      'res:brimsmith52',
      { endpoint: 'local-fast', model: 'qwen-test', temperature: 0.5 },
      { x: 3225, y: 3217, level: 0 },
    );
    const text = await fs.readFile(path.join(root, 'souls', 'brimsmith52.md'), 'utf8');

    expect(soul.id).toBe('res:brimsmith52');
    expect(soul.model).toEqual({ endpoint: 'local-fast', model: 'qwen-test', temperature: 0.5 });
    expect(text).toContain('modules:\n  - id: onion.runescape.standard');
    expect(text).toContain('behavior:\n  kind: hybrid-agent');
    expect(text).toContain('nervousSystem:');
    expect(text).toContain('model: "qwen-test"');
  });
});
