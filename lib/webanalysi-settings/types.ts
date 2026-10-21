export type WebanalysiOpenApiType =
  | "sites"
  | "summary"
  | "visit"
  | "path"
  | "referrer"
  | "os"
  | "browser"
  | "region"
  | "timeseries";

/** @deprecated Prefer WebanalysiOpenApiType; kept for internal route aliases. */
export type WebanalysiQueryType =
  | WebanalysiOpenApiType
  | "list"
  | "soft"
  | "area"
  | "echarts"
  | "stats"
  | "Login";

export type WebanalysiTimeRange =
  | "today"
  | "1d"
  | "7d"
  | "30d"
  | "60d"
  | "90d";

export type WebanalysiSettingsPublic = {
  apiUrl: string;
  hasPassword: boolean;
  configured: boolean;
  updatedAt: string | null;
};

export type WebanalysiRankItem = {
  name: string;
  value: number | string;
  per?: string;
  code?: string;
  views?: number | string;
  visitor?: number | string;
  visit?: number | string;
};

export type WebanalysiVisitStats = {
  views?: number | string;
  visitor?: number | string;
  visit?: number | string;
};

/** `/openapi/summary`：合成总数（历史+今日）与今日实时。 */
export type WebanalysiSummaryStats = {
  site_id?: string;
  total: WebanalysiVisitStats;
  today: WebanalysiVisitStats & { date?: string };
};

export type WebanalysiListPayload = {
  sites: string[];
  hosts: Record<string, string>;
};

export type WebanalysiAnalyticsBundle = {
  summary: WebanalysiSummaryStats | null;
  visit: WebanalysiVisitStats;
  echarts: WebanalysiRankItem[];
  paths: WebanalysiRankItem[];
  referrers: WebanalysiRankItem[];
  browsers: WebanalysiRankItem[];
  systems: WebanalysiRankItem[];
  areas: WebanalysiRankItem[];
};

export type WebanalysiBundleResponse =
  | { kind: "sites"; sites: string[]; hosts: Record<string, string> }
  | { kind: "analytics"; analytics: WebanalysiAnalyticsBundle };

export type WebanalysiQueryResult =
  | { type: "list"; sites: string[]; hosts: Record<string, string> }
  | { type: "summary"; summary: WebanalysiSummaryStats }
  | { type: "visit"; visit: WebanalysiVisitStats }
  | { type: "echarts"; points: WebanalysiRankItem[] }
  | { type: "rank"; items: WebanalysiRankItem[] };
