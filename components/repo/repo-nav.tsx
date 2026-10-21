"use client";

import { useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useConfig } from "@/contexts/config-context";
import { useUser } from "@/contexts/user-context";
import { canManageRepoSettings } from "@/lib/authz-shared";
import { isConfigEnabled } from "@/lib/config-flags";
import { mergeMenusConfig } from "@/lib/menu-settings/defaults";
import {
  getSidebarItemPresentation,
  isSidebarItemEnabled,
} from "@/lib/menu-settings/resolve";
import { cn } from "@/lib/utils";
import {
  RepoNavIcon,
  isRepoNavIconKind,
  resolveRepoNavIconKind,
} from "@/components/repo/repo-nav-icons";
import { repoHref } from "@/lib/repo-href";

const RepoNavItem = ({
  children,
  href,
  icon,
  active,
  onClick
}: {
  children: React.ReactNode;
  href: string;
  icon: React.ReactNode;
  active: boolean;
  onClick?: () => void;
}) => (
  <Link
    className={cn(
      active ? "bg-accent" : "hover:bg-accent",
      "flex items-center rounded-lg px-3 py-2 font-medium focus:bg-accent outline-none"
    )}
    href={href}
    onClick={onClick}
  >
    {icon}
    <span className="truncate">{children}</span>
  </Link>
);

const contentIcon = (item: any, menus: ReturnType<typeof mergeMenusConfig>) => {
  const defaultIcon = isRepoNavIconKind(item?.icon)
    ? item.icon
    : resolveRepoNavIconKind({
        name: item.name,
        label: item.label,
        type: item.type,
      });
  const presentation = getSidebarItemPresentation(
    menus,
    `content:${item.name}`,
    {
      icon: defaultIcon,
      label: item.label || item.name,
    },
  );
  const iconColor =
    presentation.iconColor ||
    (typeof item?.iconColor === "string" ? item.iconColor : undefined);
  return (
    <RepoNavIcon
      kind={presentation.icon}
      iconColor={iconColor}
      size="md"
      className="mr-2"
    />
  );
};

const RepoNav = ({
  onClick
}: {
  onClick?: () => void;
}) => {
  const { config } = useConfig();
  const { user } = useUser();
  const pathname = usePathname();

  const items = useMemo(() => {
    if (!config || !config.object) return [];
    const configObject: any = config.object;
    const menus = mergeMenusConfig(configObject.menus);

    const contentItems = (configObject.content ?? [])
      .filter(
        (item: any) =>
          item.name !== "site-config" && item.name !== "friend-link-notice",
      )
      .filter((item: any) =>
        isSidebarItemEnabled(menus, `content:${item.name}`, true),
      )
      .map((item: any) => ({
        key: item.name,
        icon: contentIcon(item, menus),
        href: `${repoHref(config.owner, config.repo, config.branch)}/${item.type}/${encodeURIComponent(item.name)}`,
        label: item.label || item.name,
      }));

    const mediaItems = (configObject.media ?? [])
      .filter((item: any) =>
        isSidebarItemEnabled(menus, `media:${item.name || "media"}`, true),
      )
      .map((item: any) => ({
        key: item.name || "media",
        icon: (
          <RepoNavIcon kind="media" size="md" className="mr-2" />
        ),
        href: `${repoHref(config.owner, config.repo, config.branch)}/media/${encodeURIComponent(item.name || "media")}`,
        label: item.label || item.name || "Media"
      }));

    const canManageRepo = canManageRepoSettings(user, config.owner);

    const configurationItem = canManageRepo &&
      isConfigEnabled(configObject) &&
      isSidebarItemEnabled(menus, "route:configuration", true)
      ? {
        key: "configuration",
        icon: <RepoNavIcon kind="configuration" size="md" className="mr-2" />,
        href: repoHref(
          config.owner,
          config.repo,
          config.branch,
          "/configuration",
        ),
        label: "内容页面"
      }
      : null;

    return [
      ...contentItems,
      configurationItem,
      ...mediaItems,
    ].filter(Boolean);
  }, [config, user]);

  if (!items.length) return null;

  return (
    <>
      {items.map(item => (
        <RepoNavItem
          key={item.key}
          icon={item.icon}
          href={item.href}
          active={pathname === item.href || pathname.startsWith(`${item.href}/`)}
          onClick={onClick}
        >
          {item.label}
        </RepoNavItem>
      ))}
    </>
  );
}

export { RepoNav };
