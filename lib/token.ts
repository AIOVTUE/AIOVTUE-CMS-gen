/**
 * Token helper functions.
 */

import { cache } from "react";
import { App } from "@octokit/app";
import { decrypt, encrypt } from "@/lib/crypto";
import { db } from "@/db";
import {
  githubInstallationTokenTable
} from "@/db/schema";
import { eq } from "drizzle-orm";
import { User } from "@/types/user";
import { getGithubAccount } from "@/lib/github-account";
import { createHttpError } from "@/lib/api-error";
import { collaboratorMatchesUserForRepo } from "@/lib/collaborator-access";
import { hasAdminAccessAsync } from "@/lib/admin";
import { getAppConfig } from "@/lib/app-config/store";
import { isLocalRepoRef } from "@/lib/local-repo/config";
import { isGithubAuthError } from "@/lib/github-auth";

const installationTokenRefreshInFlight = new Map<number, Promise<string>>();

// Get a token for a user (including collagborators who need to provide an owner/repo scope).
const getToken = cache(async (
  user: User,
  owner: string,
  repo: string,
  verifyGithubAccess: boolean = false,
) => {
  if (isLocalRepoRef(owner, repo)) {
    // Default deny: admin only. LOCAL_REPO_ALLOW_ANY_USER is refused in production
    // unless LOCAL_REPO_ALLOW_ANY_USER_IN_PRODUCTION=true (single-user hosts only).
    const allowAny =
      process.env.LOCAL_REPO_ALLOW_ANY_USER === "true" &&
      (process.env.NODE_ENV !== "production" ||
        process.env.LOCAL_REPO_ALLOW_ANY_USER_IN_PRODUCTION === "true");
    if (!(await hasAdminAccessAsync(user)) && !allowAny) {
      throw createHttpError(
        `You do not have permission to access "${owner}/${repo}".`,
        403,
      );
    }
    return {
      token: "local-repo-token",
      source: "user" as const,
    };
  }

  const githubAccount = await getGithubAccount(user.id);
  let githubAuthError: unknown = null;
  if (githubAccount?.accessToken) {
    try {
      const hasGithubAccess = await canAccessRepoWithToken(
        githubAccount.accessToken,
        owner,
        repo,
      );
      if (hasGithubAccess) {
        return {
          token: githubAccount.accessToken,
          source: "user" as const,
        };
      }
    } catch (error) {
      if (
        (error as { status?: number })?.status === 401 ||
        isGithubAuthError(error)
      ) {
        githubAuthError = error;
      } else {
        throw error;
      }
    }
  }

  const permission = await db.query.collaboratorTable.findFirst({
    where: collaboratorMatchesUserForRepo(user, owner, repo),
  });
  if (permission) {
    const installationToken = await getInstallationToken(owner, repo);

    return {
      token: installationToken,
      source: "installation" as const,
    };
  }

  if (githubAuthError) {
    throw githubAuthError;
  }

  if (githubAccount?.accessToken && verifyGithubAccess) {
    throw createHttpError(
      `You do not have permission to access "${owner}/${repo}".`,
      403,
    );
  }

  throw createHttpError(
    `You do not have permission to access "${owner}/${repo}".`,
    403,
  );
});

