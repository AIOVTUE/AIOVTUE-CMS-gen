"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useConfig } from "@/contexts/config-context";
import { useRepo } from "@/contexts/repo-context";
import { useUser } from "@/contexts/user-context";
import { canManageRepoSettings, hasGithubIdentity } from "@/lib/authz-shared";
import { isCacheEnabled, isConfigEnabled } from "@/lib/config-flags";
import { getRootActions } from "@/lib/actions";
import { getVisits } from "@/lib/tracker";
import { RepoActionButtons } from "@/components/repo/repo-action-buttons";
import { isDeferredCommitRepoClient } from "@/lib/deferred-commits-client";
import { RepoPublishButton } from "@/components/repo/repo-publish-button";
import { RepoBranches } from "@/components/repo/repo-branches";
import { LocalWorkspaceDialog } from "@/components/repo/local-workspace-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { User } from "@/components/user";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  ArrowUpRight,
  BarChart3,
  ChevronRight,
  ChevronsUpDown,
  FolderOpen,
  Home,
  MessageCircle,
  MessageSquareText,
} from "lucide-react";
import {
  RepoNavIcon,
  isRepoNavIconKind,
  resolveRepoNavIconKind,
} from "@/components/repo/repo-nav-icons";
import { flattenContentLeaves } from "@/lib/page-templates";
import { mergeMenusConfig } from "@/lib/menu-settings/defaults";
import {
  getSidebarItemPresentation,
  isSidebarItemEnabled,
} from "@/lib/menu-settings/resolve";
import type { MenuSectionKey } from "@/lib/menu-settings/types";
import { faviconUrlFromSite } from "@/lib/site-url/favicon";
import type { SiteUrlSettingsPublic } from "@/lib/site-url/types";
import type { WebanalysiSettingsPublic } from "@/lib/webanalysi-settings/types";
import type { CommentSettingsPublic } from "@/lib/comment-settings/types";
import { loadMemosSettingsAction } from "@/lib/memos-settings/actions";
import {
  loadWebanalysiBootstrapAction,
} from "@/lib/webanalysi-settings/actions";
import {
  COMMENT_LIST_DEFAULT_QUERY,
  SITE_STORAGE_KEY,
  WEBANALYSI_SITES_CACHE_KEY,
  analyticsDataCacheKey,
} from "@/lib/webanalysi-settings/client-cache-keys";
import {
  getSessionCached,
  peekSessionCache,
  setSessionCache,
} from "@/lib/session-memory-cache";
import {
  EMPTY_QUICK_LINKS_SNAPSHOT,
  readQuickLinksSnapshot,
  subscribeQuickLinksSnapshot,
  writeQuickLinksSnapshot,
} from "@/lib/sidebar-quick-links-cache";
import type {
  WebanalysiAnalyticsBundle,
  WebanalysiListPayload,
} from "@/lib/webanalysi-settings/types";
import type { CommentListPayload } from "@/lib/comment-settings/types";
import { requireApiSuccess } from "@/lib/api-client";
import type { ApiSuccess } from "@/types/api";
import {
  encodeRepoSegment,
  pathMatchesOrUnder,
  pathsEqual,
  repoHref,
} from "@/lib/repo-href";
import useSWR from "swr";

const SIDEBAR_GROUP_CLASS = "px-2 py-0.5";
const LOCAL_WORKSPACE_LABEL_KEY = "pagecms-local-workspace-label";

const folderNameFromPath = (rawPath: string) => {
  const trimmed = rawPath.replace(/[\\/]+$/, "").trim();
  if (!trimmed) return "";
  const parts = trimmed.split(/[\\/]/);
  return parts[parts.length - 1] || "";
};

const readCachedLocalWorkspaceLabel = () => {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(LOCAL_WORKSPACE_LABEL_KEY)?.trim() || "";
  } catch {
    return "";
  }
};

const writeCachedLocalWorkspaceLabel = (label: string) => {
  if (typeof window === "undefined") return;
  try {
    const trimmed = label.trim();
    if (!trimmed) {
      window.localStorage.removeItem(LOCAL_WORKSPACE_LABEL_KEY);
      return;
    }
    window.localStorage.setItem(LOCAL_WORKSPACE_LABEL_KEY, trimmed);
  } catch {
    /* ignore */
  }
};

