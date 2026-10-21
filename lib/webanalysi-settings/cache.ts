import "server-only";

import { createTtlCache } from "@/lib/security/ttl-cache";

export const WEBANALYSI_CACHE_TTL_MS = 60_000;

export const webanalysiCache = createTtlCache({
  ttlMs: WEBANALYSI_CACHE_TTL_MS,
  maxEntries: 200,
});

export const webanalysiCachePrefix = (userId: string, apiUrl: string) =>
  `webanalysi:${userId}:${apiUrl}`;

export const invalidateWebanalysiCache = (userId?: string) => {
  if (!userId) {
    webanalysiCache.invalidate();
    return;
  }
  webanalysiCache.invalidate(`webanalysi:${userId}:`);
};
