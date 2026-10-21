import { type NextRequest } from "next/server";
import { createOctokitInstance } from "@/lib/utils/octokit";
import { getInstallations, getInstallationRepos } from "@/lib/github-app";
import { db } from "@/db";
import { and, sql } from "drizzle-orm";
import { collaboratorTable } from "@/db/schema";
import { getGithubAccount } from "@/lib/github-account";
import { hasGithubIdentity } from "@/lib/authz-shared";
import { toErrorResponse } from "@/lib/api-error";
import { requireApiUserSession } from "@/lib/session-server";
import { collaboratorMatchesUser } from "@/lib/collaborator-access";
import { getLocalRepoRef, isLocalRepoMode } from "@/lib/local-repo/config";
import { isGithubAuthError } from "@/lib/github-auth";
import { logServerError } from "@/lib/security/scrub-secrets";

export const dynamic = "force-dynamic";

type RepoListItem = {
  owner: string;
  repo: string;
  private: boolean;
  defaultBranch?: string;
  updatedAt?: string;
};

/**
 * Fetches repositories for a user.
 *
 * GET /api/repos/[owner]
 *
 * Requires authentication.
 */

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ owner: string }> },
) {
  try {
    const params = await context.params;
    const sessionResult = await requireApiUserSession();
    if ("response" in sessionResult) return sessionResult.response;
    const user = sessionResult.user;

    let githubRepos: RepoListItem[] = [];
    let collaboratorRepos: RepoListItem[] = [];

    const searchParams = request.nextUrl.searchParams;
    const type = searchParams.get("type");

    if (isLocalRepoMode()) {
      const localRef = getLocalRepoRef();
      if (params.owner.toLowerCase() === localRef.owner.toLowerCase()) {
        return Response.json({
          status: "success",
          data: [
            {
              owner: localRef.owner,
              repo: localRef.repo,
              private: true,
              defaultBranch: localRef.branch,
              updatedAt: new Date().toISOString(),
            },
          ],
        });
      }
    }

    const githubAccount = await getGithubAccount(user.id);
    if (githubAccount?.accessToken && hasGithubIdentity(user)) {
      try {
        const token = githubAccount.accessToken;
        const repositorySelection = searchParams.get("repository_selection");

        let rawRepos: any[] = [];
        if (repositorySelection === "selected") {
          const installations = await getInstallations(token, [params.owner]);
          if (installations.length === 1) {
            rawRepos = await getInstallationRepos(token, installations[0].id);
          }
        } else {
          const keyword = searchParams.get("keyword");
          const octokit = createOctokitInstance(token);
          const query = `${keyword} in:name ${type}:${params.owner} fork:true`;
          const response = await octokit.rest.search.repos({
            q: query,
            sort: "updated",
            order: "desc",
            per_page: 5,
          });
          rawRepos = response.data.items;
        }

        githubRepos = rawRepos
          .filter((repo) => repo.permissions?.push)
          .map((repo) => ({
            owner: repo.owner.login,
            repo: repo.name,
            private: Boolean(repo.private),
            defaultBranch: repo.default_branch,
            updatedAt: repo.updated_at,
          }));
      } catch (error) {
        // Keep collaborator repos usable when the user's OAuth token is stale.
        if (!isGithubAuthError(error)) throw error;
      }
    }

    const collaboratorRows = await db.query.collaboratorTable.findMany({
      where: and(
        collaboratorMatchesUser(user),
        sql`lower(${collaboratorTable.owner}) = lower(${params.owner})`,
      ),
    });

    collaboratorRepos = collaboratorRows.map((row) => ({
      owner: row.owner,
      repo: row.repo,
      private: true,
      // Collaborator rows store `branch`, not GitHub's `default_branch`.
      defaultBranch: row.branch || undefined,
    }));

    const reposByKey = new Map<string, RepoListItem>();
    for (const repo of githubRepos) {
      reposByKey.set(
        `${repo.owner.toLowerCase()}::${repo.repo.toLowerCase()}`,
        repo,
      );
    }
    for (const repo of collaboratorRepos) {
      const key = `${repo.owner.toLowerCase()}::${repo.repo.toLowerCase()}`;
      const existing = reposByKey.get(key);
      if (!existing) {
        reposByKey.set(key, repo);
        continue;
      }
      // Prefer a known branch when GitHub payload lacked one.
      if (!existing.defaultBranch && repo.defaultBranch) {
        reposByKey.set(key, {
          ...existing,
          defaultBranch: repo.defaultBranch,
        });
      }
    }

    const repos = Array.from(reposByKey.values());

    return Response.json({
      status: "success",
      data: repos,
    });
  } catch (error: any) {
    logServerError(error, "repos/[owner] GET");
    return toErrorResponse(error);
  }
}
