import { createHttpError, toErrorResponse } from "@/lib/api-error";
import { requireApiUserSession } from "@/lib/session-server";
import {
  assertWebanalysiSiteId,
  queryWebanalysiAnalyticsBundle,
  queryWebanalysiSites,
  WEBANALYSI_TIME_RANGES,
} from "@/lib/webanalysi-settings/query";
import { getWebanalysiSession } from "@/lib/webanalysi-settings/settings";
import type { WebanalysiTimeRange } from "@/lib/webanalysi-settings/types";
import { logServerError } from "@/lib/security/scrub-secrets";

export const maxDuration = 30;

/**
 * Aggregated Webanalysi fetch (1 Vercel invocation).
 *
 * POST /api/webanalysi/bundle
 * body: { kind: "sites" } | { kind: "analytics", siteID, time? }
 */
export async function POST(request: Request) {
  try {
    const sessionResult = await requireApiUserSession();
    if ("response" in sessionResult) return sessionResult.response;

    const connection = await getWebanalysiSession(sessionResult.user.id);
    if (!connection?.apiUrl) {
      throw createHttpError("请先在设置中配置 Webanalysi 地址。", 400);
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      throw createHttpError("Invalid request body.", 400);
    }

    const kind = body.kind === "analytics" ? "analytics" : body.kind === "sites" ? "sites" : "";
    if (!kind) {
      throw createHttpError("Invalid bundle kind.", 400);
    }

    if (kind === "sites") {
      const sites = await queryWebanalysiSites({
        userId: sessionResult.user.id,
        apiUrl: connection.apiUrl,
        session: connection.session,
      });
      return Response.json({
        status: "success",
        data: { kind: "sites" as const, ...sites },
      });
    }

    const siteID = assertWebanalysiSiteId(
      typeof body.siteID === "string" ? body.siteID : "",
    );

    const time =
      typeof body.time === "string" &&
      WEBANALYSI_TIME_RANGES.has(body.time as WebanalysiTimeRange)
        ? (body.time as WebanalysiTimeRange)
        : "today";

    const analytics = await queryWebanalysiAnalyticsBundle({
      userId: sessionResult.user.id,
      apiUrl: connection.apiUrl,
      session: connection.session,
      siteID,
      time,
    });

    return Response.json({
      status: "success",
      data: { kind: "analytics" as const, analytics },
    });
  } catch (error: unknown) {
    logServerError(error, "webanalysi/bundle POST");
    return toErrorResponse(error);
  }
}
