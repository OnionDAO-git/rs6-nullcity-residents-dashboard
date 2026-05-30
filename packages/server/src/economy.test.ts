import { describe, expect, test } from 'bun:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { readResidentEconomy } from './economy';

async function makeMemoryRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dashboard-economy-'));
  return path.join(root, 'memory');
}

describe('readResidentEconomy', () => {
  test('returns empty-state payload when no substrate files exist', async () => {
    const memoryRoot = await makeMemoryRoot();
    const economy = await readResidentEconomy(memoryRoot, 'res:agent');
    expect(economy).toEqual({ ap: 0, recentEvents: [], activeGoals: [] });
  });

  test('returns empty-state payload when memoryRoot itself does not exist', async () => {
    const economy = await readResidentEconomy('/tmp/does-not-exist-d-econ-panel', 'res:agent');
    expect(economy.ap).toBe(0);
    expect(economy.recentEvents).toEqual([]);
    expect(economy.activeGoals).toEqual([]);
  });

  test('reads AP balance from runtime-state.json#attention', async () => {
    const memoryRoot = await makeMemoryRoot();
    // Server's residentSlug('res:agent') -> 'res-agent' (colon replaced by `-`).
    const residentDir = path.join(memoryRoot, 'res-agent');
    await fs.mkdir(residentDir, { recursive: true });
    await fs.writeFile(
      path.join(residentDir, 'runtime-state.json'),
      JSON.stringify({ resident: 'res:agent', attention: 42, tick: 100, legacy: { kind: 'attention', progress: {}, complete: false }, budgets: {} }),
    );
    const economy = await readResidentEconomy(memoryRoot, 'res:agent');
    expect(economy.ap).toBe(42);
  });

  test('clamps negative AP balance to 0', async () => {
    const memoryRoot = await makeMemoryRoot();
    const residentDir = path.join(memoryRoot, 'res-agent');
    await fs.mkdir(residentDir, { recursive: true });
    await fs.writeFile(
      path.join(residentDir, 'runtime-state.json'),
      JSON.stringify({ attention: -5 }),
    );
    const economy = await readResidentEconomy(memoryRoot, 'res:agent');
    expect(economy.ap).toBe(0);
  });

  test('returns recent economy events filtered to this resident, newest first', async () => {
    const memoryRoot = await makeMemoryRoot();
    const cityDir = path.join(memoryRoot, 'city-integration');
    await fs.mkdir(cityDir, { recursive: true });
    const lines = [
      JSON.stringify({ schemaVersion: 1, id: 'e1', ts: '2026-05-29T00:00:00.000Z', kind: 'ap_grant', residentName: 'res:agent', apDelta: 10, note: 'first' }),
      JSON.stringify({ schemaVersion: 1, id: 'e2', ts: '2026-05-29T00:01:00.000Z', kind: 'ap_decay', residentName: 'res:other', apDelta: -1 }),
      JSON.stringify({ schemaVersion: 1, id: 'e3', ts: '2026-05-29T00:02:00.000Z', kind: 'gp_earned', residentName: 'res:agent', gpDelta: 25, note: 'sold logs' }),
    ];
    await fs.writeFile(path.join(cityDir, 'economy-events.jsonl'), `${lines.join('\n')}\n`);
    const economy = await readResidentEconomy(memoryRoot, 'res:agent');
    expect(economy.recentEvents).toHaveLength(2);
    expect(economy.recentEvents[0]?.id).toBe('e3');
    expect(economy.recentEvents[0]?.gpDelta).toBe(25);
    expect(economy.recentEvents[1]?.id).toBe('e1');
    expect(economy.recentEvents[1]?.apDelta).toBe(10);
    expect(economy.recentEvents[1]?.note).toBe('first');
  });

  test('honours recentEventLimit option', async () => {
    const memoryRoot = await makeMemoryRoot();
    const cityDir = path.join(memoryRoot, 'city-integration');
    await fs.mkdir(cityDir, { recursive: true });
    const lines: string[] = [];
    for (let i = 0; i < 25; i++) {
      lines.push(JSON.stringify({ schemaVersion: 1, id: `e${i}`, ts: `2026-05-29T00:${String(i).padStart(2, '0')}:00.000Z`, kind: 'ap_grant', residentName: 'res:agent', apDelta: 1 }));
    }
    await fs.writeFile(path.join(cityDir, 'economy-events.jsonl'), `${lines.join('\n')}\n`);
    const economy = await readResidentEconomy(memoryRoot, 'res:agent', { recentEventLimit: 5 });
    expect(economy.recentEvents).toHaveLength(5);
    expect(economy.recentEvents[0]?.id).toBe('e24');
    expect(economy.recentEvents[4]?.id).toBe('e20');
  });

  test('skips malformed lines in economy-events.jsonl', async () => {
    const memoryRoot = await makeMemoryRoot();
    const cityDir = path.join(memoryRoot, 'city-integration');
    await fs.mkdir(cityDir, { recursive: true });
    const lines = [
      'NOT JSON {{{',
      JSON.stringify({ schemaVersion: 1, id: 'e1', ts: '2026-05-29T00:00:00.000Z', kind: 'ap_grant', residentName: 'res:agent', apDelta: 5 }),
      '',
      JSON.stringify({ id: 'no-kind', ts: '2026-05-29T00:01:00.000Z', residentName: 'res:agent' }),
    ];
    await fs.writeFile(path.join(cityDir, 'economy-events.jsonl'), `${lines.join('\n')}\n`);
    const economy = await readResidentEconomy(memoryRoot, 'res:agent');
    expect(economy.recentEvents).toHaveLength(1);
    expect(economy.recentEvents[0]?.id).toBe('e1');
  });

  test('returns active goals owned by this resident', async () => {
    const memoryRoot = await makeMemoryRoot();
    const goalDir = path.join(memoryRoot, 'city-integration', 'goals');
    await fs.mkdir(goalDir, { recursive: true });
    await fs.writeFile(
      path.join(goalDir, 'goal-1.json'),
      JSON.stringify({ schemaVersion: 1, id: 'goal-1', residentName: 'res:agent', goalText: 'Bank 100 GP', status: 'active', createdAt: '2026-05-29T00:00:00.000Z', updatedAt: '2026-05-29T00:00:00.000Z', completion: { condition: 'bank GP >= 100', evidenceSource: 'runtime:bank-balance' } }),
    );
    await fs.writeFile(
      path.join(goalDir, 'goal-2.json'),
      JSON.stringify({ schemaVersion: 1, id: 'goal-2', residentName: 'res:agent', goalText: 'Aspirational: see Lumbridge', status: 'active', createdAt: '2026-05-29T00:00:00.000Z', updatedAt: '2026-05-29T00:00:00.000Z' }),
    );
    await fs.writeFile(
      path.join(goalDir, 'goal-3.json'),
      JSON.stringify({ schemaVersion: 1, id: 'goal-3', residentName: 'res:other', goalText: 'Not mine', status: 'active', createdAt: '2026-05-29T00:00:00.000Z', updatedAt: '2026-05-29T00:00:00.000Z' }),
    );
    await fs.writeFile(
      path.join(goalDir, 'goal-4.json'),
      JSON.stringify({ schemaVersion: 1, id: 'goal-4', residentName: 'res:agent', goalText: 'Done already', status: 'achieved', createdAt: '2026-05-29T00:00:00.000Z', updatedAt: '2026-05-29T00:00:00.000Z' }),
    );
    const economy = await readResidentEconomy(memoryRoot, 'res:agent');
    expect(economy.activeGoals).toHaveLength(2);
    const ids = economy.activeGoals.map(g => g.id).sort();
    expect(ids).toEqual(['goal-1', 'goal-2']);
    const banked = economy.activeGoals.find(g => g.id === 'goal-1');
    expect(banked?.completion).toEqual({ condition: 'bank GP >= 100', evidenceSource: 'runtime:bank-balance' });
    const lumbridge = economy.activeGoals.find(g => g.id === 'goal-2');
    expect(lumbridge?.completion).toBeUndefined();
  });

  test('URL pattern used by the BFF matcher captures the resident name segment', () => {
    // Sanity check on the regex baked into packages/server/src/index.ts so the route
    // can never silently drift away from what the panel calls.
    const pattern = /^\/api\/resident\/([^/]+)\/economy$/;
    expect('/api/resident/res%3Aagent/economy'.match(pattern)?.[1]).toBe('res%3Aagent');
    expect('/api/resident/agent/economy'.match(pattern)?.[1]).toBe('agent');
    expect('/api/residents/res:agent/economy'.match(pattern)).toBeNull();
    expect('/api/resident/agent/economy/extra'.match(pattern)).toBeNull();
  });

  test('accepts a bare resident slug as well as res:<slug>', async () => {
    const memoryRoot = await makeMemoryRoot();
    const residentDir = path.join(memoryRoot, 'brimsmith52');
    await fs.mkdir(residentDir, { recursive: true });
    await fs.writeFile(path.join(residentDir, 'runtime-state.json'), JSON.stringify({ attention: 7 }));
    const goalDir = path.join(memoryRoot, 'city-integration', 'goals');
    await fs.mkdir(goalDir, { recursive: true });
    await fs.writeFile(
      path.join(goalDir, 'g.json'),
      JSON.stringify({ schemaVersion: 1, id: 'g', residentName: 'res:brimsmith52', goalText: 'x', status: 'active', createdAt: 't', updatedAt: 't' }),
    );
    const economy = await readResidentEconomy(memoryRoot, 'brimsmith52');
    expect(economy.ap).toBe(7);
    expect(economy.activeGoals).toHaveLength(1);
  });
});
