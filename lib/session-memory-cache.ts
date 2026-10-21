const store = new Map<string, unknown>();
const inflight = new Map<string, Promise<unknown>>();

export const peekSessionCache = <T>(key: string): T | undefined => {
  if (!store.has(key)) return undefined;
  return store.get(key) as T;
};

export const setSessionCache = <T>(key: string, value: T) => {
  store.set(key, value);
};

export const getSessionCached = async <T>(
  key: string,
  fetcher: () => Promise<T>,
): Promise<T> => {
  const cached = peekSessionCache<T>(key);
  if (cached !== undefined) return cached;

  const pending = inflight.get(key) as Promise<T> | undefined;
  if (pending) return pending;

  const promise = fetcher()
    .then((data) => {
      // Skip commit if this request was superseded or invalidated mid-flight.
      if (inflight.get(key) === promise) {
        store.set(key, data);
        inflight.delete(key);
      }
      return data;
    })
    .catch((error) => {
      if (inflight.get(key) === promise) {
        inflight.delete(key);
      }
      throw error;
    });

  inflight.set(key, promise);
  return promise;
};

export const invalidateSessionCache = (key?: string) => {
  if (key) {
    store.delete(key);
    inflight.delete(key);
    return;
  }
  store.clear();
  inflight.clear();
};

export const invalidateSessionCacheByPrefix = (prefix: string) => {
  for (const key of Array.from(store.keys())) {
    if (key.startsWith(prefix)) store.delete(key);
  }
  for (const key of Array.from(inflight.keys())) {
    if (key.startsWith(prefix)) inflight.delete(key);
  }
};
