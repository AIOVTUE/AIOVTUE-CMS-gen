import "server-only";

import {
  assertSafeOutboundUrl,
  fetchValidatedOutboundUrl,
} from "@/lib/security/ssrf-guard";
import { scrubSecrets } from "@/lib/security/scrub-secrets";
import type {
  MemosAdminComment,
  MemosAdminCommentsPage,
  MemosAdminLike,
  MemosAdminLikesPage,
  MemosEngagePost,
  MemosEngagePostsPage,
  MemosPost,
  MemosPostInput,
  MemosPostsPage,
} from "@/lib/memos-settings/types";

type ApiEnvelope<T> = {
  ok?: boolean;
  data?: T;
  error?: string;
  meta?: { total?: number; limit?: number; offset?: number };
  token?: string;
  expires_in?: number;
};

type TokenCacheEntry = {
  token: string;
  expiresAt: number;
};

const tokenCache = new Map<string, TokenCacheEntry>();
const tokenInflight = new Map<string, Promise<string>>();
const MAX_IMAGES = 9;
const MAX_CONTENT_LENGTH = 20000;
const MAX_LIMIT = 50;
const MAX_ADMIN_LIMIT = 200;

const cacheKey = (userId: string, apiUrl: string, username: string) =>
  `${userId}::${apiUrl}::${username}`;

const resolveEndpoint = (validatedBase: URL, path: string) => {
  const endpoint = new URL(path, validatedBase);
  if (endpoint.origin !== validatedBase.origin) {
    throw Object.assign(new Error("动态 API 地址无效。"), { status: 400 });
  }
  return endpoint;
};

const isAllowedImageUrl = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) return true;
  try {
    const url = new URL(trimmed);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
};

export const normalizeMemosImages = (images: unknown): string[] => {
  if (!Array.isArray(images)) return [];
  const out: string[] = [];
  for (const item of images) {
    if (typeof item !== "string") continue;
    const trimmed = item.trim();
    if (!trimmed || !isAllowedImageUrl(trimmed)) continue;
    out.push(trimmed);
    if (out.length >= MAX_IMAGES) break;
  }
  return out;
};

export const normalizeMemosPostInput = (input: {
  content?: unknown;
  images?: unknown;
  created_at?: unknown;
}): MemosPostInput => {
  const content =
    typeof input.content === "string" ? input.content.trim() : "";
  const images = normalizeMemosImages(input.images);
  if (!content && images.length === 0) {
    throw Object.assign(new Error("正文与图片不能同时为空。"), { status: 400 });
  }
  if (content.length > MAX_CONTENT_LENGTH) {
    throw Object.assign(new Error("正文过长。"), { status: 400 });
  }

  let created_at: number | null = null;
  if (
    typeof input.created_at === "number" &&
    Number.isFinite(input.created_at) &&
    input.created_at > 0
  ) {
    created_at = Math.floor(input.created_at);
  }

  return { content, images, created_at };
};

const normalizePost = (raw: unknown): MemosPost | null => {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const id = typeof row.id === "string" ? row.id.trim() : "";
  if (!id) return null;
  return {
    id,
    content: typeof row.content === "string" ? row.content : "",
    images: normalizeMemosImages(row.images),
    created_at:
      typeof row.created_at === "number" && Number.isFinite(row.created_at)
        ? row.created_at
        : 0,
    updated_at:
      typeof row.updated_at === "number" && Number.isFinite(row.updated_at)
        ? row.updated_at
        : 0,
    like_count:
      typeof row.like_count === "number" && Number.isFinite(row.like_count)
        ? row.like_count
        : 0,
    comment_count:
      typeof row.comment_count === "number" && Number.isFinite(row.comment_count)
        ? row.comment_count
        : 0,
    liked: Boolean(row.liked),
    likers: Array.isArray(row.likers)
      ? row.likers
          .map((item) => {
            if (!item || typeof item !== "object") return null;
            const name = String((item as { name?: unknown }).name ?? "").trim();
            return name ? { name } : null;
          })
          .filter(Boolean) as Array<{ name: string }>
      : [],
    comments: Array.isArray(row.comments)
      ? (row.comments as MemosPost["comments"])
      : [],
  };
};

const readJson = async <T>(response: Response): Promise<ApiEnvelope<T>> => {
  const payload = (await response.json().catch(() => null)) as ApiEnvelope<T> | null;
  if (!payload || typeof payload !== "object") {
    throw Object.assign(new Error("动态 API 返回了无效响应。"), {
      status: response.status || 502,
    });
  }
  return payload;
};

