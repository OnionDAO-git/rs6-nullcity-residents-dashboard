/**
 * Dependency-free in-memory TTL cache for expensive aggregations served on hot
 * polled routes. Values are cached as promises so concurrent callers share a
 * single in-flight computation instead of stampeding the filesystem; failed
 * computations are evicted so errors are never served from cache.
 *
 * Only cache user-independent data here: entries are shared across every
 * request, so cache keys must capture everything that changes the result.
 */
export class TtlCache<T> {
  private readonly entries = new Map<string, { value: Promise<T>; expiresAt: number }>();

  constructor(
    private readonly ttlMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  async getOrCompute(key: string, compute: () => Promise<T>): Promise<T> {
    if (this.ttlMs <= 0) return compute();
    const cached = this.entries.get(key);
    if (cached && cached.expiresAt > this.now()) return cached.value;
    const entry = { value: compute(), expiresAt: this.now() + this.ttlMs };
    this.entries.set(key, entry);
    try {
      return await entry.value;
    } catch (error) {
      // Never cache failures; the next caller should retry the computation.
      if (this.entries.get(key) === entry) this.entries.delete(key);
      throw error;
    }
  }

  clear(): void {
    this.entries.clear();
  }
}
