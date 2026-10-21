import "server-only";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { webanalysiSettingsTable } from "@/db/schema";
import { ensureDbUser } from "@/lib/ai/ensure-user";
import { decrypt, encrypt } from "@/lib/crypto";
import { ensureWebanalysiSettingsTable } from "@/lib/webanalysi-settings/ensure-table";
import type { WebanalysiSettingsPublic } from "@/lib/webanalysi-settings/types";
import { invalidateWebanalysiCache } from "@/lib/webanalysi-settings/cache";

export type { WebanalysiSettingsPublic };

const isHttpUrl = (value: string) => /^https?:\/\//i.test(value.trim());

export const assertWebanalysiApiUrl = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (!isHttpUrl(trimmed)) {
    throw Object.assign(new Error("Webanalysi 地址需以 http:// 或 https:// 开头"), {
      status: 400,
    });
  }
  try {
    return new URL(trimmed).toString().replace(/\/$/, "");
  } catch {
    throw Object.assign(new Error("Webanalysi 地址格式无效"), { status: 400 });
  }
};

const toPublic = (input: {
  apiUrl?: string | null;
  passwordCiphertext?: string | null;
  passwordIv?: string | null;
  updatedAt?: Date | string | null;
}): WebanalysiSettingsPublic => {
  const apiUrl = input.apiUrl?.trim() || "";
  const updatedAt =
    input.updatedAt instanceof Date
      ? input.updatedAt.toISOString()
      : typeof input.updatedAt === "string"
        ? input.updatedAt
        : null;
  return {
    apiUrl,
    hasPassword: Boolean(input.passwordCiphertext && input.passwordIv),
    configured: Boolean(apiUrl),
    updatedAt,
  };
};

const findSettingsRow = async (userId: string) => {
  const rows = await db
    .select()
    .from(webanalysiSettingsTable)
    .where(eq(webanalysiSettingsTable.userId, userId))
    .limit(1);
  return rows[0] ?? null;
};

export const getWebanalysiSettingsPublic = async (
  userId: string,
): Promise<WebanalysiSettingsPublic> => {
  await ensureWebanalysiSettingsTable();
  return toPublic((await findSettingsRow(userId)) ?? {});
};

export const getWebanalysiSession = async (
  userId: string,
): Promise<{ apiUrl: string; session: string } | null> => {
  await ensureWebanalysiSettingsTable();
  const row = await findSettingsRow(userId);
  const apiUrl = row?.apiUrl?.trim() || "";
  if (!apiUrl) return null;

  let session = "";
  if (row?.passwordCiphertext && row?.passwordIv) {
    try {
      session = await decrypt(row.passwordCiphertext, row.passwordIv);
    } catch {
      session = "";
    }
  }

  return { apiUrl, session };
};

type UpsertWebanalysiSettingsInput = {
  user: {
    id: string;
    name?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    githubUsername?: string | null;
    image?: string | null;
  };
  apiUrl: string;
  password?: string | null;
  passwordTouched?: boolean;
};

export const upsertWebanalysiSettings = async (
  input: UpsertWebanalysiSettingsInput,
): Promise<WebanalysiSettingsPublic> => {
  await ensureWebanalysiSettingsTable();
  await ensureDbUser(input.user);

  // Format-only validation on save. Live DNS/SSRF checks run when querying
  // Webanalysi — DNS on Vercel can hang/fail and leave the client with an empty body.
  const apiUrl = assertWebanalysiApiUrl(input.apiUrl);
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

  const [saved] = await db
    .insert(webanalysiSettingsTable)
    .values({
      userId: input.user.id,
      apiUrl,
      passwordCiphertext,
      passwordIv,
      createdAt: existing?.createdAt ?? updatedAt,
      updatedAt,
    })
    .onConflictDoUpdate({
      target: webanalysiSettingsTable.userId,
      set: {
        apiUrl,
        passwordCiphertext,
        passwordIv,
        updatedAt,
      },
    })
    .returning();

  invalidateWebanalysiCache(input.user.id);

  return toPublic(
    saved ?? {
      apiUrl,
      passwordCiphertext,
      passwordIv,
      updatedAt,
    },
  );
};
