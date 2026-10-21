import "server-only";

type Bucket = { count: number; resetAt: number };

type RateLimitOptions = {
  windowMs?: number;
  max?: number;
  message?: string;
};

const createRateLimiter = (defaultWindowMs: number, defaultMax: number) => {
  const buckets = new Map<string, Bucket>();

  const assert = (key: string, options?: RateLimitOptions) => {
    const windowMs = options?.windowMs ?? defaultWindowMs;
    const max = options?.max ?? defaultMax;
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
        new Error(
          options?.message ??
            `尝试过于频繁，请 ${retryAfterSec} 秒后再试。`,
        ),
        {
          status: 429,
          headers: { "Retry-After": String(retryAfterSec) },
        },
      );
    }

    existing.count += 1;
  };

  const clear = (key: string) => {
    buckets.delete(key);
  };

  const reset = () => {
    buckets.clear();
  };

  return { assert, clear, reset };
};

const loginLimiter = createRateLimiter(15 * 60 * 1000, 10);
const otpSendLimiter = createRateLimiter(15 * 60 * 1000, 5);
const otpVerifyLimiter = createRateLimiter(15 * 60 * 1000, 15);

/** In-memory login rate limit (per process). Key should be IP + email. */
export const assertEmailLoginRateLimit = (key: string) => {
  loginLimiter.assert(key);
};

export const clearEmailLoginRateLimit = (key: string) => {
  loginLimiter.clear(key);
};

/** OTP send: limit email bombing. Key should be `send:IP:emailHash`. */
export const assertEmailOtpSendRateLimit = (key: string) => {
  otpSendLimiter.assert(key, {
    message: undefined,
  });
};

/** OTP verify / sign-in: limit brute force. Key should be `verify:IP:emailHash`. */
export const assertEmailOtpVerifyRateLimit = (key: string) => {
  otpVerifyLimiter.assert(key, {
    message: undefined,
  });
};

/** Test helper */
export const __resetEmailLoginRateLimitForTests = () => {
  loginLimiter.reset();
  otpSendLimiter.reset();
  otpVerifyLimiter.reset();
};