function SiteQuickLinks() {
  const { owner, repo } = useRepo();
  const { config } = useConfig();
  const pathname = usePathname();
  const branch = config?.branch ?? "";
  const ownerRepoHref = `/${encodeRepoSegment(owner)}/${encodeRepoSegment(repo)}`;
  const homeHref = branch ? repoHref(owner, repo, branch) : ownerRepoHref;
  const analyticsHref = branch
    ? repoHref(owner, repo, branch, "/analytics")
    : ownerRepoHref;
  const momentsHref = branch
    ? repoHref(owner, repo, branch, "/moments")
    : ownerRepoHref;
  const commentsHref = branch
    ? repoHref(owner, repo, branch, "/comments")
    : ownerRepoHref;
  const homeActive = Boolean(branch) && pathsEqual(pathname, homeHref);
  const analyticsActive =
    Boolean(branch) && pathMatchesOrUnder(pathname, analyticsHref);
  const momentsActive =
    Boolean(branch) && pathMatchesOrUnder(pathname, momentsHref);
  const commentsActive =
    Boolean(branch) && pathMatchesOrUnder(pathname, commentsHref);

  const snapshot = useSyncExternalStore(
    subscribeQuickLinksSnapshot,
    readQuickLinksSnapshot,
    () => EMPTY_QUICK_LINKS_SNAPSHOT,
  );

  const { data } = useSWR(
    "/api/site-url/settings",
    async (url: string) => {
      const response = await fetch(url);
      const payload = await requireApiSuccess<
        ApiSuccess<SiteUrlSettingsPublic>
      >(response, "加载站点地址失败");
      return payload.data;
    },
  );
  const { data: webanalysi } = useSWR(
    "/api/webanalysi/settings",
    async (url: string) => {
      const response = await fetch(url);
      const payload = await requireApiSuccess<
        ApiSuccess<WebanalysiSettingsPublic>
      >(response, "加载访问设置失败");
      return payload.data;
    },
    { revalidateOnFocus: false, shouldRetryOnError: false },
  );
  const { data: memos } = useSWR(
    "memos-settings:sidebar",
    async () => {
      const result = await loadMemosSettingsAction();
      if (!result.ok) return null;
      return result.data;
    },
    { revalidateOnFocus: false, shouldRetryOnError: false },
  );
  const { data: comments } = useSWR(
    "/api/comment/settings",
    async (url: string) => {
      const response = await fetch(url);
      const payload = await requireApiSuccess<
        ApiSuccess<CommentSettingsPublic>
      >(response, "加载评论设置失败");
      return payload.data;
    },
    { revalidateOnFocus: false, shouldRetryOnError: false },
  );
  const [iconFailed, setIconFailed] = useState(false);

  // Prefer live settings once resolved; until then show last-known enabled links.
  // Active route always shows its own entry so the sidebar doesn't pop in late.
  const siteUrl =
    data !== undefined
      ? data?.siteUrl?.trim() || ""
      : snapshot.siteUrl;
  const customIcon =
    data !== undefined
      ? data?.iconUrl?.trim() || ""
      : snapshot.iconUrl;
  const showAnalytics =
    analyticsActive ||
    (webanalysi !== undefined
      ? Boolean(webanalysi?.configured)
      : snapshot.analytics);
  const showMoments =
    momentsActive ||
    (memos !== undefined ? Boolean(memos?.configured) : snapshot.moments);
  const showComments =
    commentsActive ||
    (comments !== undefined
      ? Boolean(
          comments?.provider === "twikoo" && comments.serverUrl?.trim(),
        )
      : snapshot.comments);

  useEffect(() => {
    // Only persist once live settings resolve — avoid writing while still on snapshot.
    if (
      data === undefined &&
      webanalysi === undefined &&
      memos === undefined &&
      comments === undefined
    ) {
      return;
    }
    writeQuickLinksSnapshot({
      siteUrl:
        data !== undefined ? data?.siteUrl?.trim() || "" : snapshot.siteUrl,
      iconUrl:
        data !== undefined ? data?.iconUrl?.trim() || "" : snapshot.iconUrl,
      analytics:
        webanalysi !== undefined
          ? Boolean(webanalysi?.configured)
          : snapshot.analytics,
      moments:
        memos !== undefined ? Boolean(memos?.configured) : snapshot.moments,
      comments:
        comments !== undefined
          ? Boolean(
              comments?.provider === "twikoo" && comments.serverUrl?.trim(),
            )
          : snapshot.comments,
    });
    // Intentionally omit snapshot.* — writing must not re-trigger from our own notify.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- snapshot is fallback only
  }, [comments, data, memos, webanalysi]);
  const favicon = useMemo(() => {
    if (!siteUrl && !customIcon) return "";
    if (customIcon) {
      if (/^(https?:|data:|blob:)/i.test(customIcon) || customIcon.startsWith("//")) {
        return customIcon.startsWith("//") ? `https:${customIcon}` : customIcon;
      }
      if (customIcon.startsWith("/") && siteUrl) {
        try {
          return new URL(customIcon, siteUrl).toString();
        } catch {
          return customIcon;
        }
      }
      return customIcon;
    }
    return faviconUrlFromSite(siteUrl);
  }, [customIcon, siteUrl]);

  useEffect(() => {
    setIconFailed(false);
  }, [favicon]);

  // Idle-prefetch analytics + comments so first open hits session cache.
  useEffect(() => {
    if (!showAnalytics && !showComments) return;

    let cancelled = false;
    let idleId: number | undefined;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const prefetch = () => {
      if (cancelled) return;

      if (showAnalytics && !peekSessionCache(WEBANALYSI_SITES_CACHE_KEY)) {
        const preferredSite =
          typeof window !== "undefined"
            ? window.localStorage.getItem(SITE_STORAGE_KEY) || ""
            : "";
        void getSessionCached(WEBANALYSI_SITES_CACHE_KEY, async () => {
          const result = await loadWebanalysiBootstrapAction({
            siteID: preferredSite,
            time: "today",
          });
          if (!result.ok) throw new Error(result.message);
          if (result.data.siteID && result.data.analytics) {
            setSessionCache<WebanalysiAnalyticsBundle>(
              analyticsDataCacheKey(result.data.siteID, result.data.time),
              result.data.analytics,
            );
          }
          return {
            sites: result.data.sites,
            hosts: result.data.hosts,
          } satisfies WebanalysiListPayload;
        }).catch(() => {
          /* ignore prefetch errors */
        });
      }

      if (showComments && !peekSessionCache(COMMENT_LIST_DEFAULT_QUERY)) {
        void getSessionCached(COMMENT_LIST_DEFAULT_QUERY, async () => {
          const response = await fetch(COMMENT_LIST_DEFAULT_QUERY);
          const payload = await requireApiSuccess<
            ApiSuccess<CommentListPayload>
          >(response, "加载评论失败");
          return payload.data;
        }).catch(() => {
          /* ignore prefetch errors */
        });
      }
    };

    const ric = (
      window as Window & {
        requestIdleCallback?: (
          cb: () => void,
          opts?: { timeout: number },
        ) => number;
      }
    ).requestIdleCallback;

    if (typeof ric === "function") {
      idleId = ric(prefetch, { timeout: 4000 });
    } else {
      timeoutId = setTimeout(prefetch, 1200);
    }

    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
      if (idleId != null) {
        (
          window as Window & { cancelIdleCallback?: (id: number) => void }
        ).cancelIdleCallback?.(idleId);
      }
    };
  }, [showAnalytics, showComments]);

  const showIcon = Boolean(favicon) && !iconFailed;

  if (!branch) return null;

  return (
    <SidebarGroup className={SIDEBAR_GROUP_CLASS}>
      <SidebarGroupContent>
        <SidebarMenu>
          {siteUrl ? (
            <SidebarMenuItem>
              <SidebarMenuButton asChild tooltip="返回站点">
                <a href={siteUrl}>
                  {showIcon ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={favicon}
                      alt=""
                      className="size-4 shrink-0 rounded-sm object-cover"
                      onError={() => setIconFailed(true)}
                    />
                  ) : null}
                  <span>返回站点</span>
                </a>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ) : null}
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="首页" isActive={homeActive}>
              <Link href={homeHref}>
                <Home className="size-4 shrink-0" />
                <span>首页</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          {showAnalytics ? (
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                tooltip="访问"
                isActive={analyticsActive}
              >
                <Link href={analyticsHref}>
                  <BarChart3 className="size-4 shrink-0" />
                  <span>访问</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ) : null}
          {showMoments ? (
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                tooltip="动态"
                isActive={momentsActive}
              >
                <Link href={momentsHref}>
                  <MessageCircle className="size-4 shrink-0" />
                  <span>动态</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ) : null}
          {showComments ? (
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                tooltip="评论"
                isActive={commentsActive}
              >
                <Link href={commentsHref}>
                  <MessageSquareText className="size-4 shrink-0" />
                  <span>评论</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ) : null}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

