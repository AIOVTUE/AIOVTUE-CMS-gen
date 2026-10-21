import type { WebanalysiTimeRange } from "@/lib/webanalysi-settings/types";

export const WEBANALYSI_SITES_CACHE_KEY = "webanalysi:sites";

export const analyticsDataCacheKey = (
  siteId: string,
  time: WebanalysiTimeRange,
) => `webanalysi:data:${siteId}:${time}`;

export const SITE_STORAGE_KEY = "pagecms-webanalysi-site";

export const COMMENT_LIST_DEFAULT_QUERY =
  "/api/comment/list?page=1&per=20";
