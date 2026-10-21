"use client";

import { Field } from "@/types/field";
import { marked } from "marked";

const stripHtml = (text: string) =>
  text
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();

const collectInlineText = (tokens: unknown[]): string => {
  const parts: string[] = [];

  for (const token of tokens as Array<Record<string, unknown>>) {
    const type = token.type;
    if (typeof type !== "string") continue;

    if (type === "text" || type === "escape" || type === "codespan") {
      if (typeof token.text === "string") parts.push(token.text);
      continue;
    }

    if (type === "link" || type === "strong" || type === "em" || type === "del") {
      if (Array.isArray(token.tokens)) parts.push(collectInlineText(token.tokens));
      else if (typeof token.text === "string") parts.push(token.text);
      continue;
    }

    if (type === "image") {
      if (typeof token.text === "string" && token.text.trim()) parts.push(token.text);
      continue;
    }

    if (Array.isArray(token.tokens)) {
      parts.push(collectInlineText(token.tokens));
    }
  }

  return parts.join(" ");
};

/** First meaningful line/block for collection list previews. */
const markdownFirstLine = (input: string): string => {
  try {
    const tokens = marked.lexer(input, { gfm: true });

    for (const token of tokens as Array<Record<string, unknown>>) {
      const type = token.type;
      if (typeof type !== "string") continue;
      if (type === "space" || type === "hr") continue;

      if (type === "heading" || type === "paragraph") {
        const text = Array.isArray(token.tokens)
          ? collectInlineText(token.tokens)
          : typeof token.text === "string"
            ? token.text
            : "";
        const cleaned = stripHtml(text);
        if (cleaned) return cleaned;
        continue;
      }

      if (type === "list" && Array.isArray(token.items)) {
        const firstItem = token.items[0] as Record<string, unknown> | undefined;
        if (!firstItem) continue;
        const text = Array.isArray(firstItem.tokens)
          ? collectInlineText(firstItem.tokens)
          : typeof firstItem.text === "string"
            ? firstItem.text
            : "";
        const cleaned = stripHtml(text);
        if (cleaned) return cleaned;
        continue;
      }

      if (type === "code" && typeof token.text === "string") {
        const cleaned = token.text.split(/\r?\n/).find((line) => line.trim())?.trim();
        if (cleaned) return cleaned;
        continue;
      }
    }
  } catch {
    // fall through
  }

  const fallback = stripHtml(input).split(/\r?\n/).find((line) => line.trim());
  return fallback?.trim() || "";
};

const ViewComponent = ({
  value,
  field
}: {
  value: string,
  field: Field
}) => {
  if (!value) return null;
  void field;

  if (Array.isArray(value)) {
    return value.map(markdownFirstLine).filter(Boolean).join(", ");
  }

  return markdownFirstLine(value);
};

export { ViewComponent };
