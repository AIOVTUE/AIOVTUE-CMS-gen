/**
 * Shared helpers for AI summary features (safe for client + server).
 */

const stripHtml = (value: string) =>
  value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");

const normalizePlainText = (value: unknown): string => {
  if (value == null) return "";
  if (typeof value === "string") return stripHtml(value).replace(/\s+/g, " ").trim();
  if (typeof value === "object") {
    try {
      return stripHtml(JSON.stringify(value)).replace(/\s+/g, " ").trim();
    } catch {
      return "";
    }
  }
  return String(value).trim();
};

const isBlankAiSummary = (value: unknown) => !normalizePlainText(value);

export { stripHtml, normalizePlainText, isBlankAiSummary };
