import YAML from "yaml";
import type { MenusConfig } from "@/lib/menu-settings/types";
import { flattenContentLeaves } from "@/lib/page-templates";

const configObjectToPagesYml = (configObject: Record<string, any>) => {
  const copy = JSON.parse(JSON.stringify(configObject));
  delete copy.navigation;
  return YAML.stringify(copy);
};

/**
 * Reorder content using sidebar leaf keys while preserving group nesting.
 * Leaves are updated in place; root nodes (groups or root leaves) are ordered
 * by the earliest matching key in `orderedKeys`.
 */
const reorderContentByKeys = (
  content: any[],
  orderedKeys: string[],
): any[] => {
  if (!Array.isArray(content) || orderedKeys.length === 0) return content;

  const byName = new Map<string, any>();
  for (const leaf of flattenContentLeaves(content)) {
    if (leaf?.name) byName.set(`content:${leaf.name}`, leaf);
  }

  const orderIndex = new Map<string, number>();
  orderedKeys.forEach((key, index) => {
    if (!orderIndex.has(key)) orderIndex.set(key, index);
  });

  const updateTree = (entries: any[]): any[] => {
    const next: any[] = [];
    for (const entry of entries) {
      if (entry?.type === "group" && Array.isArray(entry.items)) {
        const items = updateTree(entry.items);
        if (items.length === 0) continue;
        next.push({ ...entry, items });
        continue;
      }
      const key = entry?.name ? `content:${entry.name}` : "";
      if (!key || !byName.has(key)) continue;
      next.push(byName.get(key));
    }
    return next;
  };

  const updated = updateTree(content);

  // Append brand-new root leaves that were not present in the original tree.
  const present = new Set(
    flattenContentLeaves(updated).map((leaf) => `content:${leaf.name}`),
  );
  for (const key of orderedKeys) {
    if (present.has(key)) continue;
    const leaf = byName.get(key);
    if (!leaf) continue;
    updated.push(leaf);
    present.add(key);
  }

  const score = (entry: any): number => {
    if (entry?.type === "group" && Array.isArray(entry.items)) {
      const indices = flattenContentLeaves(entry.items)
        .map((leaf) =>
          leaf?.name ? orderIndex.get(`content:${leaf.name}`) : undefined,
        )
        .filter((value): value is number => typeof value === "number");
      return indices.length > 0 ? Math.min(...indices) : Number.MAX_SAFE_INTEGER;
    }
    const key = entry?.name ? `content:${entry.name}` : "";
    return orderIndex.get(key) ?? Number.MAX_SAFE_INTEGER;
  };

  return [...updated].sort((a, b) => score(a) - score(b));
};

const reorderMediaByKeys = (media: any[], orderedKeys: string[]) => {
  const byName = new Map<string, any>();
  media.forEach((entry) => {
    if (entry?.name) byName.set(`media:${entry.name}`, entry);
  });

  const used = new Set<string>();
  const reordered: any[] = [];

  orderedKeys.forEach((key) => {
    const entry = byName.get(key);
    if (!entry || used.has(key)) return;
    reordered.push(entry);
    used.add(key);
  });

  media.forEach((entry) => {
    const key = entry?.name ? `media:${entry.name}` : "";
    if (!used.has(key)) reordered.push(entry);
  });

  return reordered;
};

const applyMenusDraft = (
  configObject: Record<string, any>,
  menus: MenusConfig,
  sidebarContentOrder: string[],
  sidebarMediaOrder: string[],
) => {
  const next = JSON.parse(JSON.stringify(configObject));
  delete next.navigation;
  next.menus = menus;

  if (Array.isArray(next.content) && sidebarContentOrder.length > 0) {
    next.content = reorderContentByKeys(next.content, sidebarContentOrder);
  }

  if (Array.isArray(next.media) && sidebarMediaOrder.length > 0) {
    next.media = reorderMediaByKeys(next.media, sidebarMediaOrder);
  }

  return next;
};

export {
  applyMenusDraft,
  configObjectToPagesYml,
  reorderContentByKeys,
  reorderMediaByKeys,
};
