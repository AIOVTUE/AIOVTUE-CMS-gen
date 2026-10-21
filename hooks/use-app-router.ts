"use client";

import { useRouter } from "next/navigation";
import { showNavigationLoading } from "@/lib/navigation-loading";

type AppRouter = ReturnType<typeof useRouter>;

const encSeg = (segment: string) => {
  try {
    return encodeURIComponent(decodeURIComponent(segment)).replace(/\./g, "%2E");
  } catch {
    return encodeURIComponent(segment).replace(/\./g, "%2E");
  }
};

/**
 * Normalize in-app hrefs so soft navigation always uses stable encoding
 * (Chinese repo names + edit paths with `.ts` / nested folders).
 */
const normalizeAppHref = (href: string): string => {
  if (!href.startsWith("/") || href.startsWith("//") || href.startsWith("/api/")) {
    return href;
  }
  try {
    const url = new URL(href, "http://cms.local");
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length < 3) return href;
    url.pathname = `/${parts.map(encSeg).join("/")}`;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return href;
  }
};

/**
 * useRouter that shows the site navigation loader before path-changing
 * push/replace/back/forward (same-path query updates are skipped).
 */
export function useAppRouter(): AppRouter {
  const router = useRouter();

  return {
    ...router,
    push: (href, options) => {
      const next = normalizeAppHref(String(href));
      showNavigationLoading(next);
      return router.push(next, options);
    },
    replace: (href, options) => {
      const next = normalizeAppHref(String(href));
      showNavigationLoading(next);
      return router.replace(next, options);
    },
    back: () => {
      showNavigationLoading();
      return router.back();
    },
    forward: () => {
      showNavigationLoading();
      return router.forward();
    },
  };
}
