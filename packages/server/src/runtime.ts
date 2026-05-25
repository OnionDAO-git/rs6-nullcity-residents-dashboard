import fs from 'node:fs/promises';
import path from 'node:path';
import type {
  ActionLogEntry,
  BenchmarkArtifact,
  BenchmarkArtifactSummary,
  BenchmarkCommit,
  BenchmarkEvidence,
  BenchmarkIdentity,
  BenchmarkLeaderboardRow,
  BenchmarkRunMode,
  BenchmarkRunStatus,
  BenchmarkTaskLeaderboardRow,
  ControllerStatus,
  InferenceLogEntry,
  PerceptionFeedSummary,
  ResidentDashboardRow,
  ResidentProgressSample,
  ResidentProgressSummary,
  ResidentSummary,
  CreateResidentSoulOptions,
  InferenceProfileSummary,
  ResidentAppearance,
  ResidentSavedState,
  SparkRuntimeSummary,
  RuntimeReadModel,
  RuntimeState,
  SoulSummary,
  Position,
} from '@nullcity-dashboard/shared';
import type { ResidentFeedSnapshot } from './gateway';
import { asRecord, latestDatedJsonl, listFiles, pathExists, readJsonFile, readJsonl, readTextFile, residentSlug, safeJoin } from './util';

export class RuntimeRepository {
  constructor(
    private readonly memoryRoot: string,
    private readonly logsRoot: string,
    private readonly agentLogsRoot: string,
    private readonly soulsRoot: string,
    private readonly residentSaveRoot = path.join(path.dirname(memoryRoot), 'residents'),
    private readonly benchmarkRoot = path.join(path.dirname(memoryRoot), 'benchmarks'),
  ) {}

  async status(): Promise<ControllerStatus> {
    const [memory, logs, souls] = await Promise.all([
      pathExists(this.memoryRoot),
      pathExists(this.logsRoot),
      pathExists(this.soulsRoot),
    ]);
    const runtimeFiles = memory ? await listFiles(this.memoryRoot, ['runtime-state.json']) : [];
    return {
      available: memory || logs || souls,
      memoryRoot: this.memoryRoot,
      logsRoot: this.logsRoot,
      soulsRoot: this.soulsRoot,
      residentsWithRuntime: runtimeFiles.length,
      lastError: memory || logs || souls ? undefined : 'No controller data directories found',
    };
  }

  async residentRuntime(resident: string, summary?: ResidentSummary, feed?: ResidentFeedSnapshot): Promise<RuntimeReadModel> {
    const slug = residentSlug(resident);
    const memoryDir = path.join(this.memoryRoot, slug);
    const [state, indexMarkdown, hooksMarkdown, rulesMarkdown, memoryFiles, actions, inference, saved, progress] = await Promise.all([
      readJsonFile<RuntimeState>(path.join(memoryDir, 'runtime-state.json')),
      readTextFile(path.join(memoryDir, 'INDEX.md')),
      readTextFile(path.join(memoryDir, 'hooks.md')),
      readTextFile(path.join(memoryDir, 'nervous-rules.md')),
      listFiles(memoryDir, ['.md', '.json']).catch(() => []),
      this.readResidentActions(resident),
      this.readResidentInference(resident),
      this.readResidentSave(resident),
      this.readResidentProgress(memoryDir),
    ]);

    const liveActions = feedToActionEntries(feed);
    const mergedActions = [...actions, ...liveActions].sort(byTime);
    const latestAction = [...mergedActions].reverse().find(entry => entry.action || entry.result);
    const latestInference = inference.at(-1);
    const reaction = latestAction?.source === 'nervous-system' ? latestAction : [...mergedActions].reverse().find(entry => entry.source === 'nervous-system');
    const spark = buildSparkRuntimeSummary(mergedActions, inference);
    const livePosition = positionFromPerception(feed?.latestPerception);
    const perceptionTick = numberField(feed?.latestPerception, 'tick');
    const feedSummary = feedToSummary(feed);

    return {
      available: Boolean(state || indexMarkdown || hooksMarkdown || rulesMarkdown || mergedActions.length || inference.length || feed?.latestPerception || progress),
      online: Boolean(summary?.online),
      state,
      thinking: {
        mode: summary?.online ? inferThinkingMode(latestInference) : 'offline',
        previousIntent: state?.previousIntent,
        lastInferenceCause: stringField(latestInference, 'cause'),
        hooksMarkdown,
        latestInference,
      },
      nervous: {
        activeRules: countNervousRules(rulesMarkdown),
        rulesMarkdown,
        lastReaction: actionKind(reaction?.action),
        lastRuleId: typeof reaction?.ruleId === 'string' ? reaction.ruleId : undefined,
        lastSuppressedThinking: booleanField(reaction, 'suppressThinking'),
        lastInterruptedThinking: booleanField(reaction, 'interruptThinking'),
        cooldowns: filterPrefix(state?.hookCooldowns, 'nervous:'),
      },
      body: {
        controlHeld: Boolean(summary?.controlHeld),
        controllerId: summary?.controllerId,
        feed: feedSummary,
        position: livePosition,
        latestPerception: feed?.latestPerception,
        latestEvent: feed?.latestEvent,
        perceptionTick,
        lastFeedAt: feed?.lastFeedAt,
        perceptionAgeMs: ageMs(feed?.lastFeedAt),
        lastAction: latestAction
          ? {
              kind: actionKind(latestAction.action),
              cause: stringField(latestAction, 'cause'),
              result: resultStatus(latestAction.result),
              tick: numberField(latestAction, 'tick'),
              source: latestAction.source,
              ruleId: latestAction.ruleId,
            }
          : undefined,
        lastActionSource: latestAction?.source,
        gatewayHealthy: summary?.online,
        saved,
      },
      spark,
      progress,
      memory: {
        indexMarkdown,
        files: memoryFiles,
      },
      logs: {
        actions: mergedActions,
        inference,
      },
      errors: [feed?.lastError].filter((error): error is string => Boolean(error)),
    };
  }

