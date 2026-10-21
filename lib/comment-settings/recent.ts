import "server-only";

import type {
  CommentProviderId,
  DashboardRecentComment,
} from "@/lib/comment-settings/types";
import { scrubSecrets } from "@/lib/security/scrub-secrets";
import { assertSafeOutboundUrl, safeOutboundFetch } from "@/lib/security/ssrf-guard";

const stripHtml = (value: string) =>
  value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const normalizeWalineComments = (payload: unknown): DashboardRecentComment[] => {
  const list = Array.isArray(payload)
    ? payload
    : Array.isArray((payload as { data?: unknown })?.data)
      ? ((payload as { data: unknown[] }).data)
      : [];

  return list.slice(0, 12).map((item, index) => {
    const row = (item ?? {}) as Record<string, unknown>;
    const commentRaw =
      typeof row.comment === "string"
        ? row.comment
        : typeof row.content === "string"
          ? row.content
          : "";
    const created =
      typeof row.time === "number"
        ? new Date(row.time).toISOString()
        : typeof row.insertedAt === "string"
          ? row.insertedAt
          : typeof row.createdAt === "string"
            ? row.createdAt
            : null;
    return {
      id: String(row.objectId ?? row.id ?? index),
      nick: String(row.nick ?? row.user_id ?? "访客"),
      comment: stripHtml(commentRaw).slice(0, 280),
      url: typeof row.url === "string" ? row.url : null,
      createdAt: created,
    };
  });
};

const normalizeTwikooComments = (payload: unknown): DashboardRecentComment[] => {
  const list = Array.isArray(payload)
    ? payload
    : Array.isArray((payload as { data?: unknown })?.data)
      ? ((payload as { data: unknown[] }).data)
      : [];

  return list.slice(0, 12).map((item, index) => {
    const row = (item ?? {}) as Record<string, unknown>;
    const commentRaw =
      typeof row.comment === "string"
        ? row.comment
        : typeof row.content === "string"
          ? row.content
          : "";
    const created =
      typeof row.created === "number"
        ? new Date(row.created).toISOString()
        : typeof row.createdAt === "string"
          ? row.createdAt
          : null;
    return {
      id: String(row.id ?? row._id ?? index),
      nick: String(row.nick ?? "访客"),
      comment: stripHtml(commentRaw).slice(0, 280),
      url: typeof row.url === "string" ? row.url : null,
      createdAt: created,
    };
  });
};

export const fetchRecentComments = async (options: {
  provider: CommentProviderId;
  serverUrl: string;
  limit?: number;
}): Promise<DashboardRecentComment[]> => {
  const provider = options.provider;
  const serverUrl = options.serverUrl.trim().replace(/\/$/, "");
  const limit = Math.min(Math.max(options.limit ?? 10, 1), 20);

  if (!provider || !serverUrl) return [];

  await assertSafeOutboundUrl(serverUrl);

  if (provider === "waline") {
    const url = new URL(`${serverUrl}/comment`);
    url.searchParams.set("type", "recent");
    url.searchParams.set("count", String(limit));
    const response = await safeOutboundFetch(url.toString(), {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (response.status >= 300 && response.status < 400) {
      throw new Error("Waline 请求被重定向，已拒绝。");
    }
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const message =
        (payload as { errmsg?: string; message?: string })?.errmsg ||
        (payload as { message?: string })?.message ||
        `Waline 请求失败（${response.status}）`;
      throw new Error(scrubSecrets(String(message)));
    }
    return normalizeWalineComments(payload);
  }

  // Twikoo cloud function / self-hosted endpoint
  const response = await safeOutboundFetch(serverUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      event: "GET_RECENT_COMMENTS",
      size: limit,
    }),
    cache: "no-store",
  });
  if (response.status >= 300 && response.status < 400) {
    throw new Error("Twikoo 请求被重定向，已拒绝。");
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      (payload as { message?: string })?.message ||
      `Twikoo 请求失败（${response.status}）`;
    throw new Error(scrubSecrets(String(message)));
  }
  return normalizeTwikooComments(payload);
};
