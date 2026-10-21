import { repoHref } from "@/lib/repo-href";

/** In-repo landing path (home page, not listed in the sidebar). */
export function getRepoHomePath(
  owner: string,
  repo: string,
  branch: string,
): string {
  return repoHref(owner, repo, branch);
}

/** @deprecated Alias of getRepoHomePath. */
export function getRepoBranchPath(
  owner: string,
  repo: string,
  branch: string,
): string {
  return getRepoHomePath(owner, repo, branch);
}