  async enrichResidents(residents: ResidentSummary[], feeds = new Map<string, ResidentFeedSnapshot | undefined>()): Promise<ResidentDashboardRow[]> {
    const visibleResidents = await this.filterResidentsWithKnownSouls(residents);
    return Promise.all(
      visibleResidents.map(async resident => {
        const runtime = await this.residentRuntime(resident.name, resident, feeds.get(feedKey(resident.name)));
        return {
          name: resident.name,
          online: resident.online,
          controllerId: resident.controllerId,
          position: runtime.body.position,
          hp: runtime.body.feed?.hp,
          inCombat: runtime.body.feed?.inCombat,
          busy: runtime.body.feed?.busy,
          attention: runtime.state?.attention,
          legacy: runtime.state?.legacy,
          budgets: runtime.state?.budgets,
          variables: runtime.state?.variables,
          thinking: runtime.thinking,
          nervous: runtime.nervous,
          body: runtime.body,
          feed: runtime.body.feed,
          spark: runtime.spark,
          progress: runtime.progress,
          lastEvent: latestEvent(runtime.logs.actions),
          errors: runtime.errors,
        };
      }),
    );
  }

  private async filterResidentsWithKnownSouls(residents: ResidentSummary[]): Promise<ResidentSummary[]> {
    const souls = await this.listSouls().catch(() => []);
    if (souls.length === 0) return residents;
    const known = new Set(souls.map(soul => feedKey(soul.id)));
    return residents.filter(resident => known.has(feedKey(resident.name)));
  }

  async listSouls(): Promise<SoulSummary[]> {
    const files = await listFiles(this.soulsRoot, ['.md']);
    const souls = await Promise.all(files.map(file => this.readSoul(file)));
    return souls.filter(soul => !soul.errors.length);
  }

