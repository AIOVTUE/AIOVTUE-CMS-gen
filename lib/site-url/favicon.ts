const normalizeHostname = (hostname: string) => hostname.trim().toLowerCase();

/** Favicon URL that falls back to a generic icon instead of 404 for missing sites. */
export function faviconUrlFromHostname(hostname: string): string {
  const normalized = normalizeHostname(hostname);
  if (!normalized || !normalized.includes(".")) return "";
  return `https://icons.duckduckgo.com/ip3/${encodeURIComponent(normalized)}.ico`;
}

/** Build a favicon URL from a site's public address. */
export function faviconUrlFromSite(siteUrl: string): string {
  const trimmed = siteUrl.trim();
  if (!trimmed) return "";
  try {
    const { hostname } = new URL(trimmed);
    return faviconUrlFromHostname(hostname);
  } catch {
    return "";
  }
}

/** Build a favicon URL from a referrer URL or hostname. */
export function faviconUrlFromReferrer(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";

  const candidate = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : trimmed.startsWith("//")
      ? `https:${trimmed}`
      : `https://${trimmed}`;

  try {
    const { hostname } = new URL(candidate);
    return faviconUrlFromHostname(hostname);
  } catch {
    return faviconUrlFromHostname(trimmed);
  }
}