const assertOk = <T>(payload: ApiEnvelope<T>, status: number) => {
  if (payload.ok) return;
  const message =
    typeof payload.error === "string" && payload.error.trim()
      ? payload.error.trim()
      : `动态 API 请求失败（${status}）`;
  throw Object.assign(new Error(scrubSecrets(message)), {
    status: status === 401 ? 401 : status >= 400 && status < 600 ? status : 500,
  });
};

const loginForToken = async (options: {
  userId: string;
  apiUrl: string;
  username: string;
  password: string;
  validatedBase: URL;
}) => {
  const username = options.username.trim();
  const password = options.password.trim();
  if (!username) {
    throw Object.assign(
      new Error("请先在设置中填写动态 API 管理账号。"),
      { status: 400 },
    );
  }
  if (!password) {
    throw Object.assign(
      new Error("请先在设置中填写动态 API 管理密码。"),
      { status: 400 },
    );
  }

  const endpoint = resolveEndpoint(options.validatedBase, "/api/auth/login");
  const response = await fetchValidatedOutboundUrl(endpoint, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ username, password }),
    cache: "no-store",
  });

  if (response.status >= 300 && response.status < 400) {
    throw Object.assign(new Error("动态 API 登录被重定向，已拒绝。"), {
      status: 400,
    });
  }

  const payload = await readJson<unknown>(response);
  if (!response.ok || !payload.ok || typeof payload.token !== "string") {
    const message =
      typeof payload.error === "string" && payload.error.trim()
        ? payload.error.trim()
        : "动态 API 账号或密码校验失败，请在设置中更新凭据。";
    throw Object.assign(new Error(scrubSecrets(message)), { status: 401 });
  }

  const expiresIn =
    typeof payload.expires_in === "number" && payload.expires_in > 0
      ? payload.expires_in
      : 86400;
  const entry: TokenCacheEntry = {
    token: payload.token,
    expiresAt: Date.now() + Math.max(60, expiresIn - 60) * 1000,
  };
  tokenCache.set(
    cacheKey(options.userId, options.apiUrl, username),
    entry,
  );
  return entry.token;
};

const getAdminToken = async (options: {
  userId: string;
  apiUrl: string;
  username: string;
  password: string;
  validatedBase: URL;
  forceRefresh?: boolean;
}) => {
  const key = cacheKey(
    options.userId,
    options.apiUrl,
    options.username.trim(),
  );
  if (!options.forceRefresh) {
    const cached = tokenCache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.token;
    }
    const pending = tokenInflight.get(key);
    if (pending) return pending;
  }

  const promise = loginForToken(options).finally(() => {
    if (tokenInflight.get(key) === promise) {
      tokenInflight.delete(key);
    }
  });
  tokenInflight.set(key, promise);
  return promise;
};

const requestJson = async <T>(options: {
  validatedBase: URL;
  path: string;
  method?: string;
  body?: unknown;
  token?: string;
}): Promise<{ status: number; payload: ApiEnvelope<T> }> => {
  const endpoint = resolveEndpoint(options.validatedBase, options.path);
  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }

  const response = await fetchValidatedOutboundUrl(endpoint, {
    method: options.method || "GET",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    cache: "no-store",
  });

  if (response.status >= 300 && response.status < 400) {
    throw Object.assign(new Error("动态 API 请求被重定向，已拒绝。"), {
      status: 400,
    });
  }

  const payload = await readJson<T>(response);
  return { status: response.status, payload };
};

const withAdmin = async <T>(options: {
  userId: string;
  apiUrl: string;
  username: string;
  password: string;
  run: (token: string, validatedBase: URL) => Promise<T>;
}): Promise<T> => {
  const validatedBase = await assertSafeOutboundUrl(options.apiUrl);
  let token = await getAdminToken({
    userId: options.userId,
    apiUrl: options.apiUrl,
    username: options.username,
    password: options.password,
    validatedBase,
  });

  try {
    return await options.run(token, validatedBase);
  } catch (error: unknown) {
    const status =
      error && typeof error === "object" && "status" in error
        ? Number((error as { status?: unknown }).status)
        : 0;
    if (status !== 401) throw error;

    token = await getAdminToken({
      userId: options.userId,
      apiUrl: options.apiUrl,
      username: options.username,
      password: options.password,
      validatedBase,
      forceRefresh: true,
    });
    return options.run(token, validatedBase);
  }
};

