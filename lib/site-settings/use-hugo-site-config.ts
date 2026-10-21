"use client";

import { useMemo } from "react";
import useSWR from "swr";
import { useConfig } from "@/contexts/config-context";
import { parse } from "@/lib/serialization";
import { requireApiSuccess } from "@/lib/api-client";
import { getSchemaByName } from "@/lib/schema";
import type { ApiSuccess } from "@/types/api";
import { getByPath } from "@/lib/site-settings/paths";

const SITE_CONFIG_PATH = "hugo.toml";
const SITE_CONFIG_NAME = "site-config";

type EntryPayload = {
  contentObject?: { body?: string };
};

export function useHugoSiteConfig() {
  const { config } = useConfig();

  const hasSiteConfigSchema = useMemo(() => {
    if (!config?.object) return false;
    return Boolean(getSchemaByName(config.object, SITE_CONFIG_NAME));
  }, [config]);

  const entryApiUrl = useMemo(() => {
    if (!config || !hasSiteConfigSchema) return null;
    return `/api/${config.owner}/${config.repo}/${encodeURIComponent(config.branch)}/entries/${encodeURIComponent(SITE_CONFIG_PATH)}?name=${encodeURIComponent(SITE_CONFIG_NAME)}`;
  }, [config, hasSiteConfigSchema]);

  const { data, error, isLoading } = useSWR(
    entryApiUrl,
    async (url: string) => {
      const response = await fetch(url);
      if (response.status === 404) return null;
      const payload = await requireApiSuccess<ApiSuccess<EntryPayload>>(
        response,
        "加载站点配置失败",
      );
      return payload.data;
    },
  );

  const parsed = useMemo(() => {
    const body = data?.contentObject?.body;
    if (typeof body !== "string") return null;
    try {
      return parse(body, { format: "toml" }) as Record<string, unknown>;
    } catch {
      return null;
    }
  }, [data]);

  const baseURL = useMemo(() => {
    const raw = getByPath(parsed ?? {}, "baseURL");
    if (typeof raw !== "string") return "";
    return raw.trim();
  }, [parsed]);

  const favicon = useMemo(() => {
    const raw = getByPath(parsed ?? {}, "params.favicon");
    if (typeof raw !== "string") return "";
    const value = raw.trim();
    if (!value) return "";
    if (/^(https?:|data:|blob:)/i.test(value)) return value;
    if (value.startsWith("//")) return `https:${value}`;
    if (!baseURL) return value;
    try {
      return new URL(value, baseURL).toString();
    } catch {
      return value;
    }
  }, [baseURL, parsed]);

  return {
    parsed,
    baseURL,
    favicon,
    error,
    isLoading,
  };
}
