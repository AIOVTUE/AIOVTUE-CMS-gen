/**
 * Build in-app repo URLs with stable percent-encoding for non-ASCII segments.
 * Prevents App Router soft-navigation loops (decoded 中文 vs %E6… forms).
 */

const enc = (segment: string) => {
  const raw = segment.trim();
  if (!raw) return "";
  try {
    // Decode first so we never double-encode.
    return encodeURIComponent(decodeURIComponent(raw));
  } catch {
    return encodeURIComponent(raw);
  }
};

/** `/{owner}/{repo}/{branch}` with optional path after the branch. */
export function repoHref(
  owner: string,
  repo: string,
  branch: string,
  restPath = "",
): string {
  const rest = restPath
    ? restPath.startsWith("/")
      ? restPath
      : `/${restPath}`
    : "";
  return `/${enc(owner)}/${enc(repo)}/${enc(branch)}${rest}`;
}

/** `/api/{owner}/{repo}/{branch}` with optional path after the branch. */
export function apiRepoHref(
  owner: string,
  repo: string,
  branch: string,
  restPath = "",
): string {
  return `/api${repoHref(owner, repo, branch, restPath)}`;
}

export function encodeRepoSegment(segment: string): string {
  return enc(segment);
}

/**
 * Encode a repo-relative file path as **one** URL segment for `edit/[path]`.
 * - `/` → `%2F` (keeps a single dynamic segment)
 * - `.` → `%2E` (avoids Next treating `….ts` / `….md` as static files)
 */
export function encodeRepoPathParam(repoPath: string): string {
  const raw = repoPath.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!raw) return "";
  return enc(raw).replace(/\./g, "%2E");
}

/** Decode an `edit/[path]` param back to a repo-relative path. */
export function decodeRepoPathParam(param: string): string {
  try {
    return decodeURIComponent(param);
  } catch {
    return param;
  }
}

/**
 * Re-encode pathname segments after `/{owner}/{repo}/{branch}` so soft-nav
 * stays on a stable percent-encoded form (esp. Chinese repo + `*.ts` edits).
 */
export function encodeRepoRestPath(pathname: string): string {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length <= 3) return "";
  return `/${parts
    .slice(3)
    .map((segment) => enc(segment).replace(/\./g, "%2E"))
    .join("/")}`;
}

const safeDecode = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

/** Compare pathnames ignoring percent-encoding differences. */
export function pathsEqual(a: string, b: string): boolean {
  if (a === b) return true;
  return safeDecode(a) === safeDecode(b);
}

/** True when pathname equals href or is nested under it (encoding-safe). */
export function pathMatchesOrUnder(pathname: string, href: string): boolean {
  if (pathsEqual(pathname, href)) return true;
  const path = safeDecode(pathname);
  const root = safeDecode(href);
  return path.startsWith(`${root}/`);
}
