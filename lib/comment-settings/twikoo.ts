import "server-only";

import { createHash } from "crypto";
import type { DashboardRecentComment } from "@/lib/comment-settings/types";
import { scrubSecrets } from "@/lib/security/scrub-secrets";
import {
  assertSafeOutboundUrl,
  safeOutboundFetch,
} from "@/lib/security/ssrf-guard";

const stripHtml = (value: string) =>
  value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Twikoo admin password is MD5'd on the client before LOGIN / accessToken. */
export const twikooAccessToken = (password: string) =>
  createHash("md5").update(password, "utf8").digest("hex");

type TwikooAdminListResult = {
  comments: DashboardRecentComment[];
  total: number;
};

const normalizeAdminRow = (
  item: unknown,
  index: number,
): DashboardRecentComment => {
  const row = (item ?? {}) as Record<string, unknown>;
  const commentRaw =
    typeof row.comment === "string"
      ? row.comment
      : typeof row.commentText === "string"
        ? row.commentText
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
    // Twikoo LokiDB / Mongo 主键为 _id，管理接口也用它
    id: String(row._id ?? row.id ?? index),
    nick: String(row.nick ?? "访客"),
    comment: stripHtml(commentRaw).slice(0, 500),
    url:
      typeof row.url === "string"
        ? row.url
        : typeof row.href === "string"
          ? row.href
          : null,
    mail: typeof row.mail === "string" ? row.mail : null,
    ip: typeof row.ip === "string" ? row.ip : null,
    isSpam: typeof row.isSpam === "boolean" ? row.isSpam : null,
    createdAt: created,
  };
};

