import { createHttpError, toErrorResponse } from "@/lib/api-error";
import { requireApiUserSession } from "@/lib/session-server";
import { queryWebanalysi, assertWebanalysiSiteId } from "@/lib/webanalysi-settings/query";
import { getWebanalysiSession } from "@/lib/webanalysi-settings/settings";
import type {
  WebanalysiQueryType,
  WebanalysiTimeRange,
} from "@/lib/webanalysi-settings/types";
import { logServerError } from "@/lib/security/scrub-secrets";

const QUERY_TYPES = new Set<string>([
  "sites",
  "list",
  "summary",
  "visit",
  "stats",
  "path",
  "referrer",
  "os",
  "browser",
  "soft",
  "region",
  "area",
  "timeseries",
  "echarts",
]);

const TIME_RANGES = new Set<WebanalysiTimeRange>([
  "today",
  "1d",
  "7d",
  "30d",
  "60d",
  "90d",
]);

const isSitesType = (type: string) => type === "sites" || type === "list";

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

    const type = typeof body.type === "string" ? body.type : "";
    if (!QUERY_TYPES.has(type)) {
      throw createHttpError("无效的查询类型。", 400);
    }

    const siteID = isSitesType(type)
      ? undefined
      : assertWebanalysiSiteId(
          typeof body.siteID === "string"
            ? body.siteID
            : typeof body.site_id === "string"
              ? body.site_id
              : "",
        );
    const time =
      typeof body.time === "string" && TIME_RANGES.has(body.time as WebanalysiTimeRange)
        ? (body.time as WebanalysiTimeRange)
        : typeof body.period === "string" &&
            TIME_RANGES.has(body.period as WebanalysiTimeRange)
          ? (body.period as WebanalysiTimeRange)
          : "today";

    const data = await queryWebanalysi({
      apiUrl: connection.apiUrl,
      session: connection.session,
      type: type as WebanalysiQueryType,
      siteID,
      time,
    });

    return Response.json({ status: "success", data });
  } catch (error: unknown) {
    logServerError(error, "webanalysi/query POST");
    return toErrorResponse(error);
  }
}
