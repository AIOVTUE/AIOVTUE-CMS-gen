"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type SyntheticEvent,
} from "react";
import Link from "next/link";
import useSWR from "swr";
import { Loader } from "lucide-react";
import dynamic from "next/dynamic";
import {
  getSessionCached,
  invalidateSessionCacheByPrefix,
  peekSessionCache,
  setSessionCache,
} from "@/lib/session-memory-cache";
import { useConfig } from "@/contexts/config-context";
import { useRepoHeader } from "@/components/repo/repo-header-context";
import { RepoPageHeader } from "@/components/repo/repo-page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  loadWebanalysiAnalyticsAction,
  loadWebanalysiBootstrapAction,
  loadWebanalysiSitesAction,
} from "@/lib/webanalysi-settings/actions";
import {
  SITE_STORAGE_KEY,
  WEBANALYSI_SITES_CACHE_KEY,
  analyticsDataCacheKey,
} from "@/lib/webanalysi-settings/client-cache-keys";
import type {
  WebanalysiAnalyticsBundle,
  WebanalysiRankItem,
  WebanalysiSettingsPublic,
  WebanalysiTimeRange,
  WebanalysiVisitStats,
} from "@/lib/webanalysi-settings/types";
import { requireApiSuccess } from "@/lib/api-client";
import type { ApiSuccess } from "@/types/api";
import { cn } from "@/lib/utils";
import { faviconUrlFromReferrer } from "@/lib/site-url/favicon";
import "./analytics-panel.css";

const AnalyticsTrendChart = dynamic(
  () =>
    import("@/components/analytics/analytics-trend-chart").then(
      (m) => m.AnalyticsTrendChart,
    ),
  {
    ssr: false,
    loading: () => <Skeleton className="h-[220px] w-full" />,
  },
);

const TIME_OPTIONS: Array<{ label: string; value: WebanalysiTimeRange }> = [
  { label: "今天", value: "today" },
  { label: "昨天", value: "1d" },
  { label: "近 7 天", value: "7d" },
  { label: "近 30 天", value: "30d" },
  { label: "近 60 天", value: "60d" },
  { label: "近 90 天", value: "90d" },
];

type AnalyticsSitesCache = {
  sites: string[];
  hosts: Record<string, string>;
};

type AnalyticsDataCache = WebanalysiAnalyticsBundle;

const hideBrokenIcon = (event: SyntheticEvent<HTMLImageElement>) => {
  event.currentTarget.onerror = null;
  event.currentTarget.style.visibility = "hidden";
};

function ReferrerFavicon({ value }: { value: string }) {
  const iconUrl = useMemo(() => faviconUrlFromReferrer(value), [value]);
  const [visible, setVisible] = useState(Boolean(iconUrl));

  useEffect(() => {
    setVisible(Boolean(iconUrl));
  }, [iconUrl]);

  if (!iconUrl || !visible) return null;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={iconUrl}
      alt=""
      className="size-4 shrink-0 rounded-sm object-cover"
      referrerPolicy="no-referrer"
      onError={() => setVisible(false)}
    />
  );
}

async function fetchSettings(url: string): Promise<WebanalysiSettingsPublic> {
  const response = await fetch(url);
  const payload = await requireApiSuccess<ApiSuccess<WebanalysiSettingsPublic>>(
    response,
    "加载访问设置失败",
  );
  return payload.data;
}

async function fetchSitesBundle(): Promise<AnalyticsSitesCache> {
  const result = await loadWebanalysiSitesAction();
  if (!result.ok) {
    throw new Error(result.message);
  }
  return result.data;
}

async function fetchAnalyticsBundle(
  siteId: string,
  time: WebanalysiTimeRange,
): Promise<AnalyticsDataCache> {
  const result = await loadWebanalysiAnalyticsAction({
    siteID: siteId,
    time,
  });
  if (!result.ok) {
    throw new Error(result.message);
  }
  return result.data;
}

