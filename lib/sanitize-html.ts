import DOMPurify from "isomorphic-dompurify";

/**
 * Sanitize HTML for CMS markdown / notice previews.
 * Prefer a real allowlist sanitizer over regex stripping.
 */
export function sanitizeHtml(html: string): string {
  if (!html) return "";

  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: [
      "script",
      "iframe",
      "object",
      "embed",
      "link",
      "meta",
      "base",
      "form",
      "input",
      "button",
      "textarea",
      "select",
    ],
    FORBID_ATTR: ["style"],
    ALLOW_DATA_ATTR: false,
    ALLOW_UNKNOWN_PROTOCOLS: false,
  });
}

/** Allow only SVG markup for trusted decorative icons. */
export function sanitizeSvgIcon(html: string): string {
  if (!html) return "";
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { svg: true, svgFilters: true },
    FORBID_TAGS: ["script", "foreignObject", "iframe", "a"],
    ALLOW_DATA_ATTR: false,
    ALLOW_UNKNOWN_PROTOCOLS: false,
  });
}
