import { normalizePath } from "@/lib/utils/file";

/**
 * True when `path` is exactly `root`, or a file/folder strictly under `root/`.
 * Avoids naive startsWith bypasses (e.g. root `content/post` vs `content/posts`).
 */
export function isPathWithinRoot(path: string, root: string): boolean {
  const normalizedPath = normalizePath(path);
  const normalizedRoot = normalizePath(root);

  // Empty root = repository root (used by source-files). Still reject traversal.
  if (!normalizedRoot) {
    return (
      normalizedPath.length > 0 &&
      !normalizedPath.split("/").includes("..")
    );
  }

  if (normalizedPath.includes("..")) return false;

  return (
    normalizedPath === normalizedRoot ||
    normalizedPath.startsWith(`${normalizedRoot}/`)
  );
}

/** Media roots must be non-empty so raw/media APIs cannot widen to the whole repo. */
export function assertNonEmptyPathRoot(root: string, label = "path"): string {
  const normalized = normalizePath(root);
  if (!normalized) {
    throw Object.assign(new Error(`Invalid ${label}: root must not be empty.`), {
      status: 400,
    });
  }
  return normalized;
}