// Get the GitHub App installation token for a specific repository.
const getInstallationToken = cache(async (owner: string, repo: string) => {
  const config = await getAppConfig();
  const appId = config.githubAppId;
  const privateKey = config.githubAppPrivateKey;
  if (!appId || !privateKey) {
    throw new Error("未配置 GitHub App ID / 私钥。请完成初始化。");
  }
  const app = new App({
    appId,
    privateKey,
  });

  const repoInstallation = await app.octokit.request(
    "GET /repos/{owner}/{repo}/installation",
    { owner, repo },
  );
  if (!repoInstallation) throw new Error(`Installation token not found for "${owner}/${repo}".`);

  const installationId = repoInstallation.data.id;
  const tokenData = await db.query.githubInstallationTokenTable.findFirst({
    where: eq(githubInstallationTokenTable.installationId, installationId)
  });

  if (tokenData && Date.now() < tokenData.expiresAt.getTime() - 60_000) {
    const token = await decrypt(tokenData.ciphertext, tokenData.iv);
    if (!token) throw new Error(`Token could not be retrieved and/or decrypted.`);
    return token;
  }

  const existingRefresh = installationTokenRefreshInFlight.get(installationId);
  if (existingRefresh) {
    return existingRefresh;
  }

  const refreshJob = (async () => {
    const installationToken = await app.octokit.request(
      "POST /app/installations/{installation_id}/access_tokens",
      {
        installation_id: installationId,
      },
    );

    const { ciphertext, iv } = await encrypt(installationToken.data.token);
    const expiresAt = new Date(installationToken.data.expires_at);

    if (tokenData) {
      await db.update(githubInstallationTokenTable).set({
        ciphertext,
        iv,
        expiresAt
      }).where(
        eq(githubInstallationTokenTable.id, tokenData.id)
      );
    } else {
      await db.insert(githubInstallationTokenTable).values({
        ciphertext,
        iv,
        installationId,
        expiresAt
      }).onConflictDoUpdate({
        target: githubInstallationTokenTable.installationId,
        set: {
          ciphertext,
          iv,
          expiresAt,
        },
      });
    }

    return installationToken.data.token;
  })();

  installationTokenRefreshInFlight.set(installationId, refreshJob);
  try {
    return await refreshJob;
  } finally {
    installationTokenRefreshInFlight.delete(installationId);
  }
});

// Get the GitHub user token.
const getUserToken = cache(async (userId: string) => {
  const githubAccount = await getGithubAccount(userId);
  if (!githubAccount?.accessToken) throw new Error(`GitHub token not found for user ${userId}.`);

  return githubAccount.accessToken;
});

const canAccessRepoWithToken = async (
  token: string,
  owner: string,
  repo: string,
) => {
  try {
    const { getGithubRepo } = await import("@/lib/github-repo-get");
    await getGithubRepo(token, owner, repo);
    return true;
  } catch (error: any) {
    // Expired/revoked OAuth must surface as auth failure, not as a soft "no access".
    if (error?.status === 401 || isGithubAuthError(error)) {
      throw error;
    }
    return false;
  }
};

const canWriteRepoWithToken = async (
  token: string,
  owner: string,
  repo: string,
) => {
  try {
    const { getGithubRepo } = await import("@/lib/github-repo-get");
    const data = await getGithubRepo(token, owner, repo);
    return Boolean(data.permissions?.push);
  } catch {
    return false;
  }
};

const getWriteToken = cache(async (user: User, owner: string, repo: string) => {
  if (isLocalRepoRef(owner, repo)) {
    const allowAny =
      process.env.LOCAL_REPO_ALLOW_ANY_USER === "true" &&
      (process.env.NODE_ENV !== "production" ||
        process.env.LOCAL_REPO_ALLOW_ANY_USER_IN_PRODUCTION === "true");
    if (!(await hasAdminAccessAsync(user)) && !allowAny) {
      throw createHttpError(
        `You do not have permission to access "${owner}/${repo}".`,
        403,
      );
    }
    return {
      token: "local-repo-token",
      source: "user" as const,
    };
  }

  const githubAccount = await getGithubAccount(user.id);
  if (githubAccount?.accessToken) {
    if (await canWriteRepoWithToken(githubAccount.accessToken, owner, repo)) {
      return {
        token: githubAccount.accessToken,
        source: "user" as const,
      };
    }
    throw createHttpError(
      `You do not have write access to "${owner}/${repo}".`,
      403,
    );
  }

  const permission = await db.query.collaboratorTable.findFirst({
    where: collaboratorMatchesUserForRepo(user, owner, repo),
  });
  if (permission) {
    const installationToken = await getInstallationToken(owner, repo);
    return {
      token: installationToken,
      source: "installation" as const,
    };
  }

  throw createHttpError(
    `You do not have permission to access "${owner}/${repo}".`,
    403,
  );
});

export { getInstallationToken, getUserToken, getToken, getWriteToken };
