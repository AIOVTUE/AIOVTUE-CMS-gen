"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { marked } from "marked";
import { cn } from "@/lib/utils";
import {
  bindSitePreviewInteractions,
  enhanceSiteMarkdownHtml,
} from "@/lib/site-markdown-preview";
import { sanitizeHtml } from "@/lib/sanitize-html";
import "./entry-preview.css";

marked.setOptions({
  gfm: true,
  breaks: true,
});

const MarkdownPreview = ({
  markdown,
  className,
  emptyMessage = "暂无内容",
}: {
  markdown: string;
  className?: string;
  emptyMessage?: string;
}) => {
  const rootRef = useRef<HTMLDivElement>(null);

  const parsedHtml = useMemo(() => {
    const source = markdown?.trim();
    if (!source) return "";
    try {
      return marked.parse(source, { async: false }) as string;
    } catch {
      return "";
    }
  }, [markdown]);

  const [html, setHtml] = useState(parsedHtml);

  useEffect(() => {
    if (!parsedHtml) {
      setHtml("");
      return;
    }
    setHtml(sanitizeHtml(enhanceSiteMarkdownHtml(parsedHtml)));
  }, [parsedHtml]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || !html) return;
    return bindSitePreviewInteractions(root);
  }, [html]);

  if (!html) {
    return (
      <div
        className={cn(
          "entry-site-preview prose markdown-body sakura-post-content text-muted-foreground",
          className,
        )}
      >
        <p>{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      className={cn(
        "entry-site-preview prose markdown-body sakura-post-content",
        className,
      )}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
};

export { MarkdownPreview };
