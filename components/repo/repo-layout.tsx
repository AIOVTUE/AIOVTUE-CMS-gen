"use client";

import { useEffect } from "react";
import { RepoSidebar } from "@/components/repo/repo-sidebar";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { useConfig } from "@/contexts/config-context";
import { useRepo } from "@/contexts/repo-context";
import { trackVisit } from "@/lib/tracker";
import { setDefaultRepo } from "@/lib/default-repo";
import {
  RepoHeaderProvider,
  useRepoHeaderState,
} from "@/components/repo/repo-header-context";
import { RepoTheme } from "@/components/repo/repo-theme";
import { RepoBranchesHydrator } from "@/components/repo/repo-branches-hydrator";
import { PublishDialogProvider } from "@/components/repo/publish-dialog-context";
import { GithubAccessContent } from "@/components/github-access-banner";
import "@/components/app-shell-backdrop.css";
import "./repo-home-shell.css";

function RepoHeader() {
  const { header } = useRepoHeaderState();
  const { isMobile, setOpenMobile } = useSidebar();
  const hasHeaderContent =
    header !== null &&
    header !== undefined &&
    header !== false &&
    header !== "";

  return (
    <header className="repo-shell-header width-before-scroll-bar relative z-20 flex min-h-11 shrink-0 items-center gap-1.5 border-b px-3 py-1.5 pt-[max(0.375rem,env(safe-area-inset-top))] md:min-h-14 md:gap-2 md:px-6 md:py-2">
      <SidebarTrigger className="shrink-0 md:hidden" />
      {hasHeaderContent ? (
        <div className="min-w-0 flex-1">{header}</div>
      ) : (
        <button
          type="button"
          className="min-w-0 flex-1 text-left text-sm font-medium text-muted-foreground md:hidden"
          onClick={() => {
            if (isMobile) setOpenMobile(true);
          }}
        >
          菜单
        </button>
      )}
    </header>
  );
}

export function RepoLayout({ children }: { children: React.ReactNode }) {
  const { config } = useConfig();
  const { owner, repo } = useRepo();

  useEffect(() => {
    if (config?.owner && config?.repo && config?.branch) {
      trackVisit(owner, repo, config.branch);
      setDefaultRepo(owner, repo, config.branch);
    }
  }, [config, owner, repo]);

  return (
    <SidebarProvider className="repo-shell">
      <div className="app-shell-backdrop" aria-hidden>
        <div className="app-shell-backdrop__image" />
      </div>
      <RepoTheme />
      <RepoBranchesHydrator />
      <RepoHeaderProvider>
        <PublishDialogProvider>
          <RepoSidebar />
          <SidebarInset className="repo-shell-inset h-dvh max-h-dvh min-h-dvh min-w-0 overflow-hidden">
            <RepoHeader />
            <main
              data-cms-page-shell=""
              className="relative flex min-h-0 min-w-0 max-w-full flex-1 flex-col overflow-x-clip overflow-y-auto p-3 pb-[max(1rem,env(safe-area-inset-bottom))] md:p-6"
            >
              <GithubAccessContent>{children}</GithubAccessContent>
            </main>
          </SidebarInset>
        </PublishDialogProvider>
      </RepoHeaderProvider>
    </SidebarProvider>
  );
}
