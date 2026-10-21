import { sanitizeLoginBackgroundUrl } from "@/lib/login-credentials/sanitize-css-url";
import {
  DEFAULT_LOGIN_BG_DESKTOP,
  DEFAULT_LOGIN_BG_MOBILE,
  PAGE_BG_DESKTOP_VAR,
  PAGE_BG_MOBILE_VAR,
} from "@/lib/login-background/defaults";

export const PAGE_BACKGROUND_CHANGE_EVENT = "pagescms-page-background-change";

export function applyPageBackground(input: {
  desktopUrl?: string | null;
  mobileUrl?: string | null;
}) {
  if (typeof document === "undefined") return;

  const desktop = sanitizeLoginBackgroundUrl(
    input.desktopUrl ?? "",
    DEFAULT_LOGIN_BG_DESKTOP,
  );
  const mobile = sanitizeLoginBackgroundUrl(
    input.mobileUrl ?? "",
    DEFAULT_LOGIN_BG_MOBILE,
  );

  const root = document.documentElement;
  root.style.setProperty(PAGE_BG_DESKTOP_VAR, `url("${desktop}")`);
  root.style.setProperty(PAGE_BG_MOBILE_VAR, `url("${mobile}")`);
}

export function dispatchPageBackgroundChange(input: {
  desktopUrl: string;
  mobileUrl: string;
}) {
  applyPageBackground(input);
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(PAGE_BACKGROUND_CHANGE_EVENT, { detail: input }),
  );
}
