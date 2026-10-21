const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

/**
 * Only allow same-origin relative paths.
 * Blocks open redirects, protocol-relative URLs, backslashes, and control chars.
 */
const getSafeRedirect = (redirectTo?: string) => {
  if (!redirectTo || typeof redirectTo !== "string") return "/";

  let value = redirectTo.trim();
  if (!value) return "/";

  // Decode repeatedly to catch double-encoding (/%252F%252Fevil).
  for (let i = 0; i < 3; i += 1) {
    try {
      const decoded = decodeURIComponent(value);
      if (decoded === value) break;
      value = decoded;
    } catch {
      return "/";
    }
  }

  value = value.trim();
  if (!value.startsWith("/")) return "/";
  if (value.startsWith("//")) return "/";
  if (value.includes("\\")) return "/";
  if (value.includes("@")) return "/";
  if (CONTROL_CHARS.test(value)) return "/";
  // Disallow scheme-like segments after a slash (e.g. /javascript:alert(1))
  if (/^\/[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value)) return "/";
  // Block path traversal segments
  const segments = value.split("/");
  if (segments.some((segment) => segment === "..")) return "/";

  return value;
};

const getAuthCallbackURL = (redirectTo?: string) => {
  const safeRedirect = getSafeRedirect(redirectTo);
  return safeRedirect === "/"
    ? "/"
    : `/auth/redirect?to=${encodeURIComponent(safeRedirect)}`;
};

export { getAuthCallbackURL, getSafeRedirect };
