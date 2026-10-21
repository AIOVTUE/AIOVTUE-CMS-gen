"use client";

import useSWR from "swr";
import type { AiSettingsPublic } from "@/lib/ai/types";
import { requireApiSuccess } from "@/lib/api-client";
import { normalizePlainText } from "@/lib/ai/text";

const fetchAiSettings = async (url: string): Promise<AiSettingsPublic> => {
  const response = await fetch(url);
  const payload = await requireApiSuccess<{ data: AiSettingsPublic }>(
    response,
    "Failed to load AI settings",
  );
  return payload.data;
};

const useAiSettings = () => {
  const { data, error, isLoading, mutate } = useSWR(
    "/api/ai/settings",
    fetchAiSettings,
    {
      revalidateOnFocus: false,
      shouldRetryOnError: false,
    },
  );

  return {
    settings: data ?? null,
    error,
    isLoading,
    refresh: mutate,
    hasApiKey: Boolean(data?.hasApiKey),
    autoSummary: Boolean(data?.autoSummary),
  };
};

const generateAiSummary = async (input: {
  title?: string;
  body: unknown;
}): Promise<string> => {
  const response = await fetch("/api/ai/summary", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: input.title ?? "",
      body: normalizePlainText(input.body),
    }),
  });
  const payload = await requireApiSuccess<{ data: { summary: string } }>(
    response,
    "Failed to generate AI summary",
  );
  return payload.data.summary;
};

export { useAiSettings, generateAiSummary };
