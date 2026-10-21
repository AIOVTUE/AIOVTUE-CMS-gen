import "server-only";

import { scrubSecrets } from "@/lib/security/scrub-secrets";
import {
  assertSafeOutboundUrl,
  fetchValidatedOutboundUrl,
} from "@/lib/security/ssrf-guard";
import {
  webanalysiCache,
  webanalysiCachePrefix,
} from "@/lib/webanalysi-settings/cache";
import type {
  WebanalysiAnalyticsBundle,
  WebanalysiListPayload,
  WebanalysiOpenApiType,
  WebanalysiQueryType,
  WebanalysiRankItem,
  WebanalysiSummaryStats,
  WebanalysiTimeRange,
  WebanalysiVisitStats,
} from "@/lib/webanalysi-settings/types";

export { invalidateWebanalysiCache } from "@/lib/webanalysi-settings/cache";

const OPENAPI_TYPES = new Set<WebanalysiOpenApiType>([
  "sites",
  "summary",
  "visit",
  "path",
  "referrer",
  "os",
  "browser",
  "region",
  "timeseries",
]);

/** Map legacy dashboard `/api` type names / aliases to Open API resources. */
const LEGACY_TYPE_MAP: Record<string, WebanalysiOpenApiType> = {
  list: "sites",
  soft: "browser",
  area: "region",
  echarts: "timeseries",
  stats: "visit",
};

const TIME_RANGES = new Set<WebanalysiTimeRange>([
  "today",
  "1d",
  "7d",
  "30d",
  "60d",
  "90d",
]);

const ANALYTICS_TYPES = [
  "visit",
  "timeseries",
  "path",
  "referrer",
  "browser",
  "os",
  "region",
] as const satisfies ReadonlyArray<WebanalysiOpenApiType>;

const MAX_SITE_ID_LENGTH = 128;
const MAX_SITES = 200;
const MAX_HOST_LENGTH = 253;

export const assertWebanalysiSiteId = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    throw Object.assign(new Error("请选择站点。"), { status: 400 });
  }
  if (trimmed.length > MAX_SITE_ID_LENGTH) {
    throw Object.assign(new Error("站点 ID 过长。"), { status: 400 });
  }
  // AIOVTUE-analytics: 勿含引号、/、..、反斜杠等
  if (
    /[\u0000-\u001F\u007F"'`\\/]/.test(trimmed) ||
    trimmed.includes("..")
  ) {
    throw Object.assign(new Error("站点 ID 包含非法字符。"), { status: 400 });
  }
  return trimmed;
};

const resolveOpenApiType = (type: string): WebanalysiOpenApiType | null => {
  if (OPENAPI_TYPES.has(type as WebanalysiOpenApiType)) {
    return type as WebanalysiOpenApiType;
  }
  return LEGACY_TYPE_MAP[type] ?? null;
};

const sanitizeHostValue = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_HOST_LENGTH) return null;
  try {
    const url = new URL(
      /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`,
    );
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (url.username || url.password) return null;
    return url.host || null;
  } catch {
    return null;
  }
};

const sanitizeSitesPayload = (payload: {
  sites: string[];
  hosts: Record<string, string>;
}): WebanalysiListPayload => {
  const sites = payload.sites
    .map((site) => String(site ?? "").trim())
    .filter((site) => site.length > 0 && site.length <= MAX_SITE_ID_LENGTH)
    .filter(
      (site) =>
        !/[\u0000-\u001F\u007F"'`\\/]/.test(site) && !site.includes(".."),
    )
    .slice(0, MAX_SITES);

  const siteSet = new Set(sites);
  const hosts: Record<string, string> = {};
  for (const [site, host] of Object.entries(payload.hosts ?? {})) {
    if (!siteSet.has(site)) continue;
    const safeHost = sanitizeHostValue(host);
    if (safeHost) hosts[site] = safeHost;
  }

  return { sites, hosts };
};

const parseSitesData = (data: unknown): WebanalysiListPayload => {
  if (!Array.isArray(data)) return { sites: [], hosts: {} };

  const sites: string[] = [];
  const hosts: Record<string, string> = {};

  for (const item of data) {
    if (typeof item === "string") {
      const site = item.trim();
      if (site) sites.push(site);
      continue;
    }
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const site = String(
      row.site_id ?? row.siteId ?? row.siteID ?? row.id ?? "",
    ).trim();
    if (!site) continue;
    sites.push(site);
    const host = row.host ?? row.hostname ?? row.domain;
    if (typeof host === "string" && host.trim()) {
      hosts[site] = host.trim();
    }
  }

  return sanitizeSitesPayload({ sites, hosts });
};

