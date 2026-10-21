import { eq } from "drizzle-orm";
import { db } from "@/db";
import { loginBackgroundTable } from "@/db/schema";
import {
  DEFAULT_LOGIN_BG_DESKTOP,
  DEFAULT_LOGIN_BG_MOBILE,
} from "@/lib/login-background/defaults";
import { DEFAULT_PRIMARY_COLOR } from "@/lib/theme/primary-color";
import type { LoginBackgroundPublic } from "@/lib/login-background/types";
import { logServerError } from "@/lib/security/scrub-secrets";

export {
  DEFAULT_LOGIN_BG_DESKTOP,
  DEFAULT_LOGIN_BG_MOBILE,
} from "@/lib/login-background/defaults";
export { DEFAULT_PRIMARY_COLOR } from "@/lib/theme/primary-color";
export type { LoginBackgroundPublic } from "@/lib/login-background/types";

export const assertImageHostUrl = (value: string, label: string) => {
  const trimmed = value.trim();
  if (!trimmed) return "";
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(`${label}仅支持图床链接（http/https）`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`${label}仅支持图床链接（http/https）`);
  }
  if (parsed.username || parsed.password) {
    throw new Error(`${label}不能包含用户名或密码`);
  }
  // Block javascript:/data: and other non-http schemes already handled;
  // also reject whitespace and quotes that could break out of CSS url().
  if (/[\s"'()\\]/.test(trimmed)) {
    throw new Error(`${label}包含非法字符`);
  }
  return trimmed;
};

export const getLoginBackgroundPublic = async (): Promise<LoginBackgroundPublic> => {
  try {
    const row = await db.query.loginBackgroundTable.findFirst({
      where: eq(loginBackgroundTable.id, 1),
    });
    const desktopCustom = Boolean(row?.desktopUrl?.trim());
    const mobileCustom = Boolean(row?.mobileUrl?.trim());
    return {
      desktopUrl: desktopCustom
        ? row!.desktopUrl.trim()
        : DEFAULT_LOGIN_BG_DESKTOP,
      mobileUrl: mobileCustom ? row!.mobileUrl.trim() : DEFAULT_LOGIN_BG_MOBILE,
      primaryColor: DEFAULT_PRIMARY_COLOR,
      desktopCustom,
      mobileCustom,
    };
  } catch (error) {
    logServerError(error, "login-background settings");
    return {
      desktopUrl: DEFAULT_LOGIN_BG_DESKTOP,
      mobileUrl: DEFAULT_LOGIN_BG_MOBILE,
      primaryColor: DEFAULT_PRIMARY_COLOR,
      desktopCustom: false,
      mobileCustom: false,
    };
  }
};

export const upsertLoginBackground = async (input: {
  desktopUrl?: string;
  mobileUrl?: string;
}): Promise<LoginBackgroundPublic> => {
  const existing = await db.query.loginBackgroundTable.findFirst({
    where: eq(loginBackgroundTable.id, 1),
  });

  const nextDesktop =
    input.desktopUrl !== undefined
      ? assertImageHostUrl(input.desktopUrl, "电脑端背景")
      : (existing?.desktopUrl ?? "");
  const nextMobile =
    input.mobileUrl !== undefined
      ? assertImageHostUrl(input.mobileUrl, "手机端背景")
      : (existing?.mobileUrl ?? "");

  const updatedAt = new Date();
  await db
    .insert(loginBackgroundTable)
    .values({
      id: 1,
      desktopUrl: nextDesktop,
      mobileUrl: nextMobile,
      updatedAt,
    })
    .onConflictDoUpdate({
      target: loginBackgroundTable.id,
      set: {
        desktopUrl: nextDesktop,
        mobileUrl: nextMobile,
        updatedAt,
      },
    });

  return getLoginBackgroundPublic();
};