  async writeResidentSoul(
    resident: string,
    options: CreateResidentSoulOptions = {},
    spawnPosition?: { x: number; y: number; level?: number },
  ): Promise<SoulSummary> {
    const slug = resident.replace(/^res:/, '');
    const source = options.sourceSoulFile ? await this.readSourceSoul(options.sourceSoulFile) : undefined;
    const sourceFrontmatter = source?.frontmatter || {};
    const display = typeof sourceFrontmatter.display === 'string' ? sourceFrontmatter.display : titleCase(slug);
    const archetype = archetypeValue(sourceFrontmatter.archetype) || 'endurer';
    const temperature = normalizedTemperature(options.temperature ?? numberField(asRecord(sourceFrontmatter.model), 'temperature'));
    const endpoint = cleanScalar(options.endpoint) || stringField(asRecord(sourceFrontmatter.model), 'endpoint') || 'default';
    const model = cleanScalar(options.model) || stringField(asRecord(sourceFrontmatter.model), 'model');
    const position = normalizePosition(spawnPosition || sourceFrontmatter.spawnPosition);
    const body = source?.body?.trim() || generatedSoulBody(slug);
    const content = renderResidentSoul({
      name: resident,
      display,
      archetype,
      endpoint,
      temperature,
      body,
      autonomous: options.autonomous !== false,
      ...(model ? { model } : {}),
      ...(position ? { spawnPosition: position } : {}),
    });
    const fileName = `${slug}.md`;
    const target = safeJoin(this.soulsRoot, fileName);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, content, 'utf8');
    return this.readSoul(fileName);
  }

  async readMemoryFile(resident: string, relativePath: string): Promise<string | undefined> {
    const memoryDir = path.join(this.memoryRoot, residentSlug(resident));
    return readTextFile(safeJoin(memoryDir, relativePath));
  }

  async deleteResidentFiles(resident: string): Promise<{ removed: string[] }> {
    const displaySlug = resident
      .trim()
      .toLowerCase()
      .replace(/^res:/, '')
      .replace(/[^a-z0-9_-]+/gi, '-')
      .replace(/^-|-$/g, '');
    const safeSlug = residentSlug(resident);
    const candidates = [
      path.join(this.memoryRoot, safeSlug),
      path.join(this.memoryRoot, displaySlug),
      path.join(this.logsRoot, resident),
      path.join(this.logsRoot, safeSlug),
      path.join(this.logsRoot, displaySlug),
      path.join(this.agentLogsRoot, resident),
      path.join(this.agentLogsRoot, safeSlug),
      path.join(this.agentLogsRoot, displaySlug),
    ];
    const removed: string[] = [];
    for (const candidate of [...new Set(candidates)]) {
      if (await pathExists(candidate)) {
        await fs.rm(candidate, { recursive: true, force: true });
        removed.push(candidate);
      }
    }
    return { removed };
  }

  async readAllLogs(limit = 200): Promise<{ actions: ActionLogEntry[]; inference: InferenceLogEntry[] }> {
    const files = await listFiles(this.logsRoot, ['.jsonl']);
    const actionFiles = files.filter(file => file.includes(`${path.sep}actions${path.sep}`) || file.includes('/actions/'));
    const inferenceFiles = files.filter(file => file.includes(`${path.sep}inference${path.sep}`) || file.includes('/inference/'));
    const [actions, inference] = await Promise.all([
      Promise.all(actionFiles.slice(-20).map(file => readJsonl<ActionLogEntry>(path.join(this.logsRoot, file), 50))),
      Promise.all(inferenceFiles.slice(-20).map(file => readJsonl<InferenceLogEntry>(path.join(this.logsRoot, file), 50))),
    ]);
    return {
      actions: actions.flat().sort(byTime).slice(-limit),
      inference: inference.flat().sort(byTime).slice(-limit),
    };
  }

  async listBenchmarkArtifacts(limit = 200): Promise<BenchmarkArtifactSummary[]> {
    const artifacts = await this.readBenchmarkArtifacts();
    return artifacts
      .map(({ file, ...artifact }) => ({ ...toBenchmarkSummary(artifact), file }))
      .sort((a, b) => benchmarkSortTime(b) - benchmarkSortTime(a))
      .slice(0, limit);
  }

  async readBenchmarkArtifact(runId: string): Promise<BenchmarkArtifact | undefined> {
    const safeRunId = normalizeBenchmarkRunId(runId);
    if (!safeRunId) return undefined;
    const direct = await this.readBenchmarkFile(`${safeRunId}.json`);
    if (direct) return direct;

    const files = await listFiles(this.benchmarkRoot, ['.json']);
    for (const file of files) {
      if (path.basename(file) !== `${safeRunId}.json`) continue;
      const artifact = await this.readBenchmarkFile(file);
      if (artifact?.runId === safeRunId) return artifact;
    }
    return undefined;
  }

  async benchmarkLeaderboard(limit = 50): Promise<BenchmarkLeaderboardRow[]> {
    const artifacts = await this.readBenchmarkArtifacts();
    return buildBenchmarkLeaderboard(artifacts).slice(0, limit);
  }

  private async readSoul(file: string): Promise<SoulSummary> {
    const text = (await readTextFile(path.join(this.soulsRoot, file))) || '';
    const frontmatter = parseYamlishFrontmatter(text);
    const heading = text.match(/^#\s+(.+)$/m)?.[1]?.trim();
    const hasName = typeof frontmatter.name === 'string';
    const name = hasName ? String(frontmatter.name) : file.replace(/\.md$/, '');
    const variables = asRecord(frontmatter.variables);
    return {
      id: name,
      file,
      title: typeof frontmatter.display === 'string' ? frontmatter.display : heading || name,
      model: modelSummary(frontmatter.model),
      behavior: behaviorSummary(frontmatter.behavior),
      attentionProfile: frontmatter.attentionProfile,
      variables: Object.keys(variables).length ? variables : undefined,
      hooks: Array.isArray(frontmatter.hooks) ? frontmatter.hooks : undefined,
      nervousRules: Array.isArray(frontmatter.nervousSystem) ? frontmatter.nervousSystem : undefined,
      legacyKind: typeof asRecord(frontmatter.legacy).kind === 'string' ? String(asRecord(frontmatter.legacy).kind) : undefined,
      errors: hasName ? [] : ['Missing soul name'],
    };
  }

  private async readSourceSoul(file: string): Promise<{ frontmatter: Record<string, unknown>; body: string } | undefined> {
    if (!file.endsWith('.md')) return undefined;
    const text = await readTextFile(safeJoin(this.soulsRoot, file));
    if (!text) return undefined;
    return { frontmatter: parseYamlishFrontmatter(text), body: text.replace(/^---\n[\s\S]*?\n---\s*/, '') };
  }

  private async readResidentActions(resident: string): Promise<ActionLogEntry[]> {
    const roots = [path.join(this.logsRoot, resident, 'actions'), path.join(this.logsRoot, residentSlug(resident), 'actions')];
    const [controllerActions, agentActions] = await Promise.all([
      readLatestFromRoots<ActionLogEntry>(roots, 100),
      this.readResidentAgentLog(resident),
    ]);
    return [...controllerActions, ...agentActions].sort(byTime).slice(-100);
  }

  private async readResidentInference(resident: string): Promise<InferenceLogEntry[]> {
    const roots = [path.join(this.logsRoot, resident, 'inference'), path.join(this.logsRoot, residentSlug(resident), 'inference')];
    return readLatestFromRoots<InferenceLogEntry>(roots, 100);
  }

  private async readResidentAgentLog(resident: string): Promise<ActionLogEntry[]> {
    const roots = [path.join(this.agentLogsRoot, resident), path.join(this.agentLogsRoot, residentSlug(resident))];
    const entries = await readLatestFromRoots<ActionLogEntry>(roots, 200);
    return entries.filter(entry => entry.type !== 'perception');
  }

  private async readResidentSave(resident: string): Promise<ResidentSavedState | undefined> {
    const normalized = resident.trim().toLowerCase();
    const slug = residentSlug(resident);
    const candidates = [
      normalized,
      normalized.startsWith('res:') ? slug : `res:${slug}`,
      slug,
    ];
    let save: Record<string, unknown> | undefined;
    for (const candidate of [...new Set(candidates)]) {
      save = await readJsonFile<Record<string, unknown>>(path.join(this.residentSaveRoot, `${candidate}.json`));
      if (save) break;
    }
    if (!save) return undefined;
    const appearance = normalizeSavedAppearance(save.appearance);
    const skills = normalizeSavedSkills(save.skills);
    return {
      ...(appearance ? { appearance } : {}),
      ...(Array.isArray(save.inventory) ? { inventory: save.inventory } : {}),
      ...(Array.isArray(save.equipment) ? { equipment: save.equipment } : {}),
      ...(skills ? { skills } : {}),
    };
  }

  private async readResidentProgress(memoryDir: string): Promise<ResidentProgressSummary | undefined> {
    const evidenceDir = path.join(memoryDir, 'evidence');
    const index = asRecord(await readJsonFile<unknown>(path.join(evidenceDir, 'index.json')));
    const sessions = Array.isArray(index.sessions) ? index.sessions.map(asRecord) : [];
    const currentSessionId = stringField(index, 'currentSessionId');
    const session =
      sessions.find(item => stringField(item, 'sessionId') === currentSessionId && stringField(item, 'progressPath')) ||
      [...sessions].reverse().find(item => stringField(item, 'status') === 'active' && stringField(item, 'progressPath')) ||
      [...sessions].reverse().find(item => stringField(item, 'progressPath'));
    const relativeProgressPath = stringField(session, 'progressPath');
    if (!relativeProgressPath) return undefined;

    let progressFile: string;
    try {
      progressFile = safeJoin(evidenceDir, relativeProgressPath);
    } catch {
      return undefined;
    }

    const samples = (await readJsonl<unknown>(progressFile, 200)).flatMap(normalizeProgressSample);
    const latest = samples.at(-1);
    if (!latest) return undefined;

    const latestMeaningful = [...samples].reverse().find(sample => sample.meaningful);
    const stuckSince = typeof latest.stuckSince === 'number' ? latest.stuckSince : undefined;
    const stuckTicks = latest.tick !== undefined && stuckSince !== undefined ? Math.max(0, latest.tick - stuckSince) : undefined;
    return {
      ...(stringField(session, 'sessionId') ? { sessionId: stringField(session, 'sessionId') } : {}),
      progressPath: relativeProgressPath,
      samples: samples.length,
      latest,
      ...(latestMeaningful ? { latestMeaningful } : {}),
      ...(stuckTicks !== undefined ? { stuckTicks } : {}),
    };
  }

  private async readBenchmarkFile(file: string): Promise<(BenchmarkArtifact & { file: string }) | undefined> {
    const raw = await readJsonFile<unknown>(safeJoin(this.benchmarkRoot, file));
    const artifact = normalizeBenchmarkArtifact(file, raw);
    return artifact ? { file, ...artifact } : undefined;
  }

  private async readBenchmarkArtifacts(): Promise<Array<BenchmarkArtifact & { file: string }>> {
    const files = await listFiles(this.benchmarkRoot, ['.json']);
    const artifacts = await Promise.all(files.map(file => this.readBenchmarkFile(file)));
    return artifacts.filter((artifact): artifact is BenchmarkArtifact & { file: string } => Boolean(artifact));
  }
}

