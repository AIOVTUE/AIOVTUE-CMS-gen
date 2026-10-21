import { createHttpError } from "@/lib/api-error";
import { normalizePath } from "@/lib/utils/file";
import { isBlockedRepoPath } from "@/lib/utils/sensitive-path";

/** Normalize a repo-relative path and reject traversal / sensitive segments. */
export function assertSafeRepoPath(raw: string): string {
  const normalized = normalizePath(raw);
  if (!normalized || normalized.includes("\0") || isBlockedRepoPath(normalized)) {
    throw createHttpError("Invalid path.", 400);
  }
  return normalized;
}

/**
 * Decode a dynamic `[path]` route segment once, normalize, and reject blocked paths.
 * Next.js usually decodes params; this still guards malformed `%` sequences and NUL bytes.
 */
export function decodeAndNormalizeRepoPath(raw: string): string {
  let decoded = raw;
  try {
    if (raw.includes("%")) {
      decoded = decodeURIComponent(raw);
    }
  } catch {
    throw createHttpError("Invalid path encoding.", 400);
  }
  return assertSafeRepoPath(decoded);
}
