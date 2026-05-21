import fs from 'node:fs/promises';
import path from 'node:path';
import type {
  ActionLogEntry,
  ControllerStatus,
  InferenceLogEntry,
  ResidentDashboardRow,
  ResidentSummary,
  SparkRuntimeSummary,
  RuntimeReadModel,
  RuntimeState,
  SoulSummary,
} from '@nullcity-dashboard/shared';
import { asRecord, latestDatedJsonl, listFiles, pathExists, readJsonFile, readJsonl, readTextFile, residentSlug, safeJoin } from './util';

export class RuntimeRepository {
  constructor(
    private readonly memoryRoot: string,
    private readonly logsRoot: string,
    private readonly soulsRoot: string,
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

  async residentRuntime(resident: string, summary?: ResidentSummary): Promise<RuntimeReadModel> {
    const slug = residentSlug(resident);
    const memoryDir = path.join(this.memoryRoot, slug);
    const [state, indexMarkdown, hooksMarkdown, rulesMarkdown, memoryFiles, actions, inference] = await Promise.all([
      readJsonFile<RuntimeState>(path.join(memoryDir, 'runtime-state.json')),
      readTextFile(path.join(memoryDir, 'INDEX.md')),
      readTextFile(path.join(memoryDir, 'hooks.md')),
      readTextFile(path.join(memoryDir, 'nervous-rules.md')),
      listFiles(memoryDir, ['.md', '.json']).catch(() => []),
      this.readResidentActions(resident),
      this.readResidentInference(resident),
    ]);

    const latestAction = actions.at(-1);
    const latestInference = inference.at(-1);
    const reaction = latestAction?.source === 'nervous-system' ? latestAction : [...actions].reverse().find(entry => entry.source === 'nervous-system');
    const spark = buildSparkRuntimeSummary(actions, inference);

    return {
      available: Boolean(state || indexMarkdown || hooksMarkdown || rulesMarkdown || actions.length || inference.length),
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
      },
      spark,
      memory: {
        indexMarkdown,
        files: memoryFiles,
      },
      logs: {
        actions,
        inference,
      },
      errors: [],
    };
  }

  async enrichResidents(residents: ResidentSummary[]): Promise<ResidentDashboardRow[]> {
    return Promise.all(
      residents.map(async resident => {
        const runtime = await this.residentRuntime(resident.name, resident);
        return {
          name: resident.name,
          online: resident.online,
          controllerId: resident.controllerId,
          attention: runtime.state?.attention,
          legacy: runtime.state?.legacy,
          budgets: runtime.state?.budgets,
          variables: runtime.state?.variables,
          thinking: runtime.thinking,
          nervous: runtime.nervous,
          body: runtime.body,
          spark: runtime.spark,
          lastEvent: latestEvent(runtime.logs.actions),
          errors: runtime.errors,
        };
      }),
    );
  }

  async listSouls(): Promise<SoulSummary[]> {
    const files = await listFiles(this.soulsRoot, ['.md']);
    return Promise.all(files.map(file => this.readSoul(file)));
  }

  async readMemoryFile(resident: string, relativePath: string): Promise<string | undefined> {
    const memoryDir = path.join(this.memoryRoot, residentSlug(resident));
    return readTextFile(safeJoin(memoryDir, relativePath));
  }

  async deleteResidentFiles(resident: string): Promise<{ removed: string[] }> {
    const candidates = [
      path.join(this.memoryRoot, residentSlug(resident)),
      path.join(this.logsRoot, resident),
      path.join(this.logsRoot, residentSlug(resident)),
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

  private async readSoul(file: string): Promise<SoulSummary> {
    const text = (await readTextFile(path.join(this.soulsRoot, file))) || '';
    const frontmatter = parseYamlishFrontmatter(text);
    const heading = text.match(/^#\s+(.+)$/m)?.[1]?.trim();
    const name = typeof frontmatter.name === 'string' ? frontmatter.name : file.replace(/\.md$/, '');
    const variables = asRecord(frontmatter.variables);
    return {
      id: name,
      file,
      title: typeof frontmatter.display === 'string' ? frontmatter.display : heading || name,
      attentionProfile: frontmatter.attentionProfile,
      variables: Object.keys(variables).length ? variables : undefined,
      hooks: Array.isArray(frontmatter.hooks) ? frontmatter.hooks : undefined,
      nervousRules: Array.isArray(frontmatter.nervousSystem) ? frontmatter.nervousSystem : undefined,
      legacyKind: typeof asRecord(frontmatter.legacy).kind === 'string' ? String(asRecord(frontmatter.legacy).kind) : undefined,
      errors: [],
    };
  }

  private async readResidentActions(resident: string): Promise<ActionLogEntry[]> {
    const roots = [path.join(this.logsRoot, resident, 'actions'), path.join(this.logsRoot, residentSlug(resident), 'actions')];
    return readLatestFromRoots<ActionLogEntry>(roots, 100);
  }

  private async readResidentInference(resident: string): Promise<InferenceLogEntry[]> {
    const roots = [path.join(this.logsRoot, resident, 'inference'), path.join(this.logsRoot, residentSlug(resident), 'inference')];
    return readLatestFromRoots<InferenceLogEntry>(roots, 100);
  }
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

function inferThinkingMode(entry?: InferenceLogEntry): RuntimeReadModel['thinking']['mode'] {
  if (!entry) return 'idle';
  const status = String(entry.status || '');
  if (status.includes('decid')) return 'deciding';
  if (status.includes('execut')) return 'executing';
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
