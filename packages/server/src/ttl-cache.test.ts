import { describe, expect, test } from 'bun:test';
import { TtlCache } from './ttl-cache';

describe('TtlCache', () => {
  test('returns the cached value within the TTL without recomputing', async () => {
    let nowMs = 0;
    let calls = 0;
    const cache = new TtlCache<string>(15_000, () => nowMs);
    const compute = async () => {
      calls += 1;
      return `value-${calls}`;
    };

    await expect(cache.getOrCompute('key', compute)).resolves.toBe('value-1');
    nowMs += 14_999;
    await expect(cache.getOrCompute('key', compute)).resolves.toBe('value-1');
    expect(calls).toBe(1);
  });

  test('recomputes after the TTL expires', async () => {
    let nowMs = 0;
    let calls = 0;
    const cache = new TtlCache<string>(15_000, () => nowMs);
    const compute = async () => {
      calls += 1;
      return `value-${calls}`;
    };

    await expect(cache.getOrCompute('key', compute)).resolves.toBe('value-1');
    nowMs += 15_000;
    await expect(cache.getOrCompute('key', compute)).resolves.toBe('value-2');
    expect(calls).toBe(2);
  });

  test('caches independently per key', async () => {
    const cache = new TtlCache<string>(15_000, () => 0);
    await expect(cache.getOrCompute('a', async () => 'for-a')).resolves.toBe('for-a');
    await expect(cache.getOrCompute('b', async () => 'for-b')).resolves.toBe('for-b');
    await expect(cache.getOrCompute('a', async () => 'recomputed')).resolves.toBe('for-a');
  });

  test('coalesces concurrent callers into a single in-flight computation', async () => {
    let calls = 0;
    let release: (value: number) => void = () => {};
    const cache = new TtlCache<number>(15_000, () => 0);
    const compute = () => {
      calls += 1;
      return new Promise<number>(resolve => {
        release = resolve;
      });
    };

    const first = cache.getOrCompute('key', compute);
    const second = cache.getOrCompute('key', compute);
    release(7);
    await expect(first).resolves.toBe(7);
    await expect(second).resolves.toBe(7);
    expect(calls).toBe(1);
  });

  test('does not cache failed computations', async () => {
    let calls = 0;
    const cache = new TtlCache<string>(15_000, () => 0);
    await expect(
      cache.getOrCompute('key', async () => {
        calls += 1;
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    await expect(
      cache.getOrCompute('key', async () => {
        calls += 1;
        return 'recovered';
      }),
    ).resolves.toBe('recovered');
    expect(calls).toBe(2);
  });

  test('bypasses caching entirely when the TTL is disabled', async () => {
    let calls = 0;
    const cache = new TtlCache<number>(0);
    await expect(cache.getOrCompute('key', async () => ++calls)).resolves.toBe(1);
    await expect(cache.getOrCompute('key', async () => ++calls)).resolves.toBe(2);
  });
});
