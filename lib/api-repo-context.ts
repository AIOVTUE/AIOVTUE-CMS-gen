import { createHttpError } from "@/lib/api-error";
import { getConfig } from "@/lib/config-store";
import { getGithubId } from "@/lib/github-account";
import { checkRepoAccess } from "@/lib/github-cache-permissions";
import { requireApiUserSession } from "@/lib/session-server";
import { getToken } from "@/lib/token";
import type { Config } from "@/types/config";
import type { User } from "@/types/user";
import { isLocalRepoRef } from "@/lib/local-repo/config";

type RepoRef = {
  owner: string;
  repo: string;
  branch: string;
};

type RepoReadContext = {
  user: User;
  token: string;
  config: Config;
};

const decodeParam = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const getRepoReadContext = async ({ owner, repo, branch }: RepoRef): Promise<RepoReadContext> => {
  const sessionResult = await requireApiUserSession();
  if ("response" in sessionResult) {
    throw createHttpError("Not signed in.", sessionResult.response?.status ?? 401);
  }

  const user = sessionResult.user as User;
  const decodedOwner = decodeParam(owner);
  const decodedRepo = decodeParam(repo);
  const decodedBranch = decodeParam(branch);

  const { token, source } = await getToken(user, decodedOwner, decodedRepo);
  if (!token) throw createHttpError("Token not found", 401);

  if (!isLocalRepoRef(decodedOwner, decodedRepo)) {
    const githubId = await getGithubId(user.id);
    if (githubId && source === "user") {
      const hasAccess = await checkRepoAccess(
        token,
        decodedOwner,
        decodedRepo,
        githubId,
      );
      if (!hasAccess) {
        throw createHttpError(
          `No access to repository ${decodedOwner}/${decodedRepo}.`,
          403,
        );
      }
    }
  }

  const config = await getConfig(decodedOwner, decodedRepo, decodedBranch, {
    getToken: async () => token,
  });
  if (!config) {
    throw createHttpError(
      `Config not found for ${decodedOwner}/${decodedRepo}/${decodedBranch}.`,
      404,
    );
  }

  return { user, token, config };
};

export { getRepoReadContext };
