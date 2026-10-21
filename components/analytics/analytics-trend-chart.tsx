"use client";

import { useEffect, useRef, useState } from "react";
import * as echarts from "echarts/core";
import type { EChartsCoreOption } from "echarts/core";
import { LineChart } from "echarts/charts";
import { GridComponent, TooltipComponent } from "echarts/components";
import { SVGRenderer } from "echarts/renderers";
import type { WebanalysiRankItem, WebanalysiTimeRange } from "@/lib/webanalysi-settings/types";

echarts.use([LineChart, GridComponent, TooltipComponent, SVGRenderer]);

type ChartThemeColors = {
  primary: string;
  background: string;
  mutedForeground: string;
  axisLine: string;
  areaTop: string;
  tooltipBackground: string;
  tooltipBorder: string;
  tooltipText: string;
};

const readResolvedColor = (host: HTMLElement, cssColor: string) => {
  const probe = document.createElement("span");
  probe.style.color = cssColor;
  host.appendChild(probe);
  const resolved = getComputedStyle(probe).color;
  host.removeChild(probe);
  return resolved || cssColor;
};

const getChartThemeColors = (host: HTMLElement): ChartThemeColors => ({
  primary: readResolvedColor(host, "var(--primary)"),
  background: readResolvedColor(host, "var(--background)"),
  mutedForeground: readResolvedColor(host, "var(--muted-foreground)"),
  axisLine: readResolvedColor(
    host,
    "color-mix(in oklch, var(--border) 75%, transparent)",
  ),
  areaTop: readResolvedColor(
    host,
    "color-mix(in oklch, var(--primary) 22%, transparent)",
  ),
  tooltipBackground: readResolvedColor(host, "var(--popover)"),
  tooltipBorder: readResolvedColor(host, "var(--border)"),
  tooltipText: readResolvedColor(host, "var(--popover-foreground)"),
});

const buildChartOption = (
  points: WebanalysiRankItem[],
  timeRange: WebanalysiTimeRange,
  colors: ChartThemeColors,
): EChartsCoreOption => {
  const suffix = ["today", "1d"].includes(timeRange) ? "点" : "日";
  const dateList = points.map((item) => `${item.name}${suffix}`);
  const valueList = points.map((item) => Number(item.value) || 0);
  const areaGradient = {
    colorStops: [
      { offset: 0, color: colors.areaTop },
      { offset: 1, color: colors.background },
    ],
    x: 0,
    y: 0,
    x2: 0,
    y2: 1,
    type: "linear" as const,
    global: false,
  };

  return {
    animation: false,
    grid: { left: "0", right: "0", bottom: "0", top: "10", containLabel: true },
    xAxis: {
      type: "category",
      data: dateList,
      axisLabel: { color: colors.mutedForeground },
      axisLine: {
        lineStyle: { color: colors.axisLine, width: 2, type: "dashed" },
      },
    },
    yAxis: {
      type: "value",
      axisLabel: { color: colors.mutedForeground },
      splitLine: {
        lineStyle: { color: colors.axisLine, type: "dashed" },
      },
    },
    tooltip: {
      trigger: "axis",
      backgroundColor: colors.tooltipBackground,
      borderColor: colors.tooltipBorder,
      textStyle: { color: colors.tooltipText },
      formatter: (params: unknown) => {
        const list = Array.isArray(params) ? params : [params];
        const first = list[0] as { dataIndex?: number; name?: string } | undefined;
        const index =
          typeof first?.dataIndex === "number" ? first.dataIndex : -1;
        const point = index >= 0 ? points[index] : undefined;
        const title = first?.name || point?.name || "";
        const views = point?.views ?? point?.value ?? "—";
        const visitor = point?.visitor ?? "—";
        const visit = point?.visit ?? "—";
        return [
          title,
          `浏览量：${views}`,
          `访客：${visitor}`,
          `访问次数：${visit}`,
        ].join("<br/>");
      },
    },
    series: [
      {
        name: "浏览量",
        data: valueList,
        type: "line",
        smooth: true,
        animation: false,
        emphasis: {
          focus: "series",
          itemStyle: { borderWidth: 2, color: colors.primary },
          areaStyle: { color: areaGradient },
        },
        lineStyle: {
          width: 2,
          color: colors.primary,
        },
        showSymbol: false,
        areaStyle: {
          opacity: 1,
          color: areaGradient,
        },
      },
    ],
  };
};

export function AnalyticsTrendChart({
  points,
  timeRange,
}: {
  points: WebanalysiRankItem[];
  timeRange: WebanalysiTimeRange;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);
  const [themeVersion, setThemeVersion] = useState(0);

  useEffect(() => {
    const root = document.documentElement;
    const observer = new MutationObserver(() => {
      setThemeVersion((value) => value + 1);
    });
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    chartRef.current = echarts.init(container, null, {
      renderer: "svg",
      useDirtyRect: true,
    });

    const resize = () => chartRef.current?.resize();
    window.addEventListener("resize", resize);
    const observer = new ResizeObserver(resize);
    observer.observe(container);

    return () => {
      window.removeEventListener("resize", resize);
      observer.disconnect();
      chartRef.current?.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    const chart = chartRef.current;
    if (!chart || !container) return;

    if (points.length === 0) {
      chart.clear();
      return;
    }

    const colors = getChartThemeColors(container);
    chart.clear();
    chart.setOption(buildChartOption(points, timeRange, colors), { notMerge: true });
    chart.resize();
  }, [points, timeRange, themeVersion]);

  return (
    <div className="data-view relative">
      <div ref={containerRef} className="absolute inset-0" />
      {points.length === 0 ? (
        <div className="absolute inset-0 flex items-center justify-center">
          <p className="text-muted-foreground text-sm">暂无趋势数据</p>
        </div>
      ) : null}
    </div>
  );
}
