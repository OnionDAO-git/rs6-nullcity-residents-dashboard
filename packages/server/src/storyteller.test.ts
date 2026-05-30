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
    await fs.writeFile(path.join(storytellerRoot, 'run-a', 'summary.txt'), 'Operator summary A for human:event-demo\n');

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
        operatorWarnings: ['Do not broadcast patron:james yet.', 'Keep human:event-demo private.'],
        reviewReasons: ['missing_ref'],
        publicTitle: 'Night in Lumbridge',
        publicBody: 'Alice traded GP with patron:james, human:event-demo, and wrote to demo@onion.test.',
        publicBullets: ['Alice traded 200 GP with patron:james.', 'Bob finished a bounded goal for demo@onion.test and human:event-demo.'],
        operatorSummary: 'Dispatch needs a human review from patron:james and human:event-demo.',
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
    expect(feed.items[0]?.dispatch?.warningCount).toBe(3);
    expect(feed.items[0]?.dispatch?.publicTitle).toBe('Night in Lumbridge');
    expect(feed.items[0]?.dispatch?.publicBody).toBe('Alice traded GP with [human], [human], and wrote to [human].');
    expect(feed.items[0]?.dispatch?.publicBullets).toEqual(['Alice traded 200 GP with [human].', 'Bob finished a bounded goal for [human] and [human].']);
    expect(feed.items[0]?.dispatch?.operatorSummary).toBe('Dispatch needs a human review from [human] and [human].');
    expect(feed.items[0]?.dispatch?.operatorWarnings).toEqual(['Do not broadcast [human] yet.', 'Keep [human] private.']);
    expect(feed.items[0]?.dispatch?.reviewReasons).toEqual(['missing_ref']);
    expect(feed.items[0]?.dispatch?.eventRefsUsed).toEqual(['e2', 'e3']);
    expect(JSON.stringify(feed.items[0]?.dispatch)).not.toContain('patron:james');
    expect(JSON.stringify(feed.items[0]?.dispatch)).not.toContain('demo@onion.test');
    expect(JSON.stringify(feed.items[0]?.dispatch)).not.toContain('human:event-demo');
    expect(feed.items[1]?.runId).toBe('run-a');
    expect(feed.items[1]?.summary).toBe('Operator summary A for [human]');
    expect(JSON.stringify(feed.items[1])).not.toContain('human:event-demo');
  });

  test('summarizes grounded top events with safe evidence labels and redacted public text', async () => {
    const memoryRoot = await makeMemoryRoot();
    const storytellerRoot = path.join(path.dirname(memoryRoot), 'storyteller');

    await fs.mkdir(path.join(storytellerRoot, 'run-events'), { recursive: true });
    await fs.writeFile(
      path.join(storytellerRoot, 'run-events', 'digest.json'),
      JSON.stringify({
        digestId: 'run-events',
        builtAt: '2026-05-30T00:04:00.000Z',
        topEvents: [
          {
            ref: 'exchange-1',
            kind: 'ap_for_gp_exchange',
            residentName: 'res:alice',
            ts: '2026-05-30T00:00:30.000Z',
            note: 'Alice traded 200 GP with patron:james and human:event-demo for life-force.',
            importance: 'high',
            evidence: {
              cityUserId: 'human:event-demo',
              gpItemId: 995,
              gpBurned: 200,
              apGranted: 50,
              exchangeId: 'apgp:res:alice:fixture-001',
            },
          },
          {
            ref: 'goal-1',
            kind: 'goal_completed',
            residentName: 'res:bob',
            note: 'Bob completed a bounded quest step for demo@onion.test.',
            importance: 'medium',
            evidence: {
              goalText: 'Cook a meal for the chef.',
              questId: 'cooks_assistant',
              evidenceSource: 'quest_complete',
            },
          },
        ],
      }),
    );

    const feed = await readStorytellerDigestFeed(memoryRoot);

    expect(feed.items[0]?.topEvents).toEqual([
      {
        ref: 'exchange-1',
        kind: 'ap_for_gp_exchange',
        residentName: 'res:alice',
        ts: '2026-05-30T00:00:30.000Z',
        note: 'Alice traded 200 GP with [human] and [human] for life-force.',
        importance: 'high',
        evidenceLabels: ['coin-995', '200 GP', '50 AP', 'exchange apgp:res:alice:fixture-001'],
      },
      {
        ref: 'goal-1',
        kind: 'goal_completed',
        residentName: 'res:bob',
        note: 'Bob completed a bounded quest step for [human].',
        importance: 'medium',
        evidenceLabels: ['quest:cooks_assistant', 'evidence:quest_complete'],
      },
    ]);
    expect(JSON.stringify(feed.items[0])).not.toContain('patron:james');
    expect(JSON.stringify(feed.items[0])).not.toContain('demo@onion.test');
    expect(JSON.stringify(feed.items[0])).not.toContain('human:event-demo');
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

  test('merges canon and review queue artifacts with dry-run digests', async () => {
    const memoryRoot = await makeMemoryRoot();
    const storytellerRoot = path.join(path.dirname(memoryRoot), 'storyteller');

    await fs.mkdir(path.join(storytellerRoot, 'run-dry'), { recursive: true });
    await fs.writeFile(path.join(storytellerRoot, 'run-dry', 'digest.json'), JSON.stringify({
      digestId: 'run-dry',
      builtAt: '2026-05-30T01:00:00.000Z',
      topEvents: [],
      residents: [],
    }));

    await fs.mkdir(path.join(storytellerRoot, 'review', 'digest-review'), { recursive: true });
    await fs.writeFile(path.join(storytellerRoot, 'review', 'digest-review', 'digest.json'), JSON.stringify({
      digestId: 'digest-review',
      builtAt: '2026-05-30T01:02:00.000Z',
      topEvents: [{ ref: 'review-event', kind: 'ap_topup' }],
      residents: [{ residentName: 'res:hans' }],
    }));
    await fs.writeFile(path.join(storytellerRoot, 'review', 'digest-review', 'dispatch.json'), JSON.stringify({
      dispatchId: 'dispatch-review',
      generatedAt: '2026-05-30T01:03:00.000Z',
      needsReview: true,
      reviewReasons: ['operator_review'],
      publicTitle: 'Review this dispatch',
      publicBullets: [],
      operatorWarnings: [],
      eventRefsUsed: ['review-event'],
    }));

    await fs.mkdir(path.join(storytellerRoot, 'canon', 'digest-canon'), { recursive: true });
    await fs.writeFile(path.join(storytellerRoot, 'canon', 'digest-canon', 'digest.json'), JSON.stringify({
      digestId: 'digest-canon',
      builtAt: '2026-05-30T01:04:00.000Z',
      topEvents: [{ ref: 'canon-event', kind: 'goal_completed' }],
      residents: [{ residentName: 'res:agent' }],
    }));
    await fs.writeFile(path.join(storytellerRoot, 'canon', 'digest-canon', 'dispatch.json'), JSON.stringify({
      dispatchId: 'dispatch-canon',
      generatedAt: '2026-05-30T01:05:00.000Z',
      needsReview: false,
      publicTitle: 'Canon dispatch',
      publicBullets: ['A grounded canon line.'],
      operatorWarnings: [],
      reviewReasons: [],
      eventRefsUsed: ['canon-event'],
    }));

    const feed = await readStorytellerDigestFeed(memoryRoot);

    expect(feed.items.map(item => [item.runId, item.queue, item.dispatch?.dispatchId])).toEqual([
      ['canon/digest-canon', 'canon', 'dispatch-canon'],
      ['review/digest-review', 'review', 'dispatch-review'],
      ['run-dry', 'dry-run', undefined],
    ]);
  });
});
