import "server-only";

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

const WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 20;

/** In-memory AI test/summary rate limit (per process). Key should be user id. */
export const assertAiRequestRateLimit = (
  key: string,
  options?: { max?: number; windowMs?: number },
) => {
  const max = options?.max ?? MAX_ATTEMPTS;
  const windowMs = options?.windowMs ?? WINDOW_MS;
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }

  if (existing.count >= max) {
    const retryAfterSec = Math.max(
      1,
      Math.ceil((existing.resetAt - now) / 1000),
    );
    throw Object.assign(
      new Error(`请求过于频繁，请 ${retryAfterSec} 秒后再试。`),
      {
        status: 429,
        headers: { "Retry-After": String(retryAfterSec) },
      },
    );
  }

  existing.count += 1;
};
