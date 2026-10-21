/**
 * Get the list of GitHub accounts the user (incl. collaborators) has access to.
 */

import { db } from "@/db";
import { collaboratorTable } from "@/db/schema";
import { getInstallations } from "@/lib/github-app";
import { User } from "@/types/user";
import { getGithubAccount } from "@/lib/github-account";
import { requireGithubUserToken } from "@/lib/authz-server";
import { hasGithubIdentity } from "@/lib/authz-shared";
import { collaboratorMatchesUser } from "@/lib/collaborator-access";
import { isLocalRepoMode, getLocalRepoRef } from "@/lib/local-repo/config";
import { isGithubAuthError } from "@/lib/github-auth";

const getAccounts = async (user: User) => {
  if (isLocalRepoMode()) {
    const { owner } = getLocalRepoRef();
    return [
      {
        login: owner,
        type: "user",
        repositorySelection: "all",
        installationId: 1,
      },
    ];
  }

  let accounts: Array<{
    login: string;
    type: string;
    repositorySelection: string;
    installationId: number;
  }> = [];
  const githubAccount = await getGithubAccount(user.id);

  if (githubAccount?.accessToken && hasGithubIdentity(user)) {
    try {
      const token = await requireGithubUserToken(user);
      const installations = await getInstallations(token);

      accounts = installations.map((installation: any) => ({
        login: installation.account.login,
        type: installation.account.type === "User" ? "user" : "org",
        repositorySelection: installation.repository_selection,
        installationId: installation.id,
      }));
    } catch (error) {
      // Expired/revoked OAuth must not block email-login sessions or collaborator access.
      if (!isGithubAuthError(error)) throw error;
    }
  }

  const groupedRepos = await db
    .selectDistinct({
      owner: collaboratorTable.owner,
      type: collaboratorTable.type,
      installationId: collaboratorTable.installationId,
    })
    .from(collaboratorTable)
    .where(collaboratorMatchesUser(user));

  const collaboratorAccounts = groupedRepos.map((collaborator) => ({
    login: collaborator.owner,
    type: collaborator.type,
    repositorySelection: "selected",
    installationId: collaborator.installationId,
  }));

  const dedupedAccounts = new Map<string, (typeof accounts)[number]>();

  for (const account of accounts) {
    const key = `${account.login.toLowerCase()}::${account.installationId}`;
    dedupedAccounts.set(key, account);
  }

  for (const account of collaboratorAccounts) {
    const key = `${account.login.toLowerCase()}::${account.installationId}`;
    if (!dedupedAccounts.has(key)) {
      dedupedAccounts.set(key, account);
    }
  }

  accounts = Array.from(dedupedAccounts.values());

  if (accounts.length === 0) return [];

  return accounts;
};

export { getAccounts };
