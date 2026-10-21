"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useUser } from "@/contexts/user-context";
import { DocumentTitle } from "@/components/document-title";
import { hasGithubIdentity } from "@/lib/authz-shared";
import { MainRootLayout } from "./main-root-layout";
import { clearDefaultRepo, getDefaultRepoPath } from "@/lib/default-repo";
import { LocalWorkspaceDialog } from "@/components/repo/local-workspace-dialog";
import { RepoSelect } from "@/components/repo/repo-select";
import { FolderOpen, Github, Loader } from "lucide-react";
import { signIn } from "@/lib/auth-client";
import { getAuthCallbackURL } from "@/lib/auth-redirect";
import { hideNavigationLoading } from "@/lib/navigation-loading";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export function HomePage() {
  const searchParams = useSearchParams();
  const forceSelect = searchParams.get("select") === "1";
  const [ready, setReady] = useState(false);
  const [authorizing, setAuthorizing] = useState(false);
  const [localOpen, setLocalOpen] = useState(false);
  const [showGithubRepos, setShowGithubRepos] = useState(false);
  const { user } = useUser();
  const isGithubUser = hasGithubIdentity(user);

  useEffect(() => {
    if (forceSelect) {
      clearDefaultRepo();
      setReady(true);
      hideNavigationLoading();
      return;
    }

    const defaultPath = getDefaultRepoPath();
    if (defaultPath) {
      window.location.replace(defaultPath);
      return;
    }
    setReady(true);
    hideNavigationLoading();
  }, [forceSelect]);

  const handleAuthorizeGithub = async () => {
    if (authorizing) return;
    setAuthorizing(true);
    try {
      const result = await signIn.social({
        provider: "github",
        callbackURL: getAuthCallbackURL("/?select=1"),
        errorCallbackURL: "/sign-in",
        disableRedirect: true,
      });
      if (result.error?.message) {
        toast.error(result.error.message);
        setAuthorizing(false);
        return;
      }
      if (result.data?.url) {
        window.location.assign(result.data.url);
        return;
      }
      toast.error("无法启动 GitHub 授权，请重试。");
      setAuthorizing(false);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "无法启动 GitHub 授权。");
      setAuthorizing(false);
    }
  };

  if (!user) throw new Error("User not found");
  if (user.accounts == null) {
    return (
      <MainRootLayout title="项目">
        <DocumentTitle title="项目" />
        <div className="text-muted-foreground flex min-h-[calc(100vh-8rem)] items-center justify-center p-6 text-sm">
          正在加载账号…
        </div>
      </MainRootLayout>
    );
  }
  if (!ready) {
    return (
      <MainRootLayout title="项目">
        <DocumentTitle title="项目" />
        <div className="text-muted-foreground flex min-h-[calc(100vh-8rem)] items-center justify-center p-6 text-sm">
          正在打开…
        </div>
      </MainRootLayout>
    );
  }

  const hasInstallations = user.accounts.length > 0;

  return (
    <MainRootLayout title="项目">
      <DocumentTitle title="项目" />
      <div
        className={cn(
          "mx-auto flex min-h-[calc(100vh-8rem)] flex-col justify-center gap-8 px-4 py-10 md:px-6",
          showGithubRepos ? "max-w-2xl" : "max-w-lg",
        )}
      >
        <h1 className="text-center text-2xl font-semibold tracking-tight">开始</h1>

        <div className="grid gap-3">
          <button
            type="button"
            onClick={() => {
              hideNavigationLoading();
              setShowGithubRepos(false);
              setLocalOpen(true);
            }}
            className={cn(
              "group flex w-full items-start gap-4 rounded-xl border bg-background p-5 text-left transition-colors",
              "hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            )}
          >
            <span className="bg-muted text-foreground flex size-11 shrink-0 items-center justify-center rounded-lg">
              <FolderOpen className="size-5" />
            </span>
            <span className="min-w-0 space-y-1">
              <span className="block text-base font-medium">选择本地项目</span>
              <span className="text-muted-foreground block text-sm leading-relaxed">
                指定本机博客目录，CMS 直接读写本地文件。
              </span>
            </span>
          </button>

          {!isGithubUser ? (
            <button
              type="button"
              onClick={() => void handleAuthorizeGithub()}
              disabled={authorizing}
              className={cn(
                "group flex w-full items-start gap-4 rounded-xl border bg-background p-5 text-left transition-colors",
                "hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                "disabled:pointer-events-none disabled:opacity-60",
              )}
            >
              <span className="bg-muted text-foreground flex size-11 shrink-0 items-center justify-center rounded-lg">
                {authorizing ? (
                  <Loader className="size-5 animate-spin" />
                ) : (
                  <Github className="size-5" />
                )}
              </span>
              <span className="min-w-0 space-y-1">
                <span className="block text-base font-medium">授权 GitHub 登录</span>
                <span className="text-muted-foreground block text-sm leading-relaxed">
                  使用 GitHub 账号登录并管理远程仓库。
                </span>
              </span>
            </button>
          ) : !hasInstallations ? (
            // API route performs OAuth redirect — full navigation required.
            // eslint-disable-next-line @next/next/no-html-link-for-pages -- API OAuth redirect
            <a
              href="/api/github-app/install"
              className={cn(
                "group flex w-full items-start gap-4 rounded-xl border bg-background p-5 text-left transition-colors",
                "hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              )}
            >
              <span className="bg-muted text-foreground flex size-11 shrink-0 items-center justify-center rounded-lg">
                <Github className="size-5" />
              </span>
              <span className="min-w-0 space-y-1">
                <span className="block text-base font-medium">安装 GitHub 应用</span>
                <span className="text-muted-foreground block text-sm leading-relaxed">
                  已授权登录。安装应用后即可打开 GitHub 仓库。
                </span>
              </span>
            </a>
          ) : (
            <button
              type="button"
              onClick={() => setShowGithubRepos((open) => !open)}
              aria-expanded={showGithubRepos}
              className={cn(
                "group flex w-full items-start gap-4 rounded-xl border bg-background p-5 text-left transition-colors",
                "hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                showGithubRepos && "bg-muted/40",
              )}
            >
              <span className="bg-muted text-foreground flex size-11 shrink-0 items-center justify-center rounded-lg">
                <Github className="size-5" />
              </span>
              <span className="min-w-0 space-y-1">
                <span className="block text-base font-medium">打开 GitHub 仓库</span>
                <span className="text-muted-foreground block text-sm leading-relaxed">
                  已授权。选择要打开的远程仓库。
                </span>
              </span>
            </button>
          )}
        </div>

        {showGithubRepos && isGithubUser && hasInstallations ? (
          <div className="space-y-3">
            <h2 className="text-sm font-medium">选择仓库</h2>
            <RepoSelect />
          </div>
        ) : null}
      </div>

      <LocalWorkspaceDialog
        open={localOpen}
        onOpenChange={setLocalOpen}
        localProject
      />
    </MainRootLayout>
  );
}
