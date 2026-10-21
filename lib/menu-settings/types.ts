import type { RepoNavIconKind } from "@/components/repo/repo-nav-icons";

type MenuZone = "sidebar";

type MenuSectionKey =
  | "content"
  | "site"
  | "media"
  | "publish"
  | "actions"
  | "admin";

type MenuItemOverride = {
  enabled?: boolean;
  order?: number;
  icon?: RepoNavIconKind;
  iconColor?: string;
  label?: string;
};

type MenuSectionOverride = {
  enabled?: boolean;
  order?: number;
  label?: string;
};

type MenusConfig = {
  sidebar?: {
    sections?: Partial<Record<MenuSectionKey, MenuSectionOverride>>;
    items?: Record<string, MenuItemOverride>;
  };
};

type MenuCatalogItem = {
  key: string;
  label: string;
  href: string;
  section: MenuSectionKey;
  defaultIcon: RepoNavIconKind;
  defaultEnabled: boolean;
  nodeType?: "collection" | "file" | "media" | "route";
  contentName?: string;
};

type ResolvedMenuItem = MenuCatalogItem & {
  enabled: boolean;
  order: number;
  icon: RepoNavIconKind;
  iconColor?: string;
  displayLabel: string;
};

type ResolvedMenuSection = {
  key: MenuSectionKey;
  label: string;
  enabled: boolean;
  order: number;
  items: ResolvedMenuItem[];
};

export type {
  MenuZone,
  MenuSectionKey,
  MenuItemOverride,
  MenuSectionOverride,
  MenusConfig,
  MenuCatalogItem,
  ResolvedMenuItem,
  ResolvedMenuSection,
};