export const listMemosPosts = async (options: {
  apiUrl: string;
  limit?: number;
  offset?: number;
}): Promise<MemosPostsPage> => {
  const validatedBase = await assertSafeOutboundUrl(options.apiUrl);
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Math.floor(options.limit ?? 20)),
  );
  const offset = Math.max(0, Math.floor(options.offset ?? 0));
  const { status, payload } = await requestJson<unknown[]>({
    validatedBase,
    path: `/api/posts?limit=${limit}&offset=${offset}`,
  });
  assertOk(payload, status);
  if (!Array.isArray(payload.data)) {
    return { posts: [], total: 0, limit, offset };
  }
  const posts = payload.data
    .map((item) => normalizePost(item))
    .filter(Boolean) as MemosPost[];
  return {
    posts,
    total:
      typeof payload.meta?.total === "number" ? payload.meta.total : posts.length,
    limit:
      typeof payload.meta?.limit === "number" ? payload.meta.limit : limit,
    offset:
      typeof payload.meta?.offset === "number" ? payload.meta.offset : offset,
  };
};

export const createMemosPost = async (options: {
  userId: string;
  apiUrl: string;
  username: string;
  password: string;
  input: MemosPostInput;
}): Promise<MemosPost> => {
  return withAdmin({
    userId: options.userId,
    apiUrl: options.apiUrl,
    username: options.username,
    password: options.password,
    run: async (token, validatedBase) => {
      const body: Record<string, unknown> = {
        content: options.input.content,
        images: options.input.images,
      };
      if (options.input.created_at) {
        body.created_at = options.input.created_at;
      }
      const { status, payload } = await requestJson<unknown>({
        validatedBase,
        path: "/api/posts",
        method: "POST",
        token,
        body,
      });
      assertOk(payload, status);
      const post = normalizePost(payload.data);
      if (!post) {
        throw Object.assign(new Error("动态 API 未返回有效数据。"), {
          status: 502,
        });
      }
      return post;
    },
  });
};

export const updateMemosPost = async (options: {
  userId: string;
  apiUrl: string;
  username: string;
  password: string;
  id: string;
  input: MemosPostInput;
}): Promise<MemosPost> => {
  const id = options.id.trim();
  if (!id) {
    throw Object.assign(new Error("缺少动态 ID。"), { status: 400 });
  }
  return withAdmin({
    userId: options.userId,
    apiUrl: options.apiUrl,
    username: options.username,
    password: options.password,
    run: async (token, validatedBase) => {
      const body: Record<string, unknown> = {
        content: options.input.content,
        images: options.input.images,
      };
      if (options.input.created_at) {
        body.created_at = options.input.created_at;
      }
      const { status, payload } = await requestJson<unknown>({
        validatedBase,
        path: `/api/posts/${encodeURIComponent(id)}`,
        method: "PUT",
        token,
        body,
      });
      assertOk(payload, status);
      const post = normalizePost(payload.data);
      if (!post) {
        throw Object.assign(new Error("动态 API 未返回有效数据。"), {
          status: 502,
        });
      }
      return post;
    },
  });
};

export const deleteMemosPost = async (options: {
  userId: string;
  apiUrl: string;
  username: string;
  password: string;
  id: string;
}): Promise<void> => {
  const id = options.id.trim();
  if (!id) {
    throw Object.assign(new Error("缺少动态 ID。"), { status: 400 });
  }
  await withAdmin({
    userId: options.userId,
    apiUrl: options.apiUrl,
    username: options.username,
    password: options.password,
    run: async (token, validatedBase) => {
      const { status, payload } = await requestJson<unknown>({
        validatedBase,
        path: `/api/posts/${encodeURIComponent(id)}`,
        method: "DELETE",
        token,
      });
      assertOk(payload, status);
    },
  });
};

const clampAdminLimit = (value?: number) =>
  Math.min(MAX_ADMIN_LIMIT, Math.max(1, Math.floor(value ?? 50)));

const clampOffset = (value?: number) => Math.max(0, Math.floor(value ?? 0));

const normalizeEngagePost = (
  raw: unknown,
  kind: "comments" | "likes",
): MemosEngagePost | null => {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const id = typeof row.id === "string" ? row.id.trim() : "";
  if (!id) return null;
  return {
    id,
    content: typeof row.content === "string" ? row.content : "",
    created_at:
      typeof row.created_at === "number" && Number.isFinite(row.created_at)
        ? row.created_at
        : 0,
    last_at:
      typeof row.last_at === "number" && Number.isFinite(row.last_at)
        ? row.last_at
        : typeof row.created_at === "number" && Number.isFinite(row.created_at)
          ? row.created_at
          : 0,
    comment_count:
      kind === "comments" &&
      typeof row.comment_count === "number" &&
      Number.isFinite(row.comment_count)
        ? row.comment_count
        : undefined,
    like_count:
      kind === "likes" &&
      typeof row.like_count === "number" &&
      Number.isFinite(row.like_count)
        ? row.like_count
        : undefined,
  };
};

