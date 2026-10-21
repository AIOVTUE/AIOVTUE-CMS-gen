import "server-only";

/** Client IP from reverse-proxy headers (Vercel / nginx). */
export const getRequestIpFromHeaders = (headers: Headers): string | null => {
  const forwarded = headers.get("x-forwarded-for");
  return (
    forwarded?.split(",")[0]?.trim() ||
    headers.get("x-real-ip") ||
    null
  );
};