type NavItem = {
  key: string;
  label: string;
  href: string;
  icon: React.ReactNode;
  order?: number;
};

type NavigationNode = {
  type: "group" | "file" | "collection" | "media";
  name: string;
  label?: string;
  items?: NavigationNode[];
};

function RepoSwitcher() {
  const { owner, repo, branches = [] } = useRepo();
  const { config } = useConfig();
  const currentBranch = config?.branch ?? "";
  const isLocalOwner = owner.toLowerCase() === "local";
  const sortedBranches = useMemo(
    () => [...branches].sort((a, b) => a.localeCompare(b)),
    [branches],
  );
  const [recentRepos, setRecentRepos] = useState<
    Array<{ owner: string; repo: string; branch: string }>
  >([]);
  const triggerWrapperRef = useRef<HTMLDivElement | null>(null);
  const [menuWidth, setMenuWidth] = useState<number | null>(null);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  // Empty on SSR + first client paint so hydration matches `repo` from the URL.
  const [cachedLocalLabel, setCachedLocalLabel] = useState("");

  const { data: localWorkspace } = useSWR(
    isLocalOwner ? "/api/local-repo/workspace" : null,
    async (url: string) => {
      const response = await fetch(url);
      const payload = await requireApiSuccess<
        ApiSuccess<{ path: string; source: string }>
      >(response, "加载本地目录失败");
      return payload.data;
    },
    { revalidateOnFocus: false, shouldRetryOnError: false },
  );

  useEffect(() => {
    if (!isLocalOwner) return;
    const cached = readCachedLocalWorkspaceLabel();
    if (cached) setCachedLocalLabel(cached);
  }, [isLocalOwner]);

  useEffect(() => {
    if (!isLocalOwner) return;
    const fromApi = localWorkspace?.path
      ? folderNameFromPath(localWorkspace.path)
      : "";
    if (!fromApi) return;
    writeCachedLocalWorkspaceLabel(fromApi);
    setCachedLocalLabel(fromApi);
  }, [isLocalOwner, localWorkspace?.path]);

  const localFolderLabel = useMemo(() => {
    if (!isLocalOwner) return "";
    const fromApi = localWorkspace?.path
      ? folderNameFromPath(localWorkspace.path)
      : "";
    return fromApi || cachedLocalLabel;
  }, [cachedLocalLabel, isLocalOwner, localWorkspace?.path]);

  // Prefer URL `repo` until client-only label sources are ready (avoids hydration mismatch).
  const displayRepo = isLocalOwner
    ? localFolderLabel || decodeURIComponent(repo)
    : repo;

  useEffect(() => {
    const el = triggerWrapperRef.current;
    if (!el) return;

    const updateWidth = () => {
      setMenuWidth(el.getBoundingClientRect().width);
    };

    updateWidth();

    const observer = new ResizeObserver(() => updateWidth());
    observer.observe(el);
    window.addEventListener("resize", updateWidth);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateWidth);
    };
  }, []);

  const loadRecentRepos = useCallback(() => {
    const visits = getVisits()
      .filter(
        (visit) =>
          !(
            visit.owner.toLowerCase() === owner.toLowerCase() &&
            visit.repo.toLowerCase() === repo.toLowerCase()
          ),
      )
      .slice(0, 3)
      .map((visit) => ({
        owner: visit.owner,
        repo: visit.repo,
        branch: visit.branch,
      }));
    setRecentRepos(visits);
  }, [owner, repo]);

  useEffect(() => {
    loadRecentRepos();
  }, [loadRecentRepos]);

  const handleBranchChange = (branch: string) => {
    // Full load remounts branch layout/providers cleanly (soft push can blank).
    window.location.assign(repoHref(owner, repo, branch));
  };

  return (
    <Dialog>
      <div ref={triggerWrapperRef}>
        <DropdownMenu
          onOpenChange={(open) => {
            if (open) loadRecentRepos();
          }}
        >
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <Avatar className="h-8 w-8 rounded-md">
                <AvatarImage
                  src={`https://github.com/${owner}.png`}
                  alt={owner}
                />
                <AvatarFallback>
                  {owner.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span
                  className="truncate font-medium"
                  title={
                    isLocalOwner
                      ? localWorkspace?.path || displayRepo
                      : displayRepo
                  }
                >
                  {displayRepo}
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {currentBranch || (isLocalOwner ? "本地项目" : owner)}
                </span>
              </div>
              <ChevronsUpDown className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="rounded-lg"
            align="start"
            style={
              menuWidth
                ? { width: `${menuWidth}px`, minWidth: `${menuWidth}px` }
                : undefined
            }
          >
            {!isLocalOwner ? (
              <DropdownMenuItem asChild>
                <a
                  href={`https://github.com/${owner}/${repo}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  在 GitHub 上查看
                  <ArrowUpRight className="size-3 text-muted-foreground ml-auto" />
                </a>
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem
              onSelect={(event) => {
                event.preventDefault();
                setWorkspaceOpen(true);
              }}
            >
              选择本地项目目录
              <FolderOpen className="ml-auto size-3.5 text-muted-foreground" />
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs text-muted-foreground">分支</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={currentBranch}
              onValueChange={handleBranchChange}
            >
              {sortedBranches.map((branch) => (
                <DropdownMenuRadioItem key={branch} value={branch}>
                  <span className="truncate">{branch}</span>
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
            <DialogTrigger asChild>
              <DropdownMenuItem>管理分支</DropdownMenuItem>
            </DialogTrigger>
            {recentRepos.length > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-xs text-muted-foreground">最近访问</DropdownMenuLabel>
                {recentRepos.map((visit) => (
                  <DropdownMenuItem
                    asChild
                    key={`${visit.owner}/${visit.repo}/${visit.branch}`}
                  >
                    {/* Native <a>: soft-nav into another repo shell blanks until refresh. */}
                    <a href={repoHref(visit.owner, visit.repo, visit.branch)}>
                      <img
                        src={`https://github.com/${visit.owner}.png`}
                        alt={`${visit.owner}'s avatar`}
                        className="size-5 rounded"
                      />
                      <span className="truncate">{visit.repo}</span>
                    </a>
                  </DropdownMenuItem>
                ))}
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>管理分支</DialogTitle>
        </DialogHeader>
        <RepoBranches />
      </DialogContent>
      <LocalWorkspaceDialog open={workspaceOpen} onOpenChange={setWorkspaceOpen} />
    </Dialog>
  );
}

