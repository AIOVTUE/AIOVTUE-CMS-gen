import "server-only";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { webdavSettingsTable } from "@/db/schema";
import { ensureDbUser } from "@/lib/ai/ensure-user";
import { decrypt, encrypt } from "@/lib/crypto";
import { ensureWebdavSettingsTable } from "@/lib/webdav-settings/ensure-table";
import type { WebdavSettingsPublic } from "@/lib/webdav-settings/types";
import { assertSafeOutboundUrl } from "@/lib/security/ssrf-guard";

export type { WebdavSettingsPublic };

const isHttpUrl = (value: string) => /^https?:\/\//i.test(value.trim());

export const assertWebdavBaseUrl = (value: string, required: boolean) => {
  const trimmed = value.trim().replace(/\/$/, "");
  if (!trimmed) {
    if (required) {
      throw Object.assign(new Error("请填写 WebDAV 地址。"), { status: 400 });
    }
    return "";
  }
  if (!isHttpUrl(trimmed)) {
    throw Object.assign(new Error("WebDAV 地址需以 http:// 或 https:// 开头"), {
      status: 400,
    });
  }
  try {
    return new URL(trimmed).toString().replace(/\/$/, "");
  } catch {
    throw Object.assign(new Error("WebDAV 地址格式无效"), { status: 400 });
  }
};

export const assertWebdavUsername = (value: string, required: boolean) => {
  const trimmed = value.trim();
  if (!trimmed) {
    if (required) {
      throw Object.assign(new Error("请填写 WebDAV 用户名。"), { status: 400 });
    }
    return "";
  }
  if (trimmed.length > 256) {
    throw Object.assign(new Error("WebDAV 用户名过长。"), { status: 400 });
  }
  return trimmed;
};

const toPublic = (
  row: typeof webdavSettingsTable.$inferSelect | null,
): WebdavSettingsPublic => {
  const baseUrl = row?.baseUrl?.trim() || "";
  const username = row?.username?.trim() || "";
  return {
    baseUrl,
    username,
    hasPassword: Boolean(row?.passwordCiphertext && row?.passwordIv),
    configured: Boolean(baseUrl && username && row?.passwordCiphertext),
    updatedAt: row?.updatedAt?.toISOString() ?? null,
  };
};

const findSettingsRow = async (userId: string) => {
  const rows = await db
    .select()
    .from(webdavSettingsTable)
    .where(eq(webdavSettingsTable.userId, userId))
    .limit(1);
  return rows[0] ?? null;
};

export const getWebdavSettingsPublic = async (
  userId: string,
): Promise<WebdavSettingsPublic> => {
  await ensureWebdavSettingsTable();
  return toPublic(await findSettingsRow(userId));
};

export const getWebdavSession = async (
  userId: string,
): Promise<{
  baseUrl: string;
  username: string;
  password: string;
} | null> => {
  await ensureWebdavSettingsTable();
  const row = await findSettingsRow(userId);
  const baseUrl = row?.baseUrl?.trim() || "";
  const username = row?.username?.trim() || "";
  if (!baseUrl || !username) return null;

  let password = "";
  if (row?.passwordCiphertext && row?.passwordIv) {
    try {
      password = await decrypt(row.passwordCiphertext, row.passwordIv);
    } catch {
      password = "";
    }
  }
  if (!password) return null;
  return { baseUrl, username, password };
};

type UpsertWebdavSettingsInput = {
  user: {
    id: string;
    name?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    githubUsername?: string | null;
    image?: string | null;
  };
  baseUrl: string;
  username: string;
  password?: string | null;
  passwordTouched?: boolean;
};

export const upsertWebdavSettings = async (
  input: UpsertWebdavSettingsInput,
): Promise<WebdavSettingsPublic> => {
  await ensureWebdavSettingsTable();
  await ensureDbUser(input.user);

  const existing = await findSettingsRow(input.user.id);
  const clearing =
    !input.baseUrl.trim() &&
    !input.username.trim() &&
    (input.passwordTouched ? !(input.password ?? "").trim() : !existing?.passwordCiphertext);

  const baseUrl = assertWebdavBaseUrl(input.baseUrl, !clearing);
  const username = assertWebdavUsername(input.username, Boolean(baseUrl));
  if (baseUrl) {
    await assertSafeOutboundUrl(baseUrl);
  }

  const updatedAt = new Date();
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

  if (!baseUrl) {
    passwordCiphertext = "";
    passwordIv = "";
  }

  await db
    .insert(webdavSettingsTable)
    .values({
      userId: input.user.id,
      baseUrl: baseUrl || "",
      username: baseUrl ? username : "",
      passwordCiphertext,
      passwordIv,
      createdAt: existing?.createdAt ?? updatedAt,
      updatedAt,
    })
    .onConflictDoUpdate({
      target: webdavSettingsTable.userId,
      set: {
        baseUrl: baseUrl || "",
        username: baseUrl ? username : "",
        passwordCiphertext,
        passwordIv,
        updatedAt,
      },
    });

  return getWebdavSettingsPublic(input.user.id);
};
