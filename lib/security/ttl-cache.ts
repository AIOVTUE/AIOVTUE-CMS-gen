import "server-only";

type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

type TtlCacheOptions = {
  ttlMs?: number;
  maxEntries?: number;
};

/**
 * Process-local TTL cache with in-flight request coalescing.
 * Suitable for Vercel serverless (per-instance); not shared across isolates.
 */
export const createTtlCache = (defaults?: TtlCacheOptions) => {
  const defaultTtlMs = defaults?.ttlMs ?? 60_000;
  const maxEntries = defaults?.maxEntries ?? 200;
  const store = new Map<string, CacheEntry<unknown>>();
  const inflight = new Map<string, Promise<unknown>>();

  const pruneExpired = () => {
    const now = Date.now();
    for (const [key, entry] of store) {
      if (entry.expiresAt <= now) store.delete(key);
    }
  };

  const enforceSize = () => {
    if (store.size <= maxEntries) return;
    // Map preserves insertion order — drop oldest first.
    for (const key of store.keys()) {
      if (store.size <= maxEntries) break;
      store.delete(key);
    }
  };

  const peek = <T>(key: string): T | undefined => {
    const entry = store.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      store.delete(key);
      return undefined;
    }
    return entry.value as T;
  };

  const set = <T>(key: string, value: T, ttlMs = defaultTtlMs) => {
    pruneExpired();
    // Refresh insertion order for existing keys.
    if (store.has(key)) store.delete(key);
    store.set(key, {
      value,
      expiresAt: Date.now() + ttlMs,
    });
    enforceSize();
  };

  const get = async <T>(
    key: string,
    fetcher: () => Promise<T>,
    ttlMs = defaultTtlMs,
  ): Promise<T> => {
    const cached = peek<T>(key);
    if (cached !== undefined) return cached;

    const pending = inflight.get(key) as Promise<T> | undefined;
    if (pending) return pending;

    const promise = fetcher()
      .then((value) => {
        set(key, value, ttlMs);
        inflight.delete(key);
        return value;
      })
      .catch((error) => {
        inflight.delete(key);
        throw error;
      });

    inflight.set(key, promise);
    return promise;
  };

  const invalidate = (prefixOrKey?: string) => {
    if (!prefixOrKey) {
      store.clear();
      inflight.clear();
      return;
    }
    for (const key of [...store.keys()]) {
      if (key === prefixOrKey || key.startsWith(prefixOrKey)) {
        store.delete(key);
      }
    }
    for (const key of [...inflight.keys()]) {
      if (key === prefixOrKey || key.startsWith(prefixOrKey)) {
        inflight.delete(key);
      }
    }
  };

  return { peek, set, get, invalidate };
};
