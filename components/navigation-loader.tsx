"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { NavigationOverlayLoader } from "@/components/content-pane-loader";
import {
  hideNavigationLoading,
  subscribeNavigationLoading,
} from "@/lib/navigation-loading";

function isModifiedClick(event: MouseEvent) {
  return event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
}

function samePathNavigation(url: URL) {
  return url.pathname === window.location.pathname;
}

function RouteChangeDismiss({ visible }: { visible: boolean }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const routeKey = `${pathname}?${searchParams.toString()}`;
  const routeWhenShownRef = useRef<string | null>(null);

  useEffect(() => {
    if (!visible) {
      routeWhenShownRef.current = null;
      return;
    }

    if (routeWhenShownRef.current == null) {
      routeWhenShownRef.current = routeKey;
      return;
    }

    if (routeWhenShownRef.current === routeKey) return;

    routeWhenShownRef.current = null;
    let inner = 0;
    const outer = window.requestAnimationFrame(() => {
      inner = window.requestAnimationFrame(() => {
        hideNavigationLoading();
      });
    });
    return () => {
      window.cancelAnimationFrame(outer);
      window.cancelAnimationFrame(inner);
    };
  }, [routeKey, visible]);

  return null;
}

/**
 * Instant loader for in-app navigations.
 * With the repo sidebar: centered in the right content pane.
 * Otherwise: full-page centered.
 */
export function NavigationLoader() {
  const [visible, setVisible] = useState(false);

  useEffect(() => subscribeNavigationLoading(setVisible), []);

  useEffect(() => {
    if (!visible) return;
    const timer = window.setTimeout(() => {
      setVisible(false);
      hideNavigationLoading();
    }, 8000);
    return () => window.clearTimeout(timer);
  }, [visible]);

  useEffect(() => {
    const onPopState = () => setVisible(true);
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || isModifiedClick(event)) {
        return;
      }

      const target = (event.target as Element | null)?.closest?.("a");
      if (!target) return;

      const anchor = target as HTMLAnchorElement;
      if (anchor.target && anchor.target !== "_self") return;
      if (anchor.hasAttribute("download")) return;

      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#")) return;
      if (/^(mailto|tel|javascript):/i.test(href)) return;

      let url: URL;
      try {
        url = new URL(href, window.location.href);
      } catch {
        return;
      }

      if (url.origin !== window.location.origin) return;
      // API / auth redirects are not App Router page navigations — showing the
      // overlay leaves it stuck over dialogs and home action buttons.
      if (url.pathname.startsWith("/api/")) return;
      if (samePathNavigation(url)) return;

      setVisible(true);
    };

    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  return (
    <>
      <Suspense fallback={null}>
        <RouteChangeDismiss visible={visible} />
      </Suspense>
      <NavigationOverlayLoader active={visible} />
    </>
  );
}
