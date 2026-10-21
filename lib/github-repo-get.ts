import { cache } from "react";
import { createOctokitInstance } from "@/lib/utils/octokit";

/**
 * Request-scoped GitHub repos.get — shared by getToken access checks and
 * getRepoSnapshot so the owner layout pays one RTT instead of two.
 */
const getGithubRepo = cache(async (token: string, owner: string, repo: string) => {
  const octokit = createOctokitInstance(token);
  const response = await octokit.rest.repos.get({ owner, repo });
  return response.data;
});

export { getGithubRepo };
