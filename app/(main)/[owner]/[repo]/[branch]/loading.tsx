"use client";

import { NavigationOverlayLoader } from "@/components/content-pane-loader";

/**
 * Soft-nav loading inside a repo: centered in the right content pane.
 * Full page refresh still uses app/(main)/loading.tsx (full-page center).
 */
export default function Loading() {
  return <NavigationOverlayLoader active />;
}
