"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { format } from "date-fns";
import { ArrowLeft, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  deleteMemosCommentAction,
  deleteMemosLikeAction,
  listMemosAdminCommentsAction,
  listMemosAdminLikesAction,
  listMemosCommentPostsAction,
  listMemosLikePostsAction,
} from "@/lib/memos-settings/actions";
import {
  invalidateMemosEngageDetailCache,
  invalidateMemosEngageSummaryCache,
  memosCommentPostsCacheKey,
  memosCommentsDetailCacheKey,
  memosLikePostsCacheKey,
  memosLikesDetailCacheKey,
  type MemosCommentsDetailCache,
  type MemosEngagePostsCache,
  type MemosLikesDetailCache,
} from "@/lib/memos-settings/cache-keys";
import type {
  MemosAdminComment,
  MemosAdminLike,
  MemosEngagePost,
} from "@/lib/memos-settings/types";
import {
  getSessionCached,
  peekSessionCache,
  setSessionCache,
} from "@/lib/session-memory-cache";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 10;

type EngageKind = "comments" | "likes";

type MomentsEngageManagerProps = {
  kind: EngageKind;
  hasAdminCredentials: boolean;
  canDelete: boolean;
  /** Bump to force-refetch the current list (and open detail, if any). */
  refreshToken?: number;
  /** Called when a refreshToken-driven reload finishes (success or error). */
  onRefreshSettled?: () => void;
};

const formatDisplayDate = (ms: number) => {
  if (!ms) return "—";
  try {
    const date = new Date(ms);
    const pattern =
      date.getFullYear() === new Date().getFullYear()
        ? "MM.dd HH:mm"
        : "yyyy.MM.dd HH:mm";
    return format(date, pattern);
  } catch {
    return "—";
  }
};

const previewContent = (content: string) => {
  const text = content.replace(/\s+/g, " ").trim();
  if (!text) return "（无正文）";
  return text.length > 64 ? `${text.slice(0, 64)}…` : text;
};