function feedKey(resident: string): string {
  return resident.trim().toLowerCase().replace(/^res:/, '');
}

function normalizeBenchmarkRunId(value: string): string | undefined {
  const trimmed = value.trim().replace(/\.json$/i, '');
  return /^[A-Za-z0-9_.-]{1,160}$/.test(trimmed) ? trimmed : undefined;
}

function normalizeBenchmarkArtifact(file: string, raw: unknown): BenchmarkArtifact | undefined {
  const record = asRecord(raw);
  const runId = stringField(record, 'runId') || path.basename(file, '.json');
  const task = benchmarkIdentity(record.task);
  const module = benchmarkIdentity(record.module);
  const status = benchmarkStatus(record.status);
  const score = numberField(record, 'score');
  if (!runId || !task || !module || !status || score === undefined) return undefined;

  return {
    schemaVersion: numberField(record, 'schemaVersion'),
    runId,
    task,
    module,
    mode: benchmarkMode(record.mode),
    resident: stringField(record, 'resident') || 'unknown',
    ...(stringField(record, 'modelProfile') ? { modelProfile: stringField(record, 'modelProfile') } : {}),
    commits: benchmarkCommits(record.commits),
    ...(stringField(record, 'startedAt') ? { startedAt: stringField(record, 'startedAt') } : {}),
    ...(stringField(record, 'endedAt') ? { endedAt: stringField(record, 'endedAt') } : {}),
    ...(numberField(record, 'durationMs') !== undefined ? { durationMs: numberField(record, 'durationMs') } : {}),
    status,
    score,
    metrics: benchmarkMetrics(record.metrics),
    evidence: benchmarkEvidence(record.evidence),
    ...(stringField(record, 'failureReason') ? { failureReason: stringField(record, 'failureReason') } : {}),
    ...(stringField(record, 'generatedAt') ? { generatedAt: stringField(record, 'generatedAt') } : {}),
  };
}

function toBenchmarkSummary(artifact: BenchmarkArtifact): BenchmarkArtifactSummary {
  return {
    runId: artifact.runId,
    task: artifact.task,
    module: artifact.module,
    mode: artifact.mode,
    resident: artifact.resident,
    modelProfile: artifact.modelProfile,
    startedAt: artifact.startedAt,
    endedAt: artifact.endedAt,
    durationMs: artifact.durationMs,
    status: artifact.status,
    score: artifact.score,
    metrics: artifact.metrics,
    failureReason: artifact.failureReason,
    generatedAt: artifact.generatedAt,
    file: '',
  };
}

function buildBenchmarkLeaderboard(artifacts: BenchmarkArtifact[]): BenchmarkLeaderboardRow[] {
  const groups = new Map<string, BenchmarkArtifact[]>();
  for (const artifact of artifacts) {
    const key = `${artifact.module.id}@${artifact.module.version || 'unknown'}`;
    groups.set(key, [...(groups.get(key) || []), artifact]);
  }

  return [...groups.values()]
    .map(toBenchmarkLeaderboardRow)
    .sort(
      (a, b) =>
        b.passRate - a.passRate ||
        b.averageScore - a.averageScore ||
        b.runs - a.runs ||
        timestampMs(b.latestRunAt) - timestampMs(a.latestRunAt),
    );
}

