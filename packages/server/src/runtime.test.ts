import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { PatronActivitySummary, RelationshipActivitySummary } from '@nullcity-dashboard/shared';
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
  test('synthesizes resident summaries from fresh controller runtime files when the gateway roster is empty', async () => {
    const { RuntimeRepository } = await import('./runtime');
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dashboard-runtime-roster-'));
    const memoryRoot = path.join(root, 'memory');
    const repository = new RuntimeRepository(
      memoryRoot,
      path.join(root, 'logs'),
      path.join(root, 'agent-logs'),
      path.join(root, 'souls'),
    );
    const freshState = path.join(memoryRoot, 'res-hans', 'runtime-state.json');
    const staleState = path.join(memoryRoot, 'res-pip', 'runtime-state.json');
    await fs.mkdir(path.dirname(freshState), { recursive: true });
    await fs.mkdir(path.dirname(staleState), { recursive: true });
    await fs.writeFile(freshState, JSON.stringify({ resident: 'res:hans', tick: 12 }), 'utf8');
    await fs.writeFile(staleState, JSON.stringify({ resident: 'res:pip', tick: 3 }), 'utf8');
    await fs.utimes(freshState, new Date('2026-05-30T19:00:00.000Z'), new Date('2026-05-30T19:00:00.000Z'));
    await fs.utimes(staleState, new Date('2026-05-30T18:30:00.000Z'), new Date('2026-05-30T18:30:00.000Z'));

    await expect(repository.listRuntimeResidentSummaries({ now: new Date('2026-05-30T19:01:00.000Z'), onlineWindowMs: 5 * 60_000 })).resolves.toEqual([
      { name: 'res:hans', online: true },
      { name: 'res:pip', online: false },
    ]);
    await expect(repository.listRuntimeResidentSummaries({ filter: 'online', now: new Date('2026-05-30T19:01:00.000Z'), onlineWindowMs: 5 * 60_000 })).resolves.toEqual([
      { name: 'res:hans', online: true },
    ]);
  });

  test('summarizes latest resident progress evidence from controller memory', async () => {
    const { RuntimeRepository } = await import('./runtime');
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dashboard-progress-'));
    const memoryRoot = path.join(root, 'memory');
    const evidenceDir = path.join(memoryRoot, 'res-agent', 'evidence');
    const progressPath = path.join(evidenceDir, 'progress', 'session-a.jsonl');
    const repository = new RuntimeRepository(
      memoryRoot,
      path.join(root, 'logs'),
      path.join(root, 'agent-logs'),
      path.join(root, 'souls'),
    );
    await fs.mkdir(path.dirname(progressPath), { recursive: true });
    await fs.writeFile(
      path.join(evidenceDir, 'index.json'),
      JSON.stringify({
        schemaVersion: 1,
        resident: 'res:agent',
        currentSessionId: 'session-a',
        sessions: [
          {
            sessionId: 'session-a',
            status: 'active',
            progressPath: 'progress/session-a.jsonl',
          },
        ],
      }),
      'utf8',
    );
    await fs.writeFile(
      progressPath,
      [
        JSON.stringify({ kind: 'progress', ts: '2026-05-23T05:00:00.000Z', tick: 98, meaningful: true, reasons: ['xp_gain:firemaking:40'], stuckSince: null }),
        JSON.stringify({ kind: 'progress', ts: '2026-05-23T05:00:06.000Z', tick: 104, meaningful: false, reasons: [], stuckSince: 100 }),
      ].join('\n'),
      'utf8',
    );

    const model = await repository.residentRuntime('res:agent', { name: 'res:agent', online: true });
    const progress = (model as { progress?: Record<string, unknown> }).progress;

    expect(model.available).toBe(true);
    expect(progress).toMatchObject({
      sessionId: 'session-a',
      progressPath: 'progress/session-a.jsonl',
      stuckTicks: 4,
      latest: { tick: 104, meaningful: false, stuckSince: 100 },
      latestMeaningful: { tick: 98, meaningful: true, reasons: ['xp_gain:firemaking:40'] },
    });
  });

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

  test('exposes configured SOUL inference and SPARK stack for operator inspection', async () => {
    const { RuntimeRepository } = await import('./runtime');
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dashboard-resident-stack-'));
    const soulsRoot = path.join(root, 'souls');
    const logsRoot = path.join(root, 'logs');
    const repository = new RuntimeRepository(
      path.join(root, 'memory'),
      logsRoot,
      path.join(root, 'agent-logs'),
      soulsRoot,
    );

    await fs.mkdir(soulsRoot, { recursive: true });
    await fs.mkdir(path.join(logsRoot, 'res:qa-scout', 'inference'), { recursive: true });
    await fs.writeFile(
      path.join(soulsRoot, 'res-qa-scout.md'),
      [
        '---',
        'name: res:qa-scout',
        'display: QA Scout',
        'model:',
        '  endpoint: spacetower_qwopus_q4',
        '  model: qwopus3.5-27b-v3@q4_k_s',
        'modules:',
        '  - id: onion.runescape.standard',
        '    version: 0.1.0',
        '    enabled: true',
        'behavior:',
        '  kind: hybrid-agent',
        '  brain:',
        '    thinking: true',
        '    temperature: 0.55',
        '  body:',
        '    thinking: false',
        '    temperature: 0.1',
        '---',
        '# QA Scout',
      ].join('\n'),
      'utf8',
    );
    await fs.writeFile(
      path.join(logsRoot, 'res:qa-scout', 'inference', '2026-05-28.jsonl'),
      JSON.stringify({
        t: '2026-05-28T12:30:00.000Z',
        status: 'ok',
        provider: 'openrouter',
        model: 'anthropic/claude-3.5-haiku',
        endpoint: 'openrouter_haiku',
        sparkModule: { id: 'onion.runescape.standard', version: '0.1.0' },
      }) + '\n',
      'utf8',
    );

    const model = await repository.residentRuntime('res:qa-scout', { name: 'res:qa-scout', online: true });
    const rows = await repository.enrichResidents([{ name: 'res:qa-scout', online: true }]);

    expect(model.stack).toMatchObject({
      soulId: 'res:qa-scout',
      soulTitle: 'QA Scout',
      soulFile: 'res-qa-scout.md',
      model: { endpoint: 'spacetower_qwopus_q4', model: 'qwopus3.5-27b-v3@q4_k_s' },
      behaviorKind: 'hybrid-agent',
      brain: { thinking: true, temperature: 0.55 },
      body: { thinking: false, temperature: 0.1 },
      configuredModules: [{ id: 'onion.runescape.standard', version: '0.1.0', source: 'soul' }],
      activeModule: { id: 'onion.runescape.standard', version: '0.1.0', source: 'inference-log' },
    });
    expect(rows[0]?.stack).toEqual(model.stack);
  });

  test('derives active plan from cognition goal and falls back to soul orientation', async () => {
    const { RuntimeRepository } = await import('./runtime');
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dashboard-resident-intent-'));
    const memoryRoot = path.join(root, 'memory');
    const soulsRoot = path.join(root, 'souls');
    const repository = new RuntimeRepository(
      memoryRoot,
      path.join(root, 'logs'),
      path.join(root, 'agent-logs'),
      soulsRoot,
    );

    await fs.mkdir(path.join(memoryRoot, 'res-agent'), { recursive: true });
    await fs.mkdir(path.join(memoryRoot, 'res-duke'), { recursive: true });
    await fs.mkdir(soulsRoot, { recursive: true });
    await fs.writeFile(
      path.join(memoryRoot, 'res-agent', 'runtime-state.json'),
      JSON.stringify({
        resident: 'res:agent',
        attention: 64,
        tick: 17,
        legacy: { kind: 'endurer', progress: {}, complete: false },
        budgets: { minuteStartedAt: '2026-05-30T00:00:00.000Z', dayStartedAt: '2026-05-30T00:00:00.000Z', requestsThisMinute: 0, requestsToday: 0 },
        cognition: { activeGoal: { id: 'master-woodcutting', description: 'Master woodcutting and document a reliable GP route.' } },
      }),
      'utf8',
    );
    await fs.writeFile(
      path.join(memoryRoot, 'res-duke', 'runtime-state.json'),
      JSON.stringify({
        resident: 'res:duke',
        attention: 64,
        tick: 17,
        legacy: { kind: 'endurer', progress: {}, complete: false },
        budgets: { minuteStartedAt: '2026-05-30T00:00:00.000Z', dayStartedAt: '2026-05-30T00:00:00.000Z', requestsThisMinute: 0, requestsToday: 0 },
      }),
      'utf8',
    );
    await fs.writeFile(
      path.join(soulsRoot, 'res-agent.md'),
      ['---', 'name: res:agent', 'display: Agent', '---', '# Agent'].join('\n'),
      'utf8',
    );
    await fs.writeFile(
      path.join(soulsRoot, 'res-duke.md'),
      [
        '---',
        'name: res:duke',
        'display: Duke',
        'orientationGoal:',
        '  id: keep-square-lit',
        '  description: Keep the square lit and turn firemaking into public myth.',
        '  tier: pursue',
        '---',
        '# Duke',
      ].join('\n'),
      'utf8',
    );

    const liveGoal = await repository.residentRuntime('res:agent', { name: 'res:agent', online: true });
    const orientationFallback = await repository.residentRuntime('res:duke', { name: 'res:duke', online: true });
    const rows = await repository.enrichResidents([
      { name: 'res:agent', online: true },
      { name: 'res:duke', online: true },
    ]);

    expect(liveGoal.thinking.activePlan).toBe('Master woodcutting and document a reliable GP route.');
    expect(orientationFallback.thinking.activePlan).toBe('Keep the square lit and turn firemaking into public myth.');
    expect(rows.map(row => row.thinking?.activePlan)).toEqual([
      'Master woodcutting and document a reliable GP route.',
      'Keep the square lit and turn firemaking into public myth.',
    ]);
  });

  test('merges trajectory action_result evidence so final timeouts beat gateway acknowledgements', async () => {
    const { RuntimeRepository } = await import('./runtime');
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dashboard-trajectory-results-'));
    const memoryRoot = path.join(root, 'memory');
    const logsRoot = path.join(root, 'logs');
    const evidenceDir = path.join(memoryRoot, 'res-agent', 'evidence');
    const trajectoryPath = path.join(evidenceDir, 'trajectory', 'session-a.jsonl');
    const repository = new RuntimeRepository(
      memoryRoot,
      logsRoot,
      path.join(root, 'agent-logs'),
      path.join(root, 'souls'),
    );

    await fs.mkdir(path.dirname(trajectoryPath), { recursive: true });
    await fs.mkdir(path.join(logsRoot, 'res:agent', 'actions'), { recursive: true });
    await fs.writeFile(
      path.join(evidenceDir, 'index.json'),
      JSON.stringify({
        schemaVersion: 1,
        resident: 'res:agent',
        currentSessionId: 'session-a',
        sessions: [
          {
            sessionId: 'session-a',
            status: 'active',
            trajectoryPath: 'trajectory/session-a.jsonl',
            progressPath: 'progress/session-a.jsonl',
          },
        ],
      }),
      'utf8',
    );
    await fs.writeFile(
      path.join(logsRoot, 'res:agent', 'actions', '2026-05-26.jsonl'),
      JSON.stringify({
        t: '2026-05-26T08:16:51.000Z',
        tick: 67406,
        source: 'thinking',
        action: { kind: 'move_to', target: { x: 3150, y: 3143, level: 0 } },
        result: { ok: true, requestId: 'controller-1' },
      }) + '\n',
      'utf8',
    );
    await fs.writeFile(
      trajectoryPath,
      JSON.stringify({
        schemaVersion: 1,
        ts: '2026-05-26T08:17:02.000Z',
        tick: 67424,
        sessionId: 'session-a',
        kind: 'action_result',
        requestId: 'controller-1',
        status: 'timeout',
        reason: 'timeout',
        evidence: [{ source: 'perception', detail: { kind: 'movement_timeout', target: { x: 3150, y: 3143, level: 0 } } }],
      }) + '\n',
      'utf8',
    );

    const model = await repository.residentRuntime('res:agent', { name: 'res:agent', online: true });

    expect(model.body.lastAction?.result).toBe('timeout');
    expect(model.logs.actions.at(-1)).toMatchObject({
      t: '2026-05-26T08:17:02.000Z',
      tick: 67424,
      requestId: 'controller-1',
      result: { status: 'timeout', reason: 'timeout', requestId: 'controller-1' },
    });
    expect(JSON.stringify(model.logs.actions.at(-1))).not.toContain('movement_timeout');
  });

  test('filters dashboard resident rows to controller-discoverable SOUL residents when SOULs are present', async () => {
    const { RuntimeRepository } = await import('./runtime');
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dashboard-known-residents-'));
    const soulsRoot = path.join(root, 'souls');
    const repository = new RuntimeRepository(
      path.join(root, 'memory'),
      path.join(root, 'logs'),
      path.join(root, 'agent-logs'),
      soulsRoot,
    );
    await fs.mkdir(soulsRoot, { recursive: true });
    await fs.writeFile(
      path.join(soulsRoot, 'res-agent.md'),
      ['---', 'name: res:agent', 'display: Agent', 'archetype: endurer', '---', '# Agent'].join('\n'),
      'utf8',
    );

    const rows = await repository.enrichResidents([
      { name: 'res:agent', online: true },
      { name: 'res:bmk_fire_5m_002e9qp0', online: false },
    ]);

    expect(rows.map(row => row.name)).toEqual(['res:agent']);
  });

  test('keeps gateway resident rows unfiltered when no SOUL catalog is available', async () => {
    const { RuntimeRepository } = await import('./runtime');
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dashboard-no-souls-'));
    const repository = new RuntimeRepository(
      path.join(root, 'memory'),
      path.join(root, 'logs'),
      path.join(root, 'agent-logs'),
      path.join(root, 'missing-souls'),
    );

    const rows = await repository.enrichResidents([
      { name: 'res:agent', online: true },
      { name: 'res:legacy', online: false },
    ]);

    expect(rows.map(row => row.name)).toEqual(['res:agent', 'res:legacy']);
  });

  test('keeps dashboard resident list rows slim by default', async () => {
    const { RuntimeRepository } = await import('./runtime');
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dashboard-slim-residents-'));
    const repository = new RuntimeRepository(
      path.join(root, 'memory'),
      path.join(root, 'logs'),
      path.join(root, 'agent-logs'),
      path.join(root, 'missing-souls'),
    );
    const largePerception = {
      tick: 123,
      resident: { position: { x: 3225, y: 3218, level: 0 } },
      nearby: { players: [{ id: 'player:codex' }], npcs: [{ id: 1 }], objects: [{ id: 2 }], worldItems: [{ id: 3 }] },
      events: [{ kind: 'message', text: 'hello' }],
      availableActions: Array.from({ length: 40 }, (_, index) => ({ kind: 'move_to', x: 3200 + index, y: 3200 })),
    };

    const rows = await repository.enrichResidents(
      [{ name: 'res:agent', online: true }],
      new Map([
        [
          'agent',
          {
            resident: 'res:agent',
            attached: true,
            latestPerception: largePerception,
            latestEvent: { kind: 'message', text: 'hello' },
            lastFeedAt: '2026-05-25T08:30:00.000Z',
            actionResults: [],
            events: [],
          },
        ],
      ]),
    );

    expect(rows[0]?.position).toEqual({ x: 3225, y: 3218, level: 0 });
    expect(rows[0]?.feed).toMatchObject({ tick: 123, nearby: { players: 1, npcs: 1, objects: 1, worldItems: 1 }, availableActions: 40 });
    expect(rows[0]?.body?.latestPerception).toBeUndefined();
    expect(rows[0]?.body?.latestEvent).toBeUndefined();
    expect(rows[0]?.body?.saved).toBeUndefined();
  });

  test('surfaces Library story arc summaries on resident rows', async () => {
    const { RuntimeRepository } = await import('./runtime');
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dashboard-story-arc-'));
    const memoryRoot = path.join(root, 'memory');
    const repository = new RuntimeRepository(
      memoryRoot,
      path.join(root, 'logs'),
      path.join(root, 'agent-logs'),
      path.join(root, 'missing-souls'),
    );
    await fs.mkdir(path.join(memoryRoot, 'library', 'res-agent'), { recursive: true });
    await fs.writeFile(
      path.join(memoryRoot, 'library', 'res-agent', 'portrait.json'),
      JSON.stringify({
        residentName: 'res:agent',
        storyArc: {
          phase: 'progress',
          summary: 'Patron support has turned into visible in-game progress.',
          latestEventTick: 42,
          latestEventKind: 'stuck_recovered',
          evidence: {
            pitches: 1,
            fundingEvents: 1,
            progressEvents: 2,
            resolutionEvents: 0,
            letterEvents: 0,
          },
        },
      }),
      'utf8',
    );

    const rows = await repository.enrichResidents([{ name: 'res:agent', online: true }]);

    expect(rows[0]?.storyArc).toMatchObject({
      phase: 'progress',
      latestEventTick: 42,
      latestEventKind: 'stuck_recovered',
      evidence: { fundingEvents: 1, progressEvents: 2 },
    });
  });

  test('infers story arc summaries from Library timelines before portrait regeneration', async () => {
    const { RuntimeRepository } = await import('./runtime');
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dashboard-story-arc-timeline-'));
    const memoryRoot = path.join(root, 'memory');
    const repository = new RuntimeRepository(
      memoryRoot,
      path.join(root, 'logs'),
      path.join(root, 'agent-logs'),
      path.join(root, 'missing-souls'),
    );
    await fs.mkdir(path.join(memoryRoot, 'library', 'res-agent'), { recursive: true });
    await fs.writeFile(
      path.join(memoryRoot, 'library', 'res-agent', 'timeline.jsonl'),
      [
        JSON.stringify({ kind: 'say', tick: 1, text: 'I need support for the witness fire.' }),
        JSON.stringify({ kind: 'patron_gift', tick: 2, patronHandle: 'p***', amount: 8 }),
        JSON.stringify({ kind: 'first_xp', tick: 3, skill: 'Firemaking' }),
      ].join('\n'),
      'utf8',
    );

    const rows = await repository.enrichResidents([{ name: 'res:agent', online: true }]);

    expect(rows[0]?.storyArc).toMatchObject({
      phase: 'progress',
      latestEventTick: 3,
      latestEventKind: 'first_xp',
      evidence: { pitches: 1, fundingEvents: 1, progressEvents: 1 },
    });
  });
});

