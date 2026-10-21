"use client";

import { useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Loader } from "@/components/loader";

/** Right content pane (`main` under SidebarInset). */
export const CMS_PAGE_SHELL_ATTR = "data-cms-page-shell";
export const CMS_PAGE_SHELL_LOADING_CLASS = "cms-page-shell--loading";

export function getPageShell(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  return document.querySelector<HTMLElement>(`[${CMS_PAGE_SHELL_ATTR}]`);
}

function getMainRootMain(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  return document.querySelector<HTMLElement>(".main-root-shell__main");
}

function setContentHidden(hidden: boolean) {
  const targets = [getPageShell(), getMainRootMain()].filter(
    (el): el is HTMLElement => Boolean(el),
  );
  for (const el of targets) {
    el.classList.toggle(CMS_PAGE_SHELL_LOADING_CLASS, hidden);
  }
}

type ShellRect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

export function useShellRect(active: boolean): ShellRect | null {
  const [rect, setRect] = useState<ShellRect | null>(null);

  useLayoutEffect(() => {
    if (!active) {
      setRect(null);
      return;
    }

    let frame = 0;
    const update = () => {
      const shell = getPageShell();
      if (!shell) {
        setRect(null);
        return;
      }
      // Shell can be taller than the viewport (long pages). Center in the
      // visible intersection so the spinner stays mid-pane, not mid-document.
      const next = shell.getBoundingClientRect();
      const top = Math.max(0, next.top);
      const left = Math.max(0, next.left);
      const bottom = Math.min(window.innerHeight, next.bottom);
      const right = Math.min(window.innerWidth, next.right);
      const width = right - left;
      const height = bottom - top;
      if (width <= 0 || height <= 0) {
        setRect(null);
        return;
      }
      setRect({ top, left, width, height });
    };

    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };

    update();
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);

    const shell = getPageShell();
    const resizeObserver =
      shell && typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(schedule)
        : null;
    if (shell && resizeObserver) resizeObserver.observe(shell);

    const mutationObserver = new MutationObserver(schedule);
    mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
    });

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
      resizeObserver?.disconnect();
      mutationObserver.disconnect();
    };
  }, [active]);

  return rect;
}

/**
 * Loader centered in the right content pane when the repo shell exists;
 * otherwise full-page centered (e.g. outside repo layout).
 */
export function NavigationOverlayLoader({
  active,
  label = "页面加载中",
}: {
  active: boolean;
  label?: string;
}) {
  const rect = useShellRect(active);

  useLayoutEffect(() => {
    setContentHidden(active);
    return () => setContentHidden(false);
  }, [active]);

  if (!active || typeof document === "undefined") return null;

  const node =
    rect && rect.width > 0 && rect.height > 0 ? (
      <Loader
        label={label}
        className="cms-site-loader--pane"
        style={{
          position: "fixed",
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height,
          zIndex: 40,
          minHeight: 0,
        }}
      />
    ) : (
      <Loader fullPage label={label} />
    );

  return createPortal(node, document.body);
}
