import "server-only";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { memosSettingsTable } from "@/db/schema";
import { ensureDbUser } from "@/lib/ai/ensure-user";
import { decrypt, encrypt } from "@/lib/crypto";
import { ensureMemosSettingsTable } from "@/lib/memos-settings/ensure-table";
import { assertSafeOutboundUrl } from "@/lib/security/ssrf-guard";
import type { MemosSettingsPublic } from "@/lib/memos-settings/types";

export type { MemosSettingsPublic };

/** AIOVTUE-memos: 2–32 chars of [A-Za-z0-9._-] */
const USERNAME_RE = /^[A-Za-z0-9._-]{2,32}$/;

export const assertMemosApiUrl = async (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const safe = await assertSafeOutboundUrl(trimmed);
  return safe.toString().replace(/\/$/, "");
};

export const assertMemosUsername = (value: string, required: boolean) => {
  const trimmed = value.trim();
  if (!trimmed) {
    if (required) {
      throw Object.assign(new Error("请填写动态 API 管理账号。"), {
        status: 400,
      });
    }
    return "";
  }
  if (!USERNAME_RE.test(trimmed)) {
    throw Object.assign(
      new Error("管理账号需为 2–32 位字母、数字、.、_、或 -。"),
      { status: 400 },
    );
  }
  return trimmed;
};

const toPublic = (input: {
  apiUrl?: string | null;
  username?: string | null;
  passwordCiphertext?: string | null;
  passwordIv?: string | null;
  updatedAt?: Date | string | null;
}): MemosSettingsPublic => {
  const apiUrl = input.apiUrl?.trim() || "";
  const username = input.username?.trim() || "";
  const updatedAt =
    input.updatedAt instanceof Date
      ? input.updatedAt.toISOString()
      : typeof input.updatedAt === "string"
        ? input.updatedAt
        : null;
  return {
    apiUrl,
    username,
    hasPassword: Boolean(input.passwordCiphertext && input.passwordIv),
    configured: Boolean(apiUrl),
    updatedAt,
  };
};

const findSettingsRow = async (userId: string) => {
  const rows = await db
    .select()
    .from(memosSettingsTable)
    .where(eq(memosSettingsTable.userId, userId))
    .limit(1);
  return rows[0] ?? null;
};

export const getMemosSettingsPublic = async (
  userId: string,
): Promise<MemosSettingsPublic> => {
  await ensureMemosSettingsTable();
  return toPublic((await findSettingsRow(userId)) ?? {});
};

export const getMemosSession = async (
  userId: string,
): Promise<{ apiUrl: string; username: string; password: string } | null> => {
  await ensureMemosSettingsTable();
  const row = await findSettingsRow(userId);
  const apiUrl = row?.apiUrl?.trim() || "";
  if (!apiUrl) return null;

  let password = "";
  if (row?.passwordCiphertext && row?.passwordIv) {
    try {
      password = await decrypt(row.passwordCiphertext, row.passwordIv);
    } catch {
      password = "";
    }
  }

  return {
    apiUrl,
    username: row?.username?.trim() || "",
    password,
  };
};

type UpsertMemosSettingsInput = {
  user: {
    id: string;
    name?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    githubUsername?: string | null;
    image?: string | null;
  };
  apiUrl: string;
  username?: string | null;
  password?: string | null;
  passwordTouched?: boolean;
};

export const upsertMemosSettings = async (
  input: UpsertMemosSettingsInput,
): Promise<MemosSettingsPublic> => {
  await ensureMemosSettingsTable();
  await ensureDbUser(input.user);

  const apiUrl = await assertMemosApiUrl(input.apiUrl);
  const username = assertMemosUsername(
    typeof input.username === "string" ? input.username : "",
    Boolean(apiUrl),
  );
  const updatedAt = new Date();
  const existing = await findSettingsRow(input.user.id);

  let passwordCiphertext = existing?.passwordCiphertext ?? "";
  let passwordIv = existing?.passwordIv ?? "";

  if (input.passwordTouched) {
    const nextPassword = (input.password ?? "").trim();
    if (nextPassword) {
      if (nextPassword.length > 128) {
        throw Object.assign(new Error("管理密码过长（最多 128 位）。"), {
          status: 400,
        });
      }
      const encrypted = await encrypt(nextPassword);
      passwordCiphertext = encrypted.ciphertext;
      passwordIv = encrypted.iv;
    } else {
      passwordCiphertext = "";
      passwordIv = "";
    }
  }

  if (!apiUrl) {
    passwordCiphertext = "";
    passwordIv = "";
  }

  const [saved] = await db
    .insert(memosSettingsTable)
    .values({
      userId: input.user.id,
      apiUrl,
      username: apiUrl ? username : "",
      passwordCiphertext,
      passwordIv,
      createdAt: existing?.createdAt ?? updatedAt,
      updatedAt,
    })
    .onConflictDoUpdate({
      target: memosSettingsTable.userId,
      set: {
        apiUrl,
        username: apiUrl ? username : "",
        passwordCiphertext,
        passwordIv,
        updatedAt,
      },
    })
    .returning();

  return toPublic(
    saved ?? {
      apiUrl,
      username: apiUrl ? username : "",
      passwordCiphertext,
      passwordIv,
      updatedAt,
    },
  );
};
