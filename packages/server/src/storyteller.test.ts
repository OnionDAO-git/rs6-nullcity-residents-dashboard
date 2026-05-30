import { describe, expect, test } from 'bun:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { readStorytellerDigestFeed } from './storyteller';

async function makeMemoryRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dashboard-storyteller-'));
  return path.join(root, 'memory');
}

describe('readStorytellerDigestFeed', () => {
  test('returns empty items when storyteller root is missing', async () => {
    const memoryRoot = await makeMemoryRoot();
    const feed = await readStorytellerDigestFeed(memoryRoot);
    expect(feed).toEqual({ items: [] });
  });

  test('reads digests and dispatch metadata sorted by builtAt desc', async () => {
    const memoryRoot = await makeMemoryRoot();
    const storytellerRoot = path.join(path.dirname(memoryRoot), 'storyteller');

    await fs.mkdir(path.join(storytellerRoot, 'run-a'), { recursive: true });
    await fs.writeFile(
      path.join(storytellerRoot, 'run-a', 'digest.json'),
      JSON.stringify({
        digestId: 'run-a',
        builtAt: '2026-05-30T00:01:00.000Z',
        windowStart: '2026-05-29T23:50:00.000Z',
        windowEnd: '2026-05-30T00:00:00.000Z',
        topEvents: [{ ref: 'e1' }],
        residents: [{ residentName: 'res:agent' }],
      }),
    );
    await fs.writeFile(path.join(storytellerRoot, 'run-a', 'summary.txt'), 'Operator summary A\n');

    await fs.mkdir(path.join(storytellerRoot, 'run-b'), { recursive: true });
    await fs.writeFile(
      path.join(storytellerRoot, 'run-b', 'digest.json'),
      JSON.stringify({
        digestId: 'run-b',
        builtAt: '2026-05-30T00:02:00.000Z',
        topEvents: [{ ref: 'e2' }, { ref: 'e3' }],
        residents: [{ residentName: 'res:agent' }, { residentName: 'res:hans' }],
      }),
    );
    await fs.writeFile(
      path.join(storytellerRoot, 'run-b', 'dispatch.json'),
      JSON.stringify({
        dispatchId: 'dispatch-b',
        generatedAt: '2026-05-30T00:03:00.000Z',
        modelProfile: 'openrouter:haiku',
        needsReview: true,
        reviewReasons: ['missing_ref'],
        publicTitle: 'Night in Lumbridge',
        eventRefsUsed: ['e2', 'e3'],
        estimatedCostUsd: 0.07,
      }),
    );

    const feed = await readStorytellerDigestFeed(memoryRoot);
    expect(feed.items).toHaveLength(2);
    expect(feed.items[0]?.runId).toBe('run-b');
    expect(feed.items[0]?.topEventCount).toBe(2);
    expect(feed.items[0]?.residentCount).toBe(2);
    expect(feed.items[0]?.dispatch?.dispatchId).toBe('dispatch-b');
    expect(feed.items[0]?.dispatch?.warningCount).toBe(1);
    expect(feed.items[1]?.runId).toBe('run-a');
    expect(feed.items[1]?.summary).toBe('Operator summary A');
  });

  test('honors limit and ignores empty malformed runs', async () => {
    const memoryRoot = await makeMemoryRoot();
    const storytellerRoot = path.join(path.dirname(memoryRoot), 'storyteller');

    await fs.mkdir(path.join(storytellerRoot, 'empty-run'), { recursive: true });
    await fs.mkdir(path.join(storytellerRoot, 'run-1'), { recursive: true });
    await fs.mkdir(path.join(storytellerRoot, 'run-2'), { recursive: true });

    await fs.writeFile(path.join(storytellerRoot, 'run-1', 'digest.json'), JSON.stringify({ digestId: 'run-1', builtAt: '2026-05-30T01:00:00.000Z' }));
    await fs.writeFile(path.join(storytellerRoot, 'run-2', 'digest.json'), JSON.stringify({ digestId: 'run-2', builtAt: '2026-05-30T02:00:00.000Z' }));

    const feed = await readStorytellerDigestFeed(memoryRoot, 1);
    expect(feed.items).toHaveLength(1);
    expect(feed.items[0]?.runId).toBe('run-2');
  });
});
