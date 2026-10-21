import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getToken } from "@/lib/token";
import { RepoProvider } from "@/contexts/repo-context";
import {
  GithubAccessProvider,
  type GithubAccessStatus,
} from "@/contexts/github-access-context";
import { getServerSession } from "@/lib/session-server";
import { getRepoSnapshot } from "@/lib/github-cache-file";
import { isGithubAuthError } from "@/lib/github-auth";
import type { Repo } from "@/types/repo";

function createStubRepo(owner: string, repo: string, branch = "main"): Repo {
  return {
    id: 0,
    owner,
    ownerId: 0,
    repo,
    defaultBranch: branch,
    branches: [branch],
    isPrivate: true,
  };
}

export default async function Layout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ owner: string; repo: string }>;
}) {
  const { owner, repo: repoParam } = await params;
  const repo = (() => {
    try {
      return decodeURIComponent(repoParam);
    } catch {
      return repoParam;
    }
  })();
  const requestHeaders = await headers();
  const session = await getServerSession();
  const user = session?.user;
  const returnTo = requestHeaders.get("x-return-to");
  const signInUrl =
    returnTo && returnTo !== "/sign-in"
      ? `/sign-in?redirect=${encodeURIComponent(returnTo)}`
      : "/sign-in";
  if (!user) return redirect(signInUrl);

  let repoInfo: Repo = createStubRepo(owner, repo);
  let accessStatus: GithubAccessStatus = "ok";

  try {
    const { token } = await getToken(user, owner, repo);
    if (!token) throw new Error("Token not found");

    repoInfo = await getRepoSnapshot(owner, repo, token, {
      branchList: "default",
    });
    const branchNames = repoInfo.branches ?? [];

    if (branchNames.length === 0) {
      accessStatus = "empty";
      repoInfo = {
        ...repoInfo,
        defaultBranch: repoInfo.defaultBranch || "main",
        branches: repoInfo.defaultBranch ? [repoInfo.defaultBranch] : ["main"],
      };
    }
  } catch (error: any) {
    if (isGithubAuthError(error) || error?.status === 401) {
      accessStatus = "auth";
    } else if (error?.status === 404) {
      accessStatus = "not_found";
    } else if (error?.status === 403) {
      accessStatus = "forbidden";
    } else {
      throw error;
    }
  }

  // Always mount RepoProvider so branch layout / sidebar stay available.
  // Branch list is minimal here ([defaultBranch]); RepoBranchesHydrator fills the rest.
  return (
    <RepoProvider repo={repoInfo}>
      <GithubAccessProvider status={accessStatus}>
        {children}
      </GithubAccessProvider>
    </RepoProvider>
  );
}
