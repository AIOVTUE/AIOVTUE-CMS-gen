"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { format } from "date-fns";
import {
  EllipsisVertical,
  Eye,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import dynamic from "next/dynamic";
import { toast } from "sonner";
import {
  createMemosPostAction,
  deleteMemosPostAction,
  listMemosPostsAction,
  loadMemosSettingsAction,
  updateMemosPostAction,
} from "@/lib/memos-settings/actions";
import {
  invalidateMemosEngageDetailCache,
  invalidateMemosEngageSummaryCache,
  invalidateMemosPostsCache,
  memosPostsCacheKey,
  memosSettingsCacheKey,
  peekMemosSettingsCache,
  type MemosPostsCache,
} from "@/lib/memos-settings/cache-keys";
import type { MemosPost } from "@/lib/memos-settings/types";
import {
  getSessionCached,
  peekSessionCache,
  setSessionCache,
} from "@/lib/session-memory-cache";
import { EditComponent as DateEditComponent } from "@/fields/core/date/edit-component";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Empty,
  EmptyContent,
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
import { MomentsEngageManager } from "@/components/moments/moments-engage-manager";
import {
  MomentsTabList,
  type MomentsTab,
} from "@/components/moments/moments-tabs";
import { useRepoHeader } from "@/components/repo/repo-header-context";
import { RepoPageHeader } from "@/components/repo/repo-page-header";
import { cn } from "@/lib/utils";

const MarkdownPreview = dynamic(
  () =>
    import("@/components/entry/markdown-preview").then((m) => m.MarkdownPreview),
  { ssr: false },
);

const DEFAULT_PAGE_SIZE = 10;
const DATE_FIELD = { options: { time: true } };

const toDatetimeLocal = (ms: number | null | undefined) => {
  if (!ms || !Number.isFinite(ms)) return "";
  try {
    return format(new Date(ms), "yyyy-MM-dd'T'HH:mm");
  } catch {
    return "";
  }
};

const fromDatetimeLocal = (value: string): number | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return null;
  return date.getTime();
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
  return text.length > 80 ? `${text.slice(0, 80)}…` : text;
};

/** Match Hugo Memos compose: extract `![](url)` from body into images[]. */
const WORD_JOINER = "\u2060";
/** Allow optional Word Joiners inside `![](` (editor anti-wrap). */
const IMAGE_MD_RE = /!\u2060?\[[^\]]*\]\u2060?\(([^)]+)\)/g;

const unwrapEditorContent = (raw: string) =>
  String(raw || "").replaceAll(WORD_JOINER, "");

/**
 * Keep `![](url)` from soft-wrapping as `!` / `[]` / `(url)`.
 * Inserts Word Joiners after `!` and after `]`.
 */
const protectImageMarkdown = (raw: string) =>
  unwrapEditorContent(raw).replace(
    /!\[([^\]]*)\]\(/g,
    `!${WORD_JOINER}[$1]${WORD_JOINER}(`,
  );

const mapCaretThroughProtect = (raw: string, caret: number) => {
  const plain = unwrapEditorContent(raw);
  let plainIndex = 0;
  const limit = Math.max(0, Math.min(caret, raw.length));
  for (let i = 0; i < limit; i += 1) {
    if (raw[i] !== WORD_JOINER) plainIndex += 1;
  }

  const protectedText = protectImageMarkdown(plain);
  let seen = 0;
  for (let j = 0; j < protectedText.length; j += 1) {
    if (protectedText[j] === WORD_JOINER) continue;
    if (seen === plainIndex) return j;
    seen += 1;
  }
  return protectedText.length;
};

const splitContentAndImages = (raw: string) => {
  const images: string[] = [];
  const content = unwrapEditorContent(raw)
    .replace(IMAGE_MD_RE, (_full, url) => {
      const u = String(url || "").trim();
      if (u) images.push(u);
      return "";
    })
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { content, images: images.slice(0, 9) };
};

