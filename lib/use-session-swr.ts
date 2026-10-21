"use client";

import useSWR, { type Key, type SWRConfiguration } from "swr";
import { getSessionCached, peekSessionCache } from "@/lib/session-memory-cache";

export function useSessionSWR<T>(
  key: Key,
  fetcher: (() => Promise<T>) | null,
  config?: SWRConfiguration<T>,
) {
  const cacheKey = key == null ? null : String(key);

  return useSWR<T>(
    key,
    cacheKey && fetcher
      ? () => getSessionCached<T>(cacheKey, fetcher)
      : null,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      revalidateIfStale: false,
      dedupingInterval: Number.POSITIVE_INFINITY,
      keepPreviousData: true,
      fallbackData: cacheKey ? peekSessionCache<T>(cacheKey) : undefined,
      ...config,
    },
  );
}
