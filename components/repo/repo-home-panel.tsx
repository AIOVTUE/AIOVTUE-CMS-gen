"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { useConfig } from "@/contexts/config-context";
import { useUser } from "@/contexts/user-context";
import { useRepoHeader } from "@/components/repo/repo-header-context";
import { RepoPageHeader } from "@/components/repo/repo-page-header";
import { RepoNavIcon } from "@/components/repo/repo-nav-icons";
import { canManageRepoSettings } from "@/lib/authz-shared";
import { buildMenuCatalog } from "@/lib/menu-settings/catalog";
import { mergeMenusConfig } from "@/lib/menu-settings/defaults";
import {
  getSidebarItemPresentation,
  isSidebarItemEnabled,
} from "@/lib/menu-settings/resolve";
import type { MenuCatalogItem, MenuSectionKey } from "@/lib/menu-settings/types";
import { cn } from "@/lib/utils";
import "./repo-home-panel.css";

type HomeTile = {
  key: string;
  label: string;
  href: string;
  external?: boolean;
  icon: React.ReactNode;
};

const SECTION_ORDER: Array<{ key: MenuSectionKey; label: string }> = [
  { key: "content", label: "内容" },
  // 内容页面 + 图片资源 share the site group (matches sidebar).
  { key: "site", label: "站点" },
  { key: "publish", label: "发布" },
  { key: "admin", label: "管理" },
];

function HomeTileButton({ tile }: { tile: HomeTile }) {
  const className = cn(
    "repo-home__tile group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
  );

  const body = (
    <>
      <span className="text-foreground flex size-10 shrink-0 items-center justify-center [&>svg]:size-5">
        {tile.icon}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm font-medium">
        {tile.label}
      </span>
      {tile.external ? (
        <ExternalLink className="text-muted-foreground size-4 shrink-0 opacity-60" />
      ) : null}
    </>
  );

  if (tile.external) {
    return (
      <a href={tile.href} className={className} target="_blank" rel="noreferrer">
        {body}
      </a>
    );
  }

  return (
    <Link href={tile.href} className={className}>
      {body}
    </Link>
  );
}

export function RepoHomePanel() {
  const { config } = useConfig();
  const { user } = useUser();
  const menus = useMemo(
    () => mergeMenusConfig((config?.object as any)?.menus),
    [config?.object],
  );

  const headerNode = useMemo(
    () => <RepoPageHeader title="首页" mobileMainClick="sidebar" />,
    [],
  );
  useRepoHeader({ header: headerNode });

  const catalogItems = useMemo(() => {
    if (!config) return [] as MenuCatalogItem[];
    const items = buildMenuCatalog({
      config,
      canManageRepo: canManageRepoSettings(user, config.owner),
    });
    return items.filter((item) => {
      if (item.href === "#") return false;
      return isSidebarItemEnabled(menus, item.key, item.defaultEnabled !== false);
    });
  }, [config, menus, user]);

  const sections = useMemo(() => {
    if (!config) return [];

    const bySection = new Map<string, HomeTile[]>();

    for (const item of catalogItems) {
      if (item.section === "actions") continue;
      const presentation = getSidebarItemPresentation(menus, item.key, {
        icon: item.defaultIcon,
        label: item.label,
      });
      const tile: HomeTile = {
        key: item.key,
        label: presentation.label,
        href: item.href,
        icon: (
          <RepoNavIcon
            kind={presentation.icon}
            iconColor={presentation.iconColor}
            size="md"
          />
        ),
      };
      // Fold legacy "media" section into site (内容页面 + 图片资源).
      const sectionKey =
        item.section === "media" ? "site" : item.section;
      const list = bySection.get(sectionKey) ?? [];
      list.push(tile);
      bySection.set(sectionKey, list);
    }

    const siteTileRank = (key: string) => {
      if (key === "route:configuration") return 0;
      if (key.startsWith("media:")) return 1;
      return 2;
    };

    return SECTION_ORDER.map((section) => {
      const tiles = [...(bySection.get(section.key) ?? [])];
      if (section.key === "site") {
        tiles.sort(
          (a, b) =>
            siteTileRank(a.key) - siteTileRank(b.key) ||
            a.label.localeCompare(b.label, "zh-CN"),
        );
      }
      return { ...section, tiles };
    }).filter((section) => section.tiles.length > 0);
  }, [catalogItems, config, menus]);

  if (!config) return null;

  return (
    <div className="repo-home">
      <div className="repo-home__content">
        {sections.map((section) => (
          <section key={section.key} className="space-y-3">
            <h2 className="repo-home__section-title text-xs font-medium tracking-wide uppercase">
              {section.label}
            </h2>
            <div className="grid gap-2 sm:grid-cols-2">
              {section.tiles.map((tile) => (
                <HomeTileButton key={tile.key} tile={tile} />
              ))}
            </div>
          </section>
        ))}
        {sections.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            暂无可用入口，请先在设置中配置。
          </p>
        ) : null}
      </div>
    </div>
  );
}