const asStatNumber = (
  value: unknown,
): number | string | undefined => {
  if (typeof value === "number" || typeof value === "string") return value;
  return undefined;
};

const normalizeRankItems = (payload: unknown): WebanalysiRankItem[] => {
  if (!Array.isArray(payload)) return [];
  return payload.slice(0, 200).map((item) => {
    const row = (item ?? {}) as Record<string, unknown>;
    const views = asStatNumber(row.views);
    const visitor = asStatNumber(row.visitor);
    const visit = asStatNumber(row.visit);
    const value =
      typeof row.value === "number" || typeof row.value === "string"
        ? row.value
        : views !== undefined
          ? views
          : 0;
    return {
      name: String(row.name ?? "").slice(0, 2000),
      value,
      per: typeof row.per === "string" ? row.per.slice(0, 32) : undefined,
      code: typeof row.code === "string" ? row.code.slice(0, 64) : undefined,
      views,
      visitor,
      visit,
    };
  });
};

const normalizeVisit = (payload: unknown): WebanalysiVisitStats => {
  const row = (payload ?? {}) as Record<string, unknown>;
  return {
    views: asStatNumber(row.views),
    visitor: asStatNumber(row.visitor),
    visit: asStatNumber(row.visit),
  };
};

const normalizeSummary = (payload: unknown): WebanalysiSummaryStats => {
  const row = (payload ?? {}) as Record<string, unknown>;
  const todayRaw = (row.today ?? {}) as Record<string, unknown>;
  return {
    site_id:
      typeof row.site_id === "string"
        ? row.site_id.slice(0, MAX_SITE_ID_LENGTH)
        : undefined,
    total: normalizeVisit(row.total),
    today: {
      ...normalizeVisit(todayRaw),
      date:
        typeof todayRaw.date === "string"
          ? todayRaw.date.slice(0, 32)
          : undefined,
    },
  };
};

const resolveOpenApiEndpoint = (
  validatedBase: URL,
  resource: WebanalysiOpenApiType,
) => {
  const endpoint = new URL(`/openapi/${resource}`, validatedBase);
  if (endpoint.origin !== validatedBase.origin) {
    throw Object.assign(new Error("Webanalysi 地址无效。"), { status: 400 });
  }
  return endpoint;
};

const buildAuthHeaders = (password: string): HeadersInit => {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  const token = password.trim();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
};

const fetchOpenApi = async (options: {
  apiUrl: string;
  session: string;
  type: WebanalysiQueryType;
  siteID?: string;
  time?: WebanalysiTimeRange;
  validatedBaseUrl?: URL;
}) => {
  const openApiType = resolveOpenApiType(options.type);
  if (!openApiType) {
    throw Object.assign(new Error("无效的 Webanalysi 查询类型。"), { status: 400 });
  }

  const period =
    options.time && TIME_RANGES.has(options.time) ? options.time : "today";

  const validatedBase =
    options.validatedBaseUrl ?? (await assertSafeOutboundUrl(options.apiUrl));

  let requestedOrigin: string;
  try {
    requestedOrigin = new URL(options.apiUrl).origin;
  } catch {
    throw Object.assign(new Error("Webanalysi 地址无效。"), { status: 400 });
  }
  if (validatedBase.origin !== requestedOrigin) {
    throw Object.assign(new Error("Webanalysi 地址无效。"), { status: 400 });
  }

  const endpoint = resolveOpenApiEndpoint(validatedBase, openApiType);
  const body: Record<string, unknown> = {};
  // summary 免密且无需 period；sites 仅列站点
  if (openApiType !== "sites" && openApiType !== "summary") {
    body.period = period;
  }
  if (openApiType !== "sites") {
    body.site_id = options.siteID;
  }

  // summary 为公开接口，可不带密码；其余在已配置密码时用 Bearer
  const headers =
    openApiType === "summary"
      ? {
          Accept: "application/json",
          "Content-Type": "application/json",
        }
      : buildAuthHeaders(options.session);

  const response = await fetchValidatedOutboundUrl(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    cache: "no-store",
  });

  if (response.status >= 300 && response.status < 400) {
    throw Object.assign(new Error("Webanalysi 请求被重定向，已拒绝。"), {
      status: 400,
    });
  }

  const payload = (await response.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;

  if (!response.ok) {
    const code = payload?.code;
    if (response.status === 401 || code === 401) {
      throw Object.assign(
        new Error("访问统计密码校验失败，请在设置中更新密码。"),
        { status: 401 },
      );
    }
    const message =
      (payload?.message as string | undefined) ||
      `访问统计请求失败（${response.status}）`;
    throw Object.assign(new Error(scrubSecrets(String(message))), {
      status: response.status >= 400 && response.status < 600 ? response.status : 500,
    });
  }

  if (!payload?.success) {
    const code = payload?.code;
    if (code === 401) {
      throw Object.assign(
        new Error("访问统计密码校验失败，请在设置中更新密码。"),
        { status: 401 },
      );
    }
    const message =
      (payload?.message as string | undefined) || "访问统计返回错误。";
    throw new Error(scrubSecrets(String(message)));
  }

  return { openApiType, payload };
};

