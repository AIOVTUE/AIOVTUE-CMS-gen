import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  Database,
  FileStack,
  FileText,
  FolderOpen,
  Heart,
  History,
  Images,
  LayoutList,
  Link2,
  MessageCircle,
  MessageSquareText,
  Music2,
  Newspaper,
  PenTool,
  Settings,
  Sparkles,
  Tv,
  UserRound,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type RepoNavIconKind =
  | "posts"
  | "moments"
  | "links"
  | "gallery"
  | "excalidraw"
  | "about"
  | "memories"
  | "stats"
  | "bangumi"
  | "music"
  | "comment"
  | "friend-articles"
  | "media"
  | "collection"
  | "file"
  | "cache"
  | "history"
  | "configuration"
  | "ai-summary"
  | "menu-settings";

const ICONS: Record<
  RepoNavIconKind,
  { Icon: LucideIcon; colorClass: string }
> = {
  posts: { Icon: FileText, colorClass: "[&>svg]:text-blue-500" },
  moments: { Icon: MessageCircle, colorClass: "[&>svg]:text-pink-500" },
  links: { Icon: Link2, colorClass: "[&>svg]:text-violet-500" },
  gallery: { Icon: Images, colorClass: "[&>svg]:text-amber-500" },
  excalidraw: { Icon: PenTool, colorClass: "[&>svg]:text-rose-500" },
  about: { Icon: UserRound, colorClass: "[&>svg]:text-emerald-500" },
  memories: { Icon: Heart, colorClass: "[&>svg]:text-rose-400" },
  stats: { Icon: BarChart3, colorClass: "[&>svg]:text-sky-500" },
  bangumi: { Icon: Tv, colorClass: "[&>svg]:text-orange-500" },
  music: { Icon: Music2, colorClass: "[&>svg]:text-yellow-500" },
  comment: { Icon: MessageSquareText, colorClass: "[&>svg]:text-orange-400" },
  "friend-articles": { Icon: Newspaper, colorClass: "[&>svg]:text-lime-600" },
  media: {
    Icon: FolderOpen,
    colorClass:
      "[&>svg]:fill-[#ffcc4d] [&>svg]:text-[#c2850a] [&>svg]:stroke-[#c2850a]",
  },
  collection: { Icon: FileStack, colorClass: "[&>svg]:text-sky-500" },
  file: { Icon: FileText, colorClass: "[&>svg]:text-slate-500" },
  cache: { Icon: Database, colorClass: "[&>svg]:text-cyan-500" },
  history: { Icon: History, colorClass: "[&>svg]:text-orange-500" },
  configuration: { Icon: Settings, colorClass: "[&>svg]:text-slate-600" },
  "ai-summary": { Icon: Sparkles, colorClass: "[&>svg]:text-fuchsia-500" },
  "menu-settings": { Icon: LayoutList, colorClass: "[&>svg]:text-teal-500" },
};

export function resolveRepoNavIconKind(input: {
  name?: string;
  label?: string;
  type?: string;
}): RepoNavIconKind {
  const name = input.name?.toLowerCase() || "";
  const label = (input.label || "").toLowerCase();
  const key = `${name} ${label}`;

  if (
    name === "posts" ||
    name === "post" ||
    label.includes("文章") ||
    label.includes("博客")
  ) {
    return "posts";
  }
  if (
    name === "moments" ||
    name === "moment" ||
    label.includes("动态") ||
    label.includes("说说")
  ) {
    return "moments";
  }
  if (
    name === "links" ||
    name === "friends" ||
    label.includes("友链") ||
    label.includes("链接")
  ) {
    return "links";
  }
  if (
    name === "gallery" ||
    name === "albums" ||
    label.includes("相册") ||
    label.includes("图库")
  ) {
    return "gallery";
  }
  if (name === "excalidraw" || label.includes("画板")) {
    return "excalidraw";
  }
  if (name === "memories" || label.includes("回忆")) {
    return "memories";
  }
  if (name === "stats" || label.includes("统计")) {
    return "stats";
  }
  if (name === "bangumi" || label.includes("追番") || label.includes("番剧")) {
    return "bangumi";
  }
  if (name === "music" || label.includes("音乐")) {
    return "music";
  }
  if (
    name === "comment" ||
    name === "comments" ||
    label.includes("留言") ||
    label.includes("评论")
  ) {
    return "comment";
  }
  if (
    name === "friend-articles" ||
    label.includes("友文")
  ) {
    return "friend-articles";
  }
  if (name === "about" || label.includes("关于")) {
    return "about";
  }
  if (key.includes("media") || input.type === "media") {
    return "media";
  }
  if (input.type === "collection") {
    return "collection";
  }
  return "file";
}

export function RepoNavIcon({
  kind,
  size = "sm",
  className,
  iconColor,
}: {
  kind: RepoNavIconKind;
  size?: "sm" | "md";
  className?: string;
  iconColor?: string;
}) {
  const { Icon, colorClass } = ICONS[kind];
  const sizeClass = size === "md" ? "h-5 w-5" : "size-4";
  const colorStyle = iconColor ? { color: iconColor } : undefined;

  return (
    <span
      className={cn(
        "repo-nav-icon inline-flex shrink-0 items-center justify-center",
        !iconColor && colorClass,
        size === "md" ? "[&>svg]:h-5 [&>svg]:w-5" : "[&>svg]:size-4",
        className,
      )}
      style={colorStyle}
    >
      <Icon className={sizeClass} style={colorStyle} />
    </span>
  );
}

export const REPO_NAV_ICON_KINDS = Object.keys(ICONS) as RepoNavIconKind[];

export const REPO_NAV_ICON_LABELS: Record<RepoNavIconKind, string> = {
  posts: "文章",
  moments: "动态",
  links: "友链",
  gallery: "相册",
  excalidraw: "画板",
  about: "关于",
  memories: "回忆",
  stats: "统计",
  bangumi: "追番",
  music: "音乐",
  comment: "留言",
  "friend-articles": "友文",
  media: "媒体",
  collection: "集合",
  file: "文件",
  cache: "缓存",
  history: "记录",
  configuration: "配置",
  "ai-summary": "AI摘要",
  "menu-settings": "菜单",
};

export const isRepoNavIconKind = (value: unknown): value is RepoNavIconKind =>
  typeof value === "string" && value in ICONS;
