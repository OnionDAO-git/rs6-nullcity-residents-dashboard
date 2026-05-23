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
