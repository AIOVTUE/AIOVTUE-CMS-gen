import "server-only";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { commentSettingsTable } from "@/db/schema";
import { ensureDbUser } from "@/lib/ai/ensure-user";
import { decrypt, encrypt } from "@/lib/crypto";
import { ensureCommentSettingsTable } from "@/lib/comment-settings/ensure-table";
import type {
  CommentBackupIntervalHours,
  CommentProviderId,
  CommentSettingsPublic,
} from "@/lib/comment-settings/types";
import { assertSafeOutboundUrl } from "@/lib/security/ssrf-guard";

export type { CommentProviderId, CommentSettingsPublic };

const WRITABLE_PROVIDERS = new Set<CommentProviderId>(["", "twikoo"]);
const INTERVALS = new Set<number>([6, 12, 24, 168]);

const normalizeProvider = (value: unknown): CommentProviderId => {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
  // Legacy "waline" rows still read back; settings UI only enables Twikoo.
  if (raw === "twikoo" || raw === "waline") return raw;
  return "";
};

const isHttpUrl = (value: string) => /^https?:\/\//i.test(value.trim());

export const assertCommentProvider = (value: unknown): CommentProviderId => {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!WRITABLE_PROVIDERS.has(raw as CommentProviderId)) {
    throw Object.assign(new Error("评论系统仅支持 Twikoo。"), {
      status: 400,
    });
  }
  return raw as CommentProviderId;
};

export const assertCommentServerUrl = (
  value: string,
  provider: CommentProviderId,
) => {
  const trimmed = value.trim();
  if (!provider) return "";
  if (!trimmed) {
    throw Object.assign(new Error("请填写评论服务地址。"), { status: 400 });
  }
  if (!isHttpUrl(trimmed)) {
    throw Object.assign(new Error("评论地址需以 http:// 或 https:// 开头"), {
      status: 400,
    });
  }
  try {
    return new URL(trimmed).toString().replace(/\/$/, "");
  } catch {
    throw Object.assign(new Error("评论地址格式无效"), { status: 400 });
  }
};

export const assertBackupRemotePath = (value: string) => {
  const trimmed = value.trim() || "/pagecms/comments";
  if (trimmed.length > 512) {
    throw Object.assign(new Error("备份路径过长。"), { status: 400 });
  }
  if (trimmed.includes("..") || /[\u0000-\u001F\u007F]/.test(trimmed)) {
    throw Object.assign(new Error("备份路径包含非法字符。"), { status: 400 });
  }
  return trimmed.replace(/\/+$/, "") || "/pagecms/comments";
};

export const assertBackupIntervalHours = (
  value: unknown,
): CommentBackupIntervalHours => {
  const n = typeof value === "number" ? value : Number(value);
  if (!INTERVALS.has(n)) {
    throw Object.assign(new Error("备份间隔仅支持 6 / 12 / 24 / 168 小时。"), {
      status: 400,
    });
  }
  return n as CommentBackupIntervalHours;
};

const toPublic = (
  row: typeof commentSettingsTable.$inferSelect | null,
): CommentSettingsPublic => ({
  provider: normalizeProvider(row?.provider ?? ""),
  serverUrl: row?.serverUrl?.trim() || "",
  hasPassword: Boolean(row?.passwordCiphertext && row?.passwordIv),
  backupEnabled: Boolean(row?.backupEnabled),
  backupRemotePath: row?.backupRemotePath?.trim() || "/pagecms/comments",
  backupIntervalHours: INTERVALS.has(Number(row?.backupIntervalHours))
    ? (Number(row?.backupIntervalHours) as CommentBackupIntervalHours)
    : 24,
  lastBackupAt: row?.lastBackupAt?.toISOString() ?? null,
  lastBackupStatus: row?.lastBackupStatus?.trim() || "",
  lastBackupMessage: row?.lastBackupMessage?.trim() || "",
  updatedAt: row?.updatedAt?.toISOString() ?? null,
});

const findSettingsRow = async (userId: string) => {
  const rows = await db
    .select()
    .from(commentSettingsTable)
    .where(eq(commentSettingsTable.userId, userId))
    .limit(1);
  return rows[0] ?? null;
};

export const getCommentSettingsPublic = async (
  userId: string,
): Promise<CommentSettingsPublic> => {
  await ensureCommentSettingsTable();
  return toPublic(await findSettingsRow(userId));
};