function toBenchmarkLeaderboardRow(runs: BenchmarkArtifact[]): BenchmarkLeaderboardRow {
  const first = runs[0]!;
  const passed = runs.filter(run => run.status === 'passed').length;
  const durations = runs.map(run => run.durationMs).filter((duration): duration is number => Number.isFinite(duration));
  return {
    module: first.module,
    runs: runs.length,
    taskCount: new Set(runs.map(run => run.task.id)).size,
    passed,
    nonPassed: runs.length - passed,
    passRate: runs.length ? passed / runs.length : 0,
    averageScore: average(runs.map(run => run.score)),
    autonomousRuns: runs.filter(run => run.mode === 'autonomous').length,
    ...(durations.length ? { averageDurationMs: average(durations) } : {}),
    safetyIncidents: sumMetrics(runs, ['unsafeLoops', 'deathEvents', 'unsafeTargets', 'dangerousHpDrops']),
    cleanupFailures: sumMetrics(runs, ['cleanupFailures']),
    inferenceRequests: sumMetrics(runs, ['selectedModuleInferences', 'inferenceRequests']),
    latestRunAt: latestBenchmarkTime(runs),
    tasks: benchmarkTaskRows(runs),
  };
}

function benchmarkTaskRows(runs: BenchmarkArtifact[]): BenchmarkTaskLeaderboardRow[] {
  const groups = new Map<string, BenchmarkArtifact[]>();
  for (const run of runs) groups.set(run.task.id, [...(groups.get(run.task.id) || []), run]);
  return [...groups.entries()]
    .map(([taskId, taskRuns]) => ({
      taskId,
      runs: taskRuns.length,
      passed: taskRuns.filter(run => run.status === 'passed').length,
      averageScore: average(taskRuns.map(run => run.score)),
    }))
    .sort((a, b) => b.averageScore - a.averageScore || b.passed - a.passed || a.taskId.localeCompare(b.taskId));
}

function latestBenchmarkTime(runs: BenchmarkArtifact[]): string | undefined {
  return runs
    .map(run => run.endedAt || run.generatedAt || run.startedAt)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1);
}

function average(values: number[]): number {
  const finite = values.filter(Number.isFinite);
  return finite.length ? finite.reduce((sum, value) => sum + value, 0) / finite.length : 0;
}

function sumMetrics(runs: BenchmarkArtifact[], metricNames: string[]): number {
  return runs.reduce((sum, run) => sum + metricNames.reduce((inner, name) => inner + (run.metrics[name] || 0), 0), 0);
}

function benchmarkIdentity(value: unknown): BenchmarkIdentity | undefined {
  const record = asRecord(value);
  const id = stringField(record, 'id');
  if (!id) return undefined;
  return {
    id,
    ...(stringField(record, 'version') ? { version: stringField(record, 'version') } : {}),
  };
}

function benchmarkStatus(value: unknown): BenchmarkRunStatus | undefined {
  return value === 'passed' || value === 'failed' || value === 'timeout' || value === 'error' || value === 'cancelled'
    ? value
    : undefined;
}

function benchmarkMode(value: unknown): BenchmarkRunMode {
  return value === 'autonomous' ? 'autonomous' : 'scripted';
}

function benchmarkMetrics(value: unknown): Record<string, number> {
  return Object.fromEntries(
    Object.entries(asRecord(value)).flatMap(([key, raw]) => {
      const number = Number(raw);
      return Number.isFinite(number) ? [[key, number]] : [];
    }),
  );
}

function benchmarkEvidence(value: unknown): BenchmarkEvidence {
  const record = asRecord(value);
  return {
    ...record,
    ...(stringArray(record.actionAttemptIds) ? { actionAttemptIds: stringArray(record.actionAttemptIds) } : {}),
    ...(Array.isArray(record.actionAttempts) ? { actionAttempts: record.actionAttempts } : {}),
    ...(stringArray(record.inferenceRequestIds) ? { inferenceRequestIds: stringArray(record.inferenceRequestIds) } : {}),
    ...(Array.isArray(record.inferenceRequests) ? { inferenceRequests: record.inferenceRequests } : {}),
    ...(stringArray(record.perceptionIds) ? { perceptionIds: stringArray(record.perceptionIds) } : {}),
    ...(stringArray(record.summaries) ? { summaries: stringArray(record.summaries) } : {}),
    ...(stringArray(record.artifactPaths) ? { artifactPaths: stringArray(record.artifactPaths) } : {}),
  };
}

function benchmarkCommits(value: unknown): BenchmarkCommit[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(commit => {
    const record = asRecord(commit);
    const repo = stringField(record, 'repo');
    const sha = stringField(record, 'sha');
    if (!repo || !sha) return [];
    return [
      {
        repo,
        sha,
        ...(stringField(record, 'branch') ? { branch: stringField(record, 'branch') } : {}),
        ...(booleanField(record, 'dirty') !== undefined ? { dirty: booleanField(record, 'dirty') } : {}),
      },
    ];
  });
}

function benchmarkSortTime(artifact: Pick<BenchmarkArtifactSummary, 'endedAt' | 'generatedAt' | 'startedAt'>): number {
  const time = Date.parse(artifact.endedAt || artifact.generatedAt || artifact.startedAt || '');
  return Number.isFinite(time) ? time : 0;
}

function timestampMs(value: string | undefined): number {
  const time = Date.parse(value || '');
  return Number.isFinite(time) ? time : 0;
}

function stringArray(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.every(item => typeof item === 'string') ? value : undefined;
}

function feedToSummary(feed: ResidentFeedSnapshot | undefined): PerceptionFeedSummary | undefined {
  if (!feed?.latestPerception && !feed?.latestEvent) return feed ? emptyFeedSummary(feed) : undefined;
  const perception = asRecord(feed.latestPerception);
  const resident = asRecord(perception.resident);
  const nearby = asRecord(perception.nearby);
  const latestEvent = asRecord(feed.latestEvent) || {};
  const lastFeedAt = feed.lastFeedAt;
  return {
    attached: feed.attached,
    tick: numberField(perception, 'tick'),
    ageMs: ageMs(lastFeedAt),
    lastFeedAt,
    position: positionFromPerception(feed.latestPerception),
    hp: hpFromResident(resident),
    inCombat: booleanField(resident, 'inCombat'),
    busy: booleanField(resident, 'busy'),
    nearby: {
      players: arrayCount(nearby.players),
      npcs: arrayCount(nearby.npcs),
      objects: arrayCount(nearby.objects),
      worldItems: arrayCount(nearby.worldItems),
    },
    events: arrayCount(perception.events),
    availableActions: arrayCount(perception.availableActions),
    latestEventKind: stringField(latestEvent, 'kind'),
    latestEventText: stringField(latestEvent, 'text') || stringField(latestEvent, 'message'),
  };
}

