"use client";

import { useEffect } from "react";
import { formatDocumentTitle } from "@/lib/document-title";

export function DocumentTitle({
  title,
}: {
  title?: string | null;
}) {
  useEffect(() => {
    document.title = formatDocumentTitle(title);
  }, [title]);

  return null;
}
