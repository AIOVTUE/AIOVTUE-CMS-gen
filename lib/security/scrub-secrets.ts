/**
 * Strip credentials / tokens from strings before returning them to clients or logs.
 */
export function scrubSecrets(input: unknown): string {
  const text = String(input ?? "");
  return text
    .replace(/x-access-token:[^@\s/'"]+/gi, "x-access-token:***")
    .replace(
      /https?:\/\/[^/\s:'"]+:[^/\s@'"]+@/gi,
      (match) => match.replace(/:([^/@]+)@/, ":***@"),
    )
    .replace(/\bgh[pousr]_[A-Za-z0-9_]{20,}\b/g, "***")
    .replace(/\bgithub_pat_[A-Za-z0-9_]{20,}\b/g, "***")
    .replace(/\bghp_[A-Za-z0-9_]{20,}\b/g, "***")
    .replace(/\bBearer\s+[A-Za-z0-9\-._~+/]+=*/gi, "Bearer ***")
    // OpenAI / DeepSeek / SiliconFlow style keys
    .replace(/\bsk-[A-Za-z0-9_\-]{8,}\b/gi, "sk-***")
    .replace(/\bsk-or-[A-Za-z0-9_\-]{8,}\b/gi, "sk-or-***")
    // Common JSON / form fields that may embed secrets
    .replace(
      /("?(?:api[_-]?key|apiKey|access[_-]?token|authorization)"?\s*[:=]\s*")([^"]{8,})(")/gi,
      '$1***$3',
    )
    .replace(
      /("?(?:api[_-]?key|apiKey|access[_-]?token|authorization)"?\s*[:=]\s*')([^']{8,})(')/gi,
      "$1***$3",
    )
    // Cloudflare "accountId:apiToken" blobs (token side)
    .replace(
      /\b([a-f0-9]{32})[:|]([A-Za-z0-9_\-]{20,})\b/gi,
      "$1:***",
    );
}

/** Log server errors without leaking tokens / API keys. */
export function logServerError(error: unknown, context?: string) {
  const message = scrubSecrets(
    error instanceof Error
      ? `${error.name}: ${error.message}`
      : error,
  );
  if (context) {
    console.error(`[${context}] ${message}`);
    return;
  }
  console.error(message);
}