describe('RuntimeRepository resident deletion', () => {
  test('removes dashboard-visible resident runtime and agent log files', async () => {
    const { RuntimeRepository } = await import('./runtime');
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dashboard-delete-'));
    const memoryDir = path.join(root, 'memory', 'resident_001');
    const libraryDir = path.join(root, 'memory', 'library', 'res-resident_001');
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
      fs.mkdir(libraryDir, { recursive: true }),
      fs.mkdir(controllerLogDir, { recursive: true }),
      fs.mkdir(agentLogDir, { recursive: true }),
    ]);

    const result = await repository.deleteResidentFiles('res:resident_001');

    expect(result.removed.sort()).toEqual([agentLogDir, controllerLogDir, libraryDir, memoryDir].sort());
    await expect(fs.stat(memoryDir)).rejects.toThrow();
    await expect(fs.stat(libraryDir)).rejects.toThrow();
    await expect(fs.stat(controllerLogDir)).rejects.toThrow();
    await expect(fs.stat(agentLogDir)).rejects.toThrow();
  });
});

describe('RuntimeRepository letters', () => {
  test('lists recent inbox letters newest first with redacted recipients and no bodies', async () => {
    const { RuntimeRepository } = await import('./runtime');
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dashboard-letters-'));
    const memoryRoot = path.join(root, 'memory');
    const repository = new RuntimeRepository(
      memoryRoot,
      path.join(root, 'logs'),
      path.join(root, 'agent-logs'),
      path.join(root, 'souls'),
    );
    const lettersRoot = path.join(memoryRoot, 'data', 'letters');
    await fs.mkdir(path.join(lettersRoot, 'alice@example.com'), { recursive: true });
    await fs.mkdir(path.join(lettersRoot, 'bob'), { recursive: true });
    await fs.writeFile(
      path.join(lettersRoot, 'alice@example.com', 'inbox.jsonl'),
      [
        '{',
        JSON.stringify({
          kind: 'standing_tier_crossed',
          recipient: 'alice@example.com',
          senderResident: 'res:hans',
          subject: 'You are now Acquaintance of embassy',
          body: 'private body',
          dispatchedAt: '2026-05-25T23:00:12.071Z',
          deliveryChannels: ['web-inbox'],
        }),
      ].join('\n'),
      'utf8',
    );
    await fs.writeFile(
      path.join(lettersRoot, 'alice@example.com', 'old-inbox.jsonl'),
      JSON.stringify({
        kind: 'broadcast',
        recipient: 'alice@example.com',
        subject: 'This stale file should not appear',
        dispatchedAt: '2026-05-26T00:06:00.000Z',
      }),
      'utf8',
    );
    await fs.mkdir(path.join(lettersRoot, 'alice@example.com', 'archive'), { recursive: true });
    await fs.writeFile(
      path.join(lettersRoot, 'alice@example.com', 'archive', 'inbox.jsonl'),
      JSON.stringify({
        kind: 'broadcast',
        recipient: 'alice@example.com',
        subject: 'This nested file should not appear',
        dispatchedAt: '2026-05-26T00:07:00.000Z',
      }),
      'utf8',
    );
    await fs.writeFile(
      path.join(lettersRoot, 'bob', 'inbox.jsonl'),
      JSON.stringify({
        kind: 'epitaph',
        recipient: 'bob',
        senderResident: 'res:pip',
        subject: 'Pip rests in the Library',
        body: 'also private',
        dispatchedAt: '2026-05-26T00:05:00.000Z',
        deliveryChannels: ['web-inbox', 'wall'],
      }),
      'utf8',
    );

    const letters = await repository.recentLetters(2);

    expect(letters.map(letter => letter.subject)).toEqual(['Pip rests in the Library', 'You are now Acquaintance of embassy']);
    expect(letters.every(letter => /^letter-[a-f0-9]{16}$/.test(letter.id))).toBe(true);
    expect(letters.some(letter => letter.subject.includes('should not appear'))).toBe(false);
    expect(letters[1]?.id).not.toContain('alice');
    expect(letters[1]?.id).not.toContain('example.com');
    expect(letters[1]?.id).not.toContain('Acquaintance');
    expect(letters[0]).toMatchObject({
      kind: 'epitaph',
      recipient: 'b***',
      senderResident: 'res:pip',
      dispatchedAt: '2026-05-26T00:05:00.000Z',
      deliveryChannels: ['web-inbox', 'wall'],
    });
    expect(letters[1]).toMatchObject({
      recipient: 'a***@example.com',
      senderResident: 'res:hans',
    });
    expect(letters[0]).not.toHaveProperty('body');
  });
});

