"use client";

import { useCallback, useEffect } from "react";
import useSWR from "swr";
import { requireApiSuccess } from "@/lib/api-client";
import { CMS_LOCAL_SAVE_EVENT } from "@/lib/cms-client-events";

export type PendingChangeFile = {
  path: string;
  status: string;
  operation?: string;
  newPath?: string | null;
};

export type PublishStatus = {
  dirty: boolean;
  ahead: number;
  behind: number;
  files: PendingChangeFile[];
  branch?: string;
};

/**
 * Shared publish status via SWR key dedupe — multiple consumers share one poller.
 */
const usePublishStatus = (owner: string, repo: string, branch: string) => {
  const apiBase =
    owner && repo && branch
      ? `/api/${owner}/${repo}/${encodeURIComponent(branch)}/publish`
      : "";
  const discardBase =
    owner && repo && branch
      ? `/api/${owner}/${repo}/${encodeURIComponent(branch)}/staged/discard`
      : "";

  const fetchStatus = useCallback(async (url: string) => {
    const response = await fetch(url);
    const payload = await requireApiSuccess<{ data: PublishStatus }>(
      response,
      "无法获取更改状态",
    );
    return payload.data;
  }, []);

  const { data: status, isLoading: loading, mutate } = useSWR<PublishStatus | null>(
    apiBase || null,
    fetchStatus,
    {
      refreshInterval: 60_000,
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
      dedupingInterval: 2_000,
      shouldRetryOnError: false,
    },
  );

  // Bypass SWR request dedupe so post-save / post-publish counts update immediately.
  const refresh = useCallback(async () => {
    if (!apiBase) return null;
    const next = await mutate(fetchStatus(apiBase), { revalidate: false });
    return next ?? null;
  }, [apiBase, fetchStatus, mutate]);

  useEffect(() => {
    if (!apiBase) return;
    const onLocalSave = () => {
      void refresh();
    };
    window.addEventListener(CMS_LOCAL_SAVE_EVENT, onLocalSave);
    return () => window.removeEventListener(CMS_LOCAL_SAVE_EVENT, onLocalSave);
  }, [apiBase, refresh]);

  const discard = useCallback(
    async (path?: string) => {
      if (!discardBase) {
        throw new Error("仓库未就绪");
      }
      const response = await fetch(discardBase, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(path ? { path } : {}),
      });
      const payload = await requireApiSuccess<{
        message?: string;
        data: { discarded: number; paths: string[] };
      }>(response, "撤销失败");
      await refresh();
      return payload;
    },
    [discardBase, refresh],
  );

  // Match the changes list (working-tree files only).
  const pendingCount = status?.files.length ?? 0;
  const canAct = Boolean(status?.dirty);

  return {
    status: status ?? null,
    loading,
    refresh,
    discard,
    pendingCount,
    canAct,
    apiBase,
  };
};

export { usePublishStatus };
