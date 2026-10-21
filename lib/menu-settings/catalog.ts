import {
  isRepoNavIconKind,
  resolveRepoNavIconKind,
} from "@/components/repo/repo-nav-icons";
import { flattenContentLeaves } from "@/lib/page-templates";
import { getRootActions } from "@/lib/actions";
import { isCacheEnabled, isConfigEnabled } from "@/lib/config-flags";
import { isDeferredCommitRepoClient } from "@/lib/deferred-commits-client";
import { repoHref } from "@/lib/repo-href";
import type { MenuCatalogItem, MenuSectionKey } from "@/lib/menu-settings/types";
import type { Config } from "@/types/config";

type NavigationNode = {
  type: "group" | "file" | "collection" | "media";
  name: string;
  label?: string;
  items?: NavigationNode[];
};

type BuildCatalogOptions = {
  config: Config;
  canManageRepo: boolean;
};

const makeContentHref = (config: Config, node: NavigationNode) =>
  repoHref(
    config.owner,
    config.repo,
    config.branch,
    `/${node.type}/${encodeURIComponent(node.name)}`,
  );

const makeMediaHref = (config: Config, name: string) =>
  repoHref(config.owner, config.repo, config.branch, `/media/${encodeURIComponent(name)}`);

const makeRouteHref = (config: Config, segment: string) =>
  repoHref(config.owner, config.repo, config.branch, `/${segment}`);

const pushContentNodes = (
  config: Config,
  nodes: NavigationNode[],
  items: MenuCatalogItem[],
  orderOffset: number,
  contentByName: Map<string, Record<string, any>>,
) => {
  nodes.forEach((node, index) => {
    if (node.type === "group") {
      pushContentNodes(
        config,
        node.items ?? [],
        items,
        orderOffset + index,
        contentByName,
      );
      return;
    }

    const entry = contentByName.get(node.name);
    items.push({
      key: `content:${node.name}`,
      label: node.label || node.name,
      href: makeContentHref(config, node),
      section: "content",
      defaultIcon: isRepoNavIconKind(entry?.icon)
        ? entry.icon
        : resolveRepoNavIconKind({
            name: node.name,
            label: node.label,
            type: node.type,
          }),
      defaultEnabled: true,
      nodeType: node.type === "media" ? "media" : node.type,
      contentName: node.name,
    });
  });
};

const buildMenuCatalog = ({
  config,
  canManageRepo,
}: BuildCatalogOptions): MenuCatalogItem[] => {
  const items: MenuCatalogItem[] = [];
  const configObject = (config.object ?? {}) as Record<string, any>;

  const contentLeaves = flattenContentLeaves(configObject.content);
  const contentByName = new Map(
    contentLeaves
      .filter((entry) => typeof entry?.name === "string" && entry.name)
      .map((entry) => [entry.name as string, entry as Record<string, any>]),
  );

  const contentNavigation = Array.isArray(configObject.navigation?.content)
    ? configObject.navigation.content
    : Array.isArray(configObject.content)
      ? configObject.content.map((entry: any) => ({
          type: entry.type,
          name: entry.name,
          label: entry.label || entry.name,
          items: entry.items,
        }))
      : [];

  pushContentNodes(config, contentNavigation, items, 0, contentByName);

  const mediaNavigation = Array.isArray(configObject.navigation?.media)
    ? configObject.navigation.media
    : Array.isArray(configObject.media)
      ? configObject.media.map((entry: any) => ({
          type: "media" as const,
          name: entry.name || "default",
          label: entry.label || entry.name || "Media",
        }))
      : [];

  mediaNavigation.forEach((node: NavigationNode) => {
    items.push({
      key: `media:${node.name}`,
      label: node.label || node.name,
      href: makeMediaHref(config, node.name),
      // Same group as「内容页面」under site settings.
      section: "site",
      defaultIcon: "media",
      defaultEnabled: true,
      nodeType: "media",
      contentName: node.name,
    });
  });

  if (canManageRepo && isConfigEnabled(configObject)) {
    items.push(
      {
        key: "route:configuration",
        label: "内容页面",
        href: makeRouteHref(config, "configuration"),
        section: "site",
        defaultIcon: "configuration",
        defaultEnabled: true,
        nodeType: "route",
      },
    );
  }

  if (canManageRepo && isCacheEnabled(configObject)) {
    items.push({
      key: "route:cache",
      label: "缓存",
      href: makeRouteHref(config, "cache"),
      section: "admin",
      defaultIcon: "cache",
      defaultEnabled: true,
      nodeType: "route",
    });
  }

  if (canManageRepo) {
    items.push({
      key: "route:actions",
      label: "提交记录",
      href: makeRouteHref(config, "actions"),
      section: "publish",
      defaultIcon: "history",
      defaultEnabled: true,
      nodeType: "route",
    });
  }

  if (config && isDeferredCommitRepoClient(config.owner, config.repo)) {
    items.push({
      key: "route:publish",
      label: "更改列表",
      href: makeRouteHref(config, "changes"),
      section: "publish",
      defaultIcon: "history",
      defaultEnabled: true,
      nodeType: "route",
    });
  }

  const rootActions = getRootActions(configObject);
  rootActions.forEach((action, index) => {
    items.push({
      key: `action:${action.name}`,
      label: action.label || action.name,
      href: "#",
      section: "actions",
      defaultIcon: "configuration",
      defaultEnabled: true,
      nodeType: "route",
    });
  });

  return items;
};

const SECTION_KEYS: MenuSectionKey[] = [
  "content",
  "site",
  "media",
  "publish",
  "actions",
  "admin",
];

export { buildMenuCatalog, SECTION_KEYS };
