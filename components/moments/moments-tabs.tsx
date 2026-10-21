"use client";

import { cn } from "@/lib/utils";
import "./moments-tabs.css";

export type MomentsTab = "posts" | "comments" | "likes";

export const MOMENTS_TAB_ITEMS: Array<{ id: MomentsTab; label: string }> = [
  { id: "posts", label: "动态" },
  { id: "comments", label: "评论" },
  { id: "likes", label: "点赞" },
];

type MomentsTabListProps = {
  value: MomentsTab;
  onChange: (tab: MomentsTab) => void;
  className?: string;
};

export function MomentsTabList({
  value,
  onChange,
  className,
}: MomentsTabListProps) {
  return (
    <div
      className={cn(
        "moments-tab-list inline-flex shrink-0 rounded-lg border p-1",
        className,
      )}
      role="tablist"
      aria-label="动态管理"
      data-no-sidebar-open=""
    >
      {MOMENTS_TAB_ITEMS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={value === tab.id}
          className={cn(
            "rounded-md px-2.5 py-1 text-xs transition-colors sm:px-3 sm:py-1.5 sm:text-sm",
            value === tab.id
              ? "moments-tab-list__active text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
