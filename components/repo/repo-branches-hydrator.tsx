"use client";

import { useEffect, useRef } from "react";
import { useConfig } from "@/contexts/config-context";
import { useRepo } from "@/contexts/repo-context";
import { requireApiSuccess } from "@/lib/api-client";

type BranchesPayload = {
  defaultBranch?: string;
  branches: string[];
};

/**
 * After layout ships with a minimal branch list ([defaultBranch]), hydrate the
 * full list in the background for the branch switcher.
 */
export function RepoBranchesHydrator() {
  const { config } = useConfig();
  const { owner, repo, branches, setBranches } = useRepo();
  const hydratedKey = useRef<string | null>(null);

  useEffect(() => {
    if (!config?.branch || !owner || !repo) return;

    // Ensure the active branch is visible before the full list arrives.
    if (branches && !branches.includes(config.branch)) {
      setBranches([config.branch, ...branches]);
    }

    if (owner === "local") {
      hydratedKey.current = `${owner}/${repo}`;
      return;
    }

    const key = `${owner}/${repo}`;
    if (hydratedKey.current === key) return;
    hydratedKey.current = key;

    let cancelled = false;
    const run = async () => {
      try {
        const response = await fetch(
          `/api/${owner}/${repo}/${encodeURIComponent(config.branch)}/branches`,
        );
        const payload = await requireApiSuccess<{ data: BranchesPayload }>(
          response,
          "加载分支列表失败",
        );
        if (cancelled) return;
        const next = payload.data.branches ?? [];
        if (next.length > 0) {
          setBranches(next);
        }
      } catch {
        // Allow retry on next mount/navigation.
        if (!cancelled) hydratedKey.current = null;
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [config?.branch, owner, repo, setBranches]); // eslint-disable-line react-hooks/exhaustive-deps -- omit branches to avoid setState loop

  return null;
}
