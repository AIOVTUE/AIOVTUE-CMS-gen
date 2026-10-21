import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getConfig } from "@/lib/config-store";
import { ConfigProvider } from "@/contexts/config-context";
import { RepoLayout } from "@/components/repo/repo-layout";
import { getServerSession } from "@/lib/session-server";
import { getToken } from "@/lib/token";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { isGithubAuthError } from "@/lib/github-auth";
import {
  GithubAccessProvider,
  type GithubAccessStatus,
} from "@/contexts/github-access-context";
import { hasConfiguredContentPages } from "@/lib/page-templates";
import {
  canonicalizeLocalRepoRoute,
  isLocalRepoRef,
} from "@/lib/local-repo/config";
import { encodeRepoSegment, repoHref } from "@/lib/repo-href";

export default async function Layout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ owner: string; repo: string; branch: string }>;
}) {
  const { owner, repo, branch } = await params;
  const requestHeaders = await headers();
  const session = await getServerSession();
  const user = session?.user;
  const returnTo = requestHeaders.get("x-return-to");
  const signInUrl =
    returnTo && returnTo !== "/sign-in"
      ? `/sign-in?redirect=${encodeURIComponent(returnTo)}`
      : "/sign-in";
  if (!user) return redirect(signInUrl);

  const decodedBranch = decodeURIComponent(branch);
  const decodedRepo = (() => {
    try {
      return decodeURIComponent(repo);
    } catch {
      return repo;
    }
  })();

  // `/local/hugo-blog/...` → `/local/<folder-name>/...` when a workspace path is set.
  if (isLocalRepoRef(owner, decodedRepo)) {
    const restMatch = (returnTo || "").match(
      /^\/[^/]+\/[^/]+\/[^/]+(\/.*)?$/i,
    );
    const restPath = restMatch?.[1] || "";
    const canonical = await canonicalizeLocalRepoRoute({
      owner,
      repo: decodedRepo,
      branch: decodedBranch,
      restPath,
    });
    // Do not redirect solely to decode %E6… in the URL — that desyncs the
    // App Router soft navigation and surfaces the root 页面未找到 UI.
    if (canonical) redirect(canonical);
  }

  let config = {
    owner: owner.toLowerCase(),
    // Keep Unicode repo names as-is (toLowerCase is a no-op for 中文).
    repo: decodedRepo,
    branch: decodedBranch,
    sha: "",
    version: "",
    object: {},
  };

  let branchMissingMessage: React.ReactNode = null;
  let accessStatus: GithubAccessStatus | null = null;

  try {
    const { token } = await getToken(user, owner, decodedRepo);
    const syncedConfig = await getConfig(owner, decodedRepo, decodedBranch, {
      getToken: async () => token,
    });

    if (syncedConfig) {
      config = syncedConfig;
    }
  } catch (error: any) {
    if (isGithubAuthError(error) || error?.status === 401) {
      accessStatus = "auth";
    } else if (error?.status === 403) {
      accessStatus = "forbidden";
    } else if (error?.status === 404) {
      if (error.response?.data?.message === "Not Found") {
        // Missing config is bootstrapped from the builtin template + DB.
      } else {
        branchMissingMessage = (
          <Empty className="absolute inset-0 border-0 rounded-none">
            <EmptyHeader>
              <EmptyTitle>找不到分支</EmptyTitle>
              <EmptyDescription>{`找不到分支「${decodedBranch}」。该分支可能已被删除或重命名。`}</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Link
                className={buttonVariants({ variant: "default" })}
                href={`/${encodeRepoSegment(owner)}/${encodeRepoSegment(decodedRepo)}`}
              >
                打开默认分支
              </Link>
            </EmptyContent>
          </Empty>
        );
      }
    } else {
      throw error;
    }

    // Keep a shell for sidebar UX, but never write config without repo access.
    // For true 403/404, also skip reading another repo's stored overlays (info leak).
    if (!branchMissingMessage) {
      try {
        const allowStoredOverlays = accessStatus === "auth";
        const syncedConfig = await getConfig(owner, decodedRepo, decodedBranch, {
          persist: false,
          useStored: allowStoredOverlays,
        });
        if (syncedConfig) config = syncedConfig;
      } catch {
        // keep stub config
      }
    }
  }

  const pathname = returnTo || "";
  let decodedPathname = pathname;
  try {
    decodedPathname = decodeURIComponent(pathname);
  } catch {
    // keep raw pathname
  }
  // Only gate the branch home (`/{owner}/{repo}/{branch}`) — never hijack
  // /moments, /media, /configuration, etc. (that caused redirect/RSC loops).
  const onBranchHome =
    /^\/[^/]+\/[^/]+\/[^/]+\/?$/.test(pathname) ||
    /^\/[^/]+\/[^/]+\/[^/]+\/?$/.test(decodedPathname);

  if (
    !branchMissingMessage &&
    !accessStatus &&
    onBranchHome &&
    !hasConfiguredContentPages(config.object as Record<string, any>)
  ) {
    redirect(repoHref(owner, decodedRepo, decodedBranch, "/configuration"));
  }

  const body = branchMissingMessage ? branchMissingMessage : children;

  return (
    <ConfigProvider value={config}>
      {accessStatus ? (
        <GithubAccessProvider status={accessStatus}>
          <RepoLayout>{body}</RepoLayout>
        </GithubAccessProvider>
      ) : (
        <RepoLayout>{body}</RepoLayout>
      )}
    </ConfigProvider>
  );
}
