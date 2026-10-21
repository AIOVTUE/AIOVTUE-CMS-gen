"use server";

import { createHttpError } from "@/lib/api-error";
import { requireApiUserSession } from "@/lib/session-server";
import { logServerError } from "@/lib/security/scrub-secrets";
import {
  clearMemosTokenCache,
  createMemosPost,
  deleteMemosComment,
  deleteMemosLike,
  deleteMemosPost,
  listMemosAdminComments,
  listMemosAdminLikes,
  listMemosCommentPosts,
  listMemosLikePosts,
  listMemosPosts,
  normalizeMemosPostInput,
  updateMemosPost,
  warmMemosAdminToken,
} from "@/lib/memos-settings/client";
import {
  getMemosSession,
  getMemosSettingsPublic,
  upsertMemosSettings,
  type MemosSettingsPublic,
} from "@/lib/memos-settings/settings";
import type {
  MemosAdminCommentsPage,
  MemosAdminLikesPage,
  MemosEngagePostsPage,
  MemosPost,
  MemosPostsPage,
} from "@/lib/memos-settings/types";

export type MemosSettingsActionResult =
  | { ok: true; data: MemosSettingsPublic }
  | { ok: false; message: string };

export type MemosPostsActionResult =
  | { ok: true; data: MemosPostsPage }
  | { ok: false; message: string };

export type MemosPostActionResult =
  | { ok: true; data: MemosPost }
  | { ok: false; message: string };

export type MemosDeleteActionResult =
  | { ok: true }
  | { ok: false; message: string };

export type MemosEngagePostsActionResult =
  | { ok: true; data: MemosEngagePostsPage }
  | { ok: false; message: string };

export type MemosAdminCommentsActionResult =
  | { ok: true; data: MemosAdminCommentsPage }
  | { ok: false; message: string };

export type MemosAdminLikesActionResult =
  | { ok: true; data: MemosAdminLikesPage }
  | { ok: false; message: string };

const toActionError = <T extends { ok: false; message: string }>(
  error: unknown,
  fallback: string,
): T => {
  logServerError(error, "memos-settings action");
  const message =
    error instanceof Error && error.message ? error.message : fallback;
  if (message.includes("CRYPTO_KEY")) {
    return {
      ok: false,
      message:
        "服务器未配置 CRYPTO_KEY，无法加密保存管理密码。请在 Vercel 环境变量中设置 CRYPTO_KEY 后重试。",
    } as T;
  }
  if (message.includes("DATABASE_URL")) {
    return {
      ok: false,
      message: "服务器未配置 DATABASE_URL，无法保存设置。",
    } as T;
  }
  return { ok: false, message: message || fallback } as T;
};

const requireSessionConnection = async () => {
  const sessionResult = await requireApiUserSession();
  if ("response" in sessionResult) {
    throw createHttpError("未登录或登录已过期，请重新登录。", 401);
  }
  const connection = await getMemosSession(sessionResult.user.id);
  if (!connection?.apiUrl) {
    throw createHttpError(
      "请先在设置中配置动态 API 地址。",
      400,
    );
  }
  if (!connection.username || !connection.password) {
    throw createHttpError(
      "请先在设置中填写动态 API 管理账号与密码。",
      400,
    );
  }
  return { user: sessionResult.user, connection };
};

export async function loadMemosSettingsAction(): Promise<MemosSettingsActionResult> {
  try {
    const sessionResult = await requireApiUserSession();
    if ("response" in sessionResult) {
      return { ok: false, message: "未登录或登录已过期，请重新登录。" };
    }
    const userId = sessionResult.user.id;
    const [data, connection] = await Promise.all([
      getMemosSettingsPublic(userId),
      getMemosSession(userId).catch(() => null),
    ]);
    // Warm admin token while settings load so comments/likes skip cold login.
    if (
      connection?.apiUrl &&
      connection.username &&
      connection.password
    ) {
      try {
        await warmMemosAdminToken({
          userId,
          apiUrl: connection.apiUrl,
          username: connection.username,
          password: connection.password,
        });
      } catch {
        /* engage tabs will retry login */
      }
    }
    return { ok: true, data };
  } catch (error: unknown) {
    return toActionError(error, "加载动态 API 设置失败");
  }
}

export async function saveMemosSettingsAction(input: {
  apiUrl: string;
  username?: string | null;
  password?: string | null;
  passwordTouched?: boolean;
}): Promise<MemosSettingsActionResult> {
  try {
    const sessionResult = await requireApiUserSession();
    if ("response" in sessionResult) {
      return { ok: false, message: "未登录或登录已过期，请重新登录。" };
    }
    const user = sessionResult.user;
    if (!input || typeof input !== "object") {
      throw createHttpError("Invalid request body.", 400);
    }

    const data = await upsertMemosSettings({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        emailVerified: user.emailVerified,
        githubUsername: user.githubUsername,
        image: user.image,
      },
      apiUrl: typeof input.apiUrl === "string" ? input.apiUrl : "",
      username: typeof input.username === "string" ? input.username : "",
      password: input.password,
      passwordTouched: Boolean(input.passwordTouched),
    });
    clearMemosTokenCache(user.id);
    return { ok: true, data };
  } catch (error: unknown) {
    return toActionError(error, "保存动态 API 设置失败");
  }
}

