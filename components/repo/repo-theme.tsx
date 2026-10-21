"use client";

import { useEffect, useMemo } from "react";
import useSWR from "swr";
import { useTheme } from "next-themes";
import { useConfig } from "@/contexts/config-context";
import { requireApiSuccess } from "@/lib/api-client";
import type { ApiSuccess } from "@/types/api";
import {
  applyPrimaryColorTheme,
  clearPrimaryColorTheme,
} from "@/lib/theme/primary-color";

type ThemePayload = {
  primaryColor?: string | null;
};

export function RepoTheme() {
  const { config } = useConfig();
  const { resolvedTheme } = useTheme();

  const themeApiUrl = useMemo(() => {
    if (!config) return null;
    return `/api/${config.owner}/${config.repo}/${encodeURIComponent(config.branch)}/theme`;
  }, [config]);

  const { data } = useSWR(
    themeApiUrl,
    async (url: string) => {
      const response = await fetch(url);
      const payload = await requireApiSuccess<ApiSuccess<ThemePayload>>(
        response,
        "加载站点主题色失败",
      );
      return payload.data;
    },
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      dedupingInterval: 60_000,
    },
  );

  const primaryColor =
    typeof data?.primaryColor === "string" ? data.primaryColor : undefined;

  useEffect(() => {
    applyPrimaryColorTheme(
      primaryColor,
      resolvedTheme === "dark" ? "dark" : "light",
    );

    return () => {
      clearPrimaryColorTheme();
    };
  }, [primaryColor, resolvedTheme]);

  return null;
}