describe('RuntimeRepository patrons', () => {
  test('summarizes patron AP and standing without exposing raw handles', async () => {
    const { RuntimeRepository } = await import('./runtime');
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dashboard-patrons-'));
    const memoryRoot = path.join(root, 'memory');
    const repository = new RuntimeRepository(
      memoryRoot,
      path.join(root, 'logs'),
      path.join(root, 'agent-logs'),
      path.join(root, 'souls'),
    );
    await fs.mkdir(memoryRoot, { recursive: true });
    await fs.writeFile(
      path.join(memoryRoot, 'patron-currency.json'),
      JSON.stringify({
        schemaVersion: 1,
        balances: {
          'alice@example.com': 42,
          bob: 0,
        },
        history: {
          'alice@example.com': [
            { kind: 'credit', amount: 50, createdAt: '2026-05-25T20:00:00.000Z' },
            { kind: 'debit', amount: 8, createdAt: '2026-05-25T20:03:00.000Z' },
          ],
          bob: [{ kind: 'credit', amount: 12, createdAt: '2026-05-25T20:02:00.000Z' }],
        },
      }),
      'utf8',
    );
    await fs.writeFile(
      path.join(memoryRoot, 'patron-standing.json'),
      JSON.stringify({
        schemaVersion: 1,
        points: {
          'alice@example.com|embassy': 35,
          'alice@example.com|foundry': 5,
          'bob|embassy': 80,
        },
        history: {
          'alice@example.com|embassy': [
            { humanId: 'alice@example.com', faction: 'embassy', amount: 35, createdAt: '2026-05-25T20:01:00.000Z' },
          ],
          'bob|embassy': [
            { humanId: 'bob', faction: 'embassy', amount: 80, createdAt: '2026-05-25T20:04:00.000Z' },
          ],
        },
      }),
      'utf8',
    );

    const summary = await (repository as { patronSummary(limit?: number): Promise<PatronActivitySummary> }).patronSummary(5);

    expect(summary).toMatchObject({
      totalPatrons: 2,
      totalShardBalance: 42,
      totalStandingPoints: 120,
      tierCounts: { stranger: 0, acquaintance: 0, ally: 1, officer: 1 },
    });
    expect(summary.patrons.map(patron => patron.handle)).toEqual(['b***', 'a***@example.com']);
    expect(summary.patrons.map(patron => patron.id)).toEqual(['patron-001', 'patron-002']);
    expect(JSON.stringify(summary)).not.toContain('alice@example.com');
    expect(summary.patrons[0]).toMatchObject({
      balance: 0,
      lastActivityAt: '2026-05-25T20:04:00.000Z',
      standing: [{ faction: 'embassy', points: 80, tier: 'officer' }],
    });
    expect(summary.patrons[1]).toMatchObject({
      balance: 42,
      standing: [
        { faction: 'embassy', points: 35, tier: 'ally', nextTier: 'officer', pointsToNext: 40 },
        { faction: 'foundry', points: 5, tier: 'stranger', nextTier: 'acquaintance', pointsToNext: 5 },
      ],
    });
  });

  test('returns an empty patron summary when ledgers are missing', async () => {
    const { RuntimeRepository } = await import('./runtime');
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dashboard-patrons-empty-'));
    const repository = new RuntimeRepository(
      path.join(root, 'memory'),
      path.join(root, 'logs'),
      path.join(root, 'agent-logs'),
      path.join(root, 'souls'),
    );

    await expect((repository as { patronSummary(limit?: number): Promise<PatronActivitySummary> }).patronSummary()).resolves.toMatchObject({
      totalPatrons: 0,
      totalShardBalance: 0,
      totalStandingPoints: 0,
      patrons: [],
    });
  });

  test('ignores malformed patron ledger numbers instead of fabricating zero or one point entries', async () => {
    const { RuntimeRepository } = await import('./runtime');
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dashboard-patrons-malformed-'));
    const memoryRoot = path.join(root, 'memory');
    const repository = new RuntimeRepository(
      memoryRoot,
      path.join(root, 'logs'),
      path.join(root, 'agent-logs'),
      path.join(root, 'souls'),
    );
    await fs.mkdir(memoryRoot, { recursive: true });
    await fs.writeFile(
      path.join(memoryRoot, 'patron-currency.json'),
      JSON.stringify({
        balances: {
          valid: '12',
          nullish: null,
          falsey: false,
          blank: '',
          trueish: true,
          arrayish: [],
        },
      }),
      'utf8',
    );
    await fs.writeFile(
      path.join(memoryRoot, 'patron-standing.json'),
      JSON.stringify({
        points: {
          'valid|embassy': '30',
          'falsey|embassy': false,
          'blank|embassy': '',
          'trueish|embassy': true,
          'arrayish|embassy': [],
        },
      }),
      'utf8',
    );

    const summary = await (repository as { patronSummary(limit?: number): Promise<PatronActivitySummary> }).patronSummary();

    expect(summary).toMatchObject({
      totalPatrons: 1,
      totalShardBalance: 12,
      totalStandingPoints: 30,
      tierCounts: { stranger: 0, acquaintance: 0, ally: 1, officer: 0 },
    });
    expect(summary.patrons).toHaveLength(1);
    expect(summary.patrons[0]).toMatchObject({ handle: 'v***', balance: 12, standing: [{ points: 30, tier: 'ally' }] });
  });
});