function RankSkeleton() {
  return (
    <div className="space-y-4 pt-8 w-full">
      <Skeleton className="h-6 w-60" />
      <Skeleton className="h-6 w-80" />
      <Skeleton className="h-6 w-[100px]" />
      <Skeleton className="h-6 w-60" />
      <Skeleton className="h-6 w-80" />
      <Skeleton className="h-6 w-[100px]" />
      <Skeleton className="h-6 w-80" />
      <Skeleton className="h-6 w-full" />
    </div>
  );
}

function PageItemRow({
  item,
  nameNode,
  icon,
}: {
  item: WebanalysiRankItem;
  nameNode: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="page-item">
      {icon}
      <div className="page-item-name">{nameNode}</div>
      <span className="page-item-value">{item.value}</span>
      <em>
        {item.per}
        <i style={{ width: item.per || "0%" }} />
      </em>
    </div>
  );
}

function RankCard({
  title,
  items,
  loading,
  className,
  children,
}: {
  title: string;
  items: WebanalysiRankItem[];
  loading: boolean;
  className?: string;
  children?: (item: WebanalysiRankItem, index: number) => ReactNode;
}) {
  return (
    <Card
      className={cn(
        "rank-card analytics-reveal gap-0 py-0 shadow-sm",
        className,
      )}
    >
      <CardHeader className="gap-1 pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="box-border min-w-0 pt-0 pb-2">
        <div
          className={cn(
            "pages-list",
            loading ? "analytics-skeleton-pulse" : "analytics-list-enter",
          )}
        >
          {loading ? (
            <RankSkeleton />
          ) : items.length === 0 ? (
            <p className="text-muted-foreground px-2 pt-4 text-sm">暂无数据</p>
          ) : children ? (
            items.map((item, index) => children(item, index))
          ) : (
            items.map((item, index) => (
              <PageItemRow
                key={`${item.name}-${index}`}
                item={item}
                nameNode={
                  <span className="line-clamp-1">{item.name || "（未知）"}</span>
                }
              />
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function StatSkeleton() {
  return (
    <div className="views-item w-full overflow-hidden">
      <Skeleton className="mx-auto h-3 w-10 md:ml-auto" />
      <Skeleton className="mx-auto mt-1 h-5 w-12 md:ml-auto" />
    </div>
  );
}

export function AnalyticsPanel() {
  const { config } = useConfig();
  if (!config) throw new Error("Config not found.");

  const { data: settings, isLoading: settingsLoading, error: settingsError } =
    useSWR("/api/webanalysi/settings", fetchSettings, {
      revalidateOnFocus: false,
      shouldRetryOnError: false,
    });

  const [siteList, setSiteList] = useState<string[]>([]);
  const [siteHosts, setSiteHosts] = useState<Record<string, string>>({});
  const [siteValue, setSiteValue] = useState("");
  const [timeValue, setTimeValue] = useState<WebanalysiTimeRange>("today");
  const [sitesLoading, setSitesLoading] = useState(false);
  const [dataLoading, setDataLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [visit, setVisit] = useState<WebanalysiVisitStats | null>(null);
  const [echarts, setEcharts] = useState<WebanalysiRankItem[] | null>(null);
  const [paths, setPaths] = useState<WebanalysiRankItem[] | null>(null);
  const [referrers, setReferrers] = useState<WebanalysiRankItem[] | null>(null);
  const [browsers, setBrowsers] = useState<WebanalysiRankItem[] | null>(null);
  const [systems, setSystems] = useState<WebanalysiRankItem[] | null>(null);
  const [areas, setAreas] = useState<WebanalysiRankItem[] | null>(null);
  const analyticsRequestIdRef = useRef(0);
  const sitesRequestIdRef = useRef(0);

  const headerNode = useMemo(
    () => <RepoPageHeader title="访问" />,
    [],
  );
  useRepoHeader({ header: headerNode });

  const iconBase = settings?.apiUrl?.replace(/\/$/, "") ?? "";

  const resolveSiteValue = useCallback((sites: string[]) => {
    const savedSite =
      typeof window !== "undefined"
        ? window.localStorage.getItem(SITE_STORAGE_KEY)
        : null;
    return savedSite && sites.includes(savedSite) ? savedSite : sites[0] || "";
  }, []);

  const applySitesCache = useCallback(
    (data: AnalyticsSitesCache) => {
      const sites = data.sites ?? [];
      setSiteList(sites);
      setSiteHosts(data.hosts ?? {});
      const nextSite = resolveSiteValue(sites);
      setSiteValue(nextSite);
      if (nextSite) {
        window.localStorage.setItem(SITE_STORAGE_KEY, nextSite);
      }
    },
    [resolveSiteValue],
  );

  const applyAnalyticsCache = useCallback((data: AnalyticsDataCache) => {
    setVisit(data.visit);
    setEcharts(data.echarts);
    setPaths(data.paths);
    setReferrers(data.referrers);
    setBrowsers(data.browsers);
    setSystems(data.systems);
    setAreas(data.areas);
  }, []);

  const loadSites = useCallback(async () => {
    const requestId = ++sitesRequestIdRef.current;
    const cached = peekSessionCache<AnalyticsSitesCache>(WEBANALYSI_SITES_CACHE_KEY);
    if (cached) {
      if (requestId !== sitesRequestIdRef.current) return;
      applySitesCache(cached);
      return;
    }

    setSitesLoading(true);
    setDataLoading(true);
    setError(null);
    try {
      const preferredSite =
        typeof window !== "undefined"
          ? window.localStorage.getItem(SITE_STORAGE_KEY) || ""
          : "";
      const sitesData = await getSessionCached(
        WEBANALYSI_SITES_CACHE_KEY,
        async () => {
          const result = await loadWebanalysiBootstrapAction({
            siteID: preferredSite,
            time: timeValue,
          });
          if (!result.ok) throw new Error(result.message);
          if (result.data.siteID && result.data.analytics) {
            setSessionCache(
              analyticsDataCacheKey(result.data.siteID, result.data.time),
              result.data.analytics,
            );
          }
          return {
            sites: result.data.sites,
            hosts: result.data.hosts,
          } satisfies AnalyticsSitesCache;
        },
      );
      if (requestId !== sitesRequestIdRef.current) return;
      applySitesCache(sitesData);

      const nextSite = resolveSiteValue(sitesData.sites);
      if (nextSite) {
        const analyticsCached = peekSessionCache<AnalyticsDataCache>(
          analyticsDataCacheKey(nextSite, timeValue),
        );
        if (analyticsCached) {
          applyAnalyticsCache(analyticsCached);
          setDataLoading(false);
        }
      }
    } catch (loadError) {
      if (requestId !== sitesRequestIdRef.current) return;
      setError(loadError instanceof Error ? loadError.message : "加载站点失败");
      try {
        const data = await getSessionCached(WEBANALYSI_SITES_CACHE_KEY, () =>
          fetchSitesBundle(),
        );
        if (requestId !== sitesRequestIdRef.current) return;
        applySitesCache(data);
      } catch {
        /* keep bootstrap error */
      }
    } finally {
      if (requestId === sitesRequestIdRef.current) {
        setSitesLoading(false);
      }
    }
  }, [applyAnalyticsCache, applySitesCache, resolveSiteValue, timeValue]);

  const loadAnalytics = useCallback(async () => {
    if (!siteValue || !siteList.includes(siteValue)) return;

    const cacheKey = analyticsDataCacheKey(siteValue, timeValue);
    const requestId = ++analyticsRequestIdRef.current;

    const cached = peekSessionCache<AnalyticsDataCache>(cacheKey);
    if (cached) {
      if (requestId !== analyticsRequestIdRef.current) return;
      applyAnalyticsCache(cached);
      setDataLoading(false);
      setError(null);
      return;
    }

    setDataLoading(true);
    setError(null);

    try {
      const data = await getSessionCached(cacheKey, () =>
        fetchAnalyticsBundle(siteValue, timeValue),
      );
      if (requestId !== analyticsRequestIdRef.current) return;
      applyAnalyticsCache(data);
    } catch (loadError) {
      if (requestId !== analyticsRequestIdRef.current) return;
      setError(loadError instanceof Error ? loadError.message : "加载访问数据失败");
    } finally {
      if (requestId === analyticsRequestIdRef.current) {
        setDataLoading(false);
      }
    }
  }, [siteValue, siteList, timeValue, applyAnalyticsCache]);

  const configuredApiUrl = settings?.apiUrl ?? "";
  const previousApiUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!settings) return;
    if (previousApiUrlRef.current === null) {
      previousApiUrlRef.current = configuredApiUrl;
      return;
    }
    if (previousApiUrlRef.current === configuredApiUrl) return;
    previousApiUrlRef.current = configuredApiUrl;

    // Settings endpoint/password changed — drop browser-side analytics cache.
    invalidateSessionCacheByPrefix("webanalysi:");
    sitesRequestIdRef.current += 1;
    analyticsRequestIdRef.current += 1;
    setSitesLoading(false);
    setDataLoading(false);
    setSiteList([]);
    setSiteHosts({});
    setSiteValue("");
    setVisit(null);
    setEcharts(null);
    setPaths(null);
    setReferrers(null);
    setBrowsers(null);
    setSystems(null);
    setAreas(null);
    setError(null);
  }, [settings, configuredApiUrl]);

  useEffect(() => {
    if (!settings?.configured) return;
    void loadSites();
  }, [settings?.configured, configuredApiUrl, loadSites]);

  useEffect(() => {
    if (!settings?.configured || sitesLoading || !siteValue) return;
    void loadAnalytics();
  }, [settings?.configured, sitesLoading, siteValue, timeValue, loadAnalytics]);

  const toolbarBusy = sitesLoading;
  const initialLoading = visit == null && (dataLoading || sitesLoading);
  const contentRefreshing = dataLoading && visit != null;

  const getPageUrl = (path: string) => {
    if (/^https?:\/\//i.test(path)) {
      try {
        const direct = new URL(path);
        return direct.protocol === "http:" || direct.protocol === "https:"
          ? direct.href
          : "";
      } catch {
        return "";
      }
    }
    const host = siteHosts[siteValue];
    if (!host) return "";
    try {
      const url = new URL(/^https?:\/\//i.test(host) ? host : `https://${host}`);
      if (url.protocol !== "http:" && url.protocol !== "https:") return "";
      const [pathname = "/", search = ""] = path.split("?");
      url.pathname = pathname;
      url.search = search ? (search.startsWith("?") ? search : `?${search}`) : "";
      return url.href;
    } catch {
      return "";
    }
  };

  const getReferrerUrl = (value: string) => {
    if (!/^https?:\/\//i.test(value)) return "";
    try {
      const url = new URL(value);
      return url.protocol === "http:" || url.protocol === "https:" ? url.href : "";
    } catch {
      return "";
    }
  };

  const getAreaIcon = (code: string) => {
    const safeCode = code.replace(/[^a-zA-Z0-9_-]/g, "");
    if (!safeCode || !iconBase) return "";
    try {
      const base = iconBase.endsWith("/") ? iconBase : `${iconBase}/`;
      const url = new URL(`icon/${safeCode}.png`, base);
      return url.protocol === "http:" || url.protocol === "https:" ? url.href : "";
    } catch {
      return "";
    }
  };

  return (
    <section className="analytics-panel">
      {settingsLoading ? (
        <div className="analytics-reveal text-muted-foreground flex h-40 items-center justify-center gap-2 text-sm">
          <Loader className="size-4 animate-spin" />
          加载设置中…
        </div>
      ) : settingsError ? (
        <Card className="analytics-reveal">
          <CardHeader>
            <CardTitle className="text-base">无法加载访问统计设置</CardTitle>
            <CardDescription>
              {settingsError instanceof Error
                ? settingsError.message
                : "加载设置失败，请稍后重试。"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/settings" className={cn(buttonVariants({ variant: "default" }))}>
              前往设置
            </Link>
          </CardContent>
        </Card>
      ) : !settings?.configured ? (
        <Card className="analytics-reveal">
          <CardHeader>
            <CardTitle className="text-base">尚未配置访问统计</CardTitle>
            <CardDescription>
              请先在设置中填写 AIOVTUE-analytics 服务地址，保存后即可查看访问数据。
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/settings" className={cn(buttonVariants({ variant: "default" }))}>
              前往设置
            </Link>
          </CardContent>
        </Card>
      ) : (
        <section className="main analytics-reveal">
          <div className="analytics-toolbar pb-5">
            <div className="analytics-toolbar__selects">
              <div className="min-w-0 flex-1">
                <Select
                  value={siteValue || undefined}
                  onValueChange={(value) => {
                    setSiteValue(value);
                    window.localStorage.setItem(SITE_STORAGE_KEY, value);
                  }}
                  disabled={toolbarBusy || siteList.length === 0}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="选择站点" />
                  </SelectTrigger>
                  <SelectContent position="popper" align="start" sideOffset={4}>
                    <SelectGroup>
                      <SelectLabel>Web Site</SelectLabel>
                      {siteList.map((site) => (
                        <SelectItem key={site} value={site}>
                          {site}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
              <div className="min-w-0 flex-1">
                <Select
                  value={timeValue}
                  onValueChange={(value) =>
                    setTimeValue(value as WebanalysiTimeRange)
                  }
                  disabled={toolbarBusy || !siteValue}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="选择周期" />
                  </SelectTrigger>
                  <SelectContent position="popper" align="start" sideOffset={4}>
                    <SelectGroup>
                      <SelectLabel>统计周期</SelectLabel>
                      {TIME_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div
              key={`stats-${siteValue}-${timeValue}-${visit ? "ready" : "loading"}`}
              className={cn(
                "analytics-toolbar__stats-stack",
                contentRefreshing && "analytics-is-refreshing",
              )}
            >
              <div className="views-row analytics-toolbar__stats">
                {initialLoading || visit == null ? (
                  <>
                    <StatSkeleton />
                    <StatSkeleton />
                    <StatSkeleton />
                  </>
                ) : (
                  <div className="analytics-stats-enter contents">
                    <div className="views-item">
                      <span>浏览量</span>
                      <p>{visit.views ?? "—"}</p>
                    </div>
                    <div className="views-item">
                      <span>访客</span>
                      <p>{visit.visitor ?? "—"}</p>
                    </div>
                    <div className="views-item">
                      <span>访问次数</span>
                      <p>{visit.visit ?? "—"}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {error ? <p className="text-destructive mb-4 text-sm">{error}</p> : null}

          <div
            key={`chart-${siteValue}-${timeValue}-${echarts ? "ready" : "loading"}`}
            className={cn(
              "relative",
              contentRefreshing && "analytics-is-refreshing",
            )}
          >
            {initialLoading || echarts == null ? (
              <div className="data-view analytics-skeleton-pulse flex items-center justify-center">
                <Loader className="text-muted-foreground size-5 animate-spin" />
              </div>
            ) : (
              <div className="analytics-chart-enter">
                <AnalyticsTrendChart points={echarts} timeRange={timeValue} />
              </div>
            )}
            {contentRefreshing ? (
              <div className="analytics-refresh-overlay pointer-events-none absolute inset-0 flex items-center justify-center">
                <Loader className="text-muted-foreground size-5 animate-spin" />
              </div>
            ) : null}
          </div>

          <div
            key={`ranks-a-${siteValue}-${timeValue}`}
            className={cn(
              "grid grid-cols-1 gap-4 pt-8 lg:grid-cols-2",
              contentRefreshing && "analytics-is-refreshing",
            )}
          >
            <RankCard title="页面" items={paths ?? []} loading={initialLoading || paths == null}>
              {(item, index) => {
                const href = getPageUrl(item.name);
                return (
                  <PageItemRow
                    key={`${item.name}-${index}`}
                    item={item}
                    nameNode={
                      href ? (
                        <a
                          href={href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="page-item-link line-clamp-1"
                          onClick={(event) => {
                            if (!href) event.preventDefault();
                          }}
                        >
                          {item.name}
                        </a>
                      ) : (
                        <span className="line-clamp-1">{item.name}</span>
                      )
                    }
                  />
                );
              }}
            </RankCard>

            <RankCard
              title="来源"
              items={referrers ?? []}
              loading={initialLoading || referrers == null}
            >
              {(item, index) => {
                const href = getReferrerUrl(item.name);
                const label = item.name || "(None)";
                return (
                  <PageItemRow
                    key={`${item.name}-${index}`}
                    item={item}
                    icon={<ReferrerFavicon value={item.name} />}
                    nameNode={
                      href ? (
                        <a
                          href={href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="page-item-link line-clamp-1 cursor-pointer"
                          onClick={(event) => {
                            if (!href) event.preventDefault();
                          }}
                        >
                          {label}
                        </a>
                      ) : (
                        <span className="line-clamp-1">{label}</span>
                      )
                    }
                  />
                );
              }}
            </RankCard>
          </div>

          <div
            key={`ranks-b-${siteValue}-${timeValue}`}
            className={cn(
              "grid grid-cols-1 gap-4 pt-4 lg:grid-cols-2",
              contentRefreshing && "analytics-is-refreshing",
            )}
          >
            <RankCard
              title="浏览器"
              items={browsers ?? []}
              loading={initialLoading || browsers == null}
            />

            <RankCard
              title="操作系统"
              items={systems ?? []}
              loading={initialLoading || systems == null}
            >
              {(item, index) => (
                <PageItemRow
                  key={`${item.name}-${index}`}
                  item={item}
                  icon={
                    getAreaIcon(item.name) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        className="os"
                        src={getAreaIcon(item.name)}
                        alt={item.name || "Unknown"}
                        onError={hideBrokenIcon}
                      />
                    ) : null
                  }
                  nameNode={<span className="line-clamp-1">{item.name}</span>}
                />
              )}
            </RankCard>

            <RankCard
              title="地区"
              className="lg:col-span-2"
              items={areas ?? []}
              loading={initialLoading || areas == null}
            >
              {(item, index) => {
                // Open API: name=CN, code=中国；旧接口可能相反。
                const isoCode = [item.name, item.code].find(
                  (value) =>
                    typeof value === "string" &&
                    /^[A-Za-z]{2,3}$/.test(value.trim()),
                );
                const label =
                  [item.code, item.name].find(
                    (value) =>
                      typeof value === "string" &&
                      value.trim() &&
                      !/^[A-Za-z]{2,3}$/.test(value.trim()),
                  ) ||
                  item.code ||
                  item.name ||
                  "未知";
                const iconSrc = getAreaIcon(isoCode || item.name || item.code || "");
                return (
                  <PageItemRow
                    key={`${item.name}-${index}`}
                    item={item}
                    icon={
                      iconSrc ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={iconSrc}
                          alt={String(label)}
                          onError={hideBrokenIcon}
                        />
                      ) : null
                    }
                    nameNode={
                      <span className="line-clamp-1">{label}</span>
                    }
                  />
                );
              }}
            </RankCard>
          </div>
        </section>
      )}
    </section>
  );
}