const listEngagePosts = async (options: {
  userId: string;
  apiUrl: string;
  username: string;
  password: string;
  kind: "comments" | "likes";
  limit?: number;
  offset?: number;
}): Promise<MemosEngagePostsPage> => {
  const limit = clampAdminLimit(options.limit);
  const offset = clampOffset(options.offset);
  const path =
    options.kind === "comments"
      ? `/api/admin/comment-posts?limit=${limit}&offset=${offset}`
      : `/api/admin/like-posts?limit=${limit}&offset=${offset}`;

  return withAdmin({
    userId: options.userId,
    apiUrl: options.apiUrl,
    username: options.username,
    password: options.password,
    run: async (token, validatedBase) => {
      const { status, payload } = await requestJson<unknown[]>({
        validatedBase,
        path,
        token,
      });
      assertOk(payload, status);
      const posts = Array.isArray(payload.data)
        ? (payload.data
            .map((item) => normalizeEngagePost(item, options.kind))
            .filter(Boolean) as MemosEngagePost[])
        : [];
      return {
        posts,
        total:
          typeof payload.meta?.total === "number"
            ? payload.meta.total
            : posts.length,
        limit:
          typeof payload.meta?.limit === "number" ? payload.meta.limit : limit,
        offset:
          typeof payload.meta?.offset === "number"
            ? payload.meta.offset
            : offset,
      };
    },
  });
};

export const listMemosCommentPosts = async (options: {
  userId: string;
  apiUrl: string;
  username: string;
  password: string;
  limit?: number;
  offset?: number;
}) => listEngagePosts({ ...options, kind: "comments" });

export const listMemosLikePosts = async (options: {
  userId: string;
  apiUrl: string;
  username: string;
  password: string;
  limit?: number;
  offset?: number;
}) => listEngagePosts({ ...options, kind: "likes" });

export const listMemosAdminComments = async (options: {
  userId: string;
  apiUrl: string;
  username: string;
  password: string;
  postId?: string;
  limit?: number;
  offset?: number;
}): Promise<MemosAdminCommentsPage> => {
  const limit = clampAdminLimit(options.limit);
  const offset = clampOffset(options.offset);
  const postId = (options.postId || "").trim();
  const query = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  });
  if (postId) query.set("post_id", postId);

  return withAdmin({
    userId: options.userId,
    apiUrl: options.apiUrl,
    username: options.username,
    password: options.password,
    run: async (token, validatedBase) => {
      const { status, payload } = await requestJson<unknown[]>({
        validatedBase,
        path: `/api/admin/comments?${query.toString()}`,
        token,
      });
      assertOk(payload, status);
      const comments = Array.isArray(payload.data)
        ? payload.data
            .map((item) => {
              if (!item || typeof item !== "object") return null;
              const row = item as Record<string, unknown>;
              const id = typeof row.id === "string" ? row.id.trim() : "";
              if (!id) return null;
              return {
                id,
                post_id: typeof row.post_id === "string" ? row.post_id : "",
                parent_id:
                  typeof row.parent_id === "string" ? row.parent_id : "",
                author_name:
                  typeof row.author_name === "string"
                    ? row.author_name
                    : "访客",
                author_email:
                  typeof row.author_email === "string"
                    ? row.author_email
                    : undefined,
                author_url:
                  typeof row.author_url === "string" ? row.author_url : undefined,
                content: typeof row.content === "string" ? row.content : "",
                created_at:
                  typeof row.created_at === "number" &&
                  Number.isFinite(row.created_at)
                    ? row.created_at
                    : 0,
                post_excerpt:
                  typeof row.post_excerpt === "string"
                    ? row.post_excerpt
                    : undefined,
                post_created_at:
                  typeof row.post_created_at === "number" &&
                  Number.isFinite(row.post_created_at)
                    ? row.post_created_at
                    : undefined,
              } satisfies MemosAdminComment;
            })
            .filter(Boolean) as MemosAdminComment[]
        : [];
      return {
        comments,
        total:
          typeof payload.meta?.total === "number"
            ? payload.meta.total
            : comments.length,
        limit:
          typeof payload.meta?.limit === "number" ? payload.meta.limit : limit,
        offset:
          typeof payload.meta?.offset === "number"
            ? payload.meta.offset
            : offset,
      };
    },
  });
};

