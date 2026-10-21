import "server-only";

import type { User } from "@/types/user";
import { assertGithubIdentity } from "@/lib/authz-shared";
import { createHttpError } from "@/lib/api-error";
import { hasAdminAccessAsync } from "@/lib/admin";
import { getUserToken } from "@/lib/token";
import { createOctokitInstance } from "@/lib/utils/octokit";
import { isLocalRepoRef } from "@/lib/local-repo/config";

const requireGithubUserToken = async (
  user: Pick<User, "id" | "githubUsername">,
  identityErrorMessage = "Only GitHub users can perform this action.",
) => {
  assertGithubIdentity(user, identityErrorMessage);
  return getUserToken(user.id);
};

const requireGithubRepoWriteAccess = async (
  user: Pick<User, "id" | "email" | "githubUsername">,
  owner: string,
  repo: string,
  identityErrorMessage = "Only GitHub users can perform this action.",
) => {
  if (isLocalRepoRef(owner, repo)) {
    const allowAny = process.env.LOCAL_REPO_ALLOW_ANY_USER === "true";
    if (!(await hasAdminAccessAsync(user)) && !allowAny) {
      throw createHttpError(
        `You do not have permission to access "${owner}/${repo}".`,
        403,
      );
    }
    return {
      token: "local-repo-token",
      repoAccess: {
        repoId: 1,
        ownerId: 1,
        ownerLogin: owner,
        repoName: repo,
        ownerType: "user",
      },
    };
  }

  const token = await requireGithubUserToken(user, identityErrorMessage);
  const octokit = createOctokitInstance(token);
  const response = await octokit.rest.repos.get({ owner, repo });

  if (!response.data.permissions?.push) {
    throw new Error(`You do not have write access to "${owner}/${repo}".`);
  }

  const repoAccess = {
    repoId: response.data.id,
    ownerId: response.data.owner.id,
    ownerLogin: response.data.owner.login,
    repoName: response.data.name,
    ownerType: response.data.owner.type === "User" ? "user" : "org",
  };

  return { token, repoAccess };
};

export { requireGithubUserToken, requireGithubRepoWriteAccess };
