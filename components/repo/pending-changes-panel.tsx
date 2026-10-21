"use client";

import { useState, useMemo, useCallback } from "react";
import Link from "next/link";
import { Loader, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { useConfig } from "@/contexts/config-context";
import { Button } from "@/components/ui/button";
import { describePendingChange } from "@/components/repo/pending-change-label";
import { useRepoHeader } from "@/components/repo/repo-header-context";
import { RepoPageHeader } from "@/components/repo/repo-page-header";
import { usePublishStatus } from "@/components/repo/use-publish-status";
import { repoHref } from "@/lib/repo-href";

export function PendingChangesPanel() {
  const { config } = useConfig();
  if (!config) throw new Error("Config not found.");

  const { status, loading, discard, canAct, pendingCount } = usePublishStatus(
    config.owner,
    config.repo,
    config.branch,
  );
  const [busyPath, setBusyPath] = useState<string | null>(null);
  const [discardingAll, setDiscardingAll] = useState(false);

  const base = repoHref(config.owner, config.repo, config.branch);
  const files = status?.files ?? [];
  const isEmpty = !loading && files.length === 0;

  const handleDiscardOne = async (path: string) => {
    if (!confirm(`确定撤销「${path}」的未提交更改？`)) return;
    setBusyPath(path);
    try {
      const payload = await discard(path);
      toast.success(payload.message || "已撤销");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "撤销失败");
    } finally {
      setBusyPath(null);
    }
  };

  const handleDiscardAll = useCallback(async () => {
    if (!confirm("确定撤销全部未提交更改？此操作不可恢复。")) return;
    setDiscardingAll(true);
    try {
      const payload = await discard();
      toast.success(payload.message || "已全部撤销");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "撤销失败");
    } finally {
      setDiscardingAll(false);
    }
  }, [discard]);

  const headerNode = useMemo(
    () => (
      <RepoPageHeader title="未提交更改">
        <Button asChild variant="outline" size="sm">
          <Link href={base}>返回仓库</Link>
        </Button>
        <Button
          type="button"
          variant="destructive"
          size="sm"
          disabled={!canAct || discardingAll || busyPath != null}
          onClick={() => void handleDiscardAll()}
        >
          {discardingAll ? (
            <Loader className="h-4 w-4 animate-spin" />
          ) : (
            <Undo2 className="h-4 w-4" />
          )}
          全部撤销
        </Button>
      </RepoPageHeader>
    ),
    [base, busyPath, canAct, discardingAll, handleDiscardAll],
  );

  useRepoHeader({ header: headerNode });

  if (loading && files.length === 0) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-1 items-center justify-center py-20">
        <p className="text-muted-foreground text-sm">正在读取更改列表…</p>
      </div>
    );
  }

  if (isEmpty) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-2 px-4 py-20 text-center">
        <p className="text-base font-medium tracking-tight">暂无未提交更改</p>
        <p className="text-muted-foreground max-w-sm text-sm leading-relaxed">
          当前没有待提交的修改。保存内容后会出现在这里。
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4">
      <div className="flex items-baseline justify-between gap-3 px-0.5">
        <h2 className="text-sm font-medium text-muted-foreground">
          {canAct ? `共 ${pendingCount} 处更改` : "更改列表"}
        </h2>
      </div>
      <ul className="space-y-2">
        {files.map((file) => {
          const info = describePendingChange(file, config.object as any);
          const path = file.path;
          const busy = busyPath === path;
          return (
            <li
              key={path}
              className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-background/55 px-3 py-3 backdrop-blur-sm supports-[backdrop-filter]:bg-background/40"
            >
              <div className="min-w-0">
                <div className="truncate font-medium">{info.title}</div>
                <div className="text-muted-foreground break-all font-mono text-xs">
                  {info.subtitle}
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0"
                disabled={busy || discardingAll}
                onClick={() => void handleDiscardOne(path)}
              >
                {busy ? (
                  <Loader className="h-4 w-4 animate-spin" />
                ) : (
                  <Undo2 className="h-4 w-4" />
                )}
                撤销
              </Button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