const postTwikoo = async (
  serverUrl: string,
  body: Record<string, unknown>,
) => {
  await assertSafeOutboundUrl(serverUrl);
  const response = await safeOutboundFetch(serverUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
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
  return payload as Record<string, unknown> | null;
};

/**
 * List comments via Twikoo admin API (self-hosted / Vercel).
 * Uses MD5(password) as accessToken — same as Twikoo frontend admin panel.
 */
export const fetchTwikooAdminComments = async (options: {
  serverUrl: string;
  password: string;
  page?: number;
  per?: number;
  keyword?: string;
  type?: "" | "VISIBLE" | "HIDDEN";
}): Promise<TwikooAdminListResult> => {
  const serverUrl = options.serverUrl.trim().replace(/\/$/, "");
  const password = options.password.trim();
  if (!serverUrl || !password) {
    throw Object.assign(new Error("请先在设置中填写 Twikoo 地址与管理密码。"), {
      status: 400,
    });
  }

  const accessToken = twikooAccessToken(password);
  const page = Math.max(1, options.page ?? 1);
  const per = Math.min(Math.max(options.per ?? 20, 1), 50);

  const payload = await postTwikoo(serverUrl, {
    event: "COMMENT_GET_FOR_ADMIN",
    accessToken,
    page,
    per,
    ...(options.keyword?.trim()
      ? { keyword: options.keyword.trim() }
      : {}),
    ...(options.type ? { type: options.type } : {}),
  });

  const code = Number((payload as { code?: number })?.code ?? 0);
  if (code && code !== 0) {
    const message =
      (payload as { message?: string })?.message ||
      (code === 1001 || code === 1000 ? "Twikoo 管理密码错误或未登录" : "Twikoo 管理接口失败");
    throw new Error(scrubSecrets(String(message)));
  }

  const list = Array.isArray((payload as { data?: unknown })?.data)
    ? ((payload as { data: unknown[] }).data)
    : [];
  const total = Number((payload as { count?: number })?.count ?? list.length);

  return {
    comments: list.map((item, index) => normalizeAdminRow(item, index)),
    total: Number.isFinite(total) ? total : list.length,
  };
};

const assertAdminOk = (payload: Record<string, unknown> | null, fallback: string) => {
  const code = Number(payload?.code ?? 0);
  if (code && code !== 0) {
    const message =
      (typeof payload?.message === "string" && payload.message.trim()) ||
      (code === 1001 || code === 1000
        ? "Twikoo 管理密码错误或未登录"
        : fallback);
    throw Object.assign(new Error(scrubSecrets(String(message))), {
      status: code === 1001 || code === 1000 ? 401 : 400,
    });
  }
};

const requireTwikooAdmin = (options: {
  serverUrl: string;
  password: string;
  id: string;
}) => {
  const serverUrl = options.serverUrl.trim().replace(/\/$/, "");
  const password = options.password.trim();
  const id = options.id.trim();
  if (!serverUrl || !password) {
    throw Object.assign(new Error("请先在设置中填写 Twikoo 地址与管理密码。"), {
      status: 400,
    });
  }
  if (!id || id.length > 128) {
    throw Object.assign(new Error("评论 ID 无效。"), { status: 400 });
  }
  return {
    serverUrl,
    accessToken: twikooAccessToken(password),
    id,
  };
};

/** Hide / unhide / pin via COMMENT_SET_FOR_ADMIN. */
export const setTwikooAdminComment = async (options: {
  serverUrl: string;
  password: string;
  id: string;
  set: { isSpam?: boolean; top?: boolean };
}) => {
  const { serverUrl, accessToken, id } = requireTwikooAdmin(options);
  const set: Record<string, boolean> = {};
  if (typeof options.set.isSpam === "boolean") set.isSpam = options.set.isSpam;
  if (typeof options.set.top === "boolean") set.top = options.set.top;
  if (Object.keys(set).length === 0) {
    throw Object.assign(new Error("未指定要修改的字段。"), { status: 400 });
  }

  const payload = await postTwikoo(serverUrl, {
    event: "COMMENT_SET_FOR_ADMIN",
    accessToken,
    id,
    set,
  });
  assertAdminOk(payload, "修改评论失败");
  return { ok: true as const };
};

/** Delete via COMMENT_DELETE_FOR_ADMIN. */
export const deleteTwikooAdminComment = async (options: {
  serverUrl: string;
  password: string;
  id: string;
}) => {
  const { serverUrl, accessToken, id } = requireTwikooAdmin(options);
  const payload = await postTwikoo(serverUrl, {
    event: "COMMENT_DELETE_FOR_ADMIN",
    accessToken,
    id,
  });
  assertAdminOk(payload, "删除评论失败");
  return { ok: true as const };
};

const MAX_BACKUP_PAGES = 200;
const BACKUP_PAGE_SIZE = 50;

/** Paginate all admin comments for backup export (raw-ish rows). */
export const exportTwikooAdminComments = async (options: {
  serverUrl: string;
  password: string;
}): Promise<{ comments: Record<string, unknown>[]; total: number }> => {
  const serverUrl = options.serverUrl.trim().replace(/\/$/, "");
  const password = options.password.trim();
  if (!serverUrl || !password) {
    throw Object.assign(new Error("请先在设置中填写 Twikoo 地址与管理密码。"), {
      status: 400,
    });
  }
  const accessToken = twikooAccessToken(password);
  const comments: Record<string, unknown>[] = [];
  let total = 0;

  for (let page = 1; page <= MAX_BACKUP_PAGES; page += 1) {
    const payload = await postTwikoo(serverUrl, {
      event: "COMMENT_GET_FOR_ADMIN",
      accessToken,
      page,
      per: BACKUP_PAGE_SIZE,
    });
    assertAdminOk(payload, "导出评论失败");

    const list = Array.isArray(payload?.data) ? payload.data : [];
    total = Number(payload?.count ?? total);
    for (const item of list) {
      if (item && typeof item === "object") {
        comments.push(item as Record<string, unknown>);
      }
    }
    if (list.length < BACKUP_PAGE_SIZE) break;
    if (Number.isFinite(total) && comments.length >= total) break;
  }

  return {
    comments,
    total: Number.isFinite(total) && total > 0 ? total : comments.length,
  };
};
