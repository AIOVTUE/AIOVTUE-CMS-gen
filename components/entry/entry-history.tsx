"use client";

import { formatDistanceToNow } from "date-fns";
import { getInitialsFromName } from "@/lib/utils/avatar";
import { useConfig } from "@/contexts/config-context";
import type { EntryHistoryItem } from "@/types/api";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ArrowUpRight, History, Loader } from "lucide-react";

function HistoryItemContent({
  item,
  compact = false,
}: {
  item: EntryHistoryItem;
  compact?: boolean;
}) {
  const authorName = item.commit.author?.name || item.author?.login || "未知作者";
  const authorDate = item.commit.author?.date ? new Date(item.commit.author.date) : null;

  return (
    <>
      <Avatar className={compact ? "size-7" : "h-8 w-8"}>
        <AvatarImage src={item.author?.login ? `https://github.com/${item.author.login}.png` : undefined} alt={`${authorName}'s avatar`} />
        <AvatarFallback>{getInitialsFromName(authorName)}</AvatarFallback>
      </Avatar>
      <div className={compact ? "text-left overflow-hidden" : "text-left overflow-hidden ml-3"}>
        <div className={compact ? "truncate" : "text-sm font-medium truncate"}>{authorName}</div>
        <div className="text-xs text-muted-foreground truncate">
          {authorDate ? `${formatDistanceToNow(authorDate)} ago` : "未知日期"}
        </div>
      </div>
    </>
  );
}

export function EntryHistoryBlock({
  path,
  history,
}: {
  path: string;
  history: EntryHistoryItem[];
}) {
  const { config } = useConfig();

  if (!history || history.length === 0) return null;

  return (
    <div className="flex flex-col gap-y-1 text-sm">
      {history.slice(0, 3).map((item) => (
        <a
          href={item.html_url}
          target="_blank"
          rel="noopener noreferrer"
          key={item.sha}
          className="flex items-center rounded-lg px-3 py-2 transition-all hover:bg-accent ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <HistoryItemContent item={item} />
        </a>
      ))}
      {history.length > 3 && (
        <a
          href={`https://github.com/${config?.owner}/${config?.repo}/commits/${encodeURIComponent(config!.branch)}/${path}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center rounded-lg px-3 py-2 transition-all hover:bg-accent ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <span className="mr-4">查看全部变更</span>
        </a>
      )}
    </div>
  );
}

export function EntryHistoryDropdown({
  path,
  history,
  loading = false,
  onOpenChange,
  triggerVariant = "ghost",
  triggerSize = "icon",
}: {
  path: string;
  history?: EntryHistoryItem[] | null;
  loading?: boolean;
  onOpenChange?: (open: boolean) => void;
  triggerVariant?: React.ComponentProps<typeof Button>["variant"];
  triggerSize?: React.ComponentProps<typeof Button>["size"];
}) {
  const { config } = useConfig();
  const items = history ?? [];

  return (
    <DropdownMenu onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant={triggerVariant} size={triggerSize}>
          <History />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-w-3xs">
        {loading && items.length === 0 ? (
          <div className="text-muted-foreground flex items-center gap-2 px-2 py-2 text-xs">
            <Loader className="size-3.5 animate-spin" />
            加载历史…
          </div>
        ) : items.length === 0 ? (
          <div className="text-muted-foreground px-2 py-2 text-xs">暂无历史记录</div>
        ) : (
          items.slice(0, 3).map((item) => (
            <DropdownMenuItem key={item.sha} asChild>
              <a href={item.html_url} target="_blank" rel="noopener noreferrer" className="w-full truncate flex items-center gap-3">
                <HistoryItemContent item={item} compact />
              </a>
            </DropdownMenuItem>
          ))
        )}
        <DropdownMenuSeparator/>
        <DropdownMenuItem asChild>
          <a
            href={`https://github.com/${config?.owner}/${config?.repo}/commits/${encodeURIComponent(config!.branch)}/${path}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center w-full"
          >在 GitHub 上查看<ArrowUpRight className="size-3 text-muted-foreground ml-auto" />
          </a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
