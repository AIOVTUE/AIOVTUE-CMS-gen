const SAFE_LOCAL_PATH = /^\/[^\s"'()\\]+$/;
const SAFE_HTTP_URL = /^https?:\/\/[^\s"'()\\]+$/i;

export function sanitizeLoginBackgroundUrl(
  url: string,
  fallback: string,
): string {
  const trimmed = url.trim();
  if (SAFE_LOCAL_PATH.test(trimmed) || SAFE_HTTP_URL.test(trimmed)) {
    return trimmed;
  }
  return fallback;
}
