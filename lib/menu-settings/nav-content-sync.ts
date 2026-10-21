import type { NavMenuChild, NavMenuItem } from "@/components/site-settings/nav-menu-field";

const normalizeNavUrl = (url?: string) => {
  const raw = (url || "").trim();
  if (!raw) return "";
  if (raw === "/") return "/";
  return raw.endsWith("/") ? raw : `${raw}/`;
};

/** Map blog nav URLs to CMS content schema names. */
const NAV_URL_TO_CONTENT: Record<string, string> = {
  "/moments/": "moments",
  "/gallery/": "gallery",
  "/memories/": "memories",
  "/links/": "links",
  "/about/": "about",
  "/excalidraw/": "excalidraw",
};

const NAV_NAME_TO_CONTENT: Record<string, string> = {
  动态: "moments",
  相册: "gallery",
  回忆: "memories",
  友链: "links",
  关于: "about",
  画板: "excalidraw",
};

const resolveContentNameFromNav = (item: {
  url?: string;
  name?: string;
}): string | undefined => {
  const byUrl = NAV_URL_TO_CONTENT[normalizeNavUrl(item.url)];
  if (byUrl) return byUrl;
  const name = (item.name || "").trim();
  return NAV_NAME_TO_CONTENT[name];
};

/**
 * Derive CMS content sidebar visibility from blog top-nav enable flags.
 * Only returns keys that appear in the nav (so unmapped content is left untouched).
 */
const deriveContentVisibilityFromNav = (
  menu: NavMenuItem[],
): Record<string, boolean> => {
  const visibility: Record<string, boolean> = {};

  const visit = (
    items: Array<NavMenuItem | NavMenuChild>,
    parentEnabled: boolean,
  ) => {
    for (const item of items) {
      const selfEnabled = parentEnabled && item.enabled !== false;
      const contentName = resolveContentNameFromNav(item);
      if (contentName) {
        visibility[contentName] =
          Boolean(visibility[contentName]) || selfEnabled;
      }
      if ("items" in item && Array.isArray(item.items)) {
        visit(item.items, selfEnabled);
      }
    }
  };

  visit(menu, true);
  return visibility;
};

export {
  deriveContentVisibilityFromNav,
  resolveContentNameFromNav,
  NAV_URL_TO_CONTENT,
};