export async function listMemosPostsAction(input?: {
  limit?: number;
  offset?: number;
}): Promise<MemosPostsActionResult> {
  try {
    const { connection } = await requireSessionConnection();
    const data = await listMemosPosts({
      apiUrl: connection.apiUrl,
      limit: input?.limit,
      offset: input?.offset,
    });
    return { ok: true, data };
  } catch (error: unknown) {
    return toActionError(error, "加载动态列表失败");
  }
}

export async function createMemosPostAction(input: {
  content?: string;
  images?: string[];
  created_at?: number | null;
}): Promise<MemosPostActionResult> {
  try {
    const { user, connection } = await requireSessionConnection();
    const normalized = normalizeMemosPostInput(input ?? {});
    const data = await createMemosPost({
      userId: user.id,
      apiUrl: connection.apiUrl,
      username: connection.username,
      password: connection.password,
      input: normalized,
    });
    return { ok: true, data };
  } catch (error: unknown) {
    return toActionError(error, "发布动态失败");
  }
}

export async function updateMemosPostAction(input: {
  id: string;
  content?: string;
  images?: string[];
  created_at?: number | null;
}): Promise<MemosPostActionResult> {
  try {
    const { user, connection } = await requireSessionConnection();
    const normalized = normalizeMemosPostInput(input ?? {});
    const data = await updateMemosPost({
      userId: user.id,
      apiUrl: connection.apiUrl,
      username: connection.username,
      password: connection.password,
      id: typeof input?.id === "string" ? input.id : "",
      input: normalized,
    });
    return { ok: true, data };
  } catch (error: unknown) {
    return toActionError(error, "更新动态失败");
  }
}

export async function deleteMemosPostAction(input: {
  id: string;
}): Promise<MemosDeleteActionResult> {
  try {
    const { user, connection } = await requireSessionConnection();
    await deleteMemosPost({
      userId: user.id,
      apiUrl: connection.apiUrl,
      username: connection.username,
      password: connection.password,
      id: typeof input?.id === "string" ? input.id : "",
    });
    return { ok: true };
  } catch (error: unknown) {
    return toActionError(error, "删除动态失败");
  }
}

export async function listMemosCommentPostsAction(input?: {
  limit?: number;
  offset?: number;
}): Promise<MemosEngagePostsActionResult> {
  try {
    const { user, connection } = await requireSessionConnection();
    const data = await listMemosCommentPosts({
      userId: user.id,
      apiUrl: connection.apiUrl,
      username: connection.username,
      password: connection.password,
      limit: input?.limit,
      offset: input?.offset,
    });
    return { ok: true, data };
  } catch (error: unknown) {
    return toActionError(error, "加载评论汇总失败");
  }
}

export async function listMemosLikePostsAction(input?: {
  limit?: number;
  offset?: number;
}): Promise<MemosEngagePostsActionResult> {
  try {
    const { user, connection } = await requireSessionConnection();
    const data = await listMemosLikePosts({
      userId: user.id,
      apiUrl: connection.apiUrl,
      username: connection.username,
      password: connection.password,
      limit: input?.limit,
      offset: input?.offset,
    });
    return { ok: true, data };
  } catch (error: unknown) {
    return toActionError(error, "加载点赞汇总失败");
  }
}

export async function listMemosAdminCommentsAction(input?: {
  postId?: string;
  limit?: number;
  offset?: number;
}): Promise<MemosAdminCommentsActionResult> {
  try {
    const { user, connection } = await requireSessionConnection();
    const data = await listMemosAdminComments({
      userId: user.id,
      apiUrl: connection.apiUrl,
      username: connection.username,
      password: connection.password,
      postId: input?.postId,
      limit: input?.limit,
      offset: input?.offset,
    });
    return { ok: true, data };
  } catch (error: unknown) {
    return toActionError(error, "加载评论明细失败");
  }
}

export async function listMemosAdminLikesAction(input?: {
  postId?: string;
  limit?: number;
  offset?: number;
}): Promise<MemosAdminLikesActionResult> {
  try {
    const { user, connection } = await requireSessionConnection();
    const data = await listMemosAdminLikes({
      userId: user.id,
      apiUrl: connection.apiUrl,
      username: connection.username,
      password: connection.password,
      postId: input?.postId,
      limit: input?.limit,
      offset: input?.offset,
    });
    return { ok: true, data };
  } catch (error: unknown) {
    return toActionError(error, "加载点赞明细失败");
  }
}

export async function deleteMemosCommentAction(input: {
  id: string;
}): Promise<MemosDeleteActionResult> {
  try {
    const { user, connection } = await requireSessionConnection();
    await deleteMemosComment({
      userId: user.id,
      apiUrl: connection.apiUrl,
      username: connection.username,
      password: connection.password,
      id: typeof input?.id === "string" ? input.id : "",
    });
    return { ok: true };
  } catch (error: unknown) {
    return toActionError(error, "删除评论失败");
  }
}

export async function deleteMemosLikeAction(input: {
  id: string;
}): Promise<MemosDeleteActionResult> {
  try {
    const { user, connection } = await requireSessionConnection();
    await deleteMemosLike({
      userId: user.id,
      apiUrl: connection.apiUrl,
      username: connection.username,
      password: connection.password,
      id: typeof input?.id === "string" ? input.id : "",
    });
    return { ok: true };
  } catch (error: unknown) {
    return toActionError(error, "删除点赞失败");
  }
}
