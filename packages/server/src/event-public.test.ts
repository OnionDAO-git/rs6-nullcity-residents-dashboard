import { describe, expect, test } from 'bun:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { DashboardConfig } from './config';
import { routePublicEventApi } from './event-public';
import { RuntimeRepository } from './runtime';

async function withPublicApi<T>(run: (ctx: { config: DashboardConfig; runtime: RuntimeRepository; root: string }) => Promise<T>): Promise<T> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dashboard-public-api-'));
  try {
    const memoryRoot = path.join(root, 'memory');
    const logsRoot = path.join(root, 'logs');
    const soulsRoot = path.join(root, 'souls');
    const config: DashboardConfig = {
      host: '127.0.0.1',
      port: 0,
      gatewayUrl: 'ws://127.0.0.1:43595',
      rsClientHost: '127.0.0.1:43594',
      rsClientSecure: false,
      serverRoot: root,
      memoryRoot,
      logsRoot,
      agentLogsRoot: path.join(root, 'agent-logs'),
      soulsRoot,
      residentSaveRoot: path.join(root, 'residents'),
      benchmarkRoot: path.join(root, 'benchmarks'),
      eventPublicRoot: path.join(root, 'public'),
      webDist: path.join(root, 'web-dist'),
      cacheTtlMs: 0,
    };
    const runtime = new RuntimeRepository(
      config.memoryRoot,
      config.logsRoot,
      config.agentLogsRoot,
      config.soulsRoot,
      config.residentSaveRoot,
      config.benchmarkRoot,
    );
    await fs.mkdir(path.join(memoryRoot, 'data', 'letters', 'alice-onion'), { recursive: true });
    await fs.mkdir(path.join(memoryRoot, 'library', 'res-fern'), { recursive: true });
    await fs.writeFile(
      path.join(memoryRoot, 'data', 'letters', 'alice-onion', 'inbox.jsonl'),
      `${JSON.stringify({
        kind: 'standing_tier_crossed',
        recipient: 'alice@onion',
        senderResident: 'res:fern',
        subject: 'Welcome',
        body: 'Welcome to the embassy.',
        dispatchedAt: '2026-05-27T12:00:00.000Z',
        deliveryChannels: ['web-inbox', 'wall'],
      })}\n`,
    );
    await fs.writeFile(
      path.join(memoryRoot, 'library', 'res-fern', 'portrait.json'),
      JSON.stringify({
        schemaVersion: 1,
        residentName: 'Fern',
        currentState: 'living',
        livesCount: 1,
        voice: { quotes: [{ tag: 'first', text: 'The road goes on.' }] },
        patrons: [{ handle: 'alice@onion' }],
        wants: { current: ['greet visitors'] },
        storyArc: { phase: 'progress' },
        lastUpdated: { ts: '2026-05-27T12:01:00.000Z' },
      }),
    );
    return await run({ config, runtime, root });
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

describe('routePublicEventApi', () => {
  test('serves full-fidelity inbox letters from dashboard-owned /v1/inbox', async () => {
    await withPublicApi(async ({ config, runtime }) => {
      const response = await routePublicEventApi(new Request('http://local/v1/inbox?human=alice%40onion'), new URL('http://local/v1/inbox?human=alice%40onion'), {
        config,
        runtime,
      });

      expect(response?.status).toBe(200);
      const payload = await response!.json() as { letters: Array<{ recipient: string; body: string }> };
      expect(payload.letters).toHaveLength(1);
      expect(payload.letters[0]).toMatchObject({ recipient: 'alice@onion', body: 'Welcome to the embassy.' });
    });
  });

  test('serves wall and library read models for migrated static pages', async () => {
    await withPublicApi(async ({ config, runtime }) => {
      const wall = await routePublicEventApi(new Request('http://local/v1/wall/snapshot'), new URL('http://local/v1/wall/snapshot'), {
        config,
        runtime,
      });
      const library = await routePublicEventApi(new Request('http://local/v1/library'), new URL('http://local/v1/library'), {
        config,
        runtime,
      });

      expect(wall?.status).toBe(200);
      expect(library?.status).toBe(200);
      const wallPayload = await wall!.json() as { recentLetters: unknown[]; residents: Array<{ displayName: string; activeGoal?: string }> };
      const libraryPayload = await library!.json() as { residents: Array<{ displayName: string; topQuote?: string }> };
      expect(wallPayload.recentLetters).toHaveLength(1);
      expect(wallPayload.residents[0]).toMatchObject({ displayName: 'Fern', activeGoal: 'greet visitors' });
      expect(libraryPayload.residents[0]).toMatchObject({ displayName: 'Fern', topQuote: 'The road goes on.' });
    });
  });

  test('omits QA and synthetic residents from the public wall snapshot', async () => {
    await withPublicApi(async ({ config, runtime }) => {
      await fs.mkdir(path.join(config.memoryRoot, 'data', 'letters', 'bob-onion'), { recursive: true });
      await fs.writeFile(
        path.join(config.memoryRoot, 'data', 'letters', 'bob-onion', 'inbox.jsonl'),
        `${JSON.stringify({
          kind: 'broadcast',
          recipient: 'bob@onion',
          senderResident: 'res:qa-angler',
          subject: '[Broadcast] On the passing of res:qa-angler',
          body: '',
          dispatchedAt: '2026-05-27T12:03:00.000Z',
          deliveryChannels: ['web-inbox'],
        })}\n`,
      );
      await fs.mkdir(path.join(config.memoryRoot, 'library', 'res-qa-angler'), { recursive: true });
      await fs.writeFile(
        path.join(config.memoryRoot, 'library', 'res-qa-angler', 'portrait.json'),
        JSON.stringify({
          schemaVersion: 1,
          residentName: 'QA Angler',
          currentState: 'living',
          livesCount: 1,
          wants: { current: ['catch fixture fish'] },
          lastUpdated: { ts: '2026-05-27T12:02:00.000Z' },
        }),
      );

      const wall = await routePublicEventApi(new Request('http://local/v1/wall/snapshot'), new URL('http://local/v1/wall/snapshot'), {
        config,
        runtime,
      });

      expect(wall?.status).toBe(200);
      const payload = await wall!.json() as {
        recentLetters: Array<{ senderResident?: string }>;
        residents: Array<{ slug: string; displayName: string }>;
      };
      expect(payload.recentLetters.map(letter => letter.senderResident)).toEqual(['res:fern']);
      expect(payload.residents.map(resident => resident.slug)).toEqual(['res-fern']);
    });
  });

  test('filters synthetic wall letters before applying the public snapshot limit', async () => {
    await withPublicApi(async ({ config, runtime }) => {
      await fs.mkdir(path.join(config.memoryRoot, 'data', 'letters', 'bob-onion'), { recursive: true });
      await fs.writeFile(
        path.join(config.memoryRoot, 'data', 'letters', 'bob-onion', 'inbox.jsonl'),
        `${JSON.stringify({
          kind: 'broadcast',
          recipient: 'bob@onion',
          senderResident: 'res:qa-trader',
          subject: '[Broadcast] On the passing of res:qa-trader',
          body: '',
          dispatchedAt: '2026-05-27T12:03:00.000Z',
          deliveryChannels: ['web-inbox'],
        })}\n`,
      );

      const wall = await routePublicEventApi(
        new Request('http://local/v1/wall/snapshot?limit=1'),
        new URL('http://local/v1/wall/snapshot?limit=1'),
        { config, runtime },
      );

      expect(wall?.status).toBe(200);
      const payload = await wall!.json() as { recentLetters: Array<{ senderResident?: string; subject: string }> };
      expect(payload.recentLetters).toEqual([
        expect.objectContaining({
          senderResident: 'res:fern',
          subject: 'Welcome',
        }),
      ]);
    });
  });

  test('credits daily patron check-ins and persists the dashboard-side ledgers', async () => {
    await withPublicApi(async ({ config, runtime }) => {
      const url = new URL('http://local/v1/patron/checkin?human=alice%40onion');
      const first = await routePublicEventApi(new Request(url), url, { config, runtime });
      const second = await routePublicEventApi(new Request(url), url, { config, runtime });

      expect(first?.status).toBe(200);
      expect(second?.status).toBe(200);
      expect(await first!.json()).toMatchObject({ result: 'checked_in', ap_earned: 1, shards_earned: 1, new_balance: 1, currency: 'AP' });
      expect(await second!.json()).toMatchObject({ result: 'already_checked_in', ap_earned: 0, shards_earned: 0, new_balance: 1, currency: 'AP' });
      const balance = JSON.parse(await fs.readFile(path.join(config.memoryRoot, 'patron-currency.json'), 'utf8')) as {
        balances: Record<string, number>;
      };
      expect(balance.balances['alice@onion']).toBe(1);
    });
  });
});