describe('RuntimeRepository relationships', () => {
  test('summarizes library patron and peer relationships without exposing raw handles', async () => {
    const { RuntimeRepository } = await import('./runtime');
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dashboard-relationships-'));
    const memoryRoot = path.join(root, 'memory');
    const libraryRoot = path.join(memoryRoot, 'library');
    const repository = new RuntimeRepository(
      memoryRoot,
      path.join(root, 'logs'),
      path.join(root, 'agent-logs'),
      path.join(root, 'souls'),
    );
    await fs.mkdir(path.join(libraryRoot, 'res-agent'), { recursive: true });
    await fs.mkdir(path.join(libraryRoot, 'res-hans'), { recursive: true });
    await fs.writeFile(
      path.join(libraryRoot, 'res-agent', 'timeline.jsonl'),
      [
        JSON.stringify({ kind: 'say', ts: '2026-05-25T19:59:00.000Z', text: 'hello' }),
        JSON.stringify({ kind: 'patron_gift', ts: '2026-05-25T20:00:00.000Z', patronHandle: 'alice@example.com', amount: 42 }),
        JSON.stringify({ kind: 'patron_gift', ts: '2026-05-25T20:00:30.000Z', patronHandle: 'ALICE@example.com', amount: 7 }),
        JSON.stringify({ kind: 'patron_witness', ts: '2026-05-25T20:01:00.000Z', patronHandle: 'bob', note: 'watched' }),
        JSON.stringify({ kind: 'patron_sponsor', ts: '2026-05-25T20:02:00.000Z', humanId: 'alice@example.com' }),
        JSON.stringify({ kind: 'first_peer_encounter', ts: '2026-05-25T20:03:00.000Z', tick: 100, peerId: 'res:hans', interactions: 1 }),
        JSON.stringify({ kind: 'relationship_repeated', ts: '2026-05-25T20:04:00.000Z', tick: 105, peerId: 'res:hans', interactions: 3 }),
        ...Array.from({ length: 1001 }, (_, index) =>
          JSON.stringify({ kind: 'say', ts: `2026-05-25T20:10:${String(index % 60).padStart(2, '0')}.000Z`, text: `filler ${index}` }),
        ),
      ].join('\n'),
      'utf8',
    );
    await fs.writeFile(
      path.join(libraryRoot, 'res-hans', 'timeline.jsonl'),
      [JSON.stringify({ kind: 'stuck_detected', ts: '2026-05-25T20:05:00.000Z' })].join('\n'),
      'utf8',
    );

    const summary = await (
      repository as {
        relationshipSummary(limit?: number): Promise<RelationshipActivitySummary>;
      }
    ).relationshipSummary(5);

    expect(summary).toMatchObject({
      residentsWithRelationships: 1,
      totalPatrons: 2,
      totalPatronEvents: 4,
      totalPeerRelationships: 1,
      totalPeerEvents: 2,
      totalPeerInteractions: 3,
    });
    expect(summary.residents).toHaveLength(1);
    expect(summary.residents[0]).toMatchObject({
      resident: 'res:agent',
      patrons: 2,
      patronEvents: 4,
      peerRelationships: 1,
      peerEvents: 2,
      peerInteractions: 3,
      latestEventAt: '2026-05-25T20:04:00.000Z',
      latestEventKind: 'relationship_repeated',
      latestEventTick: 105,
    });
    expect(JSON.stringify(summary)).not.toContain('alice@example.com');
    expect(JSON.stringify(summary)).not.toContain('ALICE@example.com');
    expect(JSON.stringify(summary)).not.toContain('bob');
  });

  test('filters library timelines to the visible resident allowlist', async () => {
    const { RuntimeRepository } = await import('./runtime');
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dashboard-relationships-filter-'));
    const memoryRoot = path.join(root, 'memory');
    const libraryRoot = path.join(memoryRoot, 'library');
    const repository = new RuntimeRepository(
      memoryRoot,
      path.join(root, 'logs'),
      path.join(root, 'agent-logs'),
      path.join(root, 'souls'),
    );
    await fs.mkdir(path.join(libraryRoot, 'res-agent'), { recursive: true });
    await fs.mkdir(path.join(libraryRoot, 'res-archived'), { recursive: true });
    await fs.writeFile(
      path.join(libraryRoot, 'res-agent', 'timeline.jsonl'),
      JSON.stringify({ kind: 'patron_gift', ts: '2026-05-25T20:00:00.000Z', patronHandle: 'visible' }),
      'utf8',
    );
    await fs.writeFile(
      path.join(libraryRoot, 'res-archived', 'timeline.jsonl'),
      JSON.stringify({ kind: 'patron_gift', ts: '2026-05-25T20:01:00.000Z', patronHandle: 'private' }),
      'utf8',
    );

    const summary = await (
      repository as {
        relationshipSummary(limit?: number, visibleResidents?: Iterable<string>): Promise<RelationshipActivitySummary>;
      }
    ).relationshipSummary(5, ['res:agent']);

    expect(summary).toMatchObject({
      residentsWithRelationships: 1,
      totalPatrons: 1,
      totalPatronEvents: 1,
    });
    expect(summary.residents.map(row => row.resident)).toEqual(['res:agent']);
  });

  test('returns an empty relationship summary when library timelines are missing', async () => {
    const { RuntimeRepository } = await import('./runtime');
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dashboard-relationships-empty-'));
    const repository = new RuntimeRepository(
      path.join(root, 'memory'),
      path.join(root, 'logs'),
      path.join(root, 'agent-logs'),
      path.join(root, 'souls'),
    );

    await expect((repository as { relationshipSummary(limit?: number): Promise<unknown> }).relationshipSummary()).resolves.toMatchObject({
      residentsWithRelationships: 0,
      totalPatrons: 0,
      totalPatronEvents: 0,
      totalPeerRelationships: 0,
      residents: [],
    });
  });
});