/** Decrypt stored Twikoo admin password for server-side API calls. */
export const getCommentCredentials = async (
  userId: string,
): Promise<{
  provider: CommentProviderId;
  serverUrl: string;
  password: string;
} | null> => {
  await ensureCommentSettingsTable();
  const row = await findSettingsRow(userId);
  const provider = normalizeProvider(row?.provider ?? "");
  const serverUrl = row?.serverUrl?.trim() || "";
  if (!provider || !serverUrl) return null;

  let password = "";
  if (row?.passwordCiphertext && row?.passwordIv) {
    try {
      password = await decrypt(row.passwordCiphertext, row.passwordIv);
    } catch {
      password = "";
    }
  }

  return { provider, serverUrl, password };
};

export const getCommentBackupState = async (userId: string) => {
  await ensureCommentSettingsTable();
  const row = await findSettingsRow(userId);
  return {
    enabled: Boolean(row?.backupEnabled),
    remotePath: row?.backupRemotePath?.trim() || "/pagecms/comments",
    intervalHours: INTERVALS.has(Number(row?.backupIntervalHours))
      ? Number(row?.backupIntervalHours)
      : 24,
    lastBackupAt: row?.lastBackupAt ?? null,
  };
};

export const updateCommentBackupResult = async (
  userId: string,
  result: {
    status: "success" | "error" | "skipped";
    message: string;
    at?: Date | null;
  },
) => {
  await ensureCommentSettingsTable();
  const updatedAt = new Date();
  await db
    .update(commentSettingsTable)
    .set({
      lastBackupStatus: result.status,
      lastBackupMessage: result.message.slice(0, 2000),
      ...(result.at !== undefined ? { lastBackupAt: result.at } : {}),
      updatedAt,
    })
    .where(eq(commentSettingsTable.userId, userId));
};

type UpsertCommentSettingsInput = {
  user: {
    id: string;
    name?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    githubUsername?: string | null;
    image?: string | null;
  };
  provider: string;
  serverUrl: string;
  password?: string | null;
  passwordTouched?: boolean;
  backupEnabled?: boolean;
  backupRemotePath?: string;
  backupIntervalHours?: number;
};

export const upsertCommentSettings = async (
  input: UpsertCommentSettingsInput,
): Promise<CommentSettingsPublic> => {
  await ensureCommentSettingsTable();
  await ensureDbUser(input.user);

  const provider = assertCommentProvider(input.provider);
  const serverUrl = assertCommentServerUrl(input.serverUrl, provider);
  if (provider && serverUrl) {
    await assertSafeOutboundUrl(serverUrl);
  }
  const updatedAt = new Date();
  const existing = await findSettingsRow(input.user.id);

  let passwordCiphertext = existing?.passwordCiphertext ?? "";
  let passwordIv = existing?.passwordIv ?? "";

  if (input.passwordTouched) {
    const nextPassword = (input.password ?? "").trim();
    if (nextPassword) {
      const encrypted = await encrypt(nextPassword);
      passwordCiphertext = encrypted.ciphertext;
      passwordIv = encrypted.iv;
    } else {
      passwordCiphertext = "";
      passwordIv = "";
    }
  }

  if (!provider) {
    passwordCiphertext = "";
    passwordIv = "";
  }

  const backupEnabled = Boolean(input.backupEnabled);
  const backupRemotePath = assertBackupRemotePath(
    typeof input.backupRemotePath === "string"
      ? input.backupRemotePath
      : existing?.backupRemotePath || "/pagecms/comments",
  );
  const backupIntervalHours = assertBackupIntervalHours(
    input.backupIntervalHours ?? existing?.backupIntervalHours ?? 24,
  );

  await db
    .insert(commentSettingsTable)
    .values({
      userId: input.user.id,
      provider,
      serverUrl: provider ? serverUrl : "",
      passwordCiphertext,
      passwordIv,
      backupEnabled,
      backupRemotePath,
      backupIntervalHours,
      lastBackupAt: existing?.lastBackupAt ?? null,
      lastBackupStatus: existing?.lastBackupStatus ?? "",
      lastBackupMessage: existing?.lastBackupMessage ?? "",
      createdAt: existing?.createdAt ?? updatedAt,
      updatedAt,
    })
    .onConflictDoUpdate({
      target: commentSettingsTable.userId,
      set: {
        provider,
        serverUrl: provider ? serverUrl : "",
        passwordCiphertext,
        passwordIv,
        backupEnabled,
        backupRemotePath,
        backupIntervalHours,
        updatedAt,
      },
    });

  return getCommentSettingsPublic(input.user.id);
};
