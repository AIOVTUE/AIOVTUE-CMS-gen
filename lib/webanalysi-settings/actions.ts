"use server";

import { createHttpError } from "@/lib/api-error";
import { requireApiUserSession } from "@/lib/session-server";
import {
  assertWebanalysiSiteId,
  queryWebanalysiAnalyticsBundle,
  queryWebanalysiSites,
  WEBANALYSI_TIME_RANGES,
} from "@/lib/webanalysi-settings/query";
import {
  getWebanalysiSession,
  getWebanalysiSettingsPublic,
  upsertWebanalysiSettings,
  type WebanalysiSettingsPublic,
} from "@/lib/webanalysi-settings/settings";
import type {
  WebanalysiAnalyticsBundle,
  WebanalysiListPayload,
  WebanalysiTimeRange,
} from "@/lib/webanalysi-settings/types";
import { logServerError } from "@/lib/security/scrub-secrets";

export type WebanalysiSettingsActionResult =
  | { ok: true; data: WebanalysiSettingsPublic }
  | { ok: false; message: string };

export type WebanalysiSitesActionResult =
  | { ok: true; data: WebanalysiListPayload }
  | { ok: false; message: string };

export type WebanalysiAnalyticsActionResult =
  | { ok: true; data: WebanalysiAnalyticsBundle }
  | { ok: false; message: string };

export type WebanalysiBootstrapActionResult =
  | {
      ok: true;
      data: {
        sites: string[];
        hosts: Record<string, string>;
        siteID: string;
        time: WebanalysiTimeRange;
        analytics: WebanalysiAnalyticsBundle | null;
      };
    }
  | { ok: false; message: string };

const toActionError = <T extends { ok: false; message: string }>(
  error: unknown,
  fallback: string,
): T => {
  logServerError(error, "webanalysi-settings action");
  const message =
    error instanceof Error && error.message ? error.message : fallback;
  if (message.includes("CRYPTO_KEY")) {
    return {
      ok: false,
      message:
        "服务器未配置 CRYPTO_KEY，无法加密保存访问密码。请在 Vercel 环境变量中设置 CRYPTO_KEY 后重试。",
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

export async function loadWebanalysiSettingsAction(): Promise<WebanalysiSettingsActionResult> {
  try {
    const sessionResult = await requireApiUserSession();
    if ("response" in sessionResult) {
      return { ok: false, message: "未登录或登录已过期，请重新登录。" };
    }
    const data = await getWebanalysiSettingsPublic(sessionResult.user.id);
    return { ok: true, data };
  } catch (error: unknown) {
    return toActionError(error, "加载 Webanalysi 设置失败");
  }
}

export async function saveWebanalysiSettingsAction(input: {
  apiUrl: string;
  password?: string | null;
  passwordTouched?: boolean;
}): Promise<WebanalysiSettingsActionResult> {
  try {
    const sessionResult = await requireApiUserSession();
    if ("response" in sessionResult) {
      return { ok: false, message: "未登录或登录已过期，请重新登录。" };
    }
    const user = sessionResult.user;

    if (!input || typeof input !== "object") {
      throw createHttpError("Invalid request body.", 400);
    }

    const data = await upsertWebanalysiSettings({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        emailVerified: user.emailVerified,
        githubUsername: user.githubUsername,
        image: user.image,
      },
      apiUrl: typeof input.apiUrl === "string" ? input.apiUrl : "",
      password: input.password,
      passwordTouched: Boolean(input.passwordTouched),
    });

    return { ok: true, data };
  } catch (error: unknown) {
    return toActionError(error, "保存 Webanalysi 设置失败");
  }
}

export async function loadWebanalysiSitesAction(): Promise<WebanalysiSitesActionResult> {
  try {
    const sessionResult = await requireApiUserSession();
    if ("response" in sessionResult) {
      return { ok: false, message: "未登录或登录已过期，请重新登录。" };
    }
    const connection = await getWebanalysiSession(sessionResult.user.id);
    if (!connection?.apiUrl) {
      throw createHttpError("请先在设置中配置 Webanalysi 地址。", 400);
    }
    const data = await queryWebanalysiSites({
      userId: sessionResult.user.id,
      apiUrl: connection.apiUrl,
      session: connection.session,
    });
    return { ok: true, data };
  } catch (error: unknown) {
    return toActionError(error, "加载站点列表失败");
  }
}

/** One round-trip: sites + analytics for the preferred/default site. */
export async function loadWebanalysiBootstrapAction(input?: {
  siteID?: string;
  time?: string;
}): Promise<WebanalysiBootstrapActionResult> {
  try {
    const sessionResult = await requireApiUserSession();
    if ("response" in sessionResult) {
      return { ok: false, message: "未登录或登录已过期，请重新登录。" };
    }
    const connection = await getWebanalysiSession(sessionResult.user.id);
    if (!connection?.apiUrl) {
      throw createHttpError("请先在设置中配置 Webanalysi 地址。", 400);
    }

    const time =
      typeof input?.time === "string" &&
      WEBANALYSI_TIME_RANGES.has(input.time as WebanalysiTimeRange)
        ? (input.time as WebanalysiTimeRange)
        : "today";

    const sitesPayload = await queryWebanalysiSites({
      userId: sessionResult.user.id,
      apiUrl: connection.apiUrl,
      session: connection.session,
    });

    const preferred =
      typeof input?.siteID === "string" ? input.siteID.trim() : "";
    const siteID =
      preferred && sitesPayload.sites.includes(preferred)
        ? preferred
        : sitesPayload.sites[0] || "";

    if (!siteID) {
      return {
        ok: true,
        data: {
          sites: sitesPayload.sites,
          hosts: sitesPayload.hosts,
          siteID: "",
          time,
          analytics: null,
        },
      };
    }

    const analytics = await queryWebanalysiAnalyticsBundle({
      userId: sessionResult.user.id,
      apiUrl: connection.apiUrl,
      session: connection.session,
      siteID,
      time,
    });

    return {
      ok: true,
      data: {
        sites: sitesPayload.sites,
        hosts: sitesPayload.hosts,
        siteID,
        time,
        analytics,
      },
    };
  } catch (error: unknown) {
    return toActionError(error, "加载访问数据失败");
  }
}

export async function loadWebanalysiAnalyticsAction(input: {
  siteID: string;
  time?: string;
}): Promise<WebanalysiAnalyticsActionResult> {
  try {
    const sessionResult = await requireApiUserSession();
    if ("response" in sessionResult) {
      return { ok: false, message: "未登录或登录已过期，请重新登录。" };
    }
    const connection = await getWebanalysiSession(sessionResult.user.id);
    if (!connection?.apiUrl) {
      throw createHttpError("请先在设置中配置 Webanalysi 地址。", 400);
    }
    const siteID = assertWebanalysiSiteId(input.siteID || "");
    const time =
      typeof input.time === "string" &&
      WEBANALYSI_TIME_RANGES.has(input.time as WebanalysiTimeRange)
        ? (input.time as WebanalysiTimeRange)
        : "today";
    const data = await queryWebanalysiAnalyticsBundle({
      userId: sessionResult.user.id,
      apiUrl: connection.apiUrl,
      session: connection.session,
      siteID,
      time,
    });
    return { ok: true, data };
  } catch (error: unknown) {
    return toActionError(error, "加载访问数据失败");
  }
}