describe('RuntimeRepository benchmarks', () => {
  test('lists benchmark artifacts newest first and skips malformed files', async () => {
    const { RuntimeRepository } = await import('./runtime');
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dashboard-benchmarks-'));
    const benchmarkRoot = path.join(root, 'benchmarks');
    const repository = new RuntimeRepository(
      path.join(root, 'memory'),
      path.join(root, 'logs'),
      path.join(root, 'agent-logs'),
      path.join(root, 'souls'),
      path.join(root, 'residents'),
      benchmarkRoot,
    );
    await fs.mkdir(benchmarkRoot, { recursive: true });
    await fs.writeFile(path.join(benchmarkRoot, 'broken.json'), '{', 'utf8');
    await fs.writeFile(
      path.join(benchmarkRoot, 'bench_old.json'),
      JSON.stringify({
        schemaVersion: 1,
        runId: 'bench_old',
        task: { id: 'make-fire-5m', version: '0.1.0' },
        module: { id: 'onion.runescape.standard', version: '0.1.0' },
        resident: 'res:bmk_old',
        modelProfile: 'local',
        commits: [{ repo: 'rs6-nullcity-server', sha: 'abcdef1' }],
        startedAt: '2026-05-21T00:00:00.000Z',
        endedAt: '2026-05-21T00:01:00.000Z',
        durationMs: 60000,
        status: 'passed',
        score: 1,
        metrics: { selectedModuleActions: 2 },
        evidence: { summaries: ['made fire'] },
        generatedAt: '2026-05-21T00:01:00.000Z',
      }),
      'utf8',
    );
    await fs.writeFile(
      path.join(benchmarkRoot, 'bench_new.json'),
      JSON.stringify({
        schemaVersion: 1,
        runId: 'bench_new',
        task: { id: 'follow-and-chat-5m', version: '0.1.0' },
        module: { id: 'onion.runescape.standard', version: '0.1.0' },
        mode: 'autonomous',
        resident: 'res:bmk_new',
        modelProfile: 'local',
        commits: [{ repo: 'rs6-nullcity-server', sha: 'abcdef2' }],
        startedAt: '2026-05-21T00:03:00.000Z',
        endedAt: '2026-05-21T00:04:00.000Z',
        durationMs: 60000,
        status: 'failed',
        score: 0.25,
        metrics: { selectedModuleActions: 1, statusResponses: 0 },
        evidence: { summaries: ['heard command'] },
        failureReason: 'No status response',
        generatedAt: '2026-05-21T00:04:00.000Z',
      }),
      'utf8',
    );

    const runs = await repository.listBenchmarkArtifacts();
    const detail = await repository.readBenchmarkArtifact('bench_new');

    expect(runs.map(run => run.runId)).toEqual(['bench_new', 'bench_old']);
    expect(runs[0]).toMatchObject({
      file: 'bench_new.json',
      task: { id: 'follow-and-chat-5m' },
      mode: 'autonomous',
      status: 'failed',
      score: 0.25,
      metrics: { selectedModuleActions: 1, statusResponses: 0 },
      failureReason: 'No status response',
    });
    expect(detail?.evidence.summaries).toEqual(['heard command']);
    expect(await repository.readBenchmarkArtifact('../bench_new')).toBeUndefined();
  });

  test('opens benchmark detail artifacts from nested output directories', async () => {
    const { RuntimeRepository } = await import('./runtime');
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dashboard-benchmark-detail-'));
    const benchmarkRoot = path.join(root, 'benchmarks');
    const repository = new RuntimeRepository(
      path.join(root, 'memory'),
      path.join(root, 'logs'),
      path.join(root, 'agent-logs'),
      path.join(root, 'souls'),
      path.join(root, 'residents'),
      benchmarkRoot,
    );
    await fs.mkdir(path.join(benchmarkRoot, 'combat-smoke'), { recursive: true });
    await fs.writeFile(
      path.join(benchmarkRoot, 'combat-smoke', 'bench_nested_combat.json'),
      JSON.stringify({
        schemaVersion: 1,
        runId: 'bench_nested_combat',
        task: { id: 'combat-prayer-10m', version: '0.1.0' },
        module: { id: 'onion.runescape.standard', version: '0.1.0' },
        mode: 'autonomous',
        resident: 'res:bmk_combat',
        modelProfile: 'local',
        commits: [{ repo: 'rs6-nullcity-server', sha: 'abcdef1' }],
        startedAt: '2026-05-23T03:00:00.000Z',
        endedAt: '2026-05-23T03:01:36.000Z',
        durationMs: 96305,
        status: 'passed',
        score: 1,
        metrics: { prayerSuccess: 1 },
        evidence: { summaries: ['combat-prayer-10m observed safe combat'] },
        generatedAt: '2026-05-23T03:01:36.000Z',
      }),
      'utf8',
    );

    const detail = await repository.readBenchmarkArtifact('bench_nested_combat');

    expect(detail).toMatchObject({
      runId: 'bench_nested_combat',
      task: { id: 'combat-prayer-10m' },
      status: 'passed',
      evidence: { summaries: ['combat-prayer-10m observed safe combat'] },
    });
  });

  test('normalizes named capability soak artifacts that omit benchmark task/module envelopes', async () => {
    const { RuntimeRepository } = await import('./runtime');
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dashboard-named-soak-'));
    const benchmarkRoot = path.join(root, 'benchmarks');
    const repository = new RuntimeRepository(
      path.join(root, 'memory'),
      path.join(root, 'logs'),
      path.join(root, 'agent-logs'),
      path.join(root, 'souls'),
      path.join(root, 'residents'),
      benchmarkRoot,
    );
    await fs.mkdir(path.join(benchmarkRoot, 'capability-qa'), { recursive: true });
    await fs.writeFile(
      path.join(benchmarkRoot, 'capability-qa', 'named_trade_soak_20260530125718.json'),
      JSON.stringify({
        schemaVersion: 1,
        kind: 'named_trade_soak',
        startedAt: '2026-05-30T12:56:25.537Z',
        endedAt: '2026-05-30T12:57:18.314Z',
        options: { resident: 'res:qa-trader' },
        status: 'passed',
        score: 1,
        metrics: { tradeCompletedEvents: 1, unsafeDeclines: 3 },
        summaries: ['safe trade completed; unsafe prompts declined'],
        entries: [
          {
            sparkModule: { id: 'onion.runescape.standard', version: '0.1.0' },
            action: { kind: 'trade_request' },
          },
        ],
      }),
      'utf8',
    );

    const runs = await repository.listBenchmarkArtifacts();
    const detail = await repository.readBenchmarkArtifact('named_trade_soak_20260530125718');

    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({
      runId: 'named_trade_soak_20260530125718',
      task: { id: 'named-trade-soak' },
      module: { id: 'onion.runescape.standard', version: '0.1.0' },
      resident: 'res:qa-trader',
      status: 'passed',
      score: 1,
      metrics: { tradeCompletedEvents: 1, unsafeDeclines: 3 },
    });
    expect(detail?.evidence.summaries).toEqual(['safe trade completed; unsafe prompts declined']);
  });

  test('ranks module leaderboard by pass rate, progress, run count, and recency', async () => {
    const { RuntimeRepository } = await import('./runtime');
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dashboard-leaderboard-'));
    const benchmarkRoot = path.join(root, 'benchmarks');
    const repository = new RuntimeRepository(
      path.join(root, 'memory'),
      path.join(root, 'logs'),
      path.join(root, 'agent-logs'),
      path.join(root, 'souls'),
      path.join(root, 'residents'),
      benchmarkRoot,
    );
    await fs.mkdir(benchmarkRoot, { recursive: true });
    const writeRun = (run: Record<string, unknown>) =>
      fs.writeFile(
        path.join(benchmarkRoot, `${run.runId}.json`),
        JSON.stringify({
          schemaVersion: 1,
          task: { id: 'make-fire-5m', version: '0.1.0' },
          resident: 'res:bmk',
          modelProfile: 'local',
          commits: [{ repo: 'rs6-nullcity-server', sha: 'abcdef1' }],
          startedAt: '2026-05-21T00:00:00.000Z',
          endedAt: '2026-05-21T00:01:00.000Z',
          durationMs: 60000,
          metrics: {},
          evidence: {},
          generatedAt: '2026-05-21T00:01:00.000Z',
          ...run,
        }),
        'utf8',
      );
    await Promise.all([
      writeRun({
        runId: 'standard_pass',
        module: { id: 'onion.runescape.standard', version: '0.1.0' },
        mode: 'autonomous',
        status: 'passed',
        score: 1,
        metrics: { selectedModuleInferences: 2, cleanupFailures: 1 },
      }),
      writeRun({
        runId: 'standard_fail',
        task: { id: 'combat-prayer-10m', version: '0.1.0' },
        module: { id: 'onion.runescape.standard', version: '0.1.0' },
        status: 'failed',
        score: 0.5,
        metrics: { unsafeLoops: 1 },
        failureReason: 'unsafe loop',
      }),
      writeRun({
        runId: 'experimental_pass',
        module: { id: 'onion.runescape.experimental', version: '0.1.0' },
        status: 'passed',
        score: 0.75,
        endedAt: '2026-05-21T00:02:00.000Z',
      }),
    ]);

    const leaderboard = await repository.benchmarkLeaderboard();

    expect(leaderboard.map(row => row.module.id)).toEqual(['onion.runescape.experimental', 'onion.runescape.standard']);
    expect(leaderboard[0]).toMatchObject({
      runs: 1,
      passed: 1,
      passRate: 1,
      averageScore: 0.75,
    });
    expect(leaderboard[1]).toMatchObject({
      runs: 2,
      taskCount: 2,
      passed: 1,
      nonPassed: 1,
      passRate: 0.5,
      averageScore: 0.75,
      autonomousRuns: 1,
      safetyIncidents: 1,
      cleanupFailures: 1,
      inferenceRequests: 2,
    });
    expect(leaderboard[1]?.tasks.map(task => task.taskId).sort()).toEqual(['combat-prayer-10m', 'make-fire-5m']);
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
