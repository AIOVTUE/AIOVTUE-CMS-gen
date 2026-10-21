"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { zhCN } from "date-fns/locale";
import {
  Eye,
  EyeOff,
  Loader,
  MoreHorizontal,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { useRepoHeader } from "@/components/repo/repo-header-context";
import { RepoPageHeader } from "@/components/repo/repo-page-header";
import { useSessionSWR } from "@/lib/use-session-swr";
import { invalidateSessionCache } from "@/lib/session-memory-cache";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { requireApiSuccess } from "@/lib/api-client";
import type {
  CommentListPayload,
  DashboardRecentComment,
} from "@/lib/comment-settings/types";
import { cn } from "@/lib/utils";

type ManageAction = "hide" | "show" | "delete";

async function fetchCommentList(url: string): Promise<CommentListPayload> {
  const response = await fetch(url);
  const payload = await requireApiSuccess<{ data: CommentListPayload }>(
    response,
    "加载评论失败",
  );
  return payload.data;
}

async function manageComment(action: ManageAction, id: string) {
  const response = await fetch("/api/comment/manage", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ action, id }),
  });
  await requireApiSuccess(response, "操作失败");
}

export function CommentsPanel() {
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState("");
  const [keywordInput, setKeywordInput] = useState("");
  const [type, setType] = useState<"all" | "VISIBLE" | "HIDDEN">("all");
  const [deleteTarget, setDeleteTarget] = useState<DashboardRecentComment | null>(
    null,
  );
  const [detailTarget, setDetailTarget] =
    useState<DashboardRecentComment | null>(null);
  const [isPending, startTransition] = useTransition();

  const query = useMemo(() => {
    const params = new URLSearchParams({
      page: String(page),
      per: "20",
    });
    if (keyword) params.set("keyword", keyword);
    if (type !== "all") params.set("type", type);
    return `/api/comment/list?${params.toString()}`;
  }, [keyword, page, type]);

  const { data, error, isLoading, isValidating, mutate } = useSessionSWR(
    query,
    () => fetchCommentList(query),
    { shouldRetryOnError: false },
  );

  const refreshList = useCallback(async () => {
    invalidateSessionCache(query);
    await mutate();
  }, [mutate, query]);

  const total = data?.total ?? 0;
  const per = data?.per ?? 20;
  const totalPages = Math.max(1, Math.ceil(total / per));
  const canManage = data?.source === "admin" && data.provider === "twikoo";

  const runManage = (action: ManageAction, item: DashboardRecentComment) => {
    startTransition(async () => {
      try {
        await manageComment(action, item.id);
        toast.success(
          action === "delete"
            ? "评论已删除。"
            : action === "hide"
              ? "评论已隐藏。"
              : "评论已恢复显示。",
        );
        if (action === "delete") setDeleteTarget(null);
        await refreshList();
      } catch (manageError) {
        toast.error(
          manageError instanceof Error ? manageError.message : "操作失败",
        );
      }
    });
  };

  const headerNode = useMemo(
    () => (
      <RepoPageHeader title="评论">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isValidating}
          onClick={() => void refreshList()}
        >
          {isValidating ? (
            <Loader className="size-4 animate-spin" />
          ) : (
            <RefreshCw className="size-4" />
          )}
          刷新
        </Button>
      </RepoPageHeader>
    ),
    [isValidating, refreshList],
  );
  useRepoHeader({ header: headerNode });

  // Defer auto-backup off the critical path (idle + delay after list settles).
  useEffect(() => {
    if (data?.source !== "admin" || data.provider !== "twikoo") return;
    if (typeof document !== "undefined" && document.visibilityState !== "visible") {
      return;
    }
    let cancelled = false;
    let idleId: number | undefined;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const runBackup = () => {
      if (cancelled) return;
      void (async () => {
        try {
          const response = await fetch("/api/comment/backup", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ mode: "auto" }),
          });
          if (!response.ok || cancelled) return;
        } catch {
          // Silent — manual backup lives in settings
        }
      })();
    };

    timeoutId = setTimeout(() => {
      if (cancelled) return;
      const ric = (
        window as Window & {
          requestIdleCallback?: (
            cb: () => void,
            opts?: { timeout: number },
          ) => number;
        }
      ).requestIdleCallback;
      if (typeof ric === "function") {
        idleId = ric(runBackup, { timeout: 5000 });
      } else {
        runBackup();
      }
    }, 2500);

    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
      if (idleId != null) {
        const cic = (
          window as Window & { cancelIdleCallback?: (id: number) => void }
        ).cancelIdleCallback;
        cic?.(idleId);
      }
    };
  }, [data?.source, data?.provider]);

  return (
    <div className="w-full space-y-4 px-0 py-1 md:py-2">
      {!isLoading && data && !data.configured ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">尚未配置评论系统</CardTitle>
            <CardDescription>
              请先填写 Twikoo 地址与管理密码，即可在此查看并管理评论。
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link
              href="/settings"
              className={cn(buttonVariants({ variant: "default", size: "sm" }))}
            >
              前往设置
            </Link>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <form
              className="flex min-w-0 flex-1 gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                setPage(1);
                setKeyword(keywordInput.trim());
              }}
            >
              <Input
                value={keywordInput}
                onChange={(event) => setKeywordInput(event.target.value)}
                placeholder="搜索昵称、邮箱、内容、路径…"
                className="min-w-0 flex-1"
              />
              <Button type="submit" variant="secondary" size="sm">
                搜索
              </Button>
            </form>
            <Select
              value={type}
              onValueChange={(value) => {
                setType(value as typeof type);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-full sm:w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部</SelectItem>
                <SelectItem value="VISIBLE">可见</SelectItem>
                <SelectItem value="HIDDEN">已隐藏</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {data?.source === "recent" ? (
            <p className="text-muted-foreground text-xs">
              当前以公开「最新评论」接口展示，无法隐藏或删除。填写正确的 Twikoo
              管理密码后可完整管理。
            </p>
          ) : null}

          <Card className="border-0 py-0 shadow-none">
            <CardHeader className="px-0 pb-3">
              <CardTitle className="text-base">
                Twikoo 评论
                {typeof total === "number" && data?.configured
                  ? `（${total}）`
                  : ""}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-0">
              {isLoading ? (
                <div className="text-muted-foreground flex h-28 items-center justify-center gap-2 text-sm">
                  <Loader className="size-4 animate-spin" />
                  加载中…
                </div>
              ) : error ? (
                <p className="text-destructive text-sm">
                  {error instanceof Error ? error.message : "加载评论失败"}
                </p>
              ) : !data?.comments.length ? (
                <p className="text-muted-foreground text-sm">暂无评论。</p>
              ) : (
                <ul className="divide-y">
                  {data.comments.map((item) => (
                    <li key={item.id} className="space-y-1 py-3 first:pt-0">
                      <div className="flex items-baseline gap-2">
                        <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 gap-y-0.5">
                          <span className="font-medium">{item.nick}</span>
                          {item.isSpam ? (
                            <span className="text-destructive text-xs">
                              已隐藏
                            </span>
                          ) : null}
                        </div>
                        {item.createdAt ? (
                          <span className="text-muted-foreground shrink-0 text-[10px] leading-4 whitespace-nowrap">
                            {formatDistanceToNow(new Date(item.createdAt), {
                              addSuffix: true,
                              locale: zhCN,
                            })}
                          </span>
                        ) : null}
                      </div>
                      <div className="flex items-start gap-1">
                        <button
                          type="button"
                          className="hover:bg-muted/40 min-w-0 flex-1 rounded-md py-0.5 text-left transition-colors"
                          onClick={() => setDetailTarget(item)}
                        >
                          <p className="text-sm leading-relaxed whitespace-pre-wrap">
                            {item.comment || "（无内容）"}
                          </p>
                        </button>
                        {canManage ? (
                          <DropdownMenu modal={false}>
                            <DropdownMenuTrigger asChild>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                className="-mt-0.5 shrink-0"
                                aria-label="更多操作"
                                disabled={isPending}
                              >
                                <MoreHorizontal className="size-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                disabled={isPending}
                                onSelect={() =>
                                  runManage(
                                    item.isSpam ? "show" : "hide",
                                    item,
                                  )
                                }
                              >
                                {item.isSpam ? (
                                  <Eye className="size-4" />
                                ) : (
                                  <EyeOff className="size-4" />
                                )}
                                {item.isSpam ? "显示" : "隐藏"}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                variant="destructive"
                                disabled={isPending}
                                onSelect={() => setDeleteTarget(item)}
                              >
                                <Trash2 className="size-4" />
                                删除
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {data?.source === "admin" && totalPages > 1 ? (
            <div className="flex items-center justify-center gap-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page <= 1 || isValidating}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                上一页
              </Button>
              <span className="text-muted-foreground text-sm tabular-nums">
                {page} / {totalPages}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page >= totalPages || isValidating}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                下一页
              </Button>
            </div>
          ) : null}
        </>
      )}

      <Dialog
        open={Boolean(detailTarget)}
        onOpenChange={(open) => {
          if (!open) setDetailTarget(null);
        }}
      >
        <DialogContent className="w-[calc(100%-2rem)] max-w-lg sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>评论详情</DialogTitle>
            <DialogDescription>
              {detailTarget?.nick || "匿名"}
              {detailTarget?.createdAt
                ? ` · ${formatDistanceToNow(new Date(detailTarget.createdAt), {
                    addSuffix: true,
                    locale: zhCN,
                  })}`
                : ""}
            </DialogDescription>
          </DialogHeader>
          {detailTarget ? (
            <div className="min-w-0 space-y-4">
              <p className="text-sm leading-relaxed whitespace-pre-wrap">
                {detailTarget.comment || "（无内容）"}
              </p>
              <dl className="text-muted-foreground grid gap-2 text-sm">
                <div className="grid gap-0.5 sm:grid-cols-[4.5rem_1fr] sm:gap-3">
                  <dt className="text-foreground/80 shrink-0">页面</dt>
                  <dd className="min-w-0 break-all">
                    {detailTarget.url || "—"}
                  </dd>
                </div>
                <div className="grid gap-0.5 sm:grid-cols-[4.5rem_1fr] sm:gap-3">
                  <dt className="text-foreground/80 shrink-0">邮箱</dt>
                  <dd className="min-w-0 break-all">
                    {detailTarget.mail || "—"}
                  </dd>
                </div>
                <div className="grid gap-0.5 sm:grid-cols-[4.5rem_1fr] sm:gap-3">
                  <dt className="text-foreground/80 shrink-0">IP</dt>
                  <dd className="min-w-0 break-all">
                    {detailTarget.ip || "—"}
                  </dd>
                </div>
                {detailTarget.isSpam ? (
                  <div className="grid gap-0.5 sm:grid-cols-[4.5rem_1fr] sm:gap-3">
                    <dt className="text-foreground/80 shrink-0">状态</dt>
                    <dd className="text-destructive">已隐藏</dd>
                  </div>
                ) : null}
              </dl>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open && !isPending) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除这条评论？</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>删除后无法恢复，请再次确认。</p>
                {deleteTarget ? (
                  <div className="bg-muted/60 rounded-md px-3 py-2 text-foreground">
                    <p className="font-medium">{deleteTarget.nick}</p>
                    <p className="mt-1 line-clamp-3 whitespace-pre-wrap">
                      {deleteTarget.comment || "（无内容）"}
                    </p>
                  </div>
                ) : null}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>取消</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={isPending || !deleteTarget}
              onClick={() => {
                if (deleteTarget) runManage("delete", deleteTarget);
              }}
            >
              {isPending ? "删除中…" : "确认删除"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
