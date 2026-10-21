/** Keys that must never be copied from untrusted objects. */
const FORBIDDEN_KEYS = new Set(["__proto__", "prototype", "constructor"]);

/**
 * Shallow-merge `source` onto `target`, skipping prototype-pollution keys.
 * Only own enumerable string keys are copied.
 */
export function safeAssign<T extends Record<string, unknown>>(
  target: T,
  source: Record<string, unknown> | null | undefined,
): T {
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    return target;
  }
  const out: Record<string, unknown> = { ...target };
  for (const key of Object.keys(source)) {
    if (FORBIDDEN_KEYS.has(key)) continue;
    out[key] = source[key];
  }
  return out as T;
}