export function RepoSidebar() {
  const pathname = usePathname();
  const { user } = useUser();
  const { config } = useConfig();
  const { isMobile, setOpenMobile } = useSidebar();
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (isMobile) {
      setOpenMobile(false);
    }
  }, [isMobile, pathname, setOpenMobile]);

  useEffect(() => {
    if (typeof document === "undefined" || !isMobile) {
      return;
    }

    // Radix sheet teardown can occasionally leave body interactions disabled
    // after mobile sidebar navigation.
    document.body.style.removeProperty("pointer-events");

    return () => {
      document.body.style.removeProperty("pointer-events");
    };
  }, [isMobile, pathname]);

  const handleNavigation = useCallback(() => {
    if (isMobile) {
      setOpenMobile(false);
    }
  }, [isMobile, setOpenMobile]);

  const menus = useMemo(
    () => mergeMenusConfig((config?.object as any)?.menus),
    [config?.object],
  );

  const filterNavigationTree = useCallback(
    (nodes: NavigationNode[]): NavigationNode[] =>
      nodes
        .map((node) => {
          if (node.type === "group") {
            const items = filterNavigationTree(node.items ?? []);
            return items.length > 0 ? { ...node, items } : null;
          }
          return isSidebarItemEnabled(menus, `content:${node.name}`, true)
            ? node
            : null;
        })
        .filter(Boolean) as NavigationNode[],
    [menus],
  );

  const contentNavigation = useMemo<NavigationNode[]>(() => {
    if (!config?.object) return [];
    const navigation = (config.object as any).navigation?.content;

    let nodes: NavigationNode[] = [];
    if (Array.isArray(navigation)) {
      nodes = navigation;
    } else {
      const content = (config.object as any).content ?? [];
      nodes = content.map((item: any) => ({
        type: item.type,
        name: item.name,
        label: item.label || item.name,
        items: item.items,
      }));
    }

    const filtered = filterNavigationTree(nodes);
    return filtered
      .map((node, index) => ({ node, index }))
      .sort((a, b) => {
        const orderA =
          getSidebarItemPresentation(menus, `content:${a.node.name}`, {
            icon: "file",
            label: a.node.label || a.node.name,
          }).order ?? a.index * 10;
        const orderB =
          getSidebarItemPresentation(menus, `content:${b.node.name}`, {
            icon: "file",
            label: b.node.label || b.node.name,
          }).order ?? b.index * 10;
        return orderA - orderB || a.index - b.index;
      })
      .map(({ node }) => node);
  }, [config, filterNavigationTree, menus]);

  const mediaNavigation = useMemo<NavigationNode[]>(() => {
    if (!config?.object) return [];
    const navigation = (config.object as any).navigation?.media;
    const nodes = Array.isArray(navigation)
      ? navigation
      : ((config.object as any).media ?? []).map((item: any) => ({
          type: "media" as const,
          name: item.name || "default",
          label: item.label || item.name || "Media",
        }));

    return nodes
      .filter((node: NavigationNode) =>
        isSidebarItemEnabled(menus, `media:${node.name}`, true),
      )
      .map((node: NavigationNode, index: number) => ({ node, index }))
      .sort(
        (
          a: { node: NavigationNode; index: number },
          b: { node: NavigationNode; index: number },
        ) => {
        const orderA =
          getSidebarItemPresentation(menus, `media:${a.node.name}`, {
            icon: "media",
            label: a.node.label || a.node.name,
          }).order ?? a.index * 10;
        const orderB =
          getSidebarItemPresentation(menus, `media:${b.node.name}`, {
            icon: "media",
            label: b.node.label || b.node.name,
          }).order ?? b.index * 10;
        return orderA - orderB || a.index - b.index;
      })
      .map(({ node }: { node: NavigationNode }) => node);
  }, [config, menus]);

  const adminItems = useMemo<NavItem[]>(() => {
    if (!config) return [];
    const configObject = (config.object as any) ?? {};

    const routes = [
      isCacheEnabled(configObject)
        ? {
            key: "route:cache",
            label: "缓存",
            href: repoHref(config.owner, config.repo, config.branch, "/cache"),
            icon: "cache" as const,
          }
        : null,
    ].filter(Boolean) as Array<{
      key: string;
      label: string;
      href: string;
      icon: "cache";
    }>;

    return routes
      .filter((route) => isSidebarItemEnabled(menus, route.key, true))
      .map((route) => {
        const presentation = getSidebarItemPresentation(menus, route.key, {
          icon: route.icon,
          label: route.label,
        });
        return {
          key: route.key,
          label: presentation.label,
          href: route.href,
          icon: (
            <RepoNavIcon
              kind={presentation.icon}
              iconColor={presentation.iconColor}
            />
          ),
          order: presentation.order ?? 0,
        };
      })
      .sort((a, b) => a.order - b.order || a.label.localeCompare(b.label, "zh-CN"));
  }, [config, menus]);

  const publishHistoryItem = useMemo<NavItem | null>(() => {
    if (!config || !hasGithubIdentity(user)) return null;
    if (!isSidebarItemEnabled(menus, "route:actions", true)) return null;
    const presentation = getSidebarItemPresentation(menus, "route:actions", {
      icon: "history",
      label: "提交记录",
    });
    return {
      key: "route:actions",
      label: presentation.label,
      href: repoHref(config.owner, config.repo, config.branch, "/actions"),
      icon: (
        <RepoNavIcon
          kind={presentation.icon}
          iconColor={presentation.iconColor}
        />
      ),
      order: presentation.order ?? 0,
    };
  }, [config, menus, user]);

  const siteSettingsItems = useMemo<NavItem[]>(() => {
    if (!config) return [];
    const canManageRepo = canManageRepoSettings(user, config.owner);
    const configObject = (config.object as any) ?? {};
    if (!canManageRepo || !isConfigEnabled(configObject)) return [];

    const routes = [
      {
        key: "route:configuration",
        label: "内容页面",
        href: repoHref(
          config.owner,
          config.repo,
          config.branch,
          "/configuration",
        ),
        icon: "configuration" as const,
      },
    ];

    return routes
      .filter((route) => isSidebarItemEnabled(menus, route.key, true))
      .map((route) => {
        const presentation = getSidebarItemPresentation(menus, route.key, {
          icon: route.icon,
          label: route.label,
        });
        return {
          key: route.key,
          label: presentation.label,
          href: route.href,
          icon: (
            <RepoNavIcon
              kind={presentation.icon}
              iconColor={presentation.iconColor}
            />
          ),
          order: presentation.order ?? 0,
        };
      })
      .sort((a, b) => a.order - b.order || a.label.localeCompare(b.label, "zh-CN"));
  }, [config, menus, user]);
  const rootActions = useMemo(
    () => getRootActions(config?.object),
    [config?.object],
  );

  const getNodeHref = useCallback(
    (node: NavigationNode) => {
      if (!config) return "#";
      const base = repoHref(config.owner, config.repo, config.branch);
      if (node.type === "media") {
        return `${base}/media/${encodeURIComponent(node.name)}`;
      }
      return `${base}/${node.type}/${encodeURIComponent(node.name)}`;
    },
    [config],
  );

  const contentByName = useMemo(() => {
    const leaves = flattenContentLeaves((config?.object as any)?.content);
    return new Map(
      leaves
        .filter((entry) => typeof entry?.name === "string" && entry.name)
        .map((entry) => [entry.name as string, entry as Record<string, any>]),
    );
  }, [config?.object]);

  const getNodeIcon = (node: NavigationNode) => {
    const entry = contentByName.get(node.name);
    const defaultIcon = isRepoNavIconKind(entry?.icon)
      ? entry.icon
      : resolveRepoNavIconKind({
          name: node.name,
          label: node.label,
          type: node.type,
        });
    const key =
      node.type === "media" ? `media:${node.name}` : `content:${node.name}`;
    const presentation = getSidebarItemPresentation(menus, key, {
      icon: defaultIcon,
      label: node.label || node.name,
    });
    const iconColor =
      presentation.iconColor ||
      (typeof entry?.iconColor === "string" ? entry.iconColor : undefined);
    return (
      <RepoNavIcon
        kind={presentation.icon}
        iconColor={iconColor}
      />
    );
  };

  const hasActiveDescendant = useCallback(
    function hasActiveDescendant(node: NavigationNode): boolean {
      if (node.type !== "group") {
        const href = getNodeHref(node);
        return pathname === href || pathname.startsWith(`${href}/`);
      }
      return (node.items || []).some((item) => hasActiveDescendant(item));
    },
    [getNodeHref, pathname],
  );

  const activeGroupKeys = useMemo(
    () => {
      const collectActiveGroupKeys = (
        nodes: NavigationNode[],
        prefix: string,
      ): string[] => {
        const keys: string[] = [];

        nodes.forEach((node) => {
          const key = `${prefix}-${node.name}`;
          if (node.type !== "group") {
            return;
          }

          if (hasActiveDescendant(node)) {
            keys.push(key);
          }

          if (node.items?.length) {
            keys.push(...collectActiveGroupKeys(node.items, key));
          }
        });

        return keys;
      };

      return [
        ...collectActiveGroupKeys(contentNavigation, "内容"),
        ...collectActiveGroupKeys(mediaNavigation, "Media"),
      ];
    },
    [contentNavigation, hasActiveDescendant, mediaNavigation],
  );

  useEffect(() => {
    if (activeGroupKeys.length === 0) {
      return;
    }

    setExpandedGroups((current) => {
      let changed = false;
      const next = { ...current };

      activeGroupKeys.forEach((key) => {
        if (!(key in next)) {
          next[key] = true;
          changed = true;
        }
      });

      return changed ? next : current;
    });
  }, [activeGroupKeys]);

  const toggleGroup = useCallback((key: string, defaultOpen = false) => {
    setExpandedGroups((current) => ({
      ...current,
      [key]: !(current[key] ?? defaultOpen),
    }));
  }, []);

  function renderNavigationNode(node: NavigationNode, key: string, nested: boolean = false): React.ReactNode {
    if (node.type === "group") {
      const isActive = hasActiveDescendant(node);
      const isOpen = expandedGroups[key] ?? isActive;
      if (nested) {
        return (
            <SidebarMenuSubItem key={key}>
              <SidebarMenuSubButton
                asChild
              >
                <button type="button" onClick={() => toggleGroup(key)}>
                  <ChevronRight className={cn("size-4 transition-transform", isOpen && "rotate-90")} />
                  <span>{node.label || node.name}</span>
              </button>
            </SidebarMenuSubButton>
            {isOpen && node.items && node.items.length > 0 && (
              <SidebarMenuSub>
                {node.items.map((item) => renderNavigationNode(item, `${key}-${item.name}`, true))}
              </SidebarMenuSub>
            )}
          </SidebarMenuSubItem>
        );
      }

      return (
        <SidebarMenuItem key={key}>
          <SidebarMenuButton
            asChild
          >
            <button type="button" onClick={() => toggleGroup(key)}>
              <ChevronRight className={cn("size-4 transition-transform", isOpen && "rotate-90")} />
              <span>{node.label || node.name}</span>
            </button>
          </SidebarMenuButton>
          {isOpen && node.items && node.items.length > 0 && (
            <SidebarMenuSub>
              {node.items.map((item) => renderNavigationNode(item, `${key}-${item.name}`, true))}
            </SidebarMenuSub>
          )}
        </SidebarMenuItem>
      );
    }

    const href = getNodeHref(node);
    const isActive = pathname === href || pathname.startsWith(`${href}/`);
    if (nested) {
      return (
        <SidebarMenuSubItem key={key}>
          <SidebarMenuSubButton asChild isActive={isActive}>
            <Link href={href} onClick={handleNavigation}>
              {getNodeIcon(node)}
              <span>{node.label || node.name}</span>
            </Link>
          </SidebarMenuSubButton>
        </SidebarMenuSubItem>
      );
    }

    return (
      <SidebarMenuItem key={key}>
        <SidebarMenuButton asChild isActive={isActive}>
          <Link href={href} onClick={handleNavigation}>
            {getNodeIcon(node)}
            <span>{node.label || node.name}</span>
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  }

  const renderNavigationGroup = (label: string, nodes: NavigationNode[]) => {
    if (nodes.length === 0) return null;

    return (
      <SidebarGroup className={SIDEBAR_GROUP_CLASS}>
        <SidebarGroupLabel>{label}</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            {nodes.map((node) => renderNavigationNode(node, `${label}-${node.name}`))}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    );
  };

  const renderFlatGroup = (label: string, items: NavItem[]) => {
    if (items.length === 0) return null;

    return (
      <SidebarGroup className={SIDEBAR_GROUP_CLASS}>
        <SidebarGroupLabel>{label}</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            {items.map((item) => {
              const isActive =
                pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <SidebarMenuItem key={item.key}>
                  <SidebarMenuButton asChild isActive={isActive}>
                    <Link href={item.href} onClick={handleNavigation}>
                      {item.icon}
                      <span>{item.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    );
  };

  const getSectionLabel = (key: MenuSectionKey, fallback: string) =>
    menus.sidebar?.sections?.[key]?.label?.trim() || fallback;

  const isSectionEnabled = (key: MenuSectionKey) =>
    menus.sidebar?.sections?.[key]?.enabled !== false;

  const contentSectionKey = "section-content";
  const contentSectionActive = contentNavigation.some((node) => {
    if (node.type === "group") return hasActiveDescendant(node);
    const href = getNodeHref(node);
    return pathname === href || pathname.startsWith(`${href}/`);
  });
  // Manual collapse only — default expanded, never auto-fold.
  const contentSectionOpen = expandedGroups[contentSectionKey] ?? true;

  const siteSectionKey = "section-site";
  const mediaInSite =
    isSectionEnabled("media") && mediaNavigation.length > 0;
  const mediaSectionActive =
    mediaInSite &&
    mediaNavigation.some((node) => {
      if (node.type === "group") return hasActiveDescendant(node);
      const href = getNodeHref(node);
      return pathname === href || pathname.startsWith(`${href}/`);
    });
  const siteSectionActive =
    siteSettingsItems.some(
      (item) =>
        pathname === item.href || pathname.startsWith(`${item.href}/`),
    ) || Boolean(mediaSectionActive);
  // Manual collapse only — default expanded, never auto-fold.
  const siteSectionOpen = expandedGroups[siteSectionKey] ?? true;
  const showSiteSection =
    siteSettingsItems.length > 0 || mediaInSite;

  const publishSectionKey = "section-publish";
  const publishSectionActive =
    Boolean(
      publishHistoryItem &&
        (pathname === publishHistoryItem.href ||
          pathname.startsWith(`${publishHistoryItem.href}/`)),
    ) ||
    Boolean(
      config &&
        (pathname.includes("/changes") || pathname.endsWith("/changes")),
    );
  // Keep expanded by default; no auto-fold.
  const publishSectionOpen = expandedGroups[publishSectionKey] ?? true;

  const sectionBlocks: Array<{ key: MenuSectionKey; node: React.ReactNode }> = [
    {
      key: "content",
      node:
        contentNavigation.length > 0 ? (
          <Fragment key="内容区">
            <SiteQuickLinks />
            <SidebarGroup key="内容" className={SIDEBAR_GROUP_CLASS}>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      isActive={contentSectionActive && !contentSectionOpen}
                    >
                      <button
                        type="button"
                        onClick={() => toggleGroup(contentSectionKey, true)}
                      >
                        <ChevronRight
                          className={cn(
                            "size-4 transition-transform",
                            contentSectionOpen && "rotate-90",
                          )}
                        />
                        <span>{getSectionLabel("content", "内容")}</span>
                      </button>
                    </SidebarMenuButton>
                    {contentSectionOpen ? (
                      <SidebarMenuSub>
                        {contentNavigation.map((node) =>
                          renderNavigationNode(node, `内容-${node.name}`, true),
                        )}
                      </SidebarMenuSub>
                    ) : null}
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </Fragment>
        ) : (
          <SiteQuickLinks key="站点快捷入口" />
        ),
    },
    {
      key: "site",
      node: showSiteSection ? (
        <SidebarGroup key="站点设置" className={SIDEBAR_GROUP_CLASS}>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={siteSectionActive && !siteSectionOpen}
                >
                  <button
                    type="button"
                    onClick={() => toggleGroup(siteSectionKey)}
                  >
                    <ChevronRight
                      className={cn(
                        "size-4 transition-transform",
                        siteSectionOpen && "rotate-90",
                      )}
                    />
                    <span>{getSectionLabel("site", "站点设置")}</span>
                  </button>
                </SidebarMenuButton>
                {siteSectionOpen ? (
                  <SidebarMenuSub>
                    {siteSettingsItems.map((item) => {
                        const isActive =
                          pathname === item.href ||
                          pathname.startsWith(`${item.href}/`);
                        return (
                          <SidebarMenuSubItem key={item.key}>
                            <SidebarMenuSubButton asChild isActive={isActive}>
                              <Link href={item.href} onClick={handleNavigation}>
                                {item.icon}
                                <span>{item.label}</span>
                              </Link>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        );
                      })}
                    {mediaInSite
                      ? mediaNavigation.map((node) =>
                          renderNavigationNode(
                            node,
                            `site-media-${node.name}`,
                            true,
                          ),
                        )
                      : null}
                  </SidebarMenuSub>
                ) : null}
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      ) : null,
    },
    {
      key: "media",
      // Media is nested under the site settings group.
      node: null,
    },
    {
      key: "publish",
      node: (() => {
        const showPublish =
          Boolean(config) &&
          isDeferredCommitRepoClient(config!.owner, config!.repo);
        if (!showPublish && !publishHistoryItem) return null;

        const historyActive =
          publishHistoryItem &&
          (pathname === publishHistoryItem.href ||
            pathname.startsWith(`${publishHistoryItem.href}/`));

        return (
          <SidebarGroup key="提交" className={SIDEBAR_GROUP_CLASS}>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={publishSectionActive && !publishSectionOpen}
                  >
                    <button
                      type="button"
                      onClick={() => toggleGroup(publishSectionKey, true)}
                    >
                      <ChevronRight
                        className={cn(
                          "size-4 transition-transform",
                          publishSectionOpen && "rotate-90",
                        )}
                      />
                      <span>{getSectionLabel("publish", "提交")}</span>
                    </button>
                  </SidebarMenuButton>
                  {publishSectionOpen ? (
                    <SidebarMenuSub>
                      {showPublish && config ? (
                        <RepoPublishButton
                          owner={config.owner}
                          repo={config.repo}
                          branch={config.branch}
                          onNavigate={handleNavigation}
                        />
                      ) : null}
                      {publishHistoryItem ? (
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton
                            asChild
                            isActive={Boolean(historyActive)}
                          >
                            <Link
                              href={publishHistoryItem.href}
                              onClick={handleNavigation}
                            >
                              {publishHistoryItem.icon}
                              <span>{publishHistoryItem.label}</span>
                            </Link>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      ) : null}
                    </SidebarMenuSub>
                  ) : null}
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        );
      })(),
    },
    {
      key: "actions",
      node:
        rootActions.length > 0 && config ? (
          <SidebarGroup key="操作" className={SIDEBAR_GROUP_CLASS}>
            <SidebarGroupLabel>
              {getSectionLabel("actions", "操作")}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <RepoActionButtons
                actions={rootActions}
                owner={config.owner}
                repo={config.repo}
                refName={config.branch}
                contextType="repo"
                layout="sidebar"
              />
            </SidebarGroupContent>
          </SidebarGroup>
        ) : null,
    },
    {
      key: "admin",
      node: renderFlatGroup(getSectionLabel("admin", "管理"), adminItems),
    },
  ];

  const groups = sectionBlocks
    .filter((block) => isSectionEnabled(block.key) && block.node)
    .sort(
      (a, b) =>
        (menus.sidebar?.sections?.[a.key]?.order ?? 0) -
        (menus.sidebar?.sections?.[b.key]?.order ?? 0),
    )
    .map((block) => block.node)
    .filter(Boolean);

  return (
    <Sidebar collapsible="offcanvas">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <RepoSwitcher />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent className="gap-0">
        {groups.map((group, index) => (
          <Fragment key={index}>{group}</Fragment>
        ))}
      </SidebarContent>
      <SidebarFooter className="border-t">
        <div className="flex items-center gap-2">
          <User align="start" />
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
