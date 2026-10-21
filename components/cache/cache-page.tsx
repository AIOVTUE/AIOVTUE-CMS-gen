"use client";

import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BookText, RefreshCcw, Trash2 } from "lucide-react";
import { useRepoHeader } from "@/components/repo/repo-header-context";
import { RepoPageHeader } from "@/components/repo/repo-page-header";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "sonner";
import { requireApiSuccess } from "@/lib/api-client";

type CacheStatusPayload = {
  fileMeta: {
    commitSha: string | null;
    status: string;
    error: string | null;
    updatedAt: string;
    lastCheckedAt: string;
  } | null;
  folderMeta: Array<{
    path: string;
    context: string;
    status: string;
    commitSha: string | null;
    updatedAt: string;
  }>;
  fileCount: number;
  permissionCount: number;
  config: {
    sha: string;
    lastCheckedAt: string;
    version: string;
  } | null;
  branchHeadSha: string;
};

function formatTimeAgo(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return formatDistanceToNow(date, { addSuffix: true });
}

function fullDate(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
}

function TimeWithTooltip({ value }: { value: string | null | undefined }) {
  if (!value) return <span className="font-medium">-</span>;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="cursor-help font-medium">{formatTimeAgo(value)}</span>
      </TooltipTrigger>
      <TooltipContent sideOffset={6}>{fullDate(value)}</TooltipContent>
    </Tooltip>
  );
}

