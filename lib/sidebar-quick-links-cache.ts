export type SidebarQuickLinksSnapshot = {
  siteUrl: string;
  iconUrl: string;
  analytics: boolean;
  moments: boolean;
  comments: boolean;
};

export const EMPTY_QUICK_LINKS_SNAPSHOT: SidebarQuickLinksSnapshot = {
  siteUrl: "",
  iconUrl: "",
  analytics: false,
  moments: false,
  comments: false,
};

const STORAGE_KEY = "pagecms-sidebar-quick-links";
const listeners = new Set<() => void>();

/** Stable ref for useSyncExternalStore — must be Object.is-equal when unchanged. */
let cachedSnapshot: SidebarQuickLinksSnapshot = EMPTY_QUICK_LINKS_SNAPSHOT;

const sameSnapshot = (
  a: SidebarQuickLinksSnapshot,
  b: SidebarQuickLinksSnapshot,
) =>
  a.siteUrl === b.siteUrl &&
  a.iconUrl === b.iconUrl &&
  a.analytics === b.analytics &&
  a.moments === b.moments &&
  a.comments === b.comments;

const notify = () => {
  for (const listener of listeners) listener();
};

const parseSnapshot = (raw: string | null): SidebarQuickLinksSnapshot => {
  if (!raw) return EMPTY_QUICK_LINKS_SNAPSHOT;
  try {
    const parsed = JSON.parse(raw) as Partial<SidebarQuickLinksSnapshot>;
    const next: SidebarQuickLinksSnapshot = {
      siteUrl:
        typeof parsed.siteUrl === "string" ? parsed.siteUrl.trim() : "",
      iconUrl:
        typeof parsed.iconUrl === "string" ? parsed.iconUrl.trim() : "",
      analytics: Boolean(parsed.analytics),
      moments: Boolean(parsed.moments),
      comments: Boolean(parsed.comments),
    };
    if (
      !next.siteUrl &&
      !next.iconUrl &&
      !next.analytics &&
      !next.moments &&
      !next.comments
    ) {
      return EMPTY_QUICK_LINKS_SNAPSHOT;
    }
    return next;
  } catch {
    return EMPTY_QUICK_LINKS_SNAPSHOT;
  }
};

export const readQuickLinksSnapshot = (): SidebarQuickLinksSnapshot => {
  if (typeof window === "undefined") return EMPTY_QUICK_LINKS_SNAPSHOT;
  try {
    const next = parseSnapshot(window.localStorage.getItem(STORAGE_KEY));
    if (sameSnapshot(cachedSnapshot, next)) return cachedSnapshot;
    cachedSnapshot = next;
    return cachedSnapshot;
  } catch {
    return cachedSnapshot;
  }
};

export const writeQuickLinksSnapshot = (
  snapshot: SidebarQuickLinksSnapshot,
) => {
  if (typeof window === "undefined") return;
  const next: SidebarQuickLinksSnapshot = {
    siteUrl: snapshot.siteUrl.trim(),
    iconUrl: snapshot.iconUrl.trim(),
    analytics: Boolean(snapshot.analytics),
    moments: Boolean(snapshot.moments),
    comments: Boolean(snapshot.comments),
  };
  if (sameSnapshot(cachedSnapshot, next)) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    cachedSnapshot = next;
    notify();
  } catch {
    /* ignore quota / private mode */
  }
};

export const subscribeQuickLinksSnapshot = (listener: () => void) => {
  listeners.add(listener);
  if (typeof window !== "undefined") {
    window.addEventListener("storage", listener);
  }
  return () => {
    listeners.delete(listener);
    if (typeof window !== "undefined") {
      window.removeEventListener("storage", listener);
    }
  };
};
