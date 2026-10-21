import { DEFAULT_MENU_SECTIONS, mergeMenusConfig } from "@/lib/menu-settings/defaults";
import type {
  MenuCatalogItem,
  MenuItemOverride,
  MenusConfig,
  MenuSectionKey,
  ResolvedMenuItem,
  ResolvedMenuSection,
} from "@/lib/menu-settings/types";

const getItemOverride = (
  menus: MenusConfig,
  key: string,
): MenuItemOverride | undefined => menus.sidebar?.items?.[key];

const resolveMenuItem = (
  item: MenuCatalogItem,
  menus: MenusConfig,
  fallbackOrder: number,
): ResolvedMenuItem => {
  const override = getItemOverride(menus, item.key) ?? {};
  const enabled = override.enabled ?? item.defaultEnabled;
  const order = override.order ?? fallbackOrder;
  const icon = override.icon ?? item.defaultIcon;
  const iconColor = override.iconColor?.trim() || undefined;
  const displayLabel = override.label?.trim() || item.label;

  return {
    ...item,
    enabled,
    order,
    icon,
    iconColor,
    displayLabel,
  };
};

const resolveMenuSections = (
  catalog: MenuCatalogItem[],
  menus: MenusConfig,
): ResolvedMenuSection[] => {
  const mergedMenus = mergeMenusConfig(menus);
  const sectionDefaults = mergedMenus.sidebar?.sections ?? {};

  const sections: ResolvedMenuSection[] = (
    Object.keys(sectionDefaults) as MenuSectionKey[]
  ).map((key) => {
    const sectionOverride = sectionDefaults[key] ?? {};
    const defaultSection =
      DEFAULT_MENU_SECTIONS[key as keyof typeof DEFAULT_MENU_SECTIONS];
    return {
      key,
      label: sectionOverride.label ?? defaultSection?.label ?? key,
      enabled: sectionOverride.enabled !== false,
      order: sectionOverride.order ?? defaultSection?.order ?? 0,
      items: [],
    };
  });

  catalog.forEach((item, index) => {
    const section = sections.find((entry) => entry.key === item.section);
    if (!section) return;
    section.items.push(resolveMenuItem(item, mergedMenus, index * 10));
  });

  return sections
    .map((section) => ({
      ...section,
      items: section.items
        .filter((item) => item.enabled)
        .sort(
          (a, b) =>
            a.order - b.order ||
            a.displayLabel.localeCompare(b.displayLabel, "zh-CN"),
        ),
    }))
    .filter((section) => section.enabled && section.items.length > 0)
    .sort((a, b) => a.order - b.order);
};

const isSidebarItemEnabled = (
  menus: MenusConfig | undefined,
  key: string,
  defaultEnabled = true,
) => {
  const override = mergeMenusConfig(menus).sidebar?.items?.[key];
  if (override?.enabled != null) return override.enabled;
  return defaultEnabled;
};

const getSidebarItemPresentation = (
  menus: MenusConfig | undefined,
  key: string,
  defaults: { icon: MenuCatalogItem["defaultIcon"]; label: string },
) => {
  const override = mergeMenusConfig(menus).sidebar?.items?.[key] ?? {};
  return {
    enabled: override.enabled !== false,
    icon: override.icon ?? defaults.icon,
    iconColor: override.iconColor?.trim() || undefined,
    label: override.label?.trim() || defaults.label,
    order: override.order,
  };
};

export {
  getItemOverride,
  getSidebarItemPresentation,
  isSidebarItemEnabled,
  resolveMenuSections,
};