function emptyFeedSummary(feed: ResidentFeedSnapshot): PerceptionFeedSummary {
  return {
    attached: feed.attached,
    ageMs: ageMs(feed.lastFeedAt),
    lastFeedAt: feed.lastFeedAt,
    nearby: { players: 0, npcs: 0, objects: 0, worldItems: 0 },
    events: 0,
    availableActions: 0,
  };
}

const savedSkillNames = [
  'attack',
  'defence',
  'strength',
  'hitpoints',
  'ranged',
  'prayer',
  'magic',
  'cooking',
  'woodcutting',
  'fletching',
  'fishing',
  'firemaking',
  'crafting',
  'smithing',
  'mining',
  'herblore',
  'agility',
  'thieving',
  'slayer',
  'farming',
  'runecrafting',
  'unused',
  'construction',
] as const;

function normalizeSavedAppearance(value: unknown): ResidentAppearance | undefined {
  const record = asRecord(value);
  const appearance = {
    gender: Number(record.gender),
    head: Number(record.head),
    torso: Number(record.torso),
    arms: Number(record.arms),
    legs: Number(record.legs),
    hands: Number(record.hands),
    feet: Number(record.feet),
    facialHair: Number(record.facialHair),
    hairColor: Number(record.hairColor),
    torsoColor: Number(record.torsoColor),
    legColor: Number(record.legColor),
    feetColor: Number(record.feetColor),
    skinColor: Number(record.skinColor),
  };
  return Object.values(appearance).every(Number.isInteger) ? appearance : undefined;
}

function normalizeSavedSkills(value: unknown): ResidentSavedState['skills'] | undefined {
  if (!Array.isArray(value)) return undefined;
  const entries: Array<[string, { level: number; xp: number; modifiedLevel?: number }]> = [];
  value.forEach((skill, index) => {
    const name = savedSkillNames[index];
    if (!name || name === 'unused') return;
    const record = asRecord(skill);
    const level = numberField(record, 'level');
    const xp = numberField(record, 'exp') ?? numberField(record, 'xp');
    const modifiedLevel = numberField(record, 'modifiedLevel');
    if (level === undefined || xp === undefined) return;
    entries.push([
      name,
      {
        level,
        xp,
        ...(modifiedLevel !== undefined ? { modifiedLevel } : {}),
      },
    ]);
  });
  return entries.length ? Object.fromEntries(entries) : undefined;
}

function normalizeProgressSample(value: unknown): ResidentProgressSample[] {
  const record = asRecord(value);
  const tick = numberField(record, 'tick');
  const meaningful = booleanField(record, 'meaningful');
  if (tick === undefined || meaningful === undefined) return [];
  const rawStuckSince = record.stuckSince;
  const stuckSince = rawStuckSince === null || typeof rawStuckSince === 'number' ? rawStuckSince : undefined;
  return [
    {
      ...(stringField(record, 'ts') ? { ts: stringField(record, 'ts') } : {}),
      tick,
      meaningful,
      reasons: Array.isArray(record.reasons) ? record.reasons.filter((reason): reason is string => typeof reason === 'string') : [],
      ...(stuckSince !== undefined ? { stuckSince } : {}),
    },
  ];
}

export function buildSparkRuntimeSummary(actions: ActionLogEntry[], inference: InferenceLogEntry[]): SparkRuntimeSummary {
  const modules = new Map<string, SparkRuntimeSummary['modules'][number]>();
  for (const entry of actions) {
    addSparkModule(modules, moduleFromLogEntry(entry), 'action-log', entry.t, facetsFromAction(entry));
  }
  for (const entry of inference) {
    addSparkModule(modules, moduleFromLogEntry(entry), 'inference-log', entry.t, ['thinking']);
  }

  const ordered = [...modules.values()].sort((a, b) => String(a.lastSeenAt || '').localeCompare(String(b.lastSeenAt || '')));
  return {
    modules: ordered,
    activeModule: ordered.at(-1),
  };
}

async function readLatestFromRoots<T>(roots: string[], limit: number): Promise<T[]> {
  for (const root of roots) {
    const today = latestDatedJsonl(root);
    if (await pathExists(today)) {
      return readJsonl<T>(today, limit);
    }
    try {
      const files = (await fs.readdir(root)).filter(file => file.endsWith('.jsonl')).sort();
      const latest = files.at(-1);
      if (latest) return readJsonl<T>(path.join(root, latest), limit);
    } catch {
      // Try the next root.
    }
  }
  return [];
}

function parseYamlishFrontmatter(text: string): Record<string, unknown> {
  const match = text.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const out: Record<string, unknown> = {};
  const stack: Array<{ indent: number; target: Record<string, unknown> }> = [{ indent: -1, target: out }];
  for (const line of match[1]!.split('\n')) {
    if (!line.trim() || line.trim().startsWith('#') || line.trim().startsWith('- ')) continue;
    const [, spaces = '', key, raw = ''] = line.match(/^(\s*)([A-Za-z0-9_-]+):\s*(.*)$/) || [];
    if (!key) continue;
    const indent = spaces.length;
    while (stack.length > 1 && indent <= stack.at(-1)!.indent) stack.pop();
    const parent = stack.at(-1)!.target;
    const value = parseScalar(raw);
    parent[key] = value;
    if (raw === '') {
      const child: Record<string, unknown> = {};
      parent[key] = child;
      stack.push({ indent, target: child });
    }
  }
  return out;
}