export const listMemosAdminLikes = async (options: {
  userId: string;
  apiUrl: string;
  username: string;
  password: string;
  postId?: string;
  limit?: number;
  offset?: number;
}): Promise<MemosAdminLikesPage> => {
  const limit = clampAdminLimit(options.limit);
  const offset = clampOffset(options.offset);
  const postId = (options.postId || "").trim();
  const query = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  });
  if (postId) query.set("post_id", postId);

  return withAdmin({
    userId: options.userId,
    apiUrl: options.apiUrl,
    username: options.username,
    password: options.password,
    run: async (token, validatedBase) => {
      const { status, payload } = await requestJson<unknown[]>({
        validatedBase,
        path: `/api/admin/likes?${query.toString()}`,
        token,
      });
      assertOk(payload, status);
      const likes = Array.isArray(payload.data)
        ? payload.data
            .map((item) => {
              if (!item || typeof item !== "object") return null;
              const row = item as Record<string, unknown>;
              const id = typeof row.id === "string" ? row.id.trim() : "";
              if (!id) return null;
              return {
                id,
                post_id: typeof row.post_id === "string" ? row.post_id : "",
                client_id:
                  typeof row.client_id === "string" ? row.client_id : undefined,
                author_name:
                  typeof row.author_name === "string" && row.author_name.trim()
                    ? row.author_name
                    : "访客",
                created_at:
                  typeof row.created_at === "number" &&
                  Number.isFinite(row.created_at)
                    ? row.created_at
                    : 0,
                post_excerpt:
                  typeof row.post_excerpt === "string"
                    ? row.post_excerpt
                    : undefined,
                post_created_at:
                  typeof row.post_created_at === "number" &&
                  Number.isFinite(row.post_created_at)
                    ? row.post_created_at
                    : undefined,
              } satisfies MemosAdminLike;
            })
            .filter(Boolean) as MemosAdminLike[]
        : [];
      return {
        likes,
        total:
          typeof payload.meta?.total === "number"
            ? payload.meta.total
            : likes.length,
        limit:
          typeof payload.meta?.limit === "number" ? payload.meta.limit : limit,
        offset:
          typeof payload.meta?.offset === "number"
            ? payload.meta.offset
            : offset,
      };
    },
  });
};

export const deleteMemosComment = async (options: {
  userId: string;
  apiUrl: string;
  username: string;
  password: string;
  id: string;
}): Promise<void> => {
  const id = options.id.trim();
  if (!id) {
    throw Object.assign(new Error("缺少评论 ID。"), { status: 400 });
  }
  await withAdmin({
    userId: options.userId,
    apiUrl: options.apiUrl,
    username: options.username,
    password: options.password,
    run: async (token, validatedBase) => {
      const { status, payload } = await requestJson<unknown>({
        validatedBase,
        path: `/api/comments/${encodeURIComponent(id)}`,
        method: "DELETE",
        token,
      });
      assertOk(payload, status);
    },
  });
};

export const deleteMemosLike = async (options: {
  userId: string;
  apiUrl: string;
  username: string;
  password: string;
  id: string;
}): Promise<void> => {
  const id = options.id.trim();
  if (!id) {
    throw Object.assign(new Error("缺少点赞 ID。"), { status: 400 });
  }
  await withAdmin({
    userId: options.userId,
    apiUrl: options.apiUrl,
    username: options.username,
    password: options.password,
    run: async (token, validatedBase) => {
      const { status, payload } = await requestJson<unknown>({
        validatedBase,
        path: `/api/likes/${encodeURIComponent(id)}`,
        method: "DELETE",
        token,
      });
      assertOk(payload, status);
    },
  });
};

export const clearMemosTokenCache = (userId?: string) => {
  if (!userId) {
    tokenCache.clear();
    tokenInflight.clear();
    return;
  }
  for (const key of Array.from(tokenCache.keys())) {
    if (key.startsWith(`${userId}::`)) tokenCache.delete(key);
  }
  for (const key of Array.from(tokenInflight.keys())) {
    if (key.startsWith(`${userId}::`)) tokenInflight.delete(key);
  }
};

/** Pre-login so comments/likes admin calls skip a cold auth round-trip. */
export const warmMemosAdminToken = async (options: {
  userId: string;
  apiUrl: string;
  username: string;
  password: string;
}) => {
  const validatedBase = await assertSafeOutboundUrl(options.apiUrl);
  await getAdminToken({
    userId: options.userId,
    apiUrl: options.apiUrl,
    username: options.username,
    password: options.password,
    validatedBase,
  });
};
