"use client";

import { cn } from "@/lib/utils";

type LoaderProps = {
  className?: string;
  children?: React.ReactNode;
  /** Visually hidden label for screen readers. */
  label?: string;
  /** Cover the viewport and center the animation on the whole page. */
  fullPage?: boolean;
  style?: React.CSSProperties;
};

/**
 * Loading overlay matching the Hugo blog PJAX loader
 * (loading.webp + dashed primary spinning ring).
 */
export function Loader({
  className = "",
  children,
  label = "加载中",
  fullPage = false,
  style,
}: LoaderProps) {
  return (
    <div
      className={cn(
        "cms-site-loader",
        fullPage ? "cms-site-loader--fullpage" : "relative",
        className,
      )}
      style={
        fullPage
          ? {
              position: "fixed",
              inset: 0,
              width: "100vw",
              height: "100dvh",
              // Below dialogs (z-50) would hide the spinner; keep above chrome
              // but allow Radix dialogs (z-50) — use 40 so open dialogs win.
              zIndex: 40,
              ...style,
            }
          : style
      }
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <div className="cms-site-loader__backdrop" aria-hidden>
        <div className="cms-site-loader__media">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="cms-site-loader__gif"
            src="/images/loading.webp"
            alt=""
            width={480}
            height={416}
            decoding="async"
            draggable={false}
          />
        </div>
      </div>
      {children ? (
        <div className="cms-site-loader__caption sr-only">{children}</div>
      ) : null}
    </div>
  );
}