/** Rebuild editor body so existing API images appear as markdown. */
const mergeContentWithImages = (content: string, images: string[]) => {
  const body = unwrapEditorContent(content).trim();
  const list = (images ?? []).map((url) => String(url || "").trim()).filter(Boolean);
  if (list.length === 0) return protectImageMarkdown(body);
  const existing = new Set(
    Array.from(body.matchAll(IMAGE_MD_RE), (match) => String(match[1] || "").trim()).filter(
      Boolean,
    ),
  );
  const extras = list.filter((url) => !existing.has(url));
  if (extras.length === 0) return protectImageMarkdown(body);
  const md = extras.map((url) => `![](${url})`).join("\n");
  return protectImageMarkdown(body ? `${body}\n${md}` : md);
};

type EditorState = {
  id?: string;
  content: string;
  createdAt: string;
};

const emptyEditor = (): EditorState => ({
  content: "",
  createdAt: toDatetimeLocal(Date.now()),
});

type MomentsApiManagerProps = {
  canCreate: boolean;
  canDelete: boolean;
  activeTab: MomentsTab;
  onTabChange: (tab: MomentsTab) => void;
};

export function MomentsApiManager({
  canCreate,
  canDelete,
  activeTab,
  onTabChange,
}: MomentsApiManagerProps) {
  const pageSize = DEFAULT_PAGE_SIZE;

  const [configured, setConfigured] = useState<boolean | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [hasAdminCredentials, setHasAdminCredentials] = useState(false);
  const [posts, setPosts] = useState<MemosPost[]>([]);
  const [total, setTotal] = useState(0);
  const [pageIndex, setPageIndex] = useState(0);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [settingsReady, setSettingsReady] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [contentPreview, setContentPreview] = useState(false);
  const [editor, setEditor] = useState<EditorState>(emptyEditor);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [refreshing, setRefreshing] = useState(false);
  const [commentsRefreshToken, setCommentsRefreshToken] = useState(0);
  const [likesRefreshToken, setLikesRefreshToken] = useState(0);
  const engageRefreshResolveRef = useRef<(() => void) | null>(null);
  const postsRequestIdRef = useRef(0);
  const contentPendingSelRef = useRef<{ start: number; end: number } | null>(
    null,
  );
  const contentTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  useLayoutEffect(() => {
    const pending = contentPendingSelRef.current;
    const el = contentTextareaRef.current;
    if (!pending || !el) return;
    el.setSelectionRange(pending.start, pending.end);
    contentPendingSelRef.current = null;
  }, [editor.content]);

  const applyPostsCache = useCallback((data: MemosPostsCache) => {
    setTotal(data.total);
    setPageIndex(data.pageIndex);
    setPosts(data.posts);
    setError(null);
  }, []);

  const loadSettings = useCallback(async () => {
    const cached = peekMemosSettingsCache();
    if (cached) {
      setSettingsError(null);
      setConfigured(cached.configured);
      setHasAdminCredentials(
        Boolean(cached.username?.trim()) && cached.hasPassword,
      );
      return cached;
    }

    try {
      const data = await getSessionCached(memosSettingsCacheKey(), async () => {
        const result = await loadMemosSettingsAction();
        if (!result.ok) throw new Error(result.message);
        return result.data;
      });
      setSettingsError(null);
      setConfigured(data.configured);
      setHasAdminCredentials(
        Boolean(data.username?.trim()) && data.hasPassword,
      );
      return data;
    } catch (loadError) {
      setSettingsError(
        loadError instanceof Error ? loadError.message : "加载设置失败",
      );
      setConfigured(null);
      return null;
    }
  }, []);

  const loadPosts = useCallback(
    async (nextPage = 0, options?: { force?: boolean }) => {
      const requestId = ++postsRequestIdRef.current;
      let page = Math.max(0, Math.floor(nextPage));
      const cacheKey = memosPostsCacheKey(pageSize, page);

      if (options?.force) {
        invalidateMemosPostsCache();
      } else {
        const cached = peekSessionCache<MemosPostsCache>(cacheKey);
        if (cached) {
          if (requestId !== postsRequestIdRef.current) return;
          applyPostsCache(cached);
          setLoading(false);
          return;
        }
      }

      setLoading(true);
      setError(null);
      try {
        const fetchPage = async (targetPage: number): Promise<MemosPostsCache> => {
          const key = memosPostsCacheKey(pageSize, targetPage);
          return getSessionCached(key, async () => {
            const result = await listMemosPostsAction({
              limit: pageSize,
              offset: targetPage * pageSize,
            });
            if (!result.ok) throw new Error(result.message);
            return {
              posts: result.data.posts,
              total: result.data.total,
              pageIndex: targetPage,
              pageSize,
            };
          });
        };

        let data = await fetchPage(page);
        if (requestId !== postsRequestIdRef.current) return;

        const maxPage = Math.max(0, Math.ceil(data.total / pageSize) - 1);
        if (data.total > 0 && page > maxPage) {
          page = maxPage;
          data = await fetchPage(page);
          if (requestId !== postsRequestIdRef.current) return;
        }

        applyPostsCache(data);
      } catch (loadError) {
        if (requestId !== postsRequestIdRef.current) return;
        setError(
          loadError instanceof Error ? loadError.message : "加载动态失败",
        );
        setPosts([]);
      } finally {
        if (requestId === postsRequestIdRef.current) {
          setLoading(false);
        }
      }
    },
    [applyPostsCache, pageSize],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await loadSettings();
      if (cancelled) return;
      setSettingsReady(true);
    })().catch((loadError: unknown) => {
      if (cancelled) return;
      setSettingsReady(true);
      setError(loadError instanceof Error ? loadError.message : "加载失败");
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [loadSettings]);

  useEffect(() => {
    if (!settingsReady || !configured || activeTab !== "posts") {
      if (activeTab !== "posts") setLoading(false);
      return;
    }
    void loadPosts(0);
    return () => {
      postsRequestIdRef.current += 1;
    };
  }, [activeTab, configured, loadPosts, settingsReady]);

  const pageCount = Math.max(1, Math.ceil(total / pageSize) || 1);
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

  const filteredPosts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return posts;
    return posts.filter((post) => post.content.toLowerCase().includes(q));
  }, [posts, search]);

  const goToPage = (nextPage: number) => {
    if (loading || isPending) return;
    if (nextPage < 0 || nextPage >= pageCount) return;
    if (nextPage === pageIndex) return;
    void loadPosts(nextPage);
  };

  const openCreate = useCallback(() => {
    setEditor(emptyEditor());
    setContentPreview(false);
    setEditorOpen(true);
  }, []);

  const openEdit = (post: MemosPost) => {
    setEditor({
      id: post.id,
      content: mergeContentWithImages(post.content, post.images ?? []),
      createdAt: toDatetimeLocal(post.created_at) || toDatetimeLocal(Date.now()),
    });
    setContentPreview(false);
    setEditorOpen(true);
  };

  const handleContentChange = (
    event: React.ChangeEvent<HTMLTextAreaElement>,
  ) => {
    const el = event.currentTarget;
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;
    const raw = el.value;
    const next = protectImageMarkdown(raw);
    if (next !== raw) {
      contentPendingSelRef.current = {
        start: mapCaretThroughProtect(raw, start),
        end: mapCaretThroughProtect(raw, end),
      };
    }
    setEditor((prev) => ({
      ...prev,
      content: next,
    }));
  };

  const handleSave = () => {
    const { content, images } = splitContentAndImages(editor.content);
    const created_at = fromDatetimeLocal(editor.createdAt);

    startTransition(async () => {
      try {
        if (!hasAdminCredentials) {
          toast.error("请先在设置中填写动态 API 管理账号与密码。");
          return;
        }
        if (!content && images.length === 0) {
          toast.error("正文不能为空（可用 Markdown 图片 ![](url)）。");
          return;
        }
        const payload = {
          content,
          images,
          created_at,
        };
        const editingId = editor.id;
        const result = editingId
          ? await updateMemosPostAction({ id: editingId, ...payload })
          : await createMemosPostAction(payload);
        if (!result.ok) {
          toast.error(result.message);
          return;
        }
        toast.success(editingId ? "动态已更新。" : "动态已发布。");
        setEditorOpen(false);

        if (editingId && result.data) {
          const nextPosts = posts.map((post) =>
            post.id === result.data.id ? result.data : post,
          );
          invalidateMemosPostsCache();
          setSessionCache<MemosPostsCache>(
            memosPostsCacheKey(pageSize, pageIndex),
            {
              posts: nextPosts,
              total,
              pageIndex,
              pageSize,
            },
          );
          setPosts(nextPosts);
          invalidateMemosEngageSummaryCache();
          invalidateMemosEngageDetailCache("comments", editingId);
          invalidateMemosEngageDetailCache("likes", editingId);
          return;
        }

        invalidateMemosPostsCache();
        invalidateMemosEngageSummaryCache();
        await loadPosts(0, { force: true });
      } catch (saveError) {
        toast.error(
          saveError instanceof Error ? saveError.message : "保存失败",
        );
      }
    });
  };

  const handleDelete = () => {
    if (!deleteId) return;
    const removingId = deleteId;
    startTransition(async () => {
      try {
        if (!hasAdminCredentials) {
          toast.error("请先在设置中填写动态 API 管理账号与密码。");
          return;
        }
        const result = await deleteMemosPostAction({ id: removingId });
        if (!result.ok) {
          toast.error(result.message);
          return;
        }
        toast.success("动态已删除。");
        setDeleteId(null);

        invalidateMemosEngageSummaryCache();
        invalidateMemosEngageDetailCache("comments", removingId);
        invalidateMemosEngageDetailCache("likes", removingId);
        invalidateMemosPostsCache();

        const nextPosts = posts.filter((post) => post.id !== removingId);
        const nextTotal = Math.max(0, total - 1);
        if (nextPosts.length > 0) {
          const patched: MemosPostsCache = {
            posts: nextPosts,
            total: nextTotal,
            pageIndex,
            pageSize,
          };
          setSessionCache(memosPostsCacheKey(pageSize, pageIndex), patched);
          applyPostsCache(patched);
          return;
        }

        const nextPage = pageIndex > 0 ? pageIndex - 1 : 0;
        await loadPosts(nextPage, { force: true });
      } catch (deleteError) {
        toast.error(
          deleteError instanceof Error ? deleteError.message : "删除失败",
        );
      }
    });
  };

  const settleEngageRefresh = useCallback(() => {
    const resolve = engageRefreshResolveRef.current;
    engageRefreshResolveRef.current = null;
    resolve?.();
  }, []);

  const handleRefresh = useCallback(async () => {
    if (refreshing || isPending || configured !== true) return;
    setRefreshing(true);
    try {
      if (activeTab === "posts") {
        await loadPosts(pageIndex, { force: true });
        return;
      }
      await new Promise<void>((resolve) => {
        engageRefreshResolveRef.current = resolve;
        if (activeTab === "comments") {
          setCommentsRefreshToken((token) => token + 1);
        } else {
          setLikesRefreshToken((token) => token + 1);
        }
      });
    } finally {
      engageRefreshResolveRef.current = null;
      setRefreshing(false);
    }
  }, [activeTab, configured, isPending, loadPosts, pageIndex, refreshing]);

  const headerNode = useMemo(
    () => (
      <RepoPageHeader
        title={
          <div className="flex min-w-0 flex-nowrap items-center gap-2 sm:gap-3">
            <span>动态</span>
            <MomentsTabList value={activeTab} onChange={onTabChange} />
          </div>
        }
      >
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={refreshing || isPending || configured !== true}
          onClick={() => void handleRefresh()}
          aria-busy={refreshing}
        >
          <RefreshCw
            className={cn("size-4", refreshing && "animate-spin")}
          />
          刷新
        </Button>
      </RepoPageHeader>
    ),
    [activeTab, configured, handleRefresh, isPending, onTabChange, refreshing],
  );
  useRepoHeader({ header: headerNode });

  if (settingsError) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Empty className="max-w-[420px] flex-none">
          <EmptyHeader>
            <EmptyTitle>无法加载动态 API 设置</EmptyTitle>
            <EmptyDescription>{settingsError}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Link href="/settings" className={cn(buttonVariants())}>
              前往设置
            </Link>
          </EmptyContent>
        </Empty>
      </div>
    );
  }

  if (configured === false) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Empty className="max-w-[420px] flex-none">
          <EmptyHeader>
            <EmptyTitle>尚未配置动态 API</EmptyTitle>
            <EmptyDescription>
              当前站点使用 API 模式展示动态。请先在设置中填写 AIOVTUE-memos
              服务地址、管理账号与密码。
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Link href="/settings" className={cn(buttonVariants())}>
              前往设置
            </Link>
          </EmptyContent>
        </Empty>
      </div>
    );
  }

  if (configured === null || !settingsReady) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-9 w-full max-w-sm" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="min-w-0 space-y-4">
      {/* Keep engage tabs mounted so lists prefetch while viewing posts. */}
      <div
        className={activeTab === "comments" ? undefined : "hidden"}
        hidden={activeTab !== "comments"}
        aria-hidden={activeTab !== "comments"}
      >
        <MomentsEngageManager
          kind="comments"
          hasAdminCredentials={hasAdminCredentials}
          canDelete={canDelete}
          refreshToken={commentsRefreshToken}
          onRefreshSettled={settleEngageRefresh}
        />
      </div>

      <div
        className={activeTab === "likes" ? undefined : "hidden"}
        hidden={activeTab !== "likes"}
        aria-hidden={activeTab !== "likes"}
      >
        <MomentsEngageManager
          kind="likes"
          hasAdminCredentials={hasAdminCredentials}
          canDelete={canDelete}
          refreshToken={likesRefreshToken}
          onRefreshSettled={settleEngageRefresh}
        />
      </div>

      {activeTab === "posts" ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex shrink-0 items-center gap-2">
              {canCreate ? (
                <Button
                  type="button"
                  size="sm"
                  onClick={openCreate}
                  disabled={isPending || !hasAdminCredentials}
                >
                  <Plus className="size-4" />
                  新建动态
                </Button>
              ) : null}
              <Input
                className="h-9 w-36 sm:w-48"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="搜索正文…"
                aria-label="搜索动态"
              />
            </div>
            {!hasAdminCredentials ? (
              <p className="text-destructive text-xs sm:text-sm">
                未设置管理账号或密码，无法编辑
              </p>
            ) : null}
          </div>
          {error ? <p className="text-destructive text-sm">{error}</p> : null}

          {loading && posts.length === 0 ? (
            <div className="space-y-3">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : filteredPosts.length === 0 ? (
            <Empty className="max-w-[420px]">
              <EmptyHeader>
                <EmptyTitle>暂无动态</EmptyTitle>
                <EmptyDescription>
                  {search.trim()
                    ? "没有匹配的动态。"
                    : "点击「新建动态」发布第一条。"}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div
              className={cn(
                "relative space-y-4",
                (loading || refreshing) && "pointer-events-none opacity-60",
              )}
            >
              {refreshing ? (
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
                      <TableHead className="w-full min-w-0">内容</TableHead>
                      <TableHead className="w-[7.5rem] shrink-0 text-left">时间</TableHead>
                      <TableHead className="w-[72px] text-right">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredPosts.map((post) => (
                      <TableRow key={post.id}>
                        <TableCell className="max-w-0 whitespace-normal align-middle">
                          <button
                            type="button"
                            className="hover:text-primary w-full min-w-0 text-left"
                            onClick={() => openEdit(post)}
                          >
                            <div className="truncate text-sm leading-5">
                              {previewContent(post.content)}
                            </div>
                          </button>
                        </TableCell>
                        <TableCell className="text-muted-foreground w-[7.5rem] shrink-0 align-middle text-left text-[10px] leading-4 whitespace-nowrap tabular-nums">
                          {formatDisplayDate(post.created_at)}
                        </TableCell>
                        <TableCell className="align-middle text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                aria-label="更多操作"
                              >
                                <EllipsisVertical className="size-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => openEdit(post)}>
                                <Pencil className="size-4" />
                                编辑
                              </DropdownMenuItem>
                              {canDelete ? (
                                <DropdownMenuItem
                                  variant="destructive"
                                  onClick={() => setDeleteId(post.id)}
                                >
                                  <Trash2 className="size-4" />
                                  删除
                                </DropdownMenuItem>
                              ) : null}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
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

          <Dialog
            open={editorOpen}
            onOpenChange={(open) => {
              setEditorOpen(open);
              if (!open) setContentPreview(false);
            }}
          >
            <DialogContent className="w-[calc(100%-2rem)] max-w-xl overflow-x-hidden sm:max-w-xl">
              <DialogHeader>
                <DialogTitle>
                  {editor.id ? "编辑动态" : "新建动态"}
                </DialogTitle>
              </DialogHeader>
              <div className="min-w-0 space-y-4 py-2">
                <div className="min-w-0 space-y-2">
                  <Label>发布时间</Label>
                  <DateEditComponent
                    field={DATE_FIELD}
                    name="created_at"
                    value={editor.createdAt}
                    onChange={(event: { target?: { value?: string } }) => {
                      setEditor((prev) => ({
                        ...prev,
                        createdAt: event?.target?.value ?? "",
                      }));
                    }}
                  />
                </div>
                <div className="min-w-0 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <Label htmlFor="memos-content">正文</Label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      className="shrink-0"
                      onClick={() => setContentPreview((prev) => !prev)}
                    >
                      {contentPreview ? (
                        <>
                          <Pencil />
                          编辑
                        </>
                      ) : (
                        <>
                          <Eye />
                          预览
                        </>
                      )}
                    </Button>
                  </div>
                  {contentPreview ? (
                    <div className="border-input dark:bg-input/30 box-border h-56 w-full min-w-0 max-w-full overflow-x-hidden overflow-y-auto rounded-md border px-3 py-2">
                      <MarkdownPreview
                        markdown={unwrapEditorContent(editor.content)}
                        emptyMessage="暂无正文"
                        className="max-w-none text-sm [&_img]:!my-3 [&_img]:!ml-0 [&_img]:!mr-auto [&_img]:max-h-48 [&_img]:rounded-md [&_img]:object-contain [&_.post-image-row]:!justify-start [&_.post-image-row--single]:!justify-start"
                      />
                    </div>
                  ) : (
                    /* Native textarea: shared Textarea uses field-sizing/autosize and shifts width. */
                    <textarea
                      ref={contentTextareaRef}
                      id="memos-content"
                      rows={10}
                      value={editor.content}
                      onChange={handleContentChange}
                      placeholder="写点什么…"
                      spellCheck={false}
                      className={cn(
                        "border-input bg-transparent placeholder:text-muted-foreground",
                        "focus-visible:border-ring focus-visible:ring-ring/50",
                        "dark:bg-input/30 box-border block h-56 w-full min-w-0 max-w-full",
                        "resize-none overflow-x-hidden overflow-y-auto rounded-md border px-3 py-2",
                        "text-base shadow-xs outline-none focus-visible:ring-[3px] md:text-sm",
                        "whitespace-pre-wrap break-words [overflow-wrap:anywhere]",
                      )}
                    />
                  )}
                </div>
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditorOpen(false)}
                  disabled={isPending}
                >
                  取消
                </Button>
                <Button type="button" onClick={handleSave} disabled={isPending}>
                  {isPending ? "保存中…" : "保存"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <AlertDialog
            open={Boolean(deleteId)}
            onOpenChange={(open) => {
              if (!open) setDeleteId(null);
            }}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>删除这条动态？</AlertDialogTitle>
                <AlertDialogDescription>
                  将同时删除该动态下的评论与点赞，此操作不可撤销。
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
        </>
      ) : null}
      </div>
    </div>
  );
}