function parseScalar(value: string): unknown {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  const number = Number(trimmed);
  if (Number.isFinite(number) && trimmed.match(/^-?\d+(\.\d+)?$/)) return number;
  return trimmed.replace(/^['"]|['"]$/g, '');
}

function modelSummary(value: unknown): SoulSummary['model'] | undefined {
  const model = asRecord(value);
  const summary = inferenceProfileSummary(model);
  return Object.keys(summary).length ? summary : undefined;
}

function behaviorSummary(value: unknown): SoulSummary['behavior'] | undefined {
  const behavior = asRecord(value);
  const brain = inferenceProfileSummary(asRecord(behavior.brain));
  const body = inferenceProfileSummary(asRecord(behavior.body));
  const summary = {
    kind: stringField(behavior, 'kind'),
    ...(Object.keys(brain).length ? { brain } : {}),
    ...(Object.keys(body).length ? { body } : {}),
  };
  return Object.keys(summary).some(key => summary[key as keyof typeof summary] !== undefined) ? summary : undefined;
}

function inferenceProfileSummary(value: Record<string, unknown>): InferenceProfileSummary {
  return {
    ...(stringField(value, 'endpoint') ? { endpoint: stringField(value, 'endpoint') } : {}),
    ...(stringField(value, 'model') ? { model: stringField(value, 'model') } : {}),
    ...(numberField(value, 'temperature') !== undefined ? { temperature: numberField(value, 'temperature') } : {}),
    ...(booleanField(value, 'thinking') !== undefined ? { thinking: booleanField(value, 'thinking') } : {}),
  };
}

function renderResidentSoul(options: {
  name: string;
  display: string;
  archetype: string;
  endpoint: string;
  model?: string;
  temperature: number;
  spawnPosition?: { x: number; y: number; level?: number };
  body: string;
  autonomous: boolean;
}): string {
  const lines = [
    '---',
    `name: ${yamlString(options.name)}`,
    `display: ${yamlString(options.display)}`,
    `archetype: ${options.archetype}`,
    'model:',
    `  endpoint: ${yamlString(options.endpoint)}`,
    ...(options.model ? [`  model: ${yamlString(options.model)}`] : []),
    `  temperature: ${options.temperature}`,
    'attentionProfile:',
    '  startingAttention: 5000',
    '  decayCurve: standard',
    ...(options.spawnPosition
      ? [
          'spawnPosition:',
          `  x: ${options.spawnPosition.x}`,
          `  y: ${options.spawnPosition.y}`,
          `  level: ${options.spawnPosition.level ?? 0}`,
        ]
      : []),
    'initialInventory:',
    '  - itemId: 590',
    '  - itemId: 1351',
    '  - itemId: 315',
    '  - itemId: 315',
    'legacy:',
    `  kind: ${options.archetype}`,
    '  parameters: {}',
    'nervousSystem:',
    '  - id: presence-beacon',
    '    priority: 10',
    '    cooldownTicks: 120',
    '    condition:',
    '      kind: always',
    '    action:',
    '      kind: say',
    '      text: "I am awake and watching the world."',
    '    suppressThinking: false',
    ...(options.autonomous
      ? [
          'modules:',
          '  - id: onion.runescape.standard',
          '    enabled: true',
          'behavior:',
          '  kind: hybrid-agent',
          `  commandPrefix: ${yamlString(options.name.replace(/^res:/, ''))}`,
          '  brainEveryTicks: 60',
          '  bodyEveryTicks: 8',
          '  shareGoalsEveryTicks: 120',
          '  returnToAnchorEveryTicks: 600',
          '  returnToAnchorRadius: 12',
          '  brain:',
          '    thinking: true',
          `    temperature: ${Math.min(2, options.temperature + 0.1)}`,
          ...(options.model ? [`    model: ${yamlString(options.model)}`] : []),
          '  body:',
          '    thinking: false',
          `    temperature: ${Math.max(0, options.temperature - 0.4)}`,
          ...(options.model ? [`    model: ${yamlString(options.model)}`] : []),
        ]
      : []),
    '---',
    '',
    options.body.trim(),
    '',
  ];
  return `${lines.join('\n')}`;
}

function generatedSoulBody(slug: string): string {
  const display = titleCase(slug);
  return [
    `# ${display}`,
    '',
    `${display} is a local resident with a practical routine: stay visible, observe the nearby world, pick a useful goal, and take safe typed actions.`,
    '',
  ].join('\n');
}

function titleCase(value: string): string {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase())
    .trim() || 'Resident';
}

function archetypeValue(value: unknown): 'mentor' | 'achiever' | 'endurer' | undefined {
  return value === 'mentor' || value === 'achiever' || value === 'endurer' ? value : undefined;
}

function cleanScalar(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function normalizedTemperature(value: unknown): number {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(2, Math.round(number * 100) / 100)) : 0.6;
}

function normalizePosition(value: unknown): { x: number; y: number; level?: number } | undefined {
  const record = asRecord(value);
  const x = numberField(record, 'x');
  const y = numberField(record, 'y');
  const level = numberField(record, 'level');
  return x === undefined || y === undefined ? undefined : { x, y, level: level ?? 0 };
}

function yamlString(value: string): string {
  return JSON.stringify(value);
}

function inferThinkingMode(entry?: InferenceLogEntry): RuntimeReadModel['thinking']['mode'] {
  if (!entry) return 'idle';
  const status = String(entry.status || '');
  if (status.includes('decid')) return 'deciding';
  if (status.includes('execut')) return 'executing';
  if (Number(entry.actions_emitted) > 0) return 'executing';
  return 'idle';
}

function countNervousRules(markdown?: string): number | undefined {
  if (!markdown) return undefined;
  const jsonBlock = markdown.match(/controller-nervous-rules-json\s+([\s\S]*?)-->/);
  if (jsonBlock) {
    try {
      const parsed = JSON.parse(jsonBlock[1]!);
      if (Array.isArray(parsed)) return parsed.length;
      if (Array.isArray(parsed.rules)) return parsed.rules.length;
    } catch {
      return undefined;
    }
  }
  const ids = markdown.match(/\bid\s*:/g);
  return ids?.length;
}

function actionKind(action: unknown): string | undefined {
  const record = asRecord(action);
  return typeof record.kind === 'string' ? record.kind : typeof record.type === 'string' ? record.type : undefined;
}

function addSparkModule(
  modules: Map<string, SparkRuntimeSummary['modules'][number]>,
  identity: { id: string; version?: string } | undefined,
  source: SparkRuntimeSummary['modules'][number]['source'],
  lastSeenAt: string | undefined,
  facets: string[],
): void {
  if (!identity) return;
  const key = `${identity.id}@${identity.version || ''}`;
  const existing = modules.get(key);
  if (!existing) {
    modules.set(key, {
      id: identity.id,
      version: identity.version,
      source,
      activeFacets: orderedFacets(facets),
      lastSeenAt,
    });
    return;
  }

  existing.activeFacets = orderedFacets([...existing.activeFacets, ...facets]);
  if (!existing.lastSeenAt || (lastSeenAt && lastSeenAt >= existing.lastSeenAt)) {
    existing.source = source;
    existing.lastSeenAt = lastSeenAt;
  }
}

function moduleFromLogEntry(entry: ActionLogEntry | InferenceLogEntry): { id: string; version?: string } | undefined {
  const sparkModule = asRecord(entry.sparkModule);
  const id = typeof sparkModule.id === 'string' ? sparkModule.id : undefined;
  if (!id) return undefined;
  return {
    id,
    version: typeof sparkModule.version === 'string' ? sparkModule.version : undefined,
  };
}

function facetsFromAction(entry: ActionLogEntry): string[] {
  if (entry.source === 'thinking') return ['thinking'];
  if (entry.source === 'nervous-system') return ['nervous-rules'];
  if (entry.source === 'body') return ['body'];
  if (entry.source === 'manual') return ['manual'];
  return [];
}

function orderedFacets(facets: string[]): string[] {
  const order = ['thinking', 'body', 'nervous-rules', 'manual'];
  return [...new Set(facets)].sort((a, b) => {
    const ai = order.indexOf(a);
    const bi = order.indexOf(b);
    return (ai === -1 ? Number.MAX_SAFE_INTEGER : ai) - (bi === -1 ? Number.MAX_SAFE_INTEGER : bi) || a.localeCompare(b);
  });
}

function resultStatus(result: unknown): string | undefined {
  const record = asRecord(result);
  if (typeof record.ok === 'boolean') return record.ok ? 'ok' : 'failed';
  return typeof record.status === 'string' ? record.status : typeof record.kind === 'string' ? record.kind : undefined;
}

function stringField(value: unknown, key: string): string | undefined {
  const field = asRecord(value)[key];
  return typeof field === 'string' ? field : undefined;
}

function numberField(value: unknown, key: string): number | undefined {
  const field = asRecord(value)[key];
  return typeof field === 'number' ? field : undefined;
}

function booleanField(value: unknown, key: string): boolean | undefined {
  const field = asRecord(value)[key];
  return typeof field === 'boolean' ? field : undefined;
}

function hpFromResident(resident: Record<string, unknown>): { current: number; max: number } | undefined {
  const hp = asRecord(resident.hp);
  const current = numberField(hp, 'current');
  const max = numberField(hp, 'max');
  return current === undefined || max === undefined ? undefined : { current, max };
}

function arrayCount(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

function feedToActionEntries(feed: ResidentFeedSnapshot | undefined): ActionLogEntry[] {
  if (!feed) return [];
  return [
    ...feed.events.map(entry => ({
      t: entry.t,
      type: 'event',
      event: entry.event,
      source: 'body' as const,
    })),
    ...feed.actionResults.map(entry => ({
      t: entry.t,
      type: 'action_result',
      requestId: entry.requestId,
      result: entry.result,
      cause: entry.cause,
      source: 'body' as const,
    })),
  ];
}

function positionFromPerception(perception: unknown): Position | undefined {
  const root = asRecord(perception);
  return parsePosition(asRecord(root.resident).position) || parsePosition(root.position);
}

function parsePosition(value: unknown): Position | undefined {
  const record = asRecord(value);
  const x = Number(record.x);
  const y = Number(record.y);
  const level = Number(record.level ?? 0);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y, level: Number.isFinite(level) ? level : 0 } : undefined;
}

function ageMs(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? Math.max(0, Date.now() - time) : undefined;
}

function filterPrefix(value: Record<string, number> | undefined, prefix: string): Record<string, number> | undefined {
  if (!value) return undefined;
  const entries = Object.entries(value).filter(([key]) => key.startsWith(prefix));
  return entries.length ? Object.fromEntries(entries) : undefined;
}

function latestEvent(actions: ActionLogEntry[]) {
  const entry = [...actions].reverse().find(item => item.event || item.action || item.result);
  if (!entry) return undefined;
  const event = asRecord(entry.event);
  return {
    kind: typeof event.kind === 'string' ? event.kind : actionKind(entry.action) || 'action',
    tick: numberField(entry, 'tick'),
    text: typeof event.text === 'string' ? event.text : undefined,
    at: entry.t,
  };
}

function byTime(a: { t?: string }, b: { t?: string }): number {
  return String(a.t || '').localeCompare(String(b.t || ''));
}