export function MomentsEngageManager({
  kind,
  hasAdminCredentials,
  canDelete,
  refreshToken = 0,
  onRefreshSettled,
}: MomentsEngageManagerProps) {
  const isComments = kind === "comments";
  const label = isComments ? "评论" : "点赞";
  const countLabel = isComments ? "条评论" : "个赞";

  const initialCache = peekSessionCache<MemosEngagePostsCache>(
    isComments
      ? memosCommentPostsCacheKey(0, PAGE_SIZE)
      : memosLikePostsCacheKey(0, PAGE_SIZE),
  );

  const [posts, setPosts] = useState<MemosEngagePost[]>(
    () => initialCache?.posts ?? [],
  );
  const [total, setTotal] = useState(() => initialCache?.total ?? 0);
  const [pageIndex, setPageIndex] = useState(
    () => initialCache?.pageIndex ?? 0,
  );
  const [loading, setLoading] = useState(() => !initialCache);
  const [error, setError] = useState<string | null>(null);

  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [selectedExcerpt, setSelectedExcerpt] = useState("");
  const [details, setDetails] = useState<
    Array<MemosAdminComment | MemosAdminLike>
  >([]);
  const [detailsTotal, setDetailsTotal] = useState(0);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    label: string;
  } | null>(null);
  const [isPending, startTransition] = useTransition();

  const listRequestIdRef = useRef(0);
  const detailsRequestIdRef = useRef(0);
  const pageIndexRef = useRef(pageIndex);
  const selectedPostIdRef = useRef(selectedPostId);
  pageIndexRef.current = pageIndex;
  selectedPostIdRef.current = selectedPostId;

  const applyPostsCache = useCallback((data: MemosEngagePostsCache) => {
    setTotal(data.total);
    setPageIndex(data.pageIndex);
    setPosts(data.posts);
    setError(null);
  }, []);

  const loadPosts = useCallback(
    async (nextPage = 0, options?: { force?: boolean }) => {
      const requestId = ++listRequestIdRef.current;
      let page = Math.max(0, Math.floor(nextPage));
      const cacheKey = isComments
        ? memosCommentPostsCacheKey(page, PAGE_SIZE)
        : memosLikePostsCacheKey(page, PAGE_SIZE);

      if (options?.force) {
        invalidateMemosEngageSummaryCache(kind);
      } else {
        const cached = peekSessionCache<MemosEngagePostsCache>(cacheKey);
        if (cached) {
          if (requestId !== listRequestIdRef.current) return;
          applyPostsCache(cached);
          setLoading(false);
          return;
        }
      }

      setLoading(true);
      setError(null);
      try {
        const action = isComments
          ? listMemosCommentPostsAction
          : listMemosLikePostsAction;

        const fetchPage = async (
          targetPage: number,
        ): Promise<MemosEngagePostsCache> => {
          const key = isComments
            ? memosCommentPostsCacheKey(targetPage)
            : memosLikePostsCacheKey(targetPage);
          return getSessionCached(key, async () => {
            const result = await action({
              limit: PAGE_SIZE,
              offset: targetPage * PAGE_SIZE,
            });
            if (!result.ok) throw new Error(result.message);
            return {
              posts: result.data.posts,
              total: result.data.total,
              pageIndex: targetPage,
            };
          });
        };

        let data = await fetchPage(page);
        if (requestId !== listRequestIdRef.current) return;

        const maxPage = Math.max(0, Math.ceil(data.total / PAGE_SIZE) - 1);
        if (data.total > 0 && page > maxPage) {
          page = maxPage;
          data = await fetchPage(page);
          if (requestId !== listRequestIdRef.current) return;
        }

        applyPostsCache(data);
      } catch (loadError) {
        if (requestId !== listRequestIdRef.current) return;
        setError(
          loadError instanceof Error ? loadError.message : `加载${label}汇总失败`,
        );
        setPosts([]);
      } finally {
        if (requestId === listRequestIdRef.current) {
          setLoading(false);
        }
      }
    },
    [applyPostsCache, isComments, kind, label],
  );

  const loadDetails = useCallback(
    async (postId: string, options?: { force?: boolean }) => {
      const requestId = ++detailsRequestIdRef.current;
      const cacheKey = isComments
        ? memosCommentsDetailCacheKey(postId)
        : memosLikesDetailCacheKey(postId);

      if (options?.force) {
        invalidateMemosEngageDetailCache(kind, postId);
      } else {
        if (isComments) {
          const cached = peekSessionCache<MemosCommentsDetailCache>(cacheKey);
          if (cached) {
            if (requestId !== detailsRequestIdRef.current) return;
            setDetails(cached.comments);
            setDetailsTotal(cached.total);
            setDetailsError(null);
            setDetailsLoading(false);
            const excerpt = String(cached.comments[0]?.post_excerpt || "").trim();
            if (excerpt) setSelectedExcerpt(previewContent(excerpt));
            return;
          }
        } else {
          const cached = peekSessionCache<MemosLikesDetailCache>(cacheKey);
          if (cached) {
            if (requestId !== detailsRequestIdRef.current) return;
            setDetails(cached.likes);
            setDetailsTotal(cached.total);
            setDetailsError(null);
            setDetailsLoading(false);
            const excerpt = String(cached.likes[0]?.post_excerpt || "").trim();
            if (excerpt) setSelectedExcerpt(previewContent(excerpt));
            return;
          }
        }
      }

      setDetailsLoading(true);
      setDetailsError(null);
      try {
        if (isComments) {
          const page = await getSessionCached(
            cacheKey,
            async (): Promise<MemosCommentsDetailCache> => {
              const result = await listMemosAdminCommentsAction({
                postId,
                limit: 200,
                offset: 0,
              });
              if (!result.ok) throw new Error(result.message);
              return {
                comments: result.data.comments,
                total: result.data.total,
              };
            },
          );
          if (requestId !== detailsRequestIdRef.current) return;
          setDetails(page.comments);
          setDetailsTotal(page.total);
          const excerpt = String(page.comments[0]?.post_excerpt || "").trim();
          if (excerpt) setSelectedExcerpt(previewContent(excerpt));
        } else {
          const page = await getSessionCached(
            cacheKey,
            async (): Promise<MemosLikesDetailCache> => {
              const result = await listMemosAdminLikesAction({
                postId,
                limit: 200,
                offset: 0,
              });
              if (!result.ok) throw new Error(result.message);
              return {
                likes: result.data.likes,
                total: result.data.total,
              };
            },
          );
          if (requestId !== detailsRequestIdRef.current) return;
          setDetails(page.likes);
          setDetailsTotal(page.total);
          const excerpt = String(page.likes[0]?.post_excerpt || "").trim();
          if (excerpt) setSelectedExcerpt(previewContent(excerpt));
        }
      } catch (loadError) {
        if (requestId !== detailsRequestIdRef.current) return;
        setDetailsError(
          loadError instanceof Error ? loadError.message : `加载${label}明细失败`,
        );
        setDetails([]);
        setDetailsTotal(0);
      } finally {
        if (requestId === detailsRequestIdRef.current) {
          setDetailsLoading(false);
        }
      }
    },
    [isComments, kind, label],
  );

  useEffect(() => {
    let cancelled = false;
    setSelectedPostId(null);
    setDetails([]);
    (async () => {
      if (cancelled) return;
      await loadPosts(0);
    })().catch(() => {
      /* handled in loadPosts */
    });
    return () => {
      cancelled = true;
      listRequestIdRef.current += 1;
      detailsRequestIdRef.current += 1;
    };
  }, [loadPosts]);

  useEffect(() => {
    if (!refreshToken) return;
    let cancelled = false;
    (async () => {
      try {
        const page = pageIndexRef.current;
        const selectedId = selectedPostIdRef.current;
        await loadPosts(page, { force: true });
        if (cancelled) return;
        if (selectedId) {
          await loadDetails(selectedId, { force: true });
        }
      } finally {
        if (!cancelled) onRefreshSettled?.();
      }
    })().catch(() => {
      /* handled in loaders */
    });
    return () => {
      cancelled = true;
    };
  }, [loadDetails, loadPosts, onRefreshSettled, refreshToken]);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE) || 1);
  const paginationItems = useMemo(() => {
    if (pageCount <= 7) {
      return Array.from({ length: pageCount }, (_, i) => i);
    }
    const pages = new Set<number>([0, pageCount - 1, pageIndex]);
    if (pageIndex - 1 >= 0) pages.add(pageIndex - 1);
    if (pageIndex + 1 < pageCount) pages.add(pageIndex + 1);
    const ordered = Array.from(pages).sort((a, b) => a - b);
    const items: Array<number | "ellipsis"> = [];
    for (let i = 0; i < ordered.length; i += 1) {
      if (i > 0 && ordered[i]! - ordered[i - 1]! > 1) {
        items.push("ellipsis");
      }
      items.push(ordered[i]!);
    }
    return items;
  }, [pageCount, pageIndex]);

  const goToPage = (nextPage: number) => {
    if (loading || isPending) return;
    if (nextPage < 0 || nextPage >= pageCount) return;
    if (nextPage === pageIndex) return;
    void loadPosts(nextPage);
  };

  const openDetails = (post: MemosEngagePost) => {
    setSelectedPostId(post.id);
    setSelectedExcerpt(previewContent(post.content));
    void loadDetails(post.id);
  };

  const backToList = () => {
    detailsRequestIdRef.current += 1;
    setSelectedPostId(null);
    setDetails([]);
    setDetailsError(null);
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    const removingId = deleteTarget.id;
    const postId = selectedPostId;
    startTransition(async () => {
      try {
        if (!hasAdminCredentials) {
          toast.error("请先在设置中填写动态 API 管理账号与密码。");
          return;
        }
        const result = isComments
          ? await deleteMemosCommentAction({ id: removingId })
          : await deleteMemosLikeAction({ id: removingId });
        if (!result.ok) {
          toast.error(result.message);
          return;
        }
        toast.success(`${label}已删除。`);
        setDeleteTarget(null);

        if (postId) {
          const nextDetails = details.filter((item) => item.id !== removingId);
          const nextTotal = Math.max(0, detailsTotal - 1);
          setDetails(nextDetails);
          setDetailsTotal(nextTotal);

          if (isComments) {
            setSessionCache<MemosCommentsDetailCache>(
              memosCommentsDetailCacheKey(postId),
              { comments: nextDetails as MemosAdminComment[], total: nextTotal },
            );
          } else {
            setSessionCache<MemosLikesDetailCache>(
              memosLikesDetailCacheKey(postId),
              { likes: nextDetails as MemosAdminLike[], total: nextTotal },
            );
          }

          const nextPosts = posts.map((post) => {
            if (post.id !== postId) return post;
            return isComments
              ? { ...post, comment_count: nextTotal }
              : { ...post, like_count: nextTotal };
          });
          setPosts(nextPosts);
          setSessionCache<MemosEngagePostsCache>(
            isComments
              ? memosCommentPostsCacheKey(pageIndex)
              : memosLikePostsCacheKey(pageIndex),
            { posts: nextPosts, total, pageIndex },
          );

          // Drop other summary pages so counts stay consistent.
          invalidateMemosEngageSummaryCache(kind);
          setSessionCache<MemosEngagePostsCache>(
            isComments
              ? memosCommentPostsCacheKey(pageIndex)
              : memosLikePostsCacheKey(pageIndex),
            { posts: nextPosts, total, pageIndex },
          );
          return;
        }

        invalidateMemosEngageDetailCache(kind);
        await loadPosts(pageIndex, { force: true });
      } catch (deleteError) {
        toast.error(
          deleteError instanceof Error ? deleteError.message : "删除失败",
        );
      }
    });
  };

  if (!hasAdminCredentials) {
    return (
      <Empty className="max-w-[420px]">
        <EmptyHeader>
          <EmptyTitle>需要管理账号与密码</EmptyTitle>
          <EmptyDescription>
            评论与点赞管理需要动态 API 管理账号与密码，请先在设置中填写。
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  if (loading && posts.length === 0 && !selectedPostId) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-9 w-full max-w-sm" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }

  if (selectedPostId) {
    return (
      <div className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={backToList}
            disabled={isPending}
          >
            <ArrowLeft className="size-4" />
            返回列表
          </Button>
          <div className="text-muted-foreground min-w-0 flex-1 text-xs sm:text-sm">
            <span className="line-clamp-2">
              动态：{selectedExcerpt || "（无正文）"}
              {detailsTotal
                ? ` · ${detailsTotal} ${countLabel}`
                : ""}
            </span>
          </div>
        </div>

        {detailsError ? (
          <p className="text-destructive text-sm">{detailsError}</p>
        ) : null}

        {detailsLoading && details.length === 0 ? (
          <div className="space-y-3">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : details.length === 0 ? (
          <Empty className="max-w-[420px]">
            <EmptyHeader>
              <EmptyTitle>暂无{label}</EmptyTitle>
              <EmptyDescription>该动态下没有{label}记录。</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div
            className={cn(
              "relative overflow-x-auto rounded-md border",
              detailsLoading && "pointer-events-none opacity-60",
            )}
          >
            {detailsLoading ? (
              <div
                className="bg-background/40 absolute inset-0 z-10 flex items-center justify-center"
                aria-hidden
              >
                <RefreshCw className="text-muted-foreground size-6 animate-spin" />
              </div>
            ) : null}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-full min-w-0">
                    {isComments ? "内容" : "昵称"}
                  </TableHead>
                  <TableHead className="w-[7.5rem] shrink-0 text-left">时间</TableHead>
                  {canDelete ? (
                    <TableHead className="w-[72px] text-right">操作</TableHead>
                  ) : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {details.map((row) => {
                  const isComment = "content" in row;
                  const nick = row.author_name || "访客";
                  const body = isComment
                    ? `${nick}${row.parent_id ? " 回复" : ""}：${previewContent(row.content)}`
                    : nick;
                  return (
                    <TableRow key={row.id}>
                      <TableCell className="w-full max-w-0 min-w-0 whitespace-normal align-middle text-sm">
                        <div className="line-clamp-3 break-words leading-5">
                          {body}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground w-[7.5rem] shrink-0 align-middle text-left text-[10px] leading-4 whitespace-nowrap tabular-nums">
                        {formatDisplayDate(row.created_at)}
                      </TableCell>
                      {canDelete ? (
                        <TableCell className="align-middle text-right">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`删除${label}`}
                            disabled={isPending}
                            onClick={() =>
                              setDeleteTarget({
                                id: row.id,
                                label: isComment
                                  ? previewContent(row.content)
                                  : nick,
                              })
                            }
                          >
                            <Trash2 className="text-destructive size-4" />
                          </Button>
                        </TableCell>
                      ) : null}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        <AlertDialog
          open={Boolean(deleteTarget)}
          onOpenChange={(open) => {
            if (!open) setDeleteTarget(null);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>删除这条{label}？</AlertDialogTitle>
              <AlertDialogDescription>
                {deleteTarget?.label
                  ? `将删除「${deleteTarget.label}」，此操作不可撤销。`
                  : "此操作不可撤销。"}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isPending}>取消</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-white hover:bg-destructive/90"
                disabled={isPending}
                onClick={handleDelete}
              >
                {isPending ? "删除中…" : "删除"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-4">
      <div className="text-muted-foreground text-xs sm:text-sm">
        共 {total} 条有{label}的动态
        {pageCount > 0 ? ` · 第 ${pageIndex + 1}/${pageCount} 页` : ""}
      </div>

      {error ? <p className="text-destructive text-sm">{error}</p> : null}

      {posts.length === 0 ? (
        <Empty className="max-w-[420px]">
          <EmptyHeader>
            <EmptyTitle>暂无{label}</EmptyTitle>
            <EmptyDescription>还没有带{label}的动态。</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div
          className={cn(
            "relative space-y-4",
            loading && "pointer-events-none opacity-60",
          )}
        >
          {loading ? (
            <div
              className="bg-background/40 absolute inset-0 z-10 flex items-center justify-center rounded-md"
              aria-hidden
            >
              <RefreshCw className="text-muted-foreground size-6 animate-spin" />
            </div>
          ) : null}
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-full min-w-0">动态</TableHead>
                  <TableHead className="w-[100px] text-center">{label}</TableHead>
                  <TableHead className="w-[7.5rem] shrink-0 text-left">最近互动</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {posts.map((post) => {
                  const count = isComments
                    ? post.comment_count ?? 0
                    : post.like_count ?? 0;
                  return (
                    <TableRow key={post.id}>
                      <TableCell className="max-w-0 whitespace-normal align-middle">
                        <button
                          type="button"
                          className="hover:text-primary w-full min-w-0 text-left"
                          onClick={() => openDetails(post)}
                        >
                          <div className="truncate text-sm leading-5">
                            {previewContent(post.content)}
                          </div>
                        </button>
                      </TableCell>
                      <TableCell className="text-muted-foreground align-middle text-center text-sm leading-5 whitespace-nowrap">
                        {count} {countLabel}
                      </TableCell>
                      <TableCell className="text-muted-foreground w-[7.5rem] shrink-0 align-middle text-left text-[10px] leading-4 whitespace-nowrap tabular-nums">
                        {formatDisplayDate(post.last_at || post.created_at)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <footer className="flex items-center justify-center pt-1">
            <Pagination className="mx-0 w-auto justify-center">
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    href="#"
                    iconOnly
                    onClick={(event) => {
                      event.preventDefault();
                      goToPage(pageIndex - 1);
                    }}
                    className={
                      pageIndex <= 0 || loading
                        ? "pointer-events-none opacity-50"
                        : undefined
                    }
                  />
                </PaginationItem>
                {paginationItems.map((item, index) => (
                  <PaginationItem key={`${item}-${index}`}>
                    {item === "ellipsis" ? (
                      <PaginationEllipsis />
                    ) : (
                      <PaginationLink
                        href="#"
                        isActive={item === pageIndex}
                        onClick={(event) => {
                          event.preventDefault();
                          goToPage(item);
                        }}
                        className={
                          loading
                            ? "pointer-events-none opacity-50"
                            : undefined
                        }
                      >
                        {item + 1}
                      </PaginationLink>
                    )}
                  </PaginationItem>
                ))}
                <PaginationItem>
                  <PaginationNext
                    href="#"
                    iconOnly
                    onClick={(event) => {
                      event.preventDefault();
                      goToPage(pageIndex + 1);
                    }}
                    className={
                      pageIndex >= pageCount - 1 || loading
                        ? "pointer-events-none opacity-50"
                        : undefined
                    }
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          </footer>
        </div>
      )}
    </div>
  );
}
