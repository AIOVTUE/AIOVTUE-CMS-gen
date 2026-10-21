import type { MenusConfig } from "@/lib/menu-settings/types";

const DEFAULT_MENU_SECTIONS = {
  content: { enabled: true, order: 0, label: "内容" },
  site: { enabled: true, order: 1, label: "站点设置" },
  media: { enabled: true, order: 2, label: "图片资源" },
  publish: { enabled: true, order: 3, label: "提交" },
  actions: { enabled: true, order: 4, label: "操作" },
  admin: { enabled: true, order: 5, label: "管理" },
} as const;

const getDefaultMenusConfig = (): MenusConfig => ({
  sidebar: {
    sections: { ...DEFAULT_MENU_SECTIONS },
    items: {},
  },
});

const mergeMenusConfig = (menus?: MenusConfig | null): MenusConfig => {
  const defaults = getDefaultMenusConfig();
  if (!menus) return defaults;

  return {
    sidebar: {
      sections: {
        ...defaults.sidebar?.sections,
        ...(menus.sidebar?.sections ?? {}),
      },
      items: {
        ...defaults.sidebar?.items,
        ...(menus.sidebar?.items ?? {}),
      },
    },
  };
};

const LEGACY_DEFAULT_CONTENT_KEYS = [
  "content:posts",
  "content:moments",
  "content:memories",
  "content:excalidraw",
  "content:gallery",
  "content:links",
  "content:about",
  "content:site-config",
  "content:friend-link-notice",
  "content:gallery-index",
  "content:about-data",
  "content:memories-index",
  "content:games",
  "content:stats",
  "content:bangumi",
  "content:music",
  "content:comment",
  "content:friend-articles",
] as const;

/**
 * Drop built-in content pages/sidebar entries.
 * Templates are configured per project after selecting a path.
 * Keeps pages only when the user has saved them from「内容页面」.
 */
const applySidebarContentDefaultsUpgrade = (
  menus: MenusConfig,
  settings: Record<string, any> | undefined,
): { menus: MenusConfig; settings: Record<string, any>; changed: boolean } => {
  const nextSettings = { ...(settings ?? {}) };
  if (nextSettings.sidebarContentDefaultsV7 === true) {
    return { menus, settings: nextSettings, changed: false };
  }

  const items = { ...(menus.sidebar?.items ?? {}) };
  for (const key of LEGACY_DEFAULT_CONTENT_KEYS) {
    delete items[key];
  }

  nextSettings.sidebarContentDefaultsV7 = true;
  // Legacy installs and old builtin dumps are not "user configured".
  // Do not clear pagesManaged here when templatesConfigured is missing —
  // mergeBuiltinWithStored recovers from stored content to avoid wiping pages.

  return {
    menus: {
      ...menus,
      sidebar: {
        ...menus.sidebar,
        items,
      },
    },
    settings: nextSettings,
    changed: true,
  };
};

export {
  DEFAULT_MENU_SECTIONS,
  applySidebarContentDefaultsUpgrade,
  getDefaultMenusConfig,
  mergeMenusConfig,
};