function ConfirmActionButton({
  label,
  title,
  description,
  confirmLabel = "Confirm",
  variant = "outline",
  size = "sm",
  iconOnly = false,
  tooltip,
  className,
  icon,
  disabled,
  onConfirm,
}: {
  label: string;
  title: string;
  description: string;
  confirmLabel?: string;
  variant?: React.ComponentProps<typeof Button>["variant"];
  size?: React.ComponentProps<typeof Button>["size"];
  iconOnly?: boolean;
  tooltip?: string;
  className?: string;
  icon?: React.ReactNode;
  disabled?: boolean;
  onConfirm: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      {iconOnly ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <AlertDialogTrigger asChild>
              <Button
                size={size}
                variant={variant}
                className={className}
                disabled={disabled}
                aria-label={label}
              >
                {icon ?? <Trash2 className="size-4" />}
              </Button>
            </AlertDialogTrigger>
          </TooltipTrigger>
          <TooltipContent sideOffset={6}>{tooltip || label}</TooltipContent>
        </Tooltip>
      ) : (
        <AlertDialogTrigger asChild>
          <Button
            size={size}
            variant={variant}
            className={className}
            disabled={disabled}
          >
            {label}
          </Button>
        </AlertDialogTrigger>
      )}
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>取消</AlertDialogCancel>
          <AlertDialogAction
            variant={variant === "destructive" ? "destructive" : "default"}
            onClick={() => {
              void onConfirm().finally(() => setOpen(false));
            }}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function CachePage({
  owner,
  repo,
  branch,
}: {
  owner: string;
  repo: string;
  branch: string;
}) {
  const [data, setData] = useState<CacheStatusPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(
        `/api/${owner}/${repo}/${encodeURIComponent(branch)}/cache`,
      );
      const payload = await requireApiSuccess<{
        status: string;
        data: CacheStatusPayload;
      }>(response, "获取缓存状态失败");
      setData(payload.data);
    } catch (error: any) {
      toast.error(error?.message || "获取缓存状态失败");
    } finally {
      setLoading(false);
    }
  }, [branch, owner, repo]);

  useEffect(() => {
    void fetchStatus();
  }, [fetchStatus]);

  const runAction = useCallback(
    async (action: string, successMessage: string) => {
      setActionLoading(action);
      const loadingId = toast.loading("正在更新缓存...");
      try {
        const response = await fetch(
          `/api/${owner}/${repo}/${encodeURIComponent(branch)}/cache`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action }),
          },
        );
        await requireApiSuccess(response, "Failed cache action");
        toast.success(successMessage, { id: loadingId });
        await fetchStatus();
      } catch (error: any) {
        toast.error(error?.message || "Failed cache action", { id: loadingId });
      } finally {
        setActionLoading(null);
      }
    },
    [branch, fetchStatus, owner, repo],
  );

  const headerNode = useMemo(
    () => (
      <RepoPageHeader
        title={
          <div className="flex items-center gap-2">
            <span className="repo-page-header__title">缓存</span>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  asChild
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground hover:text-foreground"
                >
                  <Link
                    href="https://pagescms.org/docs/development/caching/"
                    target="_blank"
                    rel="noreferrer"
                  >
                    <BookText />
                    <span className="sr-only">Cache docs</span>
                  </Link>
                </Button>
              </TooltipTrigger>
              <TooltipContent>查看文档</TooltipContent>
            </Tooltip>
          </div>
        }
      >
        <ConfirmActionButton
          label="Clear all cache"
          title="Clear all cache?"
          description="This will clear file, config, and permission cache for this repository/branch."
          confirmLabel="Clear all"
          variant="default"
          size="default"
          disabled={loading || actionLoading != null}
          onConfirm={async () =>
            runAction("clear-all-cache", "All cache cleared")
          }
        />
      </RepoPageHeader>
    ),
    [actionLoading, loading, runAction],
  );

  useRepoHeader({ header: headerNode });

  const remoteSha = data?.branchHeadSha ?? null;
  const localSha = data?.fileMeta?.commitSha ?? null;
  const isOutOfSync = !!remoteSha && !!localSha && remoteSha !== localSha;
  const canReconcile = !!data && isOutOfSync;
  const shortSha = (sha: string | null | undefined) =>
    sha ? sha.slice(0, 8) : "-";

  if (loading || !data) {
    return (
      <div className="max-w-screen-lg mx-auto space-y-4">
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="h-full">
            <CardHeader>
              <CardTitle className="text-base">内容</CardTitle>
              <CardDescription>
                已缓存的内容（文件与集合）。
              </CardDescription>
            </CardHeader>
            <CardContent className="text-sm flex-1">
              <div className="divide-y rounded-md border">
                <div className="flex items-center justify-between gap-3 px-3 py-2">
                  <span className="text-muted-foreground">已缓存文件</span>
                  <Skeleton className="h-4 w-10" />
                </div>
                <div className="flex items-center justify-between gap-3 px-3 py-2">
                  <span className="text-muted-foreground">文件夹缓存</span>
                  <Skeleton className="h-4 w-10" />
                </div>
                <div className="flex items-center justify-between gap-3 px-3 py-2">
                  <span className="text-muted-foreground">缓存 SHA</span>
                  <Skeleton className="h-4 w-20" />
                </div>
                <div className="flex items-center justify-between gap-3 px-3 py-2">
                  <span className="text-muted-foreground">远程 SHA</span>
                  <Skeleton className="h-4 w-20" />
                </div>
                <div className="flex items-center justify-between gap-3 px-3 py-2">
                  <span className="text-muted-foreground">更新时间</span>
                  <Skeleton className="h-4 w-20" />
                </div>
                <div className="flex items-center justify-between gap-3 px-3 py-2">
                  <span className="text-muted-foreground">状态</span>
                  <Skeleton className="h-4 w-16" />
                </div>
                <div className="flex items-center justify-between gap-3 px-3 py-2">
                  <span className="text-muted-foreground">上次检查</span>
                  <Skeleton className="h-4 w-20" />
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex justify-end">
              <div className="inline-flex items-center">
                <Button
                  variant="outline"
                  size="icon-sm"
                  className="rounded-r-none"
                  disabled
                >
                  <RefreshCcw className="size-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon-sm"
                  className="rounded-l-none border-l-0"
                  disabled
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </CardFooter>
          </Card>

          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">配置</CardTitle>
                <CardDescription>
                  CMS configuration status (builtin schema + database overlays).
                </CardDescription>
              </CardHeader>
              <CardContent className="text-sm flex-1">
                <div className="divide-y rounded-md border">
                  <div className="flex items-center justify-between gap-3 px-3 py-2">
                    <span className="text-muted-foreground">缓存 SHA</span>
                    <Skeleton className="h-4 w-20" />
                  </div>
                  <div className="flex items-center justify-between gap-3 px-3 py-2">
                    <span className="text-muted-foreground">版本</span>
                    <Skeleton className="h-4 w-12" />
                  </div>
                  <div className="flex items-center justify-between gap-3 px-3 py-2">
                    <span className="text-muted-foreground">上次检查</span>
                    <Skeleton className="h-4 w-20" />
                  </div>
                </div>
              </CardContent>
              <CardFooter className="flex justify-end">
                <div className="inline-flex items-center">
                  <Button
                    variant="outline"
                    size="icon-sm"
                    className="rounded-r-none"
                    disabled
                  >
                    <RefreshCcw className="size-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon-sm"
                    className="rounded-l-none border-l-0"
                    disabled
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </CardFooter>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">权限</CardTitle>
                <CardDescription>
                  Cached repository permission checks.
                </CardDescription>
              </CardHeader>
              <CardContent className="text-sm flex-1">
                <div className="divide-y rounded-md border">
                  <div className="flex items-center justify-between gap-3 px-3 py-2">
                    <span className="text-muted-foreground">条目数</span>
                    <Skeleton className="h-4 w-10" />
                  </div>
                </div>
              </CardContent>
              <CardFooter className="justify-end">
                <Button variant="outline" size="icon-sm" disabled>
                  <Trash2 className="size-4" />
                </Button>
              </CardFooter>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="max-w-screen-lg mx-auto space-y-4">
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="h-full">
            <CardHeader>
              <CardTitle className="text-base">内容</CardTitle>
              <CardDescription>
                已缓存的内容（文件与集合）。
              </CardDescription>
            </CardHeader>
            <CardContent className="text-sm flex-1">
              <div className="divide-y rounded-md border">
                <div className="flex items-center justify-between gap-3 px-3 py-2">
                  <span className="text-muted-foreground">已缓存文件</span>
                  <span className="font-medium">{data.fileCount}</span>
                </div>
                <div className="flex items-center justify-between gap-3 px-3 py-2">
                  <span className="text-muted-foreground">文件夹缓存</span>
                  <span className="font-medium">{data.folderMeta.length}</span>
                </div>
                <div className="flex items-center justify-between gap-3 px-3 py-2">
                  <span className="text-muted-foreground">缓存 SHA</span>
                  <span className="font-mono font-medium">
                    {shortSha(localSha)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3 px-3 py-2">
                  <span className="text-muted-foreground">远程 SHA</span>
                  <span className="font-mono font-medium">
                    {shortSha(remoteSha)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3 px-3 py-2">
                  <span className="text-muted-foreground">更新时间</span>
                  <TimeWithTooltip value={data.fileMeta?.updatedAt} />
                </div>
                <div className="flex items-center justify-between gap-3 px-3 py-2">
                  <span className="text-muted-foreground">状态</span>
                  <span className="font-medium capitalize">
                    {data.fileMeta?.status || "unknown"}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3 px-3 py-2">
                  <span className="text-muted-foreground">上次检查</span>
                  <TimeWithTooltip value={data.fileMeta?.lastCheckedAt} />
                </div>
              </div>
              {data.fileMeta?.status === "error" && (
                <div className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-3 text-sm">
                  <p className="font-medium text-destructive">
                    Unknown cache error
                  </p>
                  <p className="mt-1 text-muted-foreground">
                    Try refreshing the cache first. If the issue persists, clear
                    the cache and refresh it again.
                  </p>
                </div>
              )}
            </CardContent>
            <CardFooter className="flex justify-end">
              <div className="inline-flex items-center">
                <ConfirmActionButton
                  label="刷新缓存"
                  title="Refresh file cache?"
                  description="This will check remote SHA and reconcile file cache if needed."
                  confirmLabel="Refresh"
                  variant="outline"
                  size="icon-sm"
                  iconOnly
                  tooltip="刷新缓存"
                  icon={<RefreshCcw className="size-4" />}
                  className="rounded-r-none"
                  disabled={actionLoading != null || !canReconcile}
                  onConfirm={async () =>
                    runAction("reconcile-file-cache", "File cache refreshed")
                  }
                />
                <ConfirmActionButton
                  label="清除缓存"
                  title="Clear file cache?"
                  description="This will delete cached file entries and reset file cache metadata."
                  confirmLabel="Clear"
                  variant="outline"
                  size="icon-sm"
                  iconOnly
                  tooltip="清除缓存"
                  icon={<Trash2 className="size-4" />}
                  className="rounded-l-none border-l-0"
                  disabled={actionLoading != null}
                  onConfirm={async () =>
                    runAction("clear-file-cache", "File cache cleared")
                  }
                />
              </div>
            </CardFooter>
          </Card>

          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">配置</CardTitle>
                <CardDescription>
                  CMS configuration status (builtin schema + database overlays).
                </CardDescription>
              </CardHeader>
              <CardContent className="text-sm flex-1">
                <div className="divide-y rounded-md border">
                  <div className="flex items-center justify-between gap-3 px-3 py-2">
                    <span className="text-muted-foreground">缓存 SHA</span>
                    <span className="font-mono font-medium">
                      {shortSha(data.config?.sha)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3 px-3 py-2">
                    <span className="text-muted-foreground">版本</span>
                    <span className="font-medium">
                      {data.config?.version || "-"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3 px-3 py-2">
                    <span className="text-muted-foreground">上次检查</span>
                    <TimeWithTooltip value={data.config?.lastCheckedAt} />
                  </div>
                </div>
              </CardContent>
              <CardFooter className="flex justify-end">
                <div className="inline-flex items-center">
                  <ConfirmActionButton
                    label="刷新缓存"
                    title="Refresh CMS config?"
                    description="Re-apply the builtin schema over database overlays and update the last-checked time."
                    confirmLabel="Refresh"
                    variant="outline"
                    size="icon-sm"
                    iconOnly
                    tooltip="刷新缓存"
                    icon={<RefreshCcw className="size-4" />}
                    className="rounded-r-none"
                    disabled={actionLoading != null}
                    onConfirm={async () =>
                      runAction("refresh-config", "Config cache refreshed")
                    }
                  />
                  <ConfirmActionButton
                    label="清除缓存"
                    title="Touch CMS config?"
                    description="CMS overlays (menus/settings) are stored in the database and are not cleared. This only updates the last-checked time."
                    confirmLabel="Confirm"
                    variant="outline"
                    size="icon-sm"
                    iconOnly
                    tooltip="清除缓存"
                    icon={<Trash2 className="size-4" />}
                    className="rounded-l-none border-l-0"
                    disabled={actionLoading != null}
                    onConfirm={async () =>
                      runAction("clear-config-cache", "Config cache cleared")
                    }
                  />
                </div>
              </CardFooter>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">权限</CardTitle>
                <CardDescription>
                  Cached repository permission checks.
                </CardDescription>
              </CardHeader>
              <CardContent className="text-sm flex-1">
                <div className="divide-y rounded-md border">
                  <div className="flex items-center justify-between gap-3 px-3 py-2">
                    <span className="text-muted-foreground">条目数</span>
                    <span className="font-medium">{data.permissionCount}</span>
                  </div>
                </div>
              </CardContent>
              <CardFooter className="justify-end">
                <ConfirmActionButton
                  label="清除缓存"
                  title="Clear permission cache?"
                  description="This will remove cached permission entries for this repository."
                  confirmLabel="Clear"
                  variant="outline"
                  size="icon-sm"
                  iconOnly
                  tooltip="清除缓存"
                  icon={<Trash2 className="size-4" />}
                  disabled={actionLoading != null}
                  onConfirm={async () =>
                    runAction(
                      "clear-permission-cache",
                      "Permission cache cleared",
                    )
                  }
                />
              </CardFooter>
            </Card>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
