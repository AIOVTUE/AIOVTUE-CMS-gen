import "server-only";

import {
  getCommentBackupState,
  getCommentCredentials,
  updateCommentBackupResult,
} from "@/lib/comment-settings/settings";
import { exportTwikooAdminComments } from "@/lib/comment-settings/twikoo";
import type { CommentBackupResult } from "@/lib/comment-settings/types";
import { uploadWebdavFile } from "@/lib/webdav-settings/client";
import { getWebdavSession } from "@/lib/webdav-settings/settings";
import { scrubSecrets } from "@/lib/security/scrub-secrets";

const stampFilename = (date = new Date()) => {
  const iso = date.toISOString().replace(/[:.]/g, "-");
  return `comments-${iso}.json`;
};

const joinRemotePath = (dir: string, filename: string) => {
  const base = dir.replace(/^\/+/, "").replace(/\/+$/, "");
  return base ? `${base}/${filename}` : filename;
};

export const isCommentBackupDue = (options: {
  lastBackupAt: Date | null;
  intervalHours: number;
}) => {
  if (!options.lastBackupAt) return true;
  const elapsed = Date.now() - options.lastBackupAt.getTime();
  return elapsed >= options.intervalHours * 60 * 60 * 1000;
};

export const runCommentBackupForUser = async (options: {
  userId: string;
  force?: boolean;
}): Promise<CommentBackupResult> => {
  const state = await getCommentBackupState(options.userId);
  if (!options.force && !state.enabled) {
    return {
      ok: true,
      skipped: true,
      message: "未启用评论自动备份。",
      lastBackupAt: state.lastBackupAt?.toISOString() ?? null,
    };
  }

  if (
    !options.force &&
    !isCommentBackupDue({
      lastBackupAt: state.lastBackupAt,
      intervalHours: state.intervalHours,
    })
  ) {
    return {
      ok: true,
      skipped: true,
      message: "尚未到达备份间隔。",
      lastBackupAt: state.lastBackupAt?.toISOString() ?? null,
    };
  }

  try {
    const creds = await getCommentCredentials(options.userId);
    if (!creds || creds.provider !== "twikoo") {
      throw Object.assign(
        new Error("评论自动备份目前仅支持已配置管理密码的 Twikoo。"),
        { status: 400 },
      );
    }
    if (!creds.password) {
      throw Object.assign(new Error("请先填写 Twikoo 管理密码后再备份。"), {
        status: 400,
      });
    }

    const webdav = await getWebdavSession(options.userId);
    if (!webdav) {
      throw Object.assign(
        new Error("请先在设置中配置 WebDAV（地址、用户名、密码）。"),
        { status: 400 },
      );
    }

    const exported = await exportTwikooAdminComments({
      serverUrl: creds.serverUrl,
      password: creds.password,
    });

    const exportedAt = new Date();
    const payload = {
      exportedAt: exportedAt.toISOString(),
      provider: "twikoo",
      serverUrl: creds.serverUrl,
      total: exported.total,
      count: exported.comments.length,
      comments: exported.comments,
    };
    const filename = stampFilename(exportedAt);
    const remotePath = joinRemotePath(state.remotePath, filename);
    const body = `${JSON.stringify(payload, null, 2)}\n`;

    const uploaded = await uploadWebdavFile({
      baseUrl: webdav.baseUrl,
      username: webdav.username,
      password: webdav.password,
      remotePath,
      body,
      contentType: "application/json; charset=utf-8",
    });

    const message = `已备份 ${exported.comments.length} 条评论到 ${uploaded.remotePath}`;
    await updateCommentBackupResult(options.userId, {
      status: "success",
      message,
      at: exportedAt,
    });

    return {
      ok: true,
      remotePath: uploaded.remotePath,
      total: exported.comments.length,
      message,
      lastBackupAt: exportedAt.toISOString(),
    };
  } catch (error: unknown) {
    const message = scrubSecrets(
      error instanceof Error && error.message
        ? error.message
        : "评论备份失败",
    );
    // Keep lastBackupAt = now so auto mode does not retry on every page view.
    const at = new Date();
    await updateCommentBackupResult(options.userId, {
      status: "error",
      message,
      at,
    }).catch(() => undefined);

    // Auto/opportunistic runs should not surface as 500 to the browser.
    if (!options.force) {
      return {
        ok: false,
        skipped: false,
        message,
        lastBackupAt: at.toISOString(),
      };
    }

    throw Object.assign(new Error(message), {
      status:
        error && typeof error === "object" && "status" in error
          ? Number((error as { status?: unknown }).status) || 500
          : 500,
    });
  }
};