export const queryWebanalysi = async (options: {
  apiUrl: string;
  session: string;
  type: WebanalysiQueryType;
  siteID?: string;
  time?: WebanalysiTimeRange;
  validatedBaseUrl?: URL;
}) => {
  const { openApiType, payload } = await fetchOpenApi(options);

  if (openApiType === "sites") {
    const sanitized = parseSitesData(payload.data);
    return { type: "list" as const, ...sanitized };
  }

  if (openApiType === "summary") {
    return {
      type: "summary" as const,
      summary: normalizeSummary(payload.data),
    };
  }

  if (openApiType === "visit") {
    return { type: "visit" as const, visit: normalizeVisit(payload.data) };
  }

  if (openApiType === "timeseries") {
    return {
      type: "echarts" as const,
      points: normalizeRankItems(payload.data),
    };
  }

  return {
    type: "rank" as const,
    items: normalizeRankItems(payload.data),
  };
};

export const queryWebanalysiSites = async (options: {
  userId: string;
  apiUrl: string;
  session: string;
}): Promise<WebanalysiListPayload> => {
  const key = `${webanalysiCachePrefix(options.userId, options.apiUrl)}:sites`;
  return webanalysiCache.get(key, async () => {
    const validatedBaseUrl = await assertSafeOutboundUrl(options.apiUrl);
    const result = await queryWebanalysi({
      apiUrl: options.apiUrl,
      session: options.session,
      type: "sites",
      validatedBaseUrl,
    });
    if (result.type !== "list") {
      return { sites: [], hosts: {} };
    }
    return { sites: result.sites, hosts: result.hosts };
  });
};

export const queryWebanalysiAnalyticsBundle = async (options: {
  userId: string;
  apiUrl: string;
  session: string;
  siteID: string;
  time: WebanalysiTimeRange;
}): Promise<WebanalysiAnalyticsBundle> => {
  const siteID = assertWebanalysiSiteId(options.siteID);
  const time = TIME_RANGES.has(options.time) ? options.time : "today";
  const key = `${webanalysiCachePrefix(options.userId, options.apiUrl)}:analytics:${siteID}:${time}`;

  return webanalysiCache.get(key, async () => {
    const validatedBaseUrl = await assertSafeOutboundUrl(options.apiUrl);

    const results = await Promise.all(
      ANALYTICS_TYPES.map(async (type) => ({
        type,
        data: await queryWebanalysi({
          apiUrl: options.apiUrl,
          session: options.session,
          type,
          siteID,
          time,
          validatedBaseUrl,
        }),
      })),
    );

    const bundle: WebanalysiAnalyticsBundle = {
      summary: null,
      visit: {},
      echarts: [],
      paths: [],
      referrers: [],
      browsers: [],
      systems: [],
      areas: [],
    };

    for (const entry of results) {
      const { type, data } = entry;
      if (data.type === "visit") bundle.visit = data.visit;
      if (data.type === "echarts") bundle.echarts = data.points;
      if (data.type === "rank") {
        if (type === "path") bundle.paths = data.items;
        if (type === "referrer") bundle.referrers = data.items;
        if (type === "browser") bundle.browsers = data.items;
        if (type === "os") bundle.systems = data.items;
        if (type === "region") bundle.areas = data.items;
      }
    }

    return bundle;
  });
};

export { TIME_RANGES as WEBANALYSI_TIME_RANGES, OPENAPI_TYPES as WEBANALYSI_OPENAPI_TYPES };
