import "server-only";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { siteUrlSettingsTable } from "@/db/schema";
import { ensureDbUser } from "@/lib/ai/ensure-user";
import { ensureSiteUrlSettingsTable } from "@/lib/site-url/ensure-table";
import type { SiteUrlSettingsPublic } from "@/lib/site-url/types";

export type { SiteUrlSettingsPublic };

const isHttpUrl = (value: string) => /^https?:\/\//i.test(value.trim());

export const assertSiteUrl = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (!isHttpUrl(trimmed)) {
    throw Object.assign(new Error("站点地址需以 http:// 或 https:// 开头"), {
      status: 400,
    });
  }
  try {
    const url = new URL(trimmed);
    if (!url.hostname) {
      throw new Error("invalid");
    }
    return url.toString();
  } catch {
    throw Object.assign(new Error("站点地址格式无效"), { status: 400 });
  }
};

export const assertIconUrl = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (!isHttpUrl(trimmed) && !trimmed.startsWith("/")) {
    throw Object.assign(
      new Error("图标地址需为 http(s) 链接或以 / 开头的路径"),
      { status: 400 },
    );
  }
  if (trimmed.startsWith("/")) return trimmed;
  try {
    return new URL(trimmed).toString();
  } catch {
    throw Object.assign(new Error("图标地址格式无效"), { status: 400 });
  }
};

const toPublic = (
  row: typeof siteUrlSettingsTable.$inferSelect | null,
): SiteUrlSettingsPublic => ({
  siteUrl: row?.siteUrl?.trim() || "",
  iconUrl: row?.iconUrl?.trim() || "",
  updatedAt: row?.updatedAt?.toISOString() ?? null,
});

export const getSiteUrlSettingsPublic = async (
  userId: string,
): Promise<SiteUrlSettingsPublic> => {
  await ensureSiteUrlSettingsTable();
  const row = await db.query.siteUrlSettingsTable.findFirst({
    where: eq(siteUrlSettingsTable.userId, userId),
  });
  return toPublic(row ?? null);
};

type UpsertSiteUrlSettingsInput = {
  user: {
    id: string;
    name?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    githubUsername?: string | null;
    image?: string | null;
  };
  siteUrl: string;
  iconUrl?: string;
};

export const upsertSiteUrlSettings = async (
  input: UpsertSiteUrlSettingsInput,
): Promise<SiteUrlSettingsPublic> => {
  await ensureSiteUrlSettingsTable();
  await ensureDbUser(input.user);

  const siteUrl = assertSiteUrl(input.siteUrl);
  const iconUrl =
    input.iconUrl !== undefined
      ? assertIconUrl(input.iconUrl)
      : undefined;
  const updatedAt = new Date();
  const existing = await db.query.siteUrlSettingsTable.findFirst({
    where: eq(siteUrlSettingsTable.userId, input.user.id),
  });

  const nextIconUrl = iconUrl !== undefined ? iconUrl : (existing?.iconUrl ?? "");

  await db
    .insert(siteUrlSettingsTable)
    .values({
      userId: input.user.id,
      siteUrl,
      iconUrl: nextIconUrl,
      createdAt: existing?.createdAt ?? updatedAt,
      updatedAt,
    })
    .onConflictDoUpdate({
      target: siteUrlSettingsTable.userId,
      set: {
        siteUrl,
        iconUrl: nextIconUrl,
        updatedAt,
      },
    });

  return getSiteUrlSettingsPublic(input.user.id);
};
