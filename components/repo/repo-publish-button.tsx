"use client";

import Link from "next/link";
import { Loader, Upload, ListTree } from "lucide-react";
import {
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { usePublishDialog } from "@/components/repo/publish-dialog-context";
import { usePublishStatus } from "@/components/repo/use-publish-status";
import { repoHref } from "@/lib/repo-href";

export function RepoPublishButton({
  owner,
  repo,
  branch,
  onNavigate,
}: {
  owner: string;
  repo: string;
  branch: string;
  onNavigate?: () => void;
}) {
  const { openPublishDialog } = usePublishDialog();
  const { loading, pendingCount, canAct } = usePublishStatus(
    owner,
    repo,
    branch,
  );

  const changesHref = repoHref(owner, repo, branch, "/changes");
  const countLabel =
    canAct && pendingCount > 0 ? (
      <span className="text-muted-foreground ml-auto shrink-0 tabular-nums text-xs">
        {pendingCount}
      </span>
    ) : null;

  return (
    <>
      <SidebarMenuSubItem>
        <SidebarMenuSubButton
          asChild
          className={cn("w-full", !canAct && "opacity-50")}
          aria-disabled={!canAct || loading}
        >
          <button
            type="button"
            disabled={!canAct || loading}
            title={
              canAct
                ? "将暂存的修改一并发布到 GitHub"
                : "没有待发布的更改"
            }
            onClick={openPublishDialog}
          >
            {loading ? (
              <Loader className="size-4 animate-spin" />
            ) : (
              <Upload className="size-4" />
            )}
            <span className="min-w-0 flex-1 truncate text-left">发布修改</span>
            {countLabel}
          </button>
        </SidebarMenuSubButton>
      </SidebarMenuSubItem>

      <SidebarMenuSubItem>
        <SidebarMenuSubButton asChild className="w-full">
          <Link
            href={changesHref}
            onClick={onNavigate}
            title="查看未提交的修改列表"
          >
            <ListTree className="size-4" />
            <span className="min-w-0 flex-1 truncate text-left">更改列表</span>
            {countLabel}
          </Link>
        </SidebarMenuSubButton>
      </SidebarMenuSubItem>
    </>
  );
}
