"use client";

import { useEffect } from "react";
import {
  PAGE_BACKGROUND_CHANGE_EVENT,
  applyPageBackground,
} from "@/lib/login-background/apply-page-background";
import {
  DEFAULT_LOGIN_BG_DESKTOP,
  DEFAULT_LOGIN_BG_MOBILE,
} from "@/lib/login-background/defaults";

export function PageBackgroundHydrator() {
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const response = await fetch("/api/login-background");
        if (!response.ok || cancelled) return;
        const payload = (await response.json()) as {
          data?: { desktopUrl?: string; mobileUrl?: string };
        };
        if (cancelled) return;
        applyPageBackground({
          desktopUrl: payload.data?.desktopUrl ?? DEFAULT_LOGIN_BG_DESKTOP,
          mobileUrl: payload.data?.mobileUrl ?? DEFAULT_LOGIN_BG_MOBILE,
        });
      } catch {
        if (!cancelled) {
          applyPageBackground({
            desktopUrl: DEFAULT_LOGIN_BG_DESKTOP,
            mobileUrl: DEFAULT_LOGIN_BG_MOBILE,
          });
        }
      }
    })();

    const onChange = (event: Event) => {
      const detail = (event as CustomEvent<{ desktopUrl: string; mobileUrl: string }>)
        .detail;
      if (!detail) return;
      applyPageBackground(detail);
    };
    window.addEventListener(PAGE_BACKGROUND_CHANGE_EVENT, onChange);
    return () => {
      cancelled = true;
      window.removeEventListener(PAGE_BACKGROUND_CHANGE_EVENT, onChange);
    };
  }, []);

  return null;
}
