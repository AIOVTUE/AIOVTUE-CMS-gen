"use client";

import type { MouseEvent, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useSidebar } from "@/components/ui/sidebar";
import "./repo-page-header.css";

type RepoPageHeaderProps = {
  title?: ReactNode;
  children?: ReactNode;
  align?: "center" | "start";
  className?: string;
  mainClassName?: string;
  actionsClassName?: string;
  /**
   * Mobile title-area tap. Sidebar trigger button is unaffected.
   * - `"sidebar"`: open mobile sidebar (repo home only)
   * - function: custom action (e.g. navigate to collection root)
   * - omit / undefined: no title-area action
   */
  mobileMainClick?: "sidebar" | (() => void);
};

export function RepoPageHeader({
  title,
  children,
  align = "center",
  className,
  mainClassName,
  actionsClassName,
  mobileMainClick,
}: RepoPageHeaderProps) {
  const { isMobile, setOpenMobile } = useSidebar();
  const mainClickEnabled = isMobile && mobileMainClick != null;

  const handleMainClick = (event: MouseEvent<HTMLDivElement>) => {
    if (!mainClickEnabled) return;
    const target = event.target as HTMLElement | null;
    // Real links / controls keep their own behavior; sidebar trigger is outside this node.
    if (
      target?.closest(
        "a[href], button, input, textarea, select, [data-no-sidebar-open]",
      )
    ) {
      return;
    }
    if (mobileMainClick === "sidebar") {
      setOpenMobile(true);
      return;
    }
    mobileMainClick();
  };

  return (
    <div
      className={cn(
        "repo-page-header",
        align === "start" && "repo-page-header--start",
        className,
      )}
    >
      {title != null ? (
        <div
          className={cn(
            "repo-page-header__main",
            mainClickEnabled && "cursor-pointer",
            mainClassName,
          )}
          onClick={handleMainClick}
        >
          {typeof title === "string" ? (
            <strong className="repo-page-header__title">{title}</strong>
          ) : (
            title
          )}
        </div>
      ) : null}
      {children ? (
        <div className={cn("repo-page-header__actions", actionsClassName)}>
          {children}
        </div>
      ) : null}
    </div>
  );
}
