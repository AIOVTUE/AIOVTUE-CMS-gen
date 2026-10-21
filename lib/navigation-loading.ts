type Listener = (loading: boolean) => void;

const listeners = new Set<Listener>();

export function subscribeNavigationLoading(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function isSamePathNavigation(href: string) {
  if (typeof window === "undefined") return false;
  try {
    const url = new URL(href, window.location.href);
    return url.pathname === window.location.pathname;
  } catch {
    return false;
  }
}

/**
 * Show the site loader immediately (e.g. before router.push).
 * Skips when only search/hash changes on the same pathname.
 * Notify asynchronously so callers never update NavigationLoader mid-render.
 */
export function showNavigationLoading(href?: string) {
  if (href && isSamePathNavigation(href)) return;
  queueMicrotask(() => {
    listeners.forEach((listener) => listener(true));
  });
}

export function hideNavigationLoading() {
  queueMicrotask(() => {
    listeners.forEach((listener) => listener(false));
  });
}
